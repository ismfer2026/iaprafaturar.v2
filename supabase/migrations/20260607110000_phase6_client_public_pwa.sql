-- ============================================================
-- Phase 6 - Client Public PWA
-- Public booking + public anamnese foundation.
--
-- Protected public flow rules:
-- - no Auth required for public booking/anamnese functions;
-- - never accept professional_id from public payload;
-- - resolve tenant by professionals.slug or anamnese_fichas.public_token;
-- - never search clients globally by phone;
-- - no billing/credits in pre-auth public flows;
-- - external route remains /anamnese/:token, where token maps to public_token.
-- ============================================================

ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS pwa_onboarded_at timestamptz,
  ADD COLUMN IF NOT EXISTS push_notifications_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS pwa_token text,
  ADD COLUMN IF NOT EXISTS pwa_token_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS lgpd_consent_channel text,
  ADD COLUMN IF NOT EXISTS has_anamnese boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS last_anamnese_at timestamptz;

COMMENT ON COLUMN public.clients.has_anamnese IS
  'True when at least one public/clinical anamnese form was completed for this client.';
COMMENT ON COLUMN public.clients.last_anamnese_at IS
  'Timestamp of the latest completed anamnese form for quick CRM display.';

ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS booked_by_client boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS booked_at timestamptz;

COMMENT ON COLUMN public.appointments.booked_by_client IS
  'True when appointment was created from the public client booking flow.';
COMMENT ON COLUMN public.appointments.booked_at IS
  'Public booking submission timestamp.';

