-- Phase 11: Professional onboarding essentials RPC

CREATE OR REPLACE FUNCTION public.update_professional_onboarding_essentials(
  p_business_name text DEFAULT NULL,
  p_phone_whatsapp text DEFAULT NULL,
  p_business_hours jsonb DEFAULT '{}'::jsonb,
  p_agent_name text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_professional_id uuid;
  v_phone text;
  v_has_profile boolean;
  v_has_service boolean;
  v_has_hours boolean;
  v_has_agent boolean;
  v_has_whatsapp boolean;
  v_completed boolean;
BEGIN
  v_professional_id := public.auth_professional_id();

  IF v_professional_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  v_phone := NULLIF(public.normalize_phone_digits(COALESCE(p_phone_whatsapp, '')), '');

  UPDATE public.professionals
  SET
    business_name = COALESCE(NULLIF(trim(p_business_name), ''), business_name),
    phone_whatsapp = COALESCE(v_phone, phone_whatsapp),
    settings = jsonb_set(
      COALESCE(settings, '{}'::jsonb),
      '{business_hours}',
      COALESCE(p_business_hours, '{}'::jsonb),
      true
    ),
    updated_at = now()
  WHERE id = v_professional_id;

  IF NULLIF(trim(COALESCE(p_agent_name, '')), '') IS NOT NULL THEN
    UPDATE public.professional_agents
    SET
      agent_name = trim(p_agent_name),
      is_active = true,
      updated_at = now()
    WHERE professional_id = v_professional_id
      AND agent_slug = 'rosane';

    INSERT INTO public.professional_agents (
      professional_id,
      agent_slug,
      agent_name,
      is_active
    )
    SELECT
      v_professional_id,
      'rosane',
      trim(p_agent_name),
      true
    
    WHERE NOT EXISTS (
      SELECT 1
      FROM public.professional_agents pa
      WHERE pa.professional_id = v_professional_id
        AND pa.agent_slug = 'rosane'
    );
  END IF;

  SELECT
    (
      NULLIF(trim(COALESCE(p.name, '')), '') IS NOT NULL
      AND (
        NULLIF(trim(COALESCE(p.business_name, '')), '') IS NOT NULL
        OR NULLIF(trim(COALESCE(p.name, '')), '') IS NOT NULL
      )
      AND NULLIF(trim(COALESCE(p.phone_whatsapp, '')), '') IS NOT NULL
    ),
    EXISTS (
      SELECT 1
      FROM public.services s
      WHERE s.professional_id = v_professional_id
        AND s.deleted_at IS NULL
        AND s.is_active = true
    ),
    COALESCE(p.settings->'business_hours', '{}'::jsonb) <> '{}'::jsonb,
    EXISTS (
      SELECT 1
      FROM public.professional_agents pa
      WHERE pa.professional_id = v_professional_id
        AND pa.agent_slug = 'rosane'
        AND pa.is_active = true
        AND NULLIF(trim(pa.agent_name), '') IS NOT NULL
    ),
    COALESCE(p.whatsapp_connected, false)
  INTO
    v_has_profile,
    v_has_service,
    v_has_hours,
    v_has_agent,
    v_has_whatsapp
  FROM public.professionals p
  WHERE p.id = v_professional_id;

  v_completed := v_has_profile AND v_has_service AND v_has_hours AND v_has_agent AND v_has_whatsapp;

  UPDATE public.professionals
  SET
    onboarding_essentials_completed = v_completed,
    onboarding_completed = CASE WHEN v_completed THEN true ELSE onboarding_completed END,
    onboarding_step = CASE WHEN v_completed THEN 100 ELSE onboarding_step END,
    updated_at = now()
  WHERE id = v_professional_id;

  PERFORM public.log_audit_event(
    v_professional_id,
    'professional',
    CASE WHEN v_completed THEN 'professional.onboarding.essentials_completed' ELSE 'professional.onboarding.essentials_updated' END,
    'professional',
    v_professional_id,
    jsonb_build_object(
      'has_profile', v_has_profile,
      'has_service', v_has_service,
      'has_hours', v_has_hours,
      'has_agent', v_has_agent,
      'has_whatsapp', v_has_whatsapp,
      'completed', v_completed
    )
  );

  RETURN jsonb_build_object(
    'ok', true,
    'completed', v_completed,
    'checks', jsonb_build_object(
      'profile', v_has_profile,
      'service', v_has_service,
      'hours', v_has_hours,
      'agent', v_has_agent,
      'whatsapp', v_has_whatsapp
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.update_professional_onboarding_essentials(text, text, jsonb, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.update_professional_onboarding_essentials(text, text, jsonb, text) TO authenticated;

COMMENT ON FUNCTION public.update_professional_onboarding_essentials(text, text, jsonb, text)
IS 'Phase 11 onboarding RPC. Derives professional_id from auth_professional_id and marks essentials complete only when profile, service, hours, assistant, and WhatsApp are ready.';

-- Rollback:
-- DROP FUNCTION IF EXISTS public.update_professional_onboarding_essentials(text, text, jsonb, text);
