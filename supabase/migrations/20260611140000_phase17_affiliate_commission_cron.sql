-- Phase 17: schedule affiliate commission calculation through the secure internal wrapper.
-- The wrapper reads FUNCTIONS_BASE_URL and INTERNAL_FUNCTION_TOKEN from Vault.
-- calculate_affiliate_commissions() remains service_role only; this cron invokes it via
-- the affiliate-commission-cron edge function (verify_jwt = false, internal auth required).

DO $$
DECLARE
  v_job record;
BEGIN
  FOR v_job IN
    SELECT jobname
    FROM cron.job
    WHERE jobname IN ('affiliate-commission-cron')
  LOOP
    PERFORM cron.unschedule(v_job.jobname);
  END LOOP;
END;
$$;

SELECT cron.schedule(
  'affiliate-commission-cron',
  '0 5 * * *',
  $$
    SELECT public.invoke_internal_edge_function(
      'affiliate-commission-cron',
      '{}'::jsonb
    );
  $$
);

-- Rollback:
-- SELECT cron.unschedule('affiliate-commission-cron');
