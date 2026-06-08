-- Phase 9: Secure admin analytics cron schedules
--
-- No internal token is stored in cron.job. Jobs call the
-- SECURITY DEFINER wrapper public.invoke_internal_edge_function(),
-- which reads FUNCTIONS_BASE_URL and INTERNAL_FUNCTION_TOKEN from Vault.

DO $$
DECLARE
  v_job record;
BEGIN
  FOR v_job IN
    SELECT jobname
    FROM cron.job
    WHERE jobname IN (
      'platform-health-daily',
      'platform-health-trial-watch'
    )
  LOOP
    PERFORM cron.unschedule(v_job.jobname);
  END LOOP;
END;
$$;

SELECT cron.schedule(
  'platform-health-daily',
  '20 7 * * *',
  $$
    SELECT public.invoke_internal_edge_function(
      'platform-health-agent',
      '{"mode":"daily","limit":50}'::jsonb
    );
  $$
);

SELECT cron.schedule(
  'platform-health-trial-watch',
  '20 13 * * *',
  $$
    SELECT public.invoke_internal_edge_function(
      'platform-health-agent',
      '{"mode":"trial_watch","limit":50}'::jsonb
    );
  $$
);

-- Rollback:
-- SELECT cron.unschedule('platform-health-daily');
-- SELECT cron.unschedule('platform-health-trial-watch');
