-- Phase 23 follow-up: audited prompt rollback and server-owned secret status.

CREATE OR REPLACE FUNCTION public.phase23_activate_agent_prompt_version(p_version_id uuid, p_reason text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_status text;
  v_result jsonb;
BEGIN
  PERFORM public.admin_assert_master();
  IF NULLIF(trim(COALESCE(p_reason, '')), '') IS NULL THEN RAISE EXCEPTION 'reason_required'; END IF;

  SELECT status INTO v_status
  FROM public.agent_prompt_versions
  WHERE id = p_version_id
  FOR UPDATE;

  IF v_status IS NULL THEN RAISE EXCEPTION 'version_not_found'; END IF;
  IF v_status NOT IN ('staging', 'archived') THEN RAISE EXCEPTION 'version_not_activatable'; END IF;

  IF v_status = 'archived' THEN
    UPDATE public.agent_prompt_versions SET status = 'staging' WHERE id = p_version_id;
  END IF;

  v_result := public.admin_promote_agent_prompt_version(p_version_id);
  PERFORM public.phase23_log_admin_event(
    CASE WHEN v_status = 'archived' THEN 'admin.agent.prompt_rolled_back' ELSE 'admin.agent.prompt_promoted' END,
    'agent_prompt_version',
    p_version_id,
    jsonb_build_object('reason', trim(p_reason), 'previous_status', v_status)
  );
  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.phase23_update_admin_setting_status(
  p_setting_key text,
  p_status text,
  p_public_status jsonb,
  p_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_admin_id uuid;
BEGIN
  v_admin_id := public.admin_assert_master();
  IF p_setting_key NOT IN ('evolution', 'stripe', 'ai', 'security') THEN RAISE EXCEPTION 'invalid_setting_key'; END IF;
  IF p_status NOT IN ('not_configured', 'configured', 'healthy', 'degraded', 'offline') THEN RAISE EXCEPTION 'invalid_status'; END IF;
  IF NULLIF(trim(COALESCE(p_reason, '')), '') IS NULL THEN RAISE EXCEPTION 'reason_required'; END IF;

  UPDATE public.platform_admin_settings
  SET status = p_status,
      public_status = COALESCE(p_public_status, '{}'),
      last_checked_at = now(),
      updated_by = v_admin_id,
      updated_at = now()
  WHERE setting_key = p_setting_key;

  PERFORM public.phase23_log_admin_event(
    'admin.platform_setting.status_updated',
    'platform_setting',
    NULL,
    jsonb_build_object('admin_id', v_admin_id, 'setting_key', p_setting_key, 'status', p_status, 'reason', trim(p_reason))
  );
  RETURN jsonb_build_object('ok', true, 'setting_key', p_setting_key, 'status', p_status);
END;
$$;

REVOKE ALL ON FUNCTION public.phase23_promote_agent_prompt_version(uuid, text) FROM authenticated;
REVOKE ALL ON FUNCTION public.phase23_upsert_admin_setting_status(text, text, jsonb, boolean, text) FROM authenticated;
REVOKE ALL ON FUNCTION public.phase23_activate_agent_prompt_version(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.phase23_update_admin_setting_status(text, text, jsonb, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.phase23_activate_agent_prompt_version(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.phase23_update_admin_setting_status(text, text, jsonb, text) TO authenticated;
