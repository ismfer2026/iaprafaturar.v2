-- ============================================================
-- Phase 11 - Auth identity handoff foundation
--
-- Protected public-flow invariant:
-- authenticated professionals must satisfy
--   auth.users.id = professionals.id = professionals.user_id
--
-- This migration fixes future account creation paths. It does not
-- rewrite existing divergent professional IDs; those require an
-- explicit per-ID remediation plan because professionals.id is widely
-- referenced by tenant data.
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

CREATE OR REPLACE FUNCTION public.create_professional_from_signup(
  p_name text,
  p_slug text DEFAULT NULL,
  p_phone_whatsapp text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_id uuid;
  v_email text;
  v_slug text;
  v_base text;
  v_phone text;
  v_pending_id uuid;
BEGIN
  v_email := auth.jwt() ->> 'email';

  IF auth.uid() IS NULL OR v_email IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  SELECT id
  INTO v_id
  FROM public.professionals
  WHERE user_id = auth.uid();

  IF FOUND THEN
    IF v_id IS DISTINCT FROM auth.uid() THEN
      RAISE EXCEPTION 'professional_auth_id_mismatch';
    END IF;

    IF p_phone_whatsapp IS NOT NULL THEN
      UPDATE public.professionals
      SET
        phone_whatsapp = COALESCE(phone_whatsapp, NULLIF(public.normalize_phone_digits(p_phone_whatsapp), '')),
        updated_at = now()
      WHERE id = v_id;
    END IF;

    RETURN v_id;
  END IF;

  SELECT id
  INTO v_pending_id
  FROM public.professionals
  WHERE lower(email) = lower(v_email)
    AND user_id IS NULL
  LIMIT 1;

  IF v_pending_id IS NOT NULL THEN
    RAISE EXCEPTION 'pre_account_requires_public_create_account';
  END IF;

  v_phone := NULLIF(public.normalize_phone_digits(COALESCE(p_phone_whatsapp, '')), '');

  v_base := lower(regexp_replace(
    extensions.unaccent(p_name), '[^a-z0-9]+', '-', 'g'
  ));
  v_slug := COALESCE(NULLIF(p_slug, ''), v_base);

  WHILE EXISTS (SELECT 1 FROM public.professionals WHERE slug = v_slug) LOOP
    v_slug := v_base || '-' || substr(md5(random()::text), 1, 4);
  END LOOP;

  INSERT INTO public.professionals (id, user_id, name, email, slug, phone_whatsapp)
  VALUES (auth.uid(), auth.uid(), p_name, v_email, v_slug, v_phone)
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_professional_from_signup(text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_professional_from_signup(text, text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.create_public_professional_preaccount(
  p_email text,
  p_name text DEFAULT NULL,
  p_phone_whatsapp text DEFAULT NULL,
  p_ref text DEFAULT NULL,
  p_lang text DEFAULT 'pt-BR',
  p_conversation text DEFAULT NULL,
  p_collected_data jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_id uuid;
  v_email text;
  v_name text;
  v_slug text;
  v_base text;
  v_phone text;
  v_existing public.professionals%ROWTYPE;
BEGIN
  v_email := lower(btrim(COALESCE(p_email, '')));

  IF v_email = '' OR v_email !~* '^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_email');
  END IF;

  SELECT *
  INTO v_existing
  FROM public.professionals
  WHERE lower(email) = v_email
  ORDER BY created_at ASC
  LIMIT 1;

  IF FOUND THEN
    IF v_existing.user_id IS NOT NULL THEN
      RETURN jsonb_build_object('ok', false, 'error', 'email_already_registered');
    END IF;

    RETURN jsonb_build_object(
      'ok', true,
      'professional_id', v_existing.id,
      'email', v_existing.email,
      'status', 'existing_pending'
    );
  END IF;

  v_name := NULLIF(btrim(COALESCE(p_name, '')), '');
  v_name := COALESCE(v_name, split_part(v_email, '@', 1));
  v_phone := NULLIF(public.normalize_phone_digits(COALESCE(p_phone_whatsapp, '')), '');

  v_base := lower(regexp_replace(
    extensions.unaccent(v_name), '[^a-z0-9]+', '-', 'g'
  ));
  v_slug := v_base;

  WHILE EXISTS (SELECT 1 FROM public.professionals WHERE slug = v_slug) LOOP
    v_slug := v_base || '-' || substr(md5(random()::text), 1, 4);
  END LOOP;

  INSERT INTO public.professionals (
    name,
    email,
    phone_whatsapp,
    slug,
    onboarding_pending,
    onboarding_source,
    onboarding_step,
    onboarding_data
  )
  VALUES (
    v_name,
    v_email,
    v_phone,
    v_slug,
    true,
    'public_onboarding',
    1,
    jsonb_build_object(
      'ref', NULLIF(p_ref, ''),
      'lang', COALESCE(NULLIF(p_lang, ''), 'pt-BR'),
      'conversation', NULLIF(p_conversation, ''),
      'collected_data', COALESCE(p_collected_data, '{}'::jsonb)
    )
  )
  RETURNING id INTO v_id;

  RETURN jsonb_build_object(
    'ok', true,
    'professional_id', v_id,
    'email', v_email,
    'status', 'created'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.create_public_professional_preaccount(text, text, text, text, text, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_public_professional_preaccount(text, text, text, text, text, text, jsonb) TO anon, authenticated, service_role;

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
      confirmed_at,
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
      extensions.crypt(p_password, extensions.gen_salt('bf')),
      now(),
      now(),
      jsonb_build_object('provider', 'email', 'providers', ARRAY['email']),
      jsonb_build_object(
        'name', v_professional.name,
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
      v_professional.id::text,
      v_professional.id::text,
      v_professional.id,
      jsonb_build_object(
        'sub', v_professional.id::text,
        'email', v_email,
        'email_verified', true,
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

CREATE OR REPLACE FUNCTION public.complete_public_professional_account(
  p_professional_id uuid,
  p_email text,
  p_password text
)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT public.public_create_account_for_professional(p_professional_id, p_email, p_password);
$$;

REVOKE ALL ON FUNCTION public.complete_public_professional_account(uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.complete_public_professional_account(uuid, text, text) TO anon, authenticated, service_role;

COMMENT ON FUNCTION public.public_create_account_for_professional(uuid, text, text)
IS 'Protected public handoff: converts a professional pre-account into Auth using auth.users.id = professionals.id.';

-- Rollback guidance:
--   DROP FUNCTION IF EXISTS public.complete_public_professional_account(uuid, text, text);
--   DROP FUNCTION IF EXISTS public.public_create_account_for_professional(uuid, text, text);
--   DROP FUNCTION IF EXISTS public.create_public_professional_preaccount(text, text, text, text, text, text, jsonb);
--   Recreate public.handle_new_user and create_professional_from_signup from the previous applied migration.
