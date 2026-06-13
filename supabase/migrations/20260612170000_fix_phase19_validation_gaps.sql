-- Phase 19 validation fixes: team tenancy/auth context, role enforcement,
-- anamnese versioning, owner notification preferences and write hardening.

CREATE UNIQUE INDEX IF NOT EXISTS idx_team_members_user_id_unique
  ON public.team_members(user_id)
  WHERE user_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_professional_id uuid;
  v_team_member_id uuid;
  v_name text;
  v_slug text;
  v_base text;
  v_phone text;
BEGIN
  IF COALESCE(NEW.raw_app_meta_data->>'admin_bootstrap', 'false') = 'true' THEN
    RETURN NEW;
  END IF;

  v_team_member_id := NULLIF(NEW.raw_user_meta_data->>'team_member_id', '')::uuid;
  v_professional_id := NULLIF(NEW.raw_user_meta_data->>'professional_id', '')::uuid;

  IF v_team_member_id IS NOT NULL THEN
    IF v_professional_id IS NULL THEN
      RAISE EXCEPTION 'team_member_professional_id_required';
    END IF;

    UPDATE public.team_members
    SET user_id = NEW.id, updated_at = now()
    WHERE id = v_team_member_id
      AND professional_id = v_professional_id
      AND lower(email) = lower(NEW.email)
      AND user_id IS NULL
      AND is_active = true;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'team_member_invite_not_found_or_already_linked';
    END IF;
    RETURN NEW;
  END IF;

  IF v_professional_id IS NOT NULL AND v_professional_id IS DISTINCT FROM NEW.id THEN
    RAISE EXCEPTION 'professional_auth_id_mismatch'
      USING HINT = 'Use public_create_account_for_professional / public-create-account; do not use frontend signUp for public handoff.';
  END IF;

  IF v_professional_id IS NOT NULL THEN
    UPDATE public.professionals
    SET user_id = NEW.id, email = COALESCE(email, NEW.email),
        onboarding_pending = false, updated_at = now()
    WHERE id = NEW.id AND user_id IS NULL;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'pre_account_not_found_or_already_linked'
        USING HINT = 'The professional pre-account must exist with user_id null before Auth creation.';
    END IF;
    RETURN NEW;
  END IF;

  SELECT id INTO v_professional_id
  FROM public.professionals
  WHERE lower(email) = lower(NEW.email) AND user_id IS NULL
  LIMIT 1;
  IF v_professional_id IS NOT NULL THEN
    RAISE EXCEPTION 'pre_account_requires_public_create_account'
      USING HINT = 'This email has a pending professional pre-account; use the protected /criar-conta flow.';
  END IF;

  v_name := COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1));
  v_phone := NULLIF(public.normalize_phone_digits(COALESCE(NEW.raw_user_meta_data->>'phone_whatsapp', '')), '');
  v_base := lower(regexp_replace(extensions.unaccent(v_name), '[^a-z0-9]+', '-', 'g'));
  v_slug := v_base;
  WHILE EXISTS (SELECT 1 FROM public.professionals WHERE slug = v_slug) LOOP
    v_slug := v_base || '-' || substr(md5(random()::text), 1, 4);
  END LOOP;

  INSERT INTO public.professionals (id, user_id, name, email, slug, phone_whatsapp)
  VALUES (NEW.id, NEW.id, v_name, NEW.email, v_slug, v_phone);
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.auth_professional_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT COALESCE(
    (SELECT p.id FROM public.professionals p WHERE p.user_id = auth.uid() LIMIT 1),
    (SELECT tm.professional_id
     FROM public.team_members tm
     WHERE tm.user_id = auth.uid() AND tm.is_active = true
     LIMIT 1)
  );
$$;

REVOKE ALL ON FUNCTION public.auth_professional_id() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.auth_professional_id() TO authenticated;

CREATE OR REPLACE FUNCTION public.get_professional_auth_context()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_professional public.professionals%ROWTYPE;
  v_member public.team_members%ROWTYPE;
