-- ============================================================
-- Phase 14 - Client Portal PWA
--
-- Additive layer over existing public flows. Existing public routes
-- (/agendar, /cliente, /agendamento, /anamnese, /pacote, /orcamento)
-- remain valid and are not replaced by this portal.
-- ============================================================

ALTER TABLE public.sessions
  ADD COLUMN IF NOT EXISTS client_visible_summary text,
  ADD COLUMN IF NOT EXISTS client_visible_at timestamptz;

COMMENT ON COLUMN public.sessions.client_visible_summary IS
  'Non-clinical summary explicitly released to the client portal.';
COMMENT ON COLUMN public.sessions.client_visible_at IS
  'When non-clinical session summary became visible in the client portal.';

CREATE TABLE IF NOT EXISTS public.client_portal_sessions (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  professional_id    uuid NOT NULL REFERENCES public.professionals(id) ON DELETE CASCADE,
  client_id          uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  session_token_hash text NOT NULL,
  expires_at         timestamptz NOT NULL DEFAULT (now() + interval '30 days'),
  last_seen_at       timestamptz,
  revoked_at         timestamptz,
  created_ip         text,
  created_user_agent text,
  metadata           jsonb NOT NULL DEFAULT '{}',
  created_at         timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.client_portal_sessions IS
  'Opaque client portal sessions scoped to one professional and one client. Raw bearer tokens are never stored.';
COMMENT ON COLUMN public.client_portal_sessions.session_token_hash IS
  'SHA-256 hash of the raw portal bearer token. The raw token is returned only once by the session creation RPC.';

CREATE UNIQUE INDEX IF NOT EXISTS idx_client_portal_sessions_token_hash
  ON public.client_portal_sessions(session_token_hash)
  WHERE revoked_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_client_portal_sessions_client
  ON public.client_portal_sessions(professional_id, client_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_client_portal_sessions_expiry
  ON public.client_portal_sessions(expires_at)
  WHERE revoked_at IS NULL;

ALTER TABLE public.client_portal_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "client_portal_sessions_isolation" ON public.client_portal_sessions;
CREATE POLICY "client_portal_sessions_isolation"
ON public.client_portal_sessions FOR SELECT TO authenticated
USING (professional_id = public.auth_professional_id());

REVOKE ALL ON public.client_portal_sessions FROM anon, authenticated;
GRANT SELECT ON public.client_portal_sessions TO authenticated;

DROP FUNCTION IF EXISTS public.hash_client_portal_token(text);
DROP FUNCTION IF EXISTS public.create_client_portal_session(text, text, text, text, boolean, text, text, text);
DROP FUNCTION IF EXISTS public.get_client_portal_context(text, text);
DROP FUNCTION IF EXISTS public.update_client_portal_profile(text, jsonb, text, text);
DROP FUNCTION IF EXISTS public.complete_client_portal_onboarding(text, jsonb, text, text);
DROP FUNCTION IF EXISTS public.get_client_portal_history(text, integer, timestamptz);
DROP FUNCTION IF EXISTS public.get_client_portal_packages(text);
DROP FUNCTION IF EXISTS public.get_client_portal_booking_context(text, text);
DROP FUNCTION IF EXISTS public.create_client_portal_appointment(text, uuid, timestamptz, uuid);
DROP FUNCTION IF EXISTS public.cancel_client_portal_appointment(text, uuid, text);
DROP FUNCTION IF EXISTS public.reschedule_client_portal_appointment(text, uuid, timestamptz);
DROP FUNCTION IF EXISTS public.revoke_client_portal_session(text);

CREATE OR REPLACE FUNCTION public.hash_client_portal_token(p_token text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT encode(extensions.digest(COALESCE(p_token, ''), 'sha256'), 'hex');
$$;

CREATE OR REPLACE FUNCTION public.create_client_portal_session(
  p_slug text,
  p_phone_whatsapp text,
  p_full_name text,
  p_email text DEFAULT NULL,
  p_lgpd_accepted boolean DEFAULT false,
  p_lang text DEFAULT 'pt-BR',
  p_ip text DEFAULT NULL,
  p_user_agent text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_professional public.professionals%ROWTYPE;
  v_client public.clients%ROWTYPE;
  v_slug text;
  v_phone text;
  v_full_name text;
  v_email text;
  v_locale text;
  v_token text;
  v_token_hash text;
  v_session public.client_portal_sessions%ROWTYPE;
BEGIN
  v_slug := lower(btrim(COALESCE(p_slug, '')));
  v_phone := NULLIF(public.normalize_phone_digits(COALESCE(p_phone_whatsapp, '')), '');
  v_full_name := btrim(COALESCE(p_full_name, ''));
  v_email := NULLIF(lower(btrim(COALESCE(p_email, ''))), '');
  v_locale := CASE WHEN p_lang IN ('pt-BR', 'en-US', 'es-419') THEN p_lang ELSE 'pt-BR' END;

  IF v_slug = '' OR v_full_name = '' OR v_phone IS NULL OR length(v_phone) < 8 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_input', 'locale', v_locale);
  END IF;

  IF v_email IS NOT NULL AND v_email !~* '^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_input', 'locale', v_locale);
  END IF;

  IF NOT COALESCE(p_lgpd_accepted, false) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'lgpd_required', 'locale', v_locale);
  END IF;

  SELECT *
  INTO v_professional
  FROM public.professionals
  WHERE slug = v_slug
    AND deleted_at IS NULL
    AND onboarding_completed = true
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found', 'locale', v_locale);
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(v_professional.id::text || ':' || v_phone, 0));

  SELECT *
  INTO v_client
  FROM public.clients
  WHERE professional_id = v_professional.id
    AND phone_whatsapp = v_phone
    AND deleted_at IS NULL
  LIMIT 1
  FOR UPDATE;

  IF NOT FOUND THEN
    INSERT INTO public.clients (
      professional_id,
      full_name,
      phone_whatsapp,
      email,
      journey_stage,
      source,
      lgpd_consent_at,
      lgpd_consent_source,
      lgpd_consent_channel,
      pwa_onboarded_at,
      metadata
    )
    VALUES (
      v_professional.id,
      v_full_name,
      v_phone,
      v_email,
      'lead',
      'public_link',
      now(),
      'client_portal',
      'pwa',
      now(),
      jsonb_build_object(
        'client_portal', jsonb_build_object(
          'lang', v_locale,
          'created_at', now()
        )
      )
    )
    RETURNING * INTO v_client;

    PERFORM public.log_audit_event(
      v_professional.id,
      'client',
      'client.lead.created',
      'client',
      v_client.id,
      jsonb_build_object('source', 'client_portal', 'lang', v_locale)
    );
  ELSE
    UPDATE public.clients
    SET full_name = v_full_name,
        email = COALESCE(v_email, email),
        lgpd_consent_at = COALESCE(lgpd_consent_at, now()),
        lgpd_consent_source = COALESCE(lgpd_consent_source, 'client_portal'),
        lgpd_consent_channel = COALESCE(lgpd_consent_channel, 'pwa'),
        pwa_onboarded_at = COALESCE(pwa_onboarded_at, now()),
        metadata = metadata || jsonb_build_object(
          'client_portal',
          COALESCE(metadata->'client_portal', '{}'::jsonb) || jsonb_build_object('lang', v_locale, 'last_session_created_at', now())
        ),
        updated_at = now()
    WHERE id = v_client.id
    RETURNING * INTO v_client;
  END IF;

  v_token := gen_random_uuid()::text || '.' || gen_random_uuid()::text;
  v_token_hash := public.hash_client_portal_token(v_token);

  INSERT INTO public.client_portal_sessions (
    professional_id,
    client_id,
    session_token_hash,
    expires_at,
    created_ip,
    created_user_agent,
    metadata
  )
  VALUES (
    v_professional.id,
    v_client.id,
    v_token_hash,
    now() + interval '30 days',
    NULLIF(left(COALESCE(p_ip, ''), 120), ''),
    NULLIF(left(COALESCE(p_user_agent, ''), 500), ''),
    jsonb_build_object('source', 'client_portal', 'lang', v_locale)
  )
  RETURNING * INTO v_session;

  PERFORM public.log_audit_event(
    v_professional.id,
    'client',
    'client.portal.session.created',
    'client',
    v_client.id,
    jsonb_build_object('session_id', v_session.id, 'expires_at', v_session.expires_at, 'lang', v_locale)
  );

  RETURN jsonb_build_object(
    'ok', true,
    'session_token', v_token,
    'expires_at', v_session.expires_at,
    'client',
    jsonb_build_object(
      'id', v_client.id,
      'full_name', v_client.full_name,
      'phone_whatsapp', v_client.phone_whatsapp,
      'email', v_client.email,
      'pwa_onboarded_at', v_client.pwa_onboarded_at,
      'lgpd_consent_at', v_client.lgpd_consent_at
    ),
    'professional',
    jsonb_build_object(
      'slug', v_professional.slug,
      'public_name', COALESCE(NULLIF(v_professional.business_name, ''), v_professional.name),
      'logo_url', v_professional.logo_url,
      'brand_color', COALESCE(v_professional.settings->>'brand_color', '#0f766e')
    ),
    'next_step', 'portal'
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_client_portal_context(
  p_session_token text,
  p_lang text DEFAULT 'pt-BR'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_session public.client_portal_sessions%ROWTYPE;
  v_professional public.professionals%ROWTYPE;
  v_client public.clients%ROWTYPE;
  v_next_appointment jsonb;
  v_package_summary jsonb;
  v_locale text;
BEGIN
  v_locale := CASE WHEN p_lang IN ('pt-BR', 'en-US', 'es-419') THEN p_lang ELSE 'pt-BR' END;

  SELECT *
  INTO v_session
  FROM public.client_portal_sessions
  WHERE session_token_hash = public.hash_client_portal_token(p_session_token)
    AND revoked_at IS NULL
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_session', 'locale', v_locale);
  END IF;

  IF v_session.expires_at <= now() THEN
    RETURN jsonb_build_object('ok', false, 'error', 'session_expired', 'locale', v_locale);
  END IF;

  SELECT * INTO v_professional
  FROM public.professionals
  WHERE id = v_session.professional_id
    AND deleted_at IS NULL;

  SELECT * INTO v_client
  FROM public.clients
  WHERE id = v_session.client_id
    AND professional_id = v_session.professional_id
    AND deleted_at IS NULL;

  IF v_professional.id IS NULL OR v_client.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_session', 'locale', v_locale);
  END IF;

  UPDATE public.client_portal_sessions
  SET last_seen_at = now()
  WHERE id = v_session.id;

  SELECT jsonb_build_object(
    'id', a.id,
    'service_id', a.service_id,
    'service_name', s.name,
    'scheduled_at', a.scheduled_at,
    'duration_minutes', a.duration_minutes,
    'status', a.status,
    'can_cancel', a.status IN ('agendado','confirmado')
      AND a.scheduled_at - now() >= (public.phase12_operational_rules_hours(v_professional.settings, ARRAY['appointment_rules','cancel_window_hours'], 24) || ' hours')::interval,
    'can_reschedule', a.status IN ('agendado','confirmado')
      AND a.scheduled_at - now() >= (public.phase12_operational_rules_hours(v_professional.settings, ARRAY['appointment_rules','reschedule_window_hours'], 24) || ' hours')::interval
  )
  INTO v_next_appointment
  FROM public.appointments a
  LEFT JOIN public.services s ON s.id = a.service_id
  WHERE a.professional_id = v_session.professional_id
    AND a.client_id = v_session.client_id
    AND a.deleted_at IS NULL
    AND a.status IN ('agendado','confirmado')
    AND a.scheduled_at >= now()
  ORDER BY a.scheduled_at ASC
  LIMIT 1;

  SELECT jsonb_build_object(
    'active_count', COUNT(*) FILTER (WHERE cp.status = 'ativo'),
    'total_remaining', COALESCE(SUM(cp.sessions_remaining) FILTER (WHERE cp.status = 'ativo'), 0)
  )
  INTO v_package_summary
  FROM public.client_packages cp
  WHERE cp.professional_id = v_session.professional_id
    AND cp.client_id = v_session.client_id;

  PERFORM public.log_audit_event(
    v_session.professional_id,
    'client',
    'client.portal.opened',
    'client',
    v_session.client_id,
    jsonb_build_object('session_id', v_session.id)
  );

  RETURN jsonb_build_object(
    'ok', true,
    'locale', v_locale,
    'professional',
    jsonb_build_object(
      'slug', v_professional.slug,
      'public_name', COALESCE(NULLIF(v_professional.business_name, ''), v_professional.name),
      'logo_url', v_professional.logo_url,
      'brand_color', COALESCE(v_professional.settings->>'brand_color', '#0f766e')
    ),
    'client',
    jsonb_build_object(
      'id', v_client.id,
      'full_name', v_client.full_name,
      'phone_whatsapp', v_client.phone_whatsapp,
      'email', v_client.email,
      'pwa_onboarded_at', v_client.pwa_onboarded_at,
      'lgpd_consent_at', v_client.lgpd_consent_at,
      'onboarding_required', v_client.pwa_onboarded_at IS NULL OR v_client.lgpd_consent_at IS NULL
    ),
    'next_appointment', v_next_appointment,
    'packages_summary', COALESCE(v_package_summary, jsonb_build_object('active_count', 0, 'total_remaining', 0)),
    'session',
    jsonb_build_object('expires_at', v_session.expires_at)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.update_client_portal_profile(
  p_session_token text,
  p_payload jsonb,
  p_ip text DEFAULT NULL,
  p_user_agent text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_session public.client_portal_sessions%ROWTYPE;
  v_client public.clients%ROWTYPE;
  v_full_name text;
  v_email text;
  v_contact_preference text;
  v_reminders_opt_in boolean;
BEGIN
  SELECT *
  INTO v_session
  FROM public.client_portal_sessions
  WHERE session_token_hash = public.hash_client_portal_token(p_session_token)
    AND revoked_at IS NULL
  LIMIT 1;

  IF NOT FOUND OR v_session.expires_at <= now() THEN
    RETURN jsonb_build_object('ok', false, 'error', 'session_expired');
  END IF;

  v_full_name := btrim(COALESCE(p_payload->>'full_name', ''));
  v_email := NULLIF(lower(btrim(COALESCE(p_payload->>'email', ''))), '');
  v_contact_preference := COALESCE(NULLIF(p_payload->>'contact_preference', ''), 'whatsapp');
  v_reminders_opt_in := COALESCE((p_payload->>'reminders_opt_in')::boolean, true);

  IF v_full_name = '' OR v_contact_preference NOT IN ('whatsapp', 'email', 'both') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_input');
  END IF;

  IF v_email IS NOT NULL AND v_email !~* '^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_input');
  END IF;

  UPDATE public.clients
  SET full_name = v_full_name,
      email = COALESCE(v_email, email),
      push_notifications_enabled = v_reminders_opt_in,
      whatsapp_opt_out = v_contact_preference = 'email',
      whatsapp_opt_out_at = CASE
        WHEN v_contact_preference = 'email' AND whatsapp_opt_out_at IS NULL THEN now()
        WHEN v_contact_preference <> 'email' THEN NULL
        ELSE whatsapp_opt_out_at
      END,
      metadata = metadata || jsonb_build_object(
        'client_portal_profile',
        jsonb_build_object(
          'contact_preference', v_contact_preference,
          'reminders_opt_in', v_reminders_opt_in,
          'ip', p_ip,
          'user_agent', p_user_agent,
          'updated_at', now()
        )
      ),
      updated_at = now()
  WHERE id = v_session.client_id
    AND professional_id = v_session.professional_id
  RETURNING * INTO v_client;

  PERFORM public.log_audit_event(
    v_session.professional_id,
    'client',
    'client.portal.profile.updated',
    'client',
    v_session.client_id,
    jsonb_build_object('session_id', v_session.id)
  );

  RETURN jsonb_build_object('ok', true, 'client_id', v_client.id);
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_client_portal_onboarding(
  p_session_token text,
  p_payload jsonb,
  p_ip text DEFAULT NULL,
  p_user_agent text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_result jsonb;
  v_session public.client_portal_sessions%ROWTYPE;
BEGIN
  IF NOT COALESCE((p_payload->>'lgpd_accepted')::boolean, false) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'lgpd_required');
  END IF;

  v_result := public.update_client_portal_profile(p_session_token, p_payload, p_ip, p_user_agent);
  IF COALESCE((v_result->>'ok')::boolean, false) IS NOT TRUE THEN
    RETURN v_result;
  END IF;

  SELECT *
  INTO v_session
  FROM public.client_portal_sessions
  WHERE session_token_hash = public.hash_client_portal_token(p_session_token)
    AND revoked_at IS NULL
  LIMIT 1;

  UPDATE public.clients
  SET lgpd_consent_at = COALESCE(lgpd_consent_at, now()),
      lgpd_consent_source = COALESCE(lgpd_consent_source, 'client_portal'),
      lgpd_consent_channel = COALESCE(lgpd_consent_channel, 'pwa'),
      pwa_onboarded_at = COALESCE(pwa_onboarded_at, now()),
      metadata = metadata || jsonb_build_object(
        'client_portal_onboarding',
        jsonb_build_object('completed_at', now(), 'ip', p_ip, 'user_agent', p_user_agent)
      ),
      updated_at = now()
  WHERE id = v_session.client_id
    AND professional_id = v_session.professional_id;

  PERFORM public.log_audit_event(
    v_session.professional_id,
    'client',
    'client.portal.onboarding.completed',
    'client',
    v_session.client_id,
    jsonb_build_object('session_id', v_session.id)
  );

  RETURN jsonb_build_object('ok', true, 'client_id', v_session.client_id, 'next_step', 'home');
END;
$$;

CREATE OR REPLACE FUNCTION public.get_client_portal_history(
  p_session_token text,
  p_limit integer DEFAULT 20,
  p_cursor timestamptz DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_session public.client_portal_sessions%ROWTYPE;
  v_items jsonb;
  v_limit integer;
BEGIN
  v_limit := greatest(1, least(COALESCE(p_limit, 20), 50));

  SELECT *
  INTO v_session
  FROM public.client_portal_sessions
  WHERE session_token_hash = public.hash_client_portal_token(p_session_token)
    AND revoked_at IS NULL
  LIMIT 1;

  IF NOT FOUND OR v_session.expires_at <= now() THEN
    RETURN jsonb_build_object('ok', false, 'error', 'session_expired');
  END IF;

  SELECT COALESCE(jsonb_agg(item ORDER BY (item->>'session_date')::timestamptz DESC), '[]'::jsonb)
  INTO v_items
  FROM (
    SELECT jsonb_build_object(
      'id', se.id,
      'session_date', se.session_date,
      'service_name', sv.name,
      'status', COALESCE(ap.status::text, 'realizado'),
      'summary', CASE WHEN se.client_visible_at IS NOT NULL THEN se.client_visible_summary ELSE NULL END
    ) AS item
    FROM public.sessions se
    LEFT JOIN public.services sv ON sv.id = se.service_id
    LEFT JOIN public.appointments ap ON ap.id = se.appointment_id
    WHERE se.professional_id = v_session.professional_id
      AND se.client_id = v_session.client_id
      AND se.deleted_at IS NULL
      AND (p_cursor IS NULL OR se.session_date < p_cursor)
    ORDER BY se.session_date DESC
    LIMIT v_limit
  ) src;

  RETURN jsonb_build_object('ok', true, 'items', v_items);
END;
$$;

CREATE OR REPLACE FUNCTION public.get_client_portal_packages(p_session_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_session public.client_portal_sessions%ROWTYPE;
  v_items jsonb;
BEGIN
  SELECT *
  INTO v_session
  FROM public.client_portal_sessions
  WHERE session_token_hash = public.hash_client_portal_token(p_session_token)
    AND revoked_at IS NULL
  LIMIT 1;

  IF NOT FOUND OR v_session.expires_at <= now() THEN
    RETURN jsonb_build_object('ok', false, 'error', 'session_expired');
  END IF;

  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id', cp.id,
      'service_package_id', sp.id,
      'name', sp.name,
      'slug', CASE WHEN sp.is_public AND sp.is_active AND sp.deleted_at IS NULL THEN sp.slug ELSE NULL END,
      'sessions_total', cp.sessions_total,
      'sessions_used', cp.sessions_used,
      'sessions_remaining', cp.sessions_remaining,
      'purchased_at', cp.purchased_at,
      'expires_at', cp.expires_at,
      'status', cp.status
    )
    ORDER BY CASE cp.status WHEN 'ativo' THEN 0 WHEN 'esgotado' THEN 1 WHEN 'expirado' THEN 2 ELSE 3 END, cp.expires_at NULLS LAST
  ), '[]'::jsonb)
  INTO v_items
  FROM public.client_packages cp
  JOIN public.service_packages sp ON sp.id = cp.service_package_id
  WHERE cp.professional_id = v_session.professional_id
    AND cp.client_id = v_session.client_id
    AND cp.status IN ('ativo','esgotado','expirado');

  RETURN jsonb_build_object('ok', true, 'items', v_items);
END;
$$;

CREATE OR REPLACE FUNCTION public.get_client_portal_booking_context(
  p_session_token text,
  p_lang text DEFAULT 'pt-BR'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_session public.client_portal_sessions%ROWTYPE;
  v_services jsonb;
  v_slots jsonb;
  v_locale text;
BEGIN
  v_locale := CASE WHEN p_lang IN ('pt-BR', 'en-US', 'es-419') THEN p_lang ELSE 'pt-BR' END;

  SELECT *
  INTO v_session
  FROM public.client_portal_sessions
  WHERE session_token_hash = public.hash_client_portal_token(p_session_token)
    AND revoked_at IS NULL
  LIMIT 1;

  IF NOT FOUND OR v_session.expires_at <= now() THEN
    RETURN jsonb_build_object('ok', false, 'error', 'session_expired', 'locale', v_locale);
  END IF;

  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id', s.id,
      'name', s.name,
      'description', s.description,
      'duration_minutes', s.duration_minutes,
      'price', s.price
    )
    ORDER BY s.name
  ), '[]'::jsonb)
  INTO v_services
  FROM public.services s
  WHERE s.professional_id = v_session.professional_id
    AND s.deleted_at IS NULL
    AND s.is_active = true
    AND s.is_public = true;

  SELECT jsonb_agg(
    jsonb_build_object(
      'scheduled_at',
      (
        date_trunc('day', now() AT TIME ZONE 'America/Sao_Paulo')
        AT TIME ZONE 'America/Sao_Paulo'
      ) + ((d.day_offset || ' days')::interval) + ((h.hour_value || ' hours')::interval),
      'label',
      to_char(
        (
          date_trunc('day', now() AT TIME ZONE 'America/Sao_Paulo')
          AT TIME ZONE 'America/Sao_Paulo'
        ) + ((d.day_offset || ' days')::interval) + ((h.hour_value || ' hours')::interval),
        'YYYY-MM-DD HH24:MI'
      )
    )
    ORDER BY d.day_offset, h.hour_value
  )
  INTO v_slots
  FROM generate_series(1, 7) AS d(day_offset)
  CROSS JOIN (VALUES (9), (10), (11), (14), (15), (16)) AS h(hour_value);

  RETURN jsonb_build_object(
    'ok', true,
    'locale', v_locale,
    'services', v_services,
    'available_slots', COALESCE(v_slots, '[]'::jsonb)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.create_client_portal_appointment(
  p_session_token text,
  p_service_id uuid,
  p_scheduled_at timestamptz,
  p_use_client_package_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_session public.client_portal_sessions%ROWTYPE;
  v_service public.services%ROWTYPE;
  v_package public.client_packages%ROWTYPE;
  v_appointment public.appointments%ROWTYPE;
BEGIN
  IF p_scheduled_at IS NULL OR p_scheduled_at <= now() THEN
    RETURN jsonb_build_object('ok', false, 'error', 'scheduled_at_must_be_future');
  END IF;

  SELECT *
  INTO v_session
  FROM public.client_portal_sessions
  WHERE session_token_hash = public.hash_client_portal_token(p_session_token)
    AND revoked_at IS NULL
  LIMIT 1;

  IF NOT FOUND OR v_session.expires_at <= now() THEN
    RETURN jsonb_build_object('ok', false, 'error', 'session_expired');
  END IF;

  SELECT *
  INTO v_service
  FROM public.services
  WHERE id = p_service_id
    AND professional_id = v_session.professional_id
    AND deleted_at IS NULL
    AND is_active = true
    AND is_public = true;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'service_not_available');
  END IF;

  IF p_use_client_package_id IS NOT NULL THEN
    SELECT *
    INTO v_package
    FROM public.client_packages
    WHERE id = p_use_client_package_id
      AND professional_id = v_session.professional_id
      AND client_id = v_session.client_id
      AND status = 'ativo'
    FOR UPDATE;

    IF NOT FOUND OR v_package.sessions_remaining <= 0 OR (v_package.expires_at IS NOT NULL AND v_package.expires_at < now()) THEN
      RETURN jsonb_build_object('ok', false, 'error', 'package_not_available');
    END IF;
  END IF;

  IF public.phase12_appointment_conflicts(v_session.professional_id, p_scheduled_at, v_service.duration_minutes, NULL) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'slot_unavailable');
  END IF;

  INSERT INTO public.appointments (
    professional_id,
    client_id,
    service_id,
    scheduled_at,
    duration_minutes,
    status,
    source,
    notes,
    booked_by_client,
    booked_at,
    metadata
  )
  VALUES (
    v_session.professional_id,
    v_session.client_id,
    v_service.id,
    p_scheduled_at,
    v_service.duration_minutes,
    'agendado',
    'public_link',
    'Agendamento criado no portal do cliente.',
    true,
    now(),
    jsonb_build_object(
      'source', 'client_portal',
      'client_portal_session_id', v_session.id,
      'use_client_package_id', p_use_client_package_id
    )
  )
  RETURNING * INTO v_appointment;

  UPDATE public.clients
  SET journey_stage = CASE WHEN journey_stage = 'lead' THEN 'agendado' ELSE journey_stage END,
      updated_at = now()
  WHERE id = v_session.client_id
    AND professional_id = v_session.professional_id;

  PERFORM public.log_audit_event(
    v_session.professional_id,
    'client',
    'client.portal.appointment.created',
    'appointment',
    v_appointment.id,
    jsonb_build_object(
      'client_id', v_session.client_id,
      'service_id', v_service.id,
      'session_id', v_session.id,
      'use_client_package_id', p_use_client_package_id
    )
  );

  RETURN jsonb_build_object(
    'ok', true,
    'appointment_id', v_appointment.id,
    'client_id', v_session.client_id,
    'status', v_appointment.status,
    'next_step', 'confirmation_page'
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.cancel_client_portal_appointment(
  p_session_token text,
  p_appointment_id uuid,
  p_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_session public.client_portal_sessions%ROWTYPE;
  v_appointment public.appointments%ROWTYPE;
  v_window_hours integer;
  v_settings jsonb;
BEGIN
  SELECT *
  INTO v_session
  FROM public.client_portal_sessions
  WHERE session_token_hash = public.hash_client_portal_token(p_session_token)
    AND revoked_at IS NULL
  LIMIT 1;

  IF NOT FOUND OR v_session.expires_at <= now() THEN
    RETURN jsonb_build_object('ok', false, 'error', 'session_expired');
  END IF;

  SELECT *
  INTO v_appointment
  FROM public.appointments
  WHERE id = p_appointment_id
    AND professional_id = v_session.professional_id
    AND client_id = v_session.client_id
    AND deleted_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'appointment_not_found');
  END IF;

  IF v_appointment.status = 'cancelado' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'already_cancelled');
  END IF;

  IF v_appointment.status NOT IN ('agendado','confirmado') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_status', 'status', v_appointment.status);
  END IF;

  SELECT settings INTO v_settings FROM public.professionals WHERE id = v_session.professional_id;
  v_window_hours := public.phase12_operational_rules_hours(v_settings, ARRAY['appointment_rules','cancel_window_hours'], 24);

  IF v_appointment.scheduled_at - now() < (v_window_hours || ' hours')::interval THEN
    RETURN jsonb_build_object('ok', false, 'error', 'window_closed', 'window_hours', v_window_hours);
  END IF;

  UPDATE public.appointments
  SET status = 'cancelado',
      cancelled_at = now(),
      cancellation_reason = COALESCE(NULLIF(left(trim(COALESCE(p_reason, '')), 500), ''), 'Cancelado pelo cliente no portal.')
  WHERE id = v_appointment.id
  RETURNING * INTO v_appointment;

  PERFORM public.log_audit_event(
    v_session.professional_id,
    'client',
    'client.portal.appointment.cancelled',
    'appointment',
    v_appointment.id,
    jsonb_build_object('client_id', v_session.client_id, 'session_id', v_session.id)
  );

  RETURN jsonb_build_object('ok', true, 'appointment_id', v_appointment.id, 'status', v_appointment.status);
END;
$$;

CREATE OR REPLACE FUNCTION public.reschedule_client_portal_appointment(
  p_session_token text,
  p_appointment_id uuid,
  p_new_scheduled_at timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_session public.client_portal_sessions%ROWTYPE;
  v_appointment public.appointments%ROWTYPE;
  v_new_appointment public.appointments%ROWTYPE;
  v_window_hours integer;
  v_settings jsonb;
BEGIN
  IF p_new_scheduled_at IS NULL OR p_new_scheduled_at <= now() THEN
    RETURN jsonb_build_object('ok', false, 'error', 'scheduled_at_must_be_future');
  END IF;

  SELECT *
  INTO v_session
  FROM public.client_portal_sessions
  WHERE session_token_hash = public.hash_client_portal_token(p_session_token)
    AND revoked_at IS NULL
  LIMIT 1;

  IF NOT FOUND OR v_session.expires_at <= now() THEN
    RETURN jsonb_build_object('ok', false, 'error', 'session_expired');
  END IF;

  SELECT *
  INTO v_appointment
  FROM public.appointments
  WHERE id = p_appointment_id
    AND professional_id = v_session.professional_id
    AND client_id = v_session.client_id
    AND deleted_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'appointment_not_found');
  END IF;

  IF v_appointment.status NOT IN ('agendado','confirmado') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_status', 'status', v_appointment.status);
  END IF;

  SELECT settings INTO v_settings FROM public.professionals WHERE id = v_session.professional_id;
  v_window_hours := public.phase12_operational_rules_hours(v_settings, ARRAY['appointment_rules','reschedule_window_hours'], 24);

  IF v_appointment.scheduled_at - now() < (v_window_hours || ' hours')::interval THEN
    RETURN jsonb_build_object('ok', false, 'error', 'window_closed', 'window_hours', v_window_hours);
  END IF;

  IF public.phase12_appointment_conflicts(v_session.professional_id, p_new_scheduled_at, v_appointment.duration_minutes, v_appointment.id) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'slot_unavailable');
  END IF;

  UPDATE public.appointments
  SET status = 'reagendado',
      cancelled_at = now(),
      cancellation_reason = 'Reagendado pelo cliente no portal.'
  WHERE id = v_appointment.id
  RETURNING * INTO v_appointment;

  INSERT INTO public.appointments (
    professional_id,
    client_id,
    service_id,
    scheduled_at,
    duration_minutes,
    status,
    source,
    notes,
    booked_by_client,
    booked_at,
    metadata
  )
  VALUES (
    v_session.professional_id,
    v_session.client_id,
    v_appointment.service_id,
    p_new_scheduled_at,
    v_appointment.duration_minutes,
    'agendado',
    'public_link',
    'Agendamento criado por remarcacao no portal do cliente.',
    true,
    now(),
    jsonb_build_object('source', 'client_portal', 'rescheduled_from_appointment_id', v_appointment.id, 'client_portal_session_id', v_session.id)
  )
  RETURNING * INTO v_new_appointment;

  PERFORM public.log_audit_event(
    v_session.professional_id,
    'client',
    'client.portal.appointment.rescheduled',
    'appointment',
    v_new_appointment.id,
    jsonb_build_object(
      'client_id', v_session.client_id,
      'session_id', v_session.id,
      'from_appointment_id', v_appointment.id,
      'to_appointment_id', v_new_appointment.id
    )
  );

  RETURN jsonb_build_object(
    'ok', true,
    'from_appointment_id', v_appointment.id,
    'appointment_id', v_new_appointment.id,
    'status', v_new_appointment.status
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.revoke_client_portal_session(p_session_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_session public.client_portal_sessions%ROWTYPE;
BEGIN
  UPDATE public.client_portal_sessions
  SET revoked_at = COALESCE(revoked_at, now())
  WHERE session_token_hash = public.hash_client_portal_token(p_session_token)
    AND revoked_at IS NULL
  RETURNING * INTO v_session;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', true, 'status', 'not_found');
  END IF;

  PERFORM public.log_audit_event(
    v_session.professional_id,
    'client',
    'client.portal.session.revoked',
    'client',
    v_session.client_id,
    jsonb_build_object('session_id', v_session.id)
  );

  RETURN jsonb_build_object('ok', true, 'status', 'revoked');
END;
$$;

REVOKE ALL ON FUNCTION public.hash_client_portal_token(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.create_client_portal_session(text, text, text, text, boolean, text, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_client_portal_context(text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.update_client_portal_profile(text, jsonb, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.complete_client_portal_onboarding(text, jsonb, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_client_portal_history(text, integer, timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_client_portal_packages(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_client_portal_booking_context(text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.create_client_portal_appointment(text, uuid, timestamptz, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.cancel_client_portal_appointment(text, uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.reschedule_client_portal_appointment(text, uuid, timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.revoke_client_portal_session(text) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.hash_client_portal_token(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.create_client_portal_session(text, text, text, text, boolean, text, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_client_portal_context(text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.update_client_portal_profile(text, jsonb, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.complete_client_portal_onboarding(text, jsonb, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_client_portal_history(text, integer, timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_client_portal_packages(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_client_portal_booking_context(text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.create_client_portal_appointment(text, uuid, timestamptz, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.cancel_client_portal_appointment(text, uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.reschedule_client_portal_appointment(text, uuid, timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION public.revoke_client_portal_session(text) TO service_role;

-- Rollback:
-- DROP FUNCTION IF EXISTS public.revoke_client_portal_session(text);
-- DROP FUNCTION IF EXISTS public.reschedule_client_portal_appointment(text, uuid, timestamptz);
-- DROP FUNCTION IF EXISTS public.cancel_client_portal_appointment(text, uuid, text);
-- DROP FUNCTION IF EXISTS public.create_client_portal_appointment(text, uuid, timestamptz, uuid);
-- DROP FUNCTION IF EXISTS public.get_client_portal_booking_context(text, text);
-- DROP FUNCTION IF EXISTS public.get_client_portal_packages(text);
-- DROP FUNCTION IF EXISTS public.get_client_portal_history(text, integer, timestamptz);
-- DROP FUNCTION IF EXISTS public.complete_client_portal_onboarding(text, jsonb, text, text);
-- DROP FUNCTION IF EXISTS public.update_client_portal_profile(text, jsonb, text, text);
-- DROP FUNCTION IF EXISTS public.get_client_portal_context(text, text);
-- DROP FUNCTION IF EXISTS public.create_client_portal_session(text, text, text, text, boolean, text, text, text);
-- DROP FUNCTION IF EXISTS public.hash_client_portal_token(text);
-- DROP TABLE IF EXISTS public.client_portal_sessions;
-- ALTER TABLE public.sessions
--   DROP COLUMN IF EXISTS client_visible_at,
--   DROP COLUMN IF EXISTS client_visible_summary;
