-- Phase 23 fix: use the canonical agent execution timestamp and audit prompt staging by version.

CREATE OR REPLACE FUNCTION public.phase23_get_admin_agents()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM public.admin_assert_master();
  RETURN jsonb_build_object('agents', COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'id', a.id,
      'agent_slug', a.agent_slug,
      'display_name', a.display_name,
      'status', a.status,
      'owner', a.owner,
      'active_version', (
        SELECT v.version
        FROM public.agent_prompt_versions v
        WHERE v.agent_id = a.id AND v.status = 'active'
        ORDER BY v.version DESC
        LIMIT 1
      ),
      'versions', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'id', v.id,
          'version', v.version,
          'status', v.status,
          'changelog', v.changelog,
          'created_at', v.created_at
        ) ORDER BY v.version DESC)
        FROM public.agent_prompt_versions v
        WHERE v.agent_id = a.id
      ), '[]'::jsonb),
      'last_pause_until', (
        SELECT pw.paused_until
        FROM public.agent_pause_windows pw
        WHERE pw.agent_id = a.id
        ORDER BY pw.created_at DESC
        LIMIT 1
      ),
      'executions_30d', (
        SELECT COUNT(*)
        FROM public.agent_executions e
        WHERE e.agent_slug = a.agent_slug
          AND e.started_at >= now() - interval '30 days'
      )
    ) ORDER BY a.agent_slug)
    FROM public.agent_registry a
  ), '[]'::jsonb));
END;
$$;

CREATE OR REPLACE FUNCTION public.phase23_register_agent_prompt_version(
  p_agent_slug text,
  p_display_name text,
  p_prompt_body text,
  p_changelog text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_result jsonb;
  v_version_id uuid;
BEGIN
  PERFORM public.admin_assert_master();
  IF NULLIF(trim(COALESCE(p_changelog, '')), '') IS NULL THEN
    RAISE EXCEPTION 'reason_required';
  END IF;

  v_result := public.admin_register_agent_prompt_version(
    p_agent_slug,
    p_display_name,
    p_prompt_body,
    p_changelog
  );
  v_version_id := (v_result->>'version_id')::uuid;

  PERFORM public.phase23_log_admin_event(
    'admin.agent.prompt_staged',
    'agent_prompt_version',
    v_version_id,
    jsonb_build_object(
      'agent_slug', p_agent_slug,
      'version_id', v_version_id,
      'reason', p_changelog
    )
  );
  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.phase23_get_admin_agents() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.phase23_register_agent_prompt_version(text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.phase23_get_admin_agents() TO authenticated;
GRANT EXECUTE ON FUNCTION public.phase23_register_agent_prompt_version(text, text, text, text) TO authenticated;