BEGIN
  SELECT * INTO v_professional
  FROM public.professionals
  WHERE user_id = auth.uid()
  LIMIT 1;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'professionalId', v_professional.id,
      'role', 'gestor',
      'teamMemberId', NULL,
      'onboardingCompleted', v_professional.onboarding_completed,
      'onboardingEssentialsCompleted', v_professional.onboarding_essentials_completed,
      'whatsappConnected', v_professional.whatsapp_connected
    );
  END IF;

  SELECT * INTO v_member
  FROM public.team_members
  WHERE user_id = auth.uid() AND is_active = true
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  SELECT * INTO v_professional
  FROM public.professionals
  WHERE id = v_member.professional_id;

  RETURN jsonb_build_object(
    'professionalId', v_professional.id,
    'role', v_member.nivel_acesso,
    'teamMemberId', v_member.id,
    'onboardingCompleted', v_professional.onboarding_completed,
    'onboardingEssentialsCompleted', v_professional.onboarding_essentials_completed,
    'whatsappConnected', v_professional.whatsapp_connected
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_professional_auth_context() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_professional_auth_context() TO authenticated;

-- Professional settings and identity are changed only through validated RPCs.
REVOKE UPDATE ON public.professionals FROM authenticated;

CREATE OR REPLACE FUNCTION public.deactivate_team_member(p_team_member_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_professional_id uuid := public.auth_professional_id();
  v_member public.team_members%ROWTYPE;
  v_has_owner boolean;
  v_other_active_gestores integer;
BEGIN
  IF v_professional_id IS NULL OR public.auth_professional_role() <> 'gestor' THEN
    RAISE EXCEPTION 'Unauthorized: gestor role required';
  END IF;

  SELECT * INTO v_member FROM public.team_members
  WHERE id = p_team_member_id AND professional_id = v_professional_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'team_member_not_found'; END IF;

  IF v_member.nivel_acesso = 'gestor' AND v_member.is_active THEN
    SELECT EXISTS (
      SELECT 1 FROM public.professionals
      WHERE id = v_professional_id AND user_id IS NOT NULL
    ) INTO v_has_owner;
    SELECT count(*) INTO v_other_active_gestores
    FROM public.team_members
    WHERE professional_id = v_professional_id
      AND nivel_acesso = 'gestor' AND is_active = true AND id <> v_member.id;
    IF NOT v_has_owner AND v_other_active_gestores = 0 THEN
      RAISE EXCEPTION 'cannot_deactivate_last_gestor';
    END IF;
  END IF;

  UPDATE public.team_members SET is_active = false
  WHERE id = v_member.id RETURNING * INTO v_member;
  PERFORM public.log_audit_event(v_professional_id, 'professional', 'team_member.deactivated',
    'team_member', v_member.id, jsonb_build_object('team_member_id', v_member.id));
  RETURN jsonb_build_object('team_member_id', v_member.id, 'team_member', to_jsonb(v_member));
END;
$$;

CREATE OR REPLACE FUNCTION public.update_team_member_permissions(
  p_team_member_id uuid,
  p_nivel_acesso text,
  p_possui_agenda boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_professional_id uuid := public.auth_professional_id();
  v_member public.team_members%ROWTYPE;
  v_has_owner boolean;
  v_other_active_gestores integer;
BEGIN
  IF v_professional_id IS NULL OR public.auth_professional_role() <> 'gestor' THEN
    RAISE EXCEPTION 'Unauthorized: gestor role required';
  END IF;
  IF COALESCE(p_nivel_acesso, '') NOT IN ('gestor', 'operacional') THEN
    RAISE EXCEPTION 'invalid_nivel_acesso';
  END IF;

  SELECT * INTO v_member FROM public.team_members
  WHERE id = p_team_member_id AND professional_id = v_professional_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'team_member_not_found'; END IF;

  IF v_member.nivel_acesso = 'gestor' AND v_member.is_active AND p_nivel_acesso <> 'gestor' THEN
    SELECT EXISTS (
      SELECT 1 FROM public.professionals
      WHERE id = v_professional_id AND user_id IS NOT NULL
    ) INTO v_has_owner;
    SELECT count(*) INTO v_other_active_gestores
    FROM public.team_members
    WHERE professional_id = v_professional_id
      AND nivel_acesso = 'gestor' AND is_active = true AND id <> v_member.id;
    IF NOT v_has_owner AND v_other_active_gestores = 0 THEN
      RAISE EXCEPTION 'cannot_demote_last_gestor';
    END IF;
  END IF;

  UPDATE public.team_members
  SET nivel_acesso = p_nivel_acesso, possui_agenda = COALESCE(p_possui_agenda, possui_agenda)
  WHERE id = v_member.id RETURNING * INTO v_member;
  PERFORM public.log_audit_event(v_professional_id, 'professional', 'team_member.permissions_updated',
    'team_member', v_member.id, jsonb_build_object(
      'team_member_id', v_member.id, 'nivel_acesso', v_member.nivel_acesso,
      'possui_agenda', v_member.possui_agenda));
  RETURN jsonb_build_object('team_member_id', v_member.id, 'team_member', to_jsonb(v_member));
END;
$$;

CREATE OR REPLACE FUNCTION public.create_anamnese_template_version(
  p_template_id uuid,
  p_name text,
  p_fields jsonb,
  p_is_default boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_professional_id uuid := public.auth_professional_id();
  v_old public.anamnese_templates%ROWTYPE;
  v_new public.anamnese_templates%ROWTYPE;
  v_is_default boolean;
BEGIN
  IF v_professional_id IS NULL OR public.auth_professional_role() <> 'gestor' THEN
    RAISE EXCEPTION 'Unauthorized: gestor role required';
  END IF;
  IF NULLIF(trim(COALESCE(p_name, '')), '') IS NULL THEN
    RAISE EXCEPTION 'Template name is required';
  END IF;

  SELECT * INTO v_old FROM public.anamnese_templates
  WHERE id = p_template_id AND professional_id = v_professional_id
    AND is_current = true AND deleted_at IS NULL
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'anamnese_template_not_found'; END IF;

  v_is_default := COALESCE(p_is_default, v_old.is_default);
  UPDATE public.anamnese_templates SET is_current = false, is_default = false WHERE id = v_old.id;

  INSERT INTO public.anamnese_templates (
    professional_id, name, fields, is_default, root_template_id,
    previous_version_id, version, is_current, published_at
  ) VALUES (
    v_professional_id, trim(p_name), COALESCE(p_fields, v_old.fields), v_is_default,
    v_old.root_template_id, v_old.id, v_old.version + 1, true, now()
  ) RETURNING * INTO v_new;

  IF v_is_default THEN
    UPDATE public.anamnese_templates SET is_default = false
    WHERE professional_id = v_professional_id AND id <> v_new.id AND deleted_at IS NULL;
  END IF;

  PERFORM public.log_audit_event(v_professional_id, 'professional', 'anamnese_template.version_created',
    'anamnese_template', v_new.id, jsonb_build_object(
      'previous_version_id', v_old.id, 'previous_version', v_old.version, 'new_version', v_new.version));
  RETURN jsonb_build_object('template_id', v_new.id, 'template', to_jsonb(v_new), 'previous_version_id', v_old.id);
END;
$$;

CREATE OR REPLACE FUNCTION public.phase19_require_gestor_document_write()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND public.auth_professional_role() <> 'gestor' THEN
    RAISE EXCEPTION 'Unauthorized: gestor role required';
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

REVOKE ALL ON FUNCTION public.phase19_require_gestor_document_write() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS service_packages_require_gestor ON public.service_packages;
CREATE TRIGGER service_packages_require_gestor BEFORE INSERT OR UPDATE OR DELETE ON public.service_packages
FOR EACH ROW EXECUTE FUNCTION public.phase19_require_gestor_document_write();
DROP TRIGGER IF EXISTS quotes_require_gestor ON public.quotes;
CREATE TRIGGER quotes_require_gestor BEFORE INSERT OR UPDATE OR DELETE ON public.quotes
FOR EACH ROW EXECUTE FUNCTION public.phase19_require_gestor_document_write();
DROP TRIGGER IF EXISTS modelos_require_gestor ON public.modelos;
CREATE TRIGGER modelos_require_gestor BEFORE INSERT OR UPDATE OR DELETE ON public.modelos
FOR EACH ROW EXECUTE FUNCTION public.phase19_require_gestor_document_write();
DROP TRIGGER IF EXISTS contracts_require_gestor ON public.contracts;
CREATE TRIGGER contracts_require_gestor BEFORE INSERT OR UPDATE OR DELETE ON public.contracts
FOR EACH ROW EXECUTE FUNCTION public.phase19_require_gestor_document_write();

CREATE OR REPLACE FUNCTION public.get_professional_notification_settings()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_professional_id uuid := public.auth_professional_id();
  v_role text := public.auth_professional_role();
  v_clinic_defaults jsonb;
  v_owner_preferences jsonb;
  v_team_member_id uuid;
  v_member_preferences jsonb;
  v_my_preferences jsonb;
  v_source text;
BEGIN
  IF v_professional_id IS NULL THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  SELECT COALESCE(settings->'notifications', '{}'::jsonb),
         COALESCE(settings->'owner_notifications', settings->'notifications', '{}'::jsonb)
  INTO v_clinic_defaults, v_owner_preferences
  FROM public.professionals WHERE id = v_professional_id;

  SELECT id, notifications INTO v_team_member_id, v_member_preferences
  FROM public.team_members
  WHERE professional_id = v_professional_id AND user_id = auth.uid() AND is_active = true
  LIMIT 1;

  IF v_team_member_id IS NOT NULL AND COALESCE(v_member_preferences, '{}'::jsonb) <> '{}'::jsonb THEN
    v_my_preferences := v_member_preferences;
    v_source := 'individual';
  ELSIF v_team_member_id IS NOT NULL THEN
    v_my_preferences := v_clinic_defaults;
    v_source := 'clinic';
  ELSE
    v_my_preferences := v_owner_preferences;
    v_source := 'individual';
  END IF;

  RETURN jsonb_build_object(
    'role', v_role,
    'clinicDefaults', v_clinic_defaults,
    'myPreferences', v_my_preferences,
    'myPreferencesSource', v_source
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.upsert_my_notification_preferences(p_preferences jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_professional_id uuid := public.auth_professional_id();
  v_validated jsonb;
  v_team_member_id uuid;
BEGIN
  IF v_professional_id IS NULL THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  v_validated := public.phase19_validate_notification_settings(p_preferences);
  SELECT id INTO v_team_member_id FROM public.team_members
  WHERE professional_id = v_professional_id AND user_id = auth.uid() AND is_active = true LIMIT 1;

  IF v_team_member_id IS NOT NULL THEN
    UPDATE public.team_members SET notifications = v_validated WHERE id = v_team_member_id;
  ELSE
    UPDATE public.professionals
    SET settings = jsonb_set(COALESCE(settings, '{}'::jsonb), '{owner_notifications}', v_validated, true)
    WHERE id = v_professional_id;
  END IF;
  PERFORM public.log_audit_event(v_professional_id, 'professional', 'notification_settings.personal_updated',
    CASE WHEN v_team_member_id IS NULL THEN 'professional' ELSE 'team_member' END,
    COALESCE(v_team_member_id, v_professional_id),
    jsonb_build_object('notifications', v_validated));
  RETURN jsonb_build_object('ok', true, 'preferences', v_validated);
END;
$$;

CREATE OR REPLACE FUNCTION public.get_professional_clinic_settings()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT jsonb_build_object(
    'name', p.name,
    'businessName', p.business_name,
    'email', p.email,
    'phoneWhatsapp', p.phone_whatsapp,
    'city', p.city,
    'neighborhood', p.neighborhood,
    'fullAddress', p.full_address,
    'bio', p.bio,
    'instagramHandle', p.instagram_handle
  )
  FROM public.professionals p
  WHERE p.id = public.auth_professional_id();
$$;

CREATE OR REPLACE FUNCTION public.upsert_professional_clinic_settings(
  p_name text,
  p_business_name text,
  p_phone_whatsapp text,
  p_city text DEFAULT NULL,
  p_neighborhood text DEFAULT NULL,
  p_full_address text DEFAULT NULL,
  p_bio text DEFAULT NULL,
  p_instagram_handle text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_professional_id uuid := public.auth_professional_id();
BEGIN
  IF v_professional_id IS NULL OR public.auth_professional_role() <> 'gestor' THEN
    RAISE EXCEPTION 'Unauthorized: gestor role required';
  END IF;
  IF NULLIF(trim(COALESCE(p_name, '')), '') IS NULL THEN RAISE EXCEPTION 'name_required'; END IF;

  UPDATE public.professionals
  SET name = trim(p_name),
      business_name = NULLIF(trim(COALESCE(p_business_name, '')), ''),
      phone_whatsapp = NULLIF(regexp_replace(COALESCE(p_phone_whatsapp, ''), '\D', '', 'g'), ''),
      city = NULLIF(trim(COALESCE(p_city, '')), ''),
      neighborhood = NULLIF(trim(COALESCE(p_neighborhood, '')), ''),
      full_address = NULLIF(trim(COALESCE(p_full_address, '')), ''),
      bio = NULLIF(trim(COALESCE(p_bio, '')), ''),
      instagram_handle = NULLIF(trim(COALESCE(p_instagram_handle, '')), '')
  WHERE id = v_professional_id;

  PERFORM public.log_audit_event(v_professional_id, 'professional', 'clinic_settings.updated',
    'professional', v_professional_id, '{}'::jsonb);
  RETURN public.get_professional_clinic_settings();
END;
$$;

REVOKE ALL ON FUNCTION public.get_professional_clinic_settings() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.upsert_professional_clinic_settings(text, text, text, text, text, text, text, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_professional_clinic_settings() TO authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_professional_clinic_settings(text, text, text, text, text, text, text, text)
  TO authenticated;
