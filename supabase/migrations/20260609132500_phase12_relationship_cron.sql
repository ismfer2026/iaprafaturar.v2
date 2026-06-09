-- Phase 12: schedule relationship check-ins through the secure internal wrapper.
-- The wrapper reads FUNCTIONS_BASE_URL and INTERNAL_FUNCTION_TOKEN from Vault.
-- DRY_RUN remains controlled by Edge Function env/header, not by the cron SQL.

DO $$
DECLARE
  v_job record;
BEGIN
  FOR v_job IN
    SELECT jobname
    FROM cron.job
    WHERE jobname IN ('relationship-checkins-daily')
  LOOP
    PERFORM cron.unschedule(v_job.jobname);
  END LOOP;
END;
$$;

SELECT cron.schedule(
  'relationship-checkins-daily',
  '15 13 * * *',
  $$
    SELECT public.invoke_internal_edge_function(
      'relationship-agent',
      '{"limit":50}'::jsonb
    );
  $$
);

-- Rollback:
-- SELECT cron.unschedule('relationship-checkins-daily');
