-- Phase 11: Admin manual onboarding completion

CREATE OR REPLACE FUNCTION public.admin_complete_professional_onboarding(
  p_professional_id uuid,
  p_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_admin_id uuid;
BEGIN
  PERFORM public.admin_assert_master();
  v_admin_id := auth.uid();

  IF p_professional_id IS NULL THEN
    RAISE EXCEPTION 'professional_id_required';
  END IF;

  UPDATE public.professionals
  SET
    onboarding_essentials_completed = true,
    onboarding_completed = true,
    onboarding_pending = false,
    onboarding_step = 100,
    updated_at = now()
  WHERE id = p_professional_id
    AND deleted_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'professional_not_found';
  END IF;

  PERFORM public.log_audit_event(
    p_professional_id,
    'admin',
    'admin.professional_onboarding.completed',
    'professional',
    p_professional_id,
    jsonb_build_object(
      'admin_user_id', v_admin_id,
      'reason', NULLIF(trim(COALESCE(p_reason, '')), '')
    )
  );

  RETURN jsonb_build_object(
    'ok', true,
    'professional_id', p_professional_id,
    'completed', true
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_complete_professional_onboarding(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_complete_professional_onboarding(uuid, text) TO authenticated;

COMMENT ON FUNCTION public.admin_complete_professional_onboarding(uuid, text)
IS 'Admin-only Phase 11 RPC. Completes professional onboarding manually after admin_assert_master and writes immutable audit_log with actor_type admin.';

-- Rollback:
-- DROP FUNCTION IF EXISTS public.admin_complete_professional_onboarding(uuid, text);