CREATE INDEX IF NOT EXISTS idx_services_public_booking
ON public.services(professional_id, is_active, is_public, name)
WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.registration_links (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  professional_id uuid NOT NULL REFERENCES public.professionals(id) ON DELETE RESTRICT,
  code            text NOT NULL,
  is_active       boolean NOT NULL DEFAULT true,
  expires_at      timestamptz,
  uses_count      integer NOT NULL DEFAULT 0 CHECK (uses_count >= 0),
  max_uses        integer CHECK (max_uses IS NULL OR max_uses > 0),
  created_at      timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.registration_links IS
  'Public link contract for client booking/registration flows. Public code never defines tenant without backend validation.';

CREATE UNIQUE INDEX IF NOT EXISTS idx_registration_links_code
ON public.registration_links(code);

CREATE INDEX IF NOT EXISTS idx_registration_links_professional
ON public.registration_links(professional_id);

CREATE INDEX IF NOT EXISTS idx_registration_links_active
ON public.registration_links(code, professional_id)
WHERE is_active = true;

ALTER TABLE public.registration_links ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "registration_links_isolation" ON public.registration_links;
CREATE POLICY "registration_links_isolation"
ON public.registration_links FOR ALL TO authenticated
USING (professional_id = public.auth_professional_id())
WITH CHECK (professional_id = public.auth_professional_id());

REVOKE ALL ON public.registration_links FROM anon, authenticated;
GRANT SELECT ON public.registration_links TO authenticated;

CREATE TABLE IF NOT EXISTS public.registration_sessions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  link_id         uuid REFERENCES public.registration_links(id) ON DELETE RESTRICT,
  professional_id uuid NOT NULL REFERENCES public.professionals(id) ON DELETE RESTRICT,
  session_token   text NOT NULL,
  data            jsonb NOT NULL DEFAULT '{}',
  completed_at    timestamptz,
  client_id       uuid REFERENCES public.clients(id) ON DELETE RESTRICT,
  created_at      timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.registration_sessions IS
  'Anonymous public-flow session state. It stores flow attribution/progress, not client Auth.';

CREATE UNIQUE INDEX IF NOT EXISTS idx_registration_sessions_token
ON public.registration_sessions(session_token);

CREATE INDEX IF NOT EXISTS idx_registration_sessions_professional
ON public.registration_sessions(professional_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_registration_sessions_link
ON public.registration_sessions(link_id)
WHERE link_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_registration_sessions_client
ON public.registration_sessions(client_id)
WHERE client_id IS NOT NULL;

ALTER TABLE public.registration_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "registration_sessions_isolation" ON public.registration_sessions;
CREATE POLICY "registration_sessions_isolation"
ON public.registration_sessions FOR ALL TO authenticated
USING (professional_id = public.auth_professional_id())
WITH CHECK (professional_id = public.auth_professional_id());

REVOKE ALL ON public.registration_sessions FROM anon, authenticated;
GRANT SELECT ON public.registration_sessions TO authenticated;

CREATE TABLE IF NOT EXISTS public.anamnese_templates (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  professional_id uuid NOT NULL REFERENCES public.professionals(id) ON DELETE RESTRICT,
  name            text NOT NULL CHECK (length(trim(name)) > 0),
  fields          jsonb NOT NULL DEFAULT '{}',
  is_default      boolean NOT NULL DEFAULT false,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  deleted_at      timestamptz
);

COMMENT ON TABLE public.anamnese_templates IS
  'Clinical anamnese templates by professional. Phase 6 uses default/public template; advanced editing is Phase 7.';

CREATE TRIGGER anamnese_templates_updated_at
  BEFORE UPDATE ON public.anamnese_templates
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX IF NOT EXISTS idx_anamnese_templates_professional
ON public.anamnese_templates(professional_id);

CREATE INDEX IF NOT EXISTS idx_anamnese_templates_default
ON public.anamnese_templates(professional_id)
WHERE is_default = true AND deleted_at IS NULL;

ALTER TABLE public.anamnese_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anamnese_templates_isolation" ON public.anamnese_templates;
CREATE POLICY "anamnese_templates_isolation"
ON public.anamnese_templates FOR ALL TO authenticated
USING (professional_id = public.auth_professional_id())
WITH CHECK (professional_id = public.auth_professional_id());

REVOKE ALL ON public.anamnese_templates FROM anon, authenticated;
GRANT SELECT ON public.anamnese_templates TO authenticated;

CREATE TABLE IF NOT EXISTS public.anamnese_fichas (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  professional_id    uuid NOT NULL REFERENCES public.professionals(id) ON DELETE RESTRICT,
  client_id          uuid NOT NULL REFERENCES public.clients(id) ON DELETE RESTRICT,
  template_id        uuid NOT NULL REFERENCES public.anamnese_templates(id) ON DELETE RESTRICT,
  appointment_id     uuid REFERENCES public.appointments(id) ON DELETE RESTRICT,
  public_token       uuid UNIQUE NOT NULL DEFAULT gen_random_uuid(),
  status             text NOT NULL DEFAULT 'aguardando'
                     CHECK (status IN ('aguardando','preenchido','revisado','expirado')),
  token_expires_at   timestamptz NOT NULL DEFAULT (now() + interval '30 days'),
  dados_pessoais     jsonb NOT NULL DEFAULT '{}',
  queixas            jsonb NOT NULL DEFAULT '{}',
  historico          jsonb NOT NULL DEFAULT '{}',
  alergias           jsonb NOT NULL DEFAULT '{}',
  habitos            jsonb NOT NULL DEFAULT '{}',
  custom_data        jsonb NOT NULL DEFAULT '{}',
  fotos              jsonb NOT NULL DEFAULT '[]',
  assinatura_url     text,
  assinado_em        timestamptz,
  lgpd_aceito        boolean NOT NULL DEFAULT false,
  lgpd_aceito_em     timestamptz,
  lgpd_ip            text,
  notas_profissional text,
  preenchido_em      timestamptz,
  revisado_em        timestamptz,
  revisado_por       uuid REFERENCES public.team_members(id) ON DELETE RESTRICT,
  created_at         timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.anamnese_fichas IS
  'Public clinical anamnese form. External route /anamnese/:token maps token to public_token. Photos/signature/review are Phase 7 UI concerns.';
COMMENT ON COLUMN public.anamnese_fichas.fotos IS
  'Reserved for Phase 7 anamnese-assets uploads. Phase 6 leaves this as [].';
COMMENT ON COLUMN public.anamnese_fichas.assinatura_url IS
  'Reserved for Phase 7 digital signature UI. Phase 6 leaves this null.';
COMMENT ON COLUMN public.anamnese_fichas.revisado_por IS
  'Reserved for Phase 7 professional review flow.';

CREATE UNIQUE INDEX IF NOT EXISTS idx_anamnese_fichas_public_token
ON public.anamnese_fichas(public_token);

CREATE INDEX IF NOT EXISTS idx_anamnese_fichas_professional_client
ON public.anamnese_fichas(professional_id, client_id);

CREATE INDEX IF NOT EXISTS idx_anamnese_fichas_appointment
ON public.anamnese_fichas(appointment_id)
WHERE appointment_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_anamnese_fichas_pending_token
ON public.anamnese_fichas(public_token)
WHERE status = 'aguardando';

ALTER TABLE public.anamnese_fichas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anamnese_fichas_isolation" ON public.anamnese_fichas;
CREATE POLICY "anamnese_fichas_isolation"
ON public.anamnese_fichas FOR ALL TO authenticated
USING (professional_id = public.auth_professional_id())
WITH CHECK (professional_id = public.auth_professional_id());

REVOKE ALL ON public.anamnese_fichas FROM anon, authenticated;
GRANT SELECT ON public.anamnese_fichas TO authenticated;

CREATE OR REPLACE FUNCTION public.get_public_booking_context(
  p_slug text,
  p_lang text DEFAULT 'pt-BR',
  p_ref text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_professional record;
  v_services jsonb;
  v_slots jsonb;
  v_locale text;
BEGIN
  v_locale := CASE
    WHEN p_lang IN ('pt-BR', 'en-US', 'es-419') THEN p_lang
    ELSE 'pt-BR'
  END;

  SELECT
    p.id,
    p.slug,
    COALESCE(NULLIF(p.business_name, ''), p.name) AS public_name,
    p.logo_url,
    COALESCE(p.settings->>'brand_color', '#0f766e') AS brand_color
  INTO v_professional
  FROM public.professionals p
  WHERE p.slug = p_slug
    AND p.deleted_at IS NULL
    AND p.onboarding_completed = true
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'not_found',
      'locale', v_locale
    );
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
  WHERE s.professional_id = v_professional.id
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
    'ref', p_ref,
    'professional',
    jsonb_build_object(
      'slug', v_professional.slug,
      'public_name', v_professional.public_name,
      'logo_url', v_professional.logo_url,
      'brand_color', v_professional.brand_color
    ),
    'services', v_services,
    'available_slots', COALESCE(v_slots, '[]'::jsonb)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.create_public_appointment(
  p_slug text,
  p_service_id uuid,
  p_scheduled_at timestamptz,
  p_full_name text,
  p_phone_whatsapp text,
  p_email text DEFAULT NULL,
  p_lang text DEFAULT 'pt-BR',
  p_ref text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_professional public.professionals%ROWTYPE;
  v_service public.services%ROWTYPE;
  v_client_id uuid;
  v_appointment_id uuid;
  v_session_id uuid;
  v_phone text;
  v_locale text;
  v_existing_stage public.journey_stage_enum;
  v_lock_key bigint;
BEGIN
  v_locale := CASE
    WHEN p_lang IN ('pt-BR', 'en-US', 'es-419') THEN p_lang
    ELSE 'pt-BR'
  END;

  v_phone := NULLIF(public.normalize_phone_digits(COALESCE(p_phone_whatsapp, '')), '');

  IF length(trim(COALESCE(p_full_name, ''))) = 0 THEN
    RAISE EXCEPTION 'full_name_required';
  END IF;

  IF v_phone IS NULL THEN
    RAISE EXCEPTION 'phone_whatsapp_required';
  END IF;

  IF p_scheduled_at <= now() THEN
    RAISE EXCEPTION 'scheduled_at_must_be_future';
  END IF;

  SELECT *
  INTO v_professional
  FROM public.professionals
  WHERE slug = p_slug
    AND deleted_at IS NULL
    AND onboarding_completed = true
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'professional_not_found';
  END IF;

  SELECT *
  INTO v_service
  FROM public.services
  WHERE id = p_service_id
    AND professional_id = v_professional.id
    AND deleted_at IS NULL
    AND is_active = true
    AND is_public = true
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'service_not_available';
  END IF;

  v_lock_key := hashtextextended(v_professional.id::text || ':' || v_phone, 0);
  PERFORM pg_advisory_xact_lock(v_lock_key);

  SELECT id, journey_stage
  INTO v_client_id, v_existing_stage
  FROM public.clients
  WHERE professional_id = v_professional.id
    AND phone_whatsapp = v_phone
    AND deleted_at IS NULL
  ORDER BY created_at ASC
  LIMIT 1;

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
      metadata
    )
    VALUES (
      v_professional.id,
      trim(p_full_name),
      v_phone,
      NULLIF(trim(COALESCE(p_email, '')), ''),
      'lead',
      'public_link',
      now(),
      'public_booking',
      'public_booking',
      jsonb_build_object('lang', v_locale, 'ref', p_ref)
    )
    RETURNING id INTO v_client_id;

    PERFORM public.log_audit_event(
      v_professional.id,
      'client',
      'client.lead.created',
      'client',
      v_client_id,
      jsonb_build_object('source', 'public_booking', 'lang', v_locale, 'ref', p_ref)
    );
  ELSE
    UPDATE public.clients
    SET full_name = COALESCE(NULLIF(trim(p_full_name), ''), full_name),
        email = COALESCE(NULLIF(trim(COALESCE(p_email, '')), ''), email),
        lgpd_consent_at = COALESCE(lgpd_consent_at, now()),
        lgpd_consent_source = COALESCE(lgpd_consent_source, 'public_booking'),
        lgpd_consent_channel = COALESCE(lgpd_consent_channel, 'public_booking'),
        metadata = metadata || jsonb_build_object('last_public_booking_ref', p_ref, 'last_public_booking_lang', v_locale)
    WHERE id = v_client_id;
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
    v_professional.id,
    v_client_id,
    v_service.id,
    p_scheduled_at,
    v_service.duration_minutes,
    'agendado',
    'public_link',
    'Agendamento criado pelo fluxo publico.',
    true,
    now(),
    jsonb_build_object('lang', v_locale, 'ref', p_ref, 'slug', p_slug)
  )
  RETURNING id INTO v_appointment_id;

  IF v_existing_stage IS NULL OR v_existing_stage = 'lead' THEN
    UPDATE public.clients
    SET journey_stage = 'agendado'
    WHERE id = v_client_id;
  END IF;

  INSERT INTO public.registration_sessions (
    professional_id,
    session_token,
    data,
    completed_at,
    client_id
  )
  VALUES (
    v_professional.id,
    gen_random_uuid()::text,
    jsonb_build_object(
      'kind', 'public_booking',
      'slug', p_slug,
      'lang', v_locale,
      'ref', p_ref,
      'service_id', v_service.id,
      'scheduled_at', p_scheduled_at
    ),
    now(),
    v_client_id
  )
  RETURNING id INTO v_session_id;

  PERFORM public.log_audit_event(
    v_professional.id,
    'client',
    'appointment.created',
    'appointment',
    v_appointment_id,
    jsonb_build_object(
      'source', 'public_booking',
      'client_id', v_client_id,
      'service_id', v_service.id,
      'registration_session_id', v_session_id,
      'lang', v_locale,
      'ref', p_ref
    )
  );

  RETURN jsonb_build_object(
    'appointment_id', v_appointment_id,
    'client_id', v_client_id,
    'registration_session_id', v_session_id,
    'confirmation_status', 'queued',
    'dry_run', false,
    'next_step', 'confirmation_page'
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_public_anamnese_form(
  p_token uuid,
  p_lang text DEFAULT 'pt-BR'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_ficha record;
  v_locale text;
BEGIN
  v_locale := CASE
    WHEN p_lang IN ('pt-BR', 'en-US', 'es-419') THEN p_lang
    ELSE 'pt-BR'
  END;

  SELECT
    f.id,
    f.public_token,
    f.status,
    f.token_expires_at,
    f.dados_pessoais,
    f.queixas,
    f.historico,
    f.alergias,
    f.habitos,
    f.custom_data,
    t.fields,
    COALESCE(NULLIF(p.business_name, ''), p.name) AS public_name,
    p.logo_url,
    COALESCE(p.settings->>'brand_color', '#0f766e') AS brand_color
  INTO v_ficha
  FROM public.anamnese_fichas f
  JOIN public.anamnese_templates t ON t.id = f.template_id
  JOIN public.professionals p ON p.id = f.professional_id
  WHERE f.public_token = p_token
    AND p.deleted_at IS NULL
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found', 'locale', v_locale);
  END IF;

  IF v_ficha.token_expires_at <= now() OR v_ficha.status = 'expirado' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'expired', 'locale', v_locale);
  END IF;

  IF v_ficha.status <> 'aguardando' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'already_completed', 'status', v_ficha.status, 'locale', v_locale);
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'locale', v_locale,
    'token', v_ficha.public_token,
    'status', v_ficha.status,
    'expires_at', v_ficha.token_expires_at,
    'professional',
    jsonb_build_object(
      'public_name', v_ficha.public_name,
      'logo_url', v_ficha.logo_url,
      'brand_color', v_ficha.brand_color
    ),
    'template_fields', v_ficha.fields,
    'sections',
    jsonb_build_object(
      'dados_pessoais', v_ficha.dados_pessoais,
      'queixas', v_ficha.queixas,
      'historico', v_ficha.historico,
      'alergias', v_ficha.alergias,
      'habitos', v_ficha.habitos,
      'custom_data', v_ficha.custom_data
    )
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_public_anamnese(
  p_token uuid,
  p_dados_pessoais jsonb DEFAULT '{}',
  p_queixas jsonb DEFAULT '{}',
  p_historico jsonb DEFAULT '{}',
  p_alergias jsonb DEFAULT '{}',
  p_habitos jsonb DEFAULT '{}',
  p_custom_data jsonb DEFAULT '{}',
  p_lgpd_aceito boolean DEFAULT false,
  p_lgpd_ip text DEFAULT NULL,
  p_lang text DEFAULT 'pt-BR'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_ficha record;
  v_locale text;
BEGIN
  v_locale := CASE
    WHEN p_lang IN ('pt-BR', 'en-US', 'es-419') THEN p_lang
    ELSE 'pt-BR'
  END;

  IF p_lgpd_aceito IS NOT TRUE THEN
    RAISE EXCEPTION 'lgpd_required';
  END IF;

  SELECT
    f.id,
    f.professional_id,
    f.client_id,
    f.status,
    f.token_expires_at
  INTO v_ficha
  FROM public.anamnese_fichas f
  WHERE f.public_token = p_token
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'anamnese_not_found';
  END IF;

  IF v_ficha.token_expires_at <= now() OR v_ficha.status = 'expirado' THEN
    UPDATE public.anamnese_fichas
    SET status = 'expirado'
    WHERE id = v_ficha.id
      AND status = 'aguardando';

    RAISE EXCEPTION 'anamnese_expired';
  END IF;

  IF v_ficha.status <> 'aguardando' THEN
    RAISE EXCEPTION 'anamnese_already_completed';
  END IF;

  UPDATE public.anamnese_fichas
  SET dados_pessoais = COALESCE(p_dados_pessoais, '{}'),
      queixas = COALESCE(p_queixas, '{}'),
      historico = COALESCE(p_historico, '{}'),
      alergias = COALESCE(p_alergias, '{}'),
      habitos = COALESCE(p_habitos, '{}'),
      custom_data = COALESCE(p_custom_data, '{}'),
      fotos = '[]',
      assinatura_url = NULL,
      assinado_em = NULL,
      lgpd_aceito = true,
      lgpd_aceito_em = now(),
      lgpd_ip = p_lgpd_ip,
      status = 'preenchido',
      preenchido_em = now()
  WHERE id = v_ficha.id;

  UPDATE public.clients
  SET has_anamnese = true,
      last_anamnese_at = now()
  WHERE id = v_ficha.client_id
    AND professional_id = v_ficha.professional_id;

  PERFORM public.log_audit_event(
    v_ficha.professional_id,
    'client',
    'anamnese.completed',
    'anamnese_ficha',
    v_ficha.id,
    jsonb_build_object(
      'client_id', v_ficha.client_id,
      'lang', v_locale,
      'lgpd_aceito', true
    )
  );

  RETURN jsonb_build_object(
    'ok', true,
    'status', 'preenchido',
    'preenchido_em', now()
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_public_booking_context(text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_public_appointment(text, uuid, timestamptz, text, text, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_public_anamnese_form(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.complete_public_anamnese(uuid, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, boolean, text, text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.get_public_booking_context(text, text, text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.create_public_appointment(text, uuid, timestamptz, text, text, text, text, text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_public_anamnese_form(uuid, text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.complete_public_anamnese(uuid, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, boolean, text, text) TO anon, authenticated, service_role;

-- ============================================================
-- Rollback notes:
--
-- DROP FUNCTION IF EXISTS public.complete_public_anamnese(uuid, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, boolean, text, text);
-- DROP FUNCTION IF EXISTS public.get_public_anamnese_form(uuid, text);
-- DROP FUNCTION IF EXISTS public.create_public_appointment(text, uuid, timestamptz, text, text, text, text, text);
-- DROP FUNCTION IF EXISTS public.get_public_booking_context(text, text, text);
-- DROP TABLE IF EXISTS public.anamnese_fichas;
-- DROP TABLE IF EXISTS public.anamnese_templates;
-- DROP TABLE IF EXISTS public.registration_sessions;
-- DROP TABLE IF EXISTS public.registration_links;
-- DROP INDEX IF EXISTS public.idx_services_public_booking;
-- ALTER TABLE public.appointments
--   DROP COLUMN IF EXISTS booked_at,
--   DROP COLUMN IF EXISTS booked_by_client;
-- ALTER TABLE public.clients
--   DROP COLUMN IF EXISTS last_anamnese_at,
--   DROP COLUMN IF EXISTS has_anamnese,
--   DROP COLUMN IF EXISTS lgpd_consent_channel,
--   DROP COLUMN IF EXISTS pwa_token_expires_at,
--   DROP COLUMN IF EXISTS pwa_token,
--   DROP COLUMN IF EXISTS push_notifications_enabled,
--   DROP COLUMN IF EXISTS pwa_onboarded_at;
-- ============================================================
