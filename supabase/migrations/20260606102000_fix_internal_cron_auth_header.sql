-- ============================================================
-- Phase 5: fix secure cron auth header
--
-- Edge Functions validate internal calls through:
--   Authorization: Bearer <INTERNAL_FUNCTION_TOKEN>
--
-- The previous wrapper used x-internal-token, which is not consumed
-- by assertInternalAuth(). Recreate the wrapper without changing the
-- cron schedules; cron.job still stores no secrets.
-- ============================================================

CREATE OR REPLACE FUNCTION public.invoke_internal_edge_function(
  p_function_name text,
  p_payload jsonb DEFAULT '{}'::jsonb
)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_base_url text;
  v_internal_token text;
  v_request_id bigint;
BEGIN
  IF p_function_name IS NULL OR p_function_name !~ '^[a-z0-9-]+$' THEN
    RAISE EXCEPTION 'Invalid function name';
  END IF;

  v_base_url := rtrim(public.get_vault_secret('FUNCTIONS_BASE_URL'), '/');
  v_internal_token := public.get_vault_secret('INTERNAL_FUNCTION_TOKEN');

  SELECT net.http_post(
    url := v_base_url || '/' || p_function_name,
    headers := jsonb_build_object(
      'content-type', 'application/json',
      'authorization', 'Bearer ' || v_internal_token
    ),
    body := COALESCE(p_payload, '{}'::jsonb),
    timeout_milliseconds := 15000
  )
  INTO v_request_id;

  RETURN v_request_id;
END;
$$;

REVOKE ALL ON FUNCTION public.invoke_internal_edge_function(text, jsonb) FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION public.invoke_internal_edge_function(text, jsonb) IS
  'SECURITY DEFINER wrapper for pg_cron -> pg_net calls. Uses Authorization Bearer token from Vault; cron.job must never store secrets.';

-- Rollback:
-- Recreate this function with the previous body from
-- 20260606100000_phase5_rosane_agents_base.sql if needed.
