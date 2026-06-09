-- ============================================================
-- Phase 11 fix - align nullable Auth token/string fields with
-- rows created by GoTrue. Some GoTrue paths expect empty strings,
-- not NULL, for email/password token columns.
-- ============================================================

UPDATE auth.users u
SET
  confirmation_token = COALESCE(u.confirmation_token, ''),
  recovery_token = COALESCE(u.recovery_token, ''),
  email_change_token_new = COALESCE(u.email_change_token_new, ''),
  email_change_token_current = COALESCE(u.email_change_token_current, ''),
  reauthentication_token = COALESCE(u.reauthentication_token, ''),
  email_change = COALESCE(u.email_change, ''),
  phone_change = COALESCE(u.phone_change, ''),
  phone_change_token = COALESCE(u.phone_change_token, ''),
  updated_at = now()
FROM public.professionals p
WHERE u.id = p.id
  AND p.onboarding_source = 'public_onboarding';

CREATE OR REPLACE FUNCTION public.public_create_account_for_professional(
  p_professional_id uuid,
  p_email text,
  p_password text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_professional public.professionals%ROWTYPE;
  v_email text;
  v_existing_auth_id uuid;
BEGIN
  v_email := lower(btrim(COALESCE(p_email, '')));

  IF p_professional_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_professional_id');
  END IF;

  IF v_email = '' OR v_email !~* '^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_email');
  END IF;

  IF length(COALESCE(p_password, '')) < 8 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'weak_password');
  END IF;

  SELECT *
  INTO v_professional
  FROM public.professionals
  WHERE id = p_professional_id
    AND lower(email) = v_email
    AND deleted_at IS NULL;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'pre_account_not_found');
  END IF;

  IF v_professional.user_id IS NOT NULL AND v_professional.user_id IS DISTINCT FROM v_professional.id THEN
    RETURN jsonb_build_object('ok', false, 'error', 'identity_integrity_incident');
  END IF;

  SELECT id
  INTO v_existing_auth_id
  FROM auth.users
  WHERE lower(email) = v_email
  LIMIT 1;

  IF v_existing_auth_id IS NOT NULL AND v_existing_auth_id IS DISTINCT FROM v_professional.id THEN
    RETURN jsonb_build_object('ok', false, 'error', 'email_already_registered');
  END IF;

  IF v_existing_auth_id IS NULL THEN
    INSERT INTO auth.users (
      instance_id,
      id,
      aud,
      role,
      email,
      encrypted_password,
      email_confirmed_at,
      confirmation_token,
      recovery_token,
      email_change_token_new,
      email_change_token_current,
      reauthentication_token,
      email_change,
      phone_change,
      phone_change_token,
      raw_app_meta_data,
      raw_user_meta_data,
      created_at,
      updated_at,
      is_sso_user,
      is_anonymous
    )
    VALUES (
      '00000000-0000-0000-0000-000000000000',
      v_professional.id,
      'authenticated',
      'authenticated',
      v_email,
      extensions.crypt(p_password, extensions.gen_salt('bf', 10)),
      now(),
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      jsonb_build_object('provider', 'email', 'providers', ARRAY['email']),
      jsonb_build_object(
        'sub', v_professional.id::text,
        'email', v_email,
        'email_verified', true,
        'name', v_professional.name,
        'phone_verified', false,
        'phone_whatsapp', v_professional.phone_whatsapp,
        'professional_id', v_professional.id,
        'onboarding_source', v_professional.onboarding_source,
        'onboarding_data', v_professional.onboarding_data
      ),
      now(),
      now(),
      false,
      false
    );

    INSERT INTO auth.identities (
      id,
      provider_id,
      user_id,
      identity_data,
      provider,
      last_sign_in_at,
      created_at,
      updated_at
    )
    VALUES (
      gen_random_uuid(),
      v_professional.id::text,
      v_professional.id,
      jsonb_build_object(
        'sub', v_professional.id::text,
        'email', v_email,
        'email_verified', true,
        'name', v_professional.name,
        'phone_verified', false
      ),
      'email',
      now(),
      now(),
      now()
    )
    ON CONFLICT (provider_id, provider) DO NOTHING;
  END IF;

  UPDATE public.professionals
  SET
    user_id = id,
    email = v_email,
    onboarding_pending = false,
    onboarding_step = GREATEST(onboarding_step, 2),
    updated_at = now()
  WHERE id = v_professional.id
    AND (user_id IS NULL OR user_id = id);

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'identity_integrity_incident');
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'professional_id', v_professional.id,
    'auth_user_id', v_professional.id,
    'email', v_email
  );
END;
$$;

REVOKE ALL ON FUNCTION public.public_create_account_for_professional(uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.public_create_account_for_professional(uuid, text, text) TO anon, authenticated, service_role;
