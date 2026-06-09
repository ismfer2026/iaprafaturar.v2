-- ============================================================
-- Phase 11 - Client PWA onboarding
--
-- Public client onboarding is not a client account. It identifies the
-- client inside a professional tenant by slug + phone, records LGPD consent
-- and basic communication preferences, then sends the client to booking.
-- ============================================================

CREATE OR REPLACE FUNCTION public.complete_public_client_onboarding(
  p_slug text,
  p_full_name text,
  p_phone_whatsapp text,
  p_email text DEFAULT NULL,
  p_lgpd_accepted boolean DEFAULT false,
  p_contact_preference text DEFAULT 'whatsapp',
  p_reminders_opt_in boolean DEFAULT true,
  p_lang text DEFAULT 'pt-BR',
  p_ref text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_professional_id uuid;
  v_slug text;
  v_full_name text;
  v_phone text;
  v_email text;
  v_locale text;
  v_contact_preference text;
  v_client_id uuid;
BEGIN
  v_slug := lower(btrim(COALESCE(p_slug, '')));
  v_full_name := btrim(COALESCE(p_full_name, ''));
  v_phone := public.normalize_phone_digits(COALESCE(p_phone_whatsapp, ''));
  v_email := NULLIF(lower(btrim(COALESCE(p_email, ''))), '');
  v_locale := COALESCE(NULLIF(p_lang, ''), 'pt-BR');
  v_contact_preference := COALESCE(NULLIF(p_contact_preference, ''), 'whatsapp');

  IF v_slug = '' THEN
    RAISE EXCEPTION 'professional_not_found';
  END IF;

  IF v_full_name = '' OR length(v_phone) < 8 THEN
    RAISE EXCEPTION 'invalid_input';
  END IF;

  IF v_email IS NOT NULL AND v_email !~* '^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$' THEN
    RAISE EXCEPTION 'invalid_input';
  END IF;

  IF NOT COALESCE(p_lgpd_accepted, false) THEN
    RAISE EXCEPTION 'lgpd_required';
  END IF;

  IF v_contact_preference NOT IN ('whatsapp', 'email', 'both') THEN
    RAISE EXCEPTION 'invalid_input';
  END IF;

  SELECT id
  INTO v_professional_id
  FROM public.professionals
  WHERE slug = v_slug
    AND deleted_at IS NULL
    AND onboarding_completed = true;

  IF v_professional_id IS NULL THEN
    RAISE EXCEPTION 'professional_not_found';
  END IF;

  SELECT id
  INTO v_client_id
  FROM public.clients
  WHERE professional_id = v_professional_id
    AND phone_whatsapp = v_phone
    AND deleted_at IS NULL
  LIMIT 1;

  IF v_client_id IS NULL THEN
    INSERT INTO public.clients (
      professional_id,
      full_name,
      phone_whatsapp,
      email,
      source,
      lgpd_consent_at,
      lgpd_consent_source,
      lgpd_consent_channel,
      pwa_onboarded_at,
      push_notifications_enabled,
      whatsapp_opt_out,
      metadata
    )
    VALUES (
      v_professional_id,
      v_full_name,
      v_phone,
      v_email,
      'public_link',
      now(),
      'client_pwa_onboarding',
      'pwa',
      now(),
      COALESCE(p_reminders_opt_in, true),
      v_contact_preference = 'email',
      jsonb_build_object(
        'client_onboarding', jsonb_build_object(
          'lang', v_locale,
          'ref', p_ref,
          'contact_preference', v_contact_preference,
          'reminders_opt_in', COALESCE(p_reminders_opt_in, true),
          'completed_at', now()
        )
      )
    )
    RETURNING id INTO v_client_id;
  ELSE
    UPDATE public.clients
    SET
      full_name = v_full_name,
      email = COALESCE(v_email, email),
      lgpd_consent_at = COALESCE(lgpd_consent_at, now()),
      lgpd_consent_source = COALESCE(lgpd_consent_source, 'client_pwa_onboarding'),
      lgpd_consent_channel = COALESCE(lgpd_consent_channel, 'pwa'),
      pwa_onboarded_at = now(),
      push_notifications_enabled = COALESCE(p_reminders_opt_in, true),
      whatsapp_opt_out = v_contact_preference = 'email',
      whatsapp_opt_out_at = CASE
        WHEN v_contact_preference = 'email' AND whatsapp_opt_out_at IS NULL THEN now()
        WHEN v_contact_preference <> 'email' THEN NULL
        ELSE whatsapp_opt_out_at
      END,
      metadata = metadata || jsonb_build_object(
        'client_onboarding', jsonb_build_object(
          'lang', v_locale,
          'ref', p_ref,
          'contact_preference', v_contact_preference,
          'reminders_opt_in', COALESCE(p_reminders_opt_in, true),
          'completed_at', now()
        )
      ),
      updated_at = now()
    WHERE id = v_client_id
      AND professional_id = v_professional_id;
  END IF;

  PERFORM public.log_audit_event(
    v_professional_id,
    'client',
    'client.pwa_onboarding.completed',
    'client',
    v_client_id,
    jsonb_build_object(
      'source', 'client_pwa_onboarding',
      'lang', v_locale,
      'ref', p_ref,
      'contact_preference', v_contact_preference,
      'reminders_opt_in', COALESCE(p_reminders_opt_in, true)
    )
  );

  RETURN jsonb_build_object(
    'ok', true,
    'client_id', v_client_id,
    'professional_slug', v_slug,
    'next_step', 'booking'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.complete_public_client_onboarding(text, text, text, text, boolean, text, boolean, text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.complete_public_client_onboarding(text, text, text, text, boolean, text, boolean, text, text)
  TO anon, authenticated, service_role;

COMMENT ON FUNCTION public.complete_public_client_onboarding(text, text, text, text, boolean, text, boolean, text, text)
IS 'Public no-auth client PWA onboarding. Resolves tenant by professional slug, identifies client by (professional_id, phone_whatsapp), records LGPD and communication preferences.';

-- Rollback:
-- DROP FUNCTION IF EXISTS public.complete_public_client_onboarding(text, text, text, text, boolean, text, boolean, text, text);
