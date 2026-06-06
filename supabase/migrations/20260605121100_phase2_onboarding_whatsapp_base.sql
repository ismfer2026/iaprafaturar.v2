-- ============================================================
-- Phase 2: onboarding/auth base + professional WhatsApp source
--
-- Scope:
-- - create canonical professional_whatsapp table
-- - add minimal follow-up/progress columns to nerissa_setup_sessions
-- - make handle_new_user persist phone_whatsapp atomically
-- - add official onboarding completion RPC with IDOR protection
-- ============================================================

CREATE TABLE public.professional_whatsapp (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  professional_id       uuid NOT NULL REFERENCES public.professionals(id) ON DELETE RESTRICT,
  provider              text NOT NULL DEFAULT 'evolution_go'
                        CHECK (provider IN ('evolution_go', 'meta_waba')),
  instance_name         text,
  instance_id           text,
  instance_token        text,
  phone_number          text,
  status                text NOT NULL DEFAULT 'disconnected'
                        CHECK (status IN ('disconnected', 'connecting', 'connected', 'error')),
  is_connected          boolean NOT NULL DEFAULT false,
  last_connected_at     timestamptz,
  last_disconnected_at  timestamptz,
  disconnection_reason  text,
  connection_mode       text NOT NULL DEFAULT 'qr'
                        CHECK (connection_mode IN ('qr', 'pairing_code', 'waba')),
  number_kind           text
                        CHECK (number_kind IS NULL OR number_kind IN ('personal', 'business', 'unknown')),
  qr_code               text,
  qr_expires_at         timestamptz,
  meta_phone_number_id  text,
  meta_waba_id          text,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT professional_whatsapp_provider_fields CHECK (
    (provider = 'evolution_go' AND instance_name IS NOT NULL)
    OR provider = 'meta_waba'
  ),
  CONSTRAINT professional_whatsapp_connected_fields CHECK (
    is_connected = false
    OR (
      (provider = 'evolution_go' AND instance_name IS NOT NULL)
      OR (provider = 'meta_waba' AND meta_phone_number_id IS NOT NULL AND meta_waba_id IS NOT NULL)
    )
  ),
  CONSTRAINT professional_whatsapp_status_consistency CHECK (
    (status = 'connected' AND is_connected = true)
    OR (status <> 'connected' AND is_connected = false)
  )
);

CREATE TRIGGER professional_whatsapp_updated_at
  BEFORE UPDATE ON public.professional_whatsapp
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE UNIQUE INDEX idx_prof_whatsapp_prof_provider
  ON public.professional_whatsapp(professional_id, provider);

CREATE UNIQUE INDEX idx_prof_whatsapp_instance_name
  ON public.professional_whatsapp(instance_name)
  WHERE instance_name IS NOT NULL;

CREATE INDEX idx_prof_whatsapp_connected
  ON public.professional_whatsapp(professional_id, is_connected);

CREATE INDEX idx_prof_whatsapp_status
  ON public.professional_whatsapp(provider, status);

ALTER TABLE public.professional_whatsapp ENABLE ROW LEVEL SECURITY;

CREATE POLICY "professional_whatsapp_select_own"
ON public.professional_whatsapp FOR SELECT TO authenticated
USING (professional_id = public.auth_professional_id());

REVOKE ALL ON public.professional_whatsapp FROM authenticated;
GRANT SELECT (
  id,
  professional_id,
  provider,
  instance_name,
  instance_id,
  phone_number,
  status,
  is_connected,
  last_connected_at,
  last_disconnected_at,
  disconnection_reason,
  connection_mode,
  number_kind,
  qr_code,
  qr_expires_at,
  meta_phone_number_id,
  meta_waba_id,
  created_at,
  updated_at
) ON public.professional_whatsapp TO authenticated;

ALTER TABLE public.nerissa_setup_sessions
  ADD COLUMN IF NOT EXISTS locale text NOT NULL DEFAULT 'pt-BR'
    CHECK (locale IN ('pt-BR', 'en-US', 'es-419')),
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'app_signup',
  ADD COLUMN IF NOT EXISTS completion_percent numeric(5,2) NOT NULL DEFAULT 0
    CHECK (completion_percent >= 0 AND completion_percent <= 100),
  ADD COLUMN IF NOT EXISTS last_contact_at timestamptz,
  ADD COLUMN IF NOT EXISTS next_follow_up_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_nerissa_setup_sessions_due_followup
ON public.nerissa_setup_sessions(next_follow_up_at)
WHERE status IN ('pending', 'in_progress', 'paused')
  AND next_follow_up_at IS NOT NULL;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_name text;
  v_slug text;
  v_base text;
  v_phone text;
BEGIN
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

  INSERT INTO public.professionals (user_id, name, email, slug, phone_whatsapp)
  VALUES (NEW.id, v_name, NEW.email, v_slug, v_phone);

  RETURN NEW;
END;
$$;

