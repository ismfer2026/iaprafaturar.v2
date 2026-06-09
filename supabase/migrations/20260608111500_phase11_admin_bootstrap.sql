-- ============================================================
-- Phase 11 - Admin Auth bootstrap without creating a professional tenant
--
-- Admin users authenticate through auth.users + master_admins, but they are
-- not professional tenants. The Auth trigger must therefore skip professional
-- creation only for service-created users marked in raw_app_meta_data.
-- ============================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_professional_id uuid;
  v_name text;
  v_slug text;
  v_base text;
  v_phone text;
BEGIN
  IF COALESCE(NEW.raw_app_meta_data->>'admin_bootstrap', 'false') = 'true' THEN
    RETURN NEW;
  END IF;

  v_professional_id := NULLIF(NEW.raw_user_meta_data->>'professional_id', '')::uuid;

  IF v_professional_id IS NOT NULL AND v_professional_id IS DISTINCT FROM NEW.id THEN
    RAISE EXCEPTION 'professional_auth_id_mismatch'
      USING HINT = 'Use public_create_account_for_professional / public-create-account; do not use frontend signUp for public handoff.';
  END IF;

  IF v_professional_id IS NOT NULL THEN
    UPDATE public.professionals
    SET
      user_id = NEW.id,
      email = COALESCE(email, NEW.email),
      onboarding_pending = false,
      updated_at = now()
    WHERE id = NEW.id
      AND user_id IS NULL;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'pre_account_not_found_or_already_linked'
        USING HINT = 'The professional pre-account must exist with user_id null before Auth creation.';
    END IF;

    RETURN NEW;
  END IF;

  SELECT id
  INTO v_professional_id
  FROM public.professionals
  WHERE lower(email) = lower(NEW.email)
    AND user_id IS NULL
  LIMIT 1;

  IF v_professional_id IS NOT NULL THEN
    RAISE EXCEPTION 'pre_account_requires_public_create_account'
      USING HINT = 'This email has a pending professional pre-account; use the protected /criar-conta flow.';
  END IF;

  v_name := COALESCE(
    NEW.raw_user_meta_data->>'name',
    split_part(NEW.email, '@', 1)
  );

  v_phone := NULLIF(public.normalize_phone_digits(COALESCE(NEW.raw_user_meta_data->>'phone_whatsapp', '')), '');

  v_base := lower(regexp_replace(
    extensions.unaccent(v_name), '[^a-z0-9]+', '-', 'g'
  ));
  v_slug := v_base;

  WHILE EXISTS (SELECT 1 FROM public.professionals WHERE slug = v_slug) LOOP
    v_slug := v_base || '-' || substr(md5(random()::text), 1, 4);
  END LOOP;

  INSERT INTO public.professionals (id, user_id, name, email, slug, phone_whatsapp)
  VALUES (NEW.id, NEW.id, v_name, NEW.email, v_slug, v_phone);

  -- Auth trigger intentionally does not process referral, affiliate,
  -- billing, credits, growth, admin bootstrap, wallets or setup objects.
  -- Those modules cannot break account creation.
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.bootstrap_master_admin(
  p_email text,
  p_password text,
  p_name text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_email text;
  v_name text;
  v_user_id uuid;
BEGIN
  v_email := lower(btrim(COALESCE(p_email, '')));
  v_name := NULLIF(btrim(COALESCE(p_name, '')), '');

  IF v_email = '' OR v_email !~* '^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_email');
  END IF;

  IF length(COALESCE(p_password, '')) < 8 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'weak_password');
  END IF;

  SELECT id
  INTO v_user_id
  FROM auth.users
  WHERE lower(email) = v_email
  LIMIT 1;

  IF v_user_id IS NULL THEN
    v_user_id := gen_random_uuid();

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
      v_user_id,
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
      jsonb_build_object(
        'provider', 'email',
        'providers', ARRAY['email'],
        'admin_bootstrap', true,
        'role', 'admin_master'
      ),
      jsonb_build_object(
        'sub', v_user_id::text,
        'email', v_email,
        'email_verified', true,
        'name', COALESCE(v_name, split_part(v_email, '@', 1)),
        'phone_verified', false
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
      v_user_id::text,
      v_user_id,
      jsonb_build_object(
        'sub', v_user_id::text,
        'email', v_email,
        'email_verified', true,
        'name', COALESCE(v_name, split_part(v_email, '@', 1)),
        'phone_verified', false
      ),
      'email',
      now(),
      now(),
      now()
    )
    ON CONFLICT (provider_id, provider) DO NOTHING;
  END IF;

  INSERT INTO public.master_admins (user_id, email, name)
  VALUES (v_user_id, v_email, v_name)
  ON CONFLICT (user_id) DO UPDATE
  SET
    email = EXCLUDED.email,
    name = COALESCE(EXCLUDED.name, public.master_admins.name);

  INSERT INTO public.user_roles (user_id, role)
  VALUES (v_user_id, 'admin_master')
  ON CONFLICT (user_id, role) DO NOTHING;

  RETURN jsonb_build_object(
    'ok', true,
    'user_id', v_user_id,
    'email', v_email
  );
END;
$$;

REVOKE ALL ON FUNCTION public.bootstrap_master_admin(text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.bootstrap_master_admin(text, text, text) TO service_role;

COMMENT ON FUNCTION public.bootstrap_master_admin(text, text, text)
IS 'Service-role only admin bootstrap. Creates/links auth.users + master_admins without creating a professionals tenant.';

-- Rollback:
-- DROP FUNCTION IF EXISTS public.bootstrap_master_admin(text, text, text);
-- Recreate public.handle_new_user() from 20260608102000_phase11_auth_identity_handoff.sql if needed.
