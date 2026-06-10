-- Phase 13: schedule package low-balance and expiry alerts through the secure internal wrapper.
-- The wrapper reads FUNCTIONS_BASE_URL and INTERNAL_FUNCTION_TOKEN from Vault.

DO $$
DECLARE
  v_job record;
BEGIN
  FOR v_job IN
    SELECT jobname
    FROM cron.job
    WHERE jobname IN ('package-low-balance-daily', 'package-expiry-daily')
  LOOP
    PERFORM cron.unschedule(v_job.jobname);
  END LOOP;
END;
$$;

SELECT cron.schedule(
  'package-low-balance-daily',
  '45 13 * * *',
  $$
    SELECT public.invoke_internal_edge_function(
      'package-alert-agent',
      '{"mode":"low_balance","limit":50}'::jsonb
    );
  $$
);

SELECT cron.schedule(
  'package-expiry-daily',
  '55 13 * * *',
  $$
    SELECT public.invoke_internal_edge_function(
      'package-alert-agent',
      '{"mode":"expiry","limit":50}'::jsonb
    );
  $$
);

-- Rollback:
-- SELECT cron.unschedule('package-low-balance-daily');
-- SELECT cron.unschedule('package-expiry-daily');