DROP FUNCTION IF EXISTS public.create_professional_from_signup(text, text);

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
  v_id    uuid;
  v_email text;
  v_slug  text;
  v_base  text;
  v_phone text;
BEGIN
  v_email := auth.jwt() ->> 'email';

  IF v_email IS NULL THEN
    RAISE EXCEPTION 'Email not found in JWT';
  END IF;

  SELECT id INTO v_id
  FROM public.professionals
  WHERE user_id = auth.uid();

  IF FOUND THEN
    IF p_phone_whatsapp IS NOT NULL THEN
      UPDATE public.professionals
      SET phone_whatsapp = COALESCE(phone_whatsapp, NULLIF(public.normalize_phone_digits(p_phone_whatsapp), ''))
      WHERE id = v_id;
    END IF;

    RETURN v_id;
  END IF;

  v_phone := NULLIF(public.normalize_phone_digits(COALESCE(p_phone_whatsapp, '')), '');

  v_base := lower(regexp_replace(
    extensions.unaccent(p_name), '[^a-z0-9]+', '-', 'g'
  ));
  v_slug := COALESCE(p_slug, v_base);

  WHILE EXISTS (SELECT 1 FROM public.professionals WHERE slug = v_slug) LOOP
    v_slug := v_base || '-' || substr(md5(random()::text), 1, 4);
  END LOOP;

  INSERT INTO public.professionals (user_id, name, email, slug, phone_whatsapp)
  VALUES (auth.uid(), p_name, v_email, v_slug, v_phone)
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_professional_from_signup(text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_professional_from_signup(text, text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.complete_professional_onboarding(
  p_professional_id uuid,
  p_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_professional public.professionals%ROWTYPE;
  v_session public.nerissa_setup_sessions%ROWTYPE;
  v_connected_instance record;
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role'
     AND p_professional_id IS DISTINCT FROM public.auth_professional_id() THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  SELECT *
  INTO v_professional
  FROM public.professionals
  WHERE id = p_professional_id
    AND deleted_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Professional not found';
  END IF;

  SELECT *
  INTO v_session
  FROM public.nerissa_setup_sessions
  WHERE professional_id = p_professional_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Onboarding setup session not found';
  END IF;

  IF v_professional.onboarding_essentials_completed IS NOT TRUE THEN
    RAISE EXCEPTION 'Onboarding essentials are not completed';
  END IF;

  SELECT id, instance_name, provider
  INTO v_connected_instance
  FROM public.professional_whatsapp
  WHERE professional_id = p_professional_id
    AND is_connected = true
    AND status = 'connected'
  ORDER BY last_connected_at DESC NULLS LAST, created_at DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Professional WhatsApp is not connected';
  END IF;

  UPDATE public.professionals
  SET onboarding_completed = true,
      onboarding_pending = false,
      whatsapp_connected = true,
      whatsapp_connected_at = COALESCE(whatsapp_connected_at, now())
  WHERE id = p_professional_id;

  UPDATE public.nerissa_setup_sessions
  SET status = 'completed',
      completion_percent = 100,
      completed_at = COALESCE(completed_at, now()),
      current_step = 'completed'
  WHERE id = v_session.id;

  INSERT INTO public.nerissa_setup_events (
    session_id,
    professional_id,
    event_type,
    agent_slug,
    data
  ) VALUES (
    v_session.id,
    p_professional_id,
    'professional.onboarding.completed',
    CASE WHEN COALESCE(auth.role(), '') = 'service_role' THEN 'nerissa-setup-agent' ELSE NULL END,
    jsonb_build_object(
      'reason', p_reason,
      'actor_role', auth.role(),
      'provider', v_connected_instance.provider,
      'instance_name', v_connected_instance.instance_name,
      'professional_whatsapp_id', v_connected_instance.id
    )
  );

  RETURN jsonb_build_object(
    'completed', true,
    'professional_id', p_professional_id,
    'session_id', v_session.id,
    'professional_whatsapp_id', v_connected_instance.id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.complete_professional_onboarding(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.complete_professional_onboarding(uuid, text) TO authenticated, service_role;

COMMENT ON TABLE public.professional_whatsapp IS
  'Canonical WhatsApp connection state for each professional. Supports Evolution Go and Meta WABA without exposing credentials to the frontend.';

COMMENT ON FUNCTION public.complete_professional_onboarding(uuid, text) IS
  'Official onboarding completion RPC. Blocks IDOR for authenticated users, permits service_role via backend agents, and requires essentials plus connected WhatsApp.';

-- Rollback note for development-only reset:
-- DROP FUNCTION IF EXISTS public.complete_professional_onboarding(uuid, text);
-- DROP TABLE IF EXISTS public.professional_whatsapp;
-- ALTER TABLE public.nerissa_setup_sessions
--   DROP COLUMN IF EXISTS locale,
--   DROP COLUMN IF EXISTS source,
--   DROP COLUMN IF EXISTS completion_percent,
--   DROP COLUMN IF EXISTS last_contact_at,
--   DROP COLUMN IF EXISTS next_follow_up_at;
