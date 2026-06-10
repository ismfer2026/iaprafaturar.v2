-- Phase 13: schedule quote expiration and follow-up through the secure internal wrapper.
-- The wrapper reads FUNCTIONS_BASE_URL and INTERNAL_FUNCTION_TOKEN from Vault.
-- DRY_RUN remains controlled by Edge Function env/header for external WhatsApp sends.

DO $$
DECLARE
  v_job record;
BEGIN
  FOR v_job IN
    SELECT jobname
    FROM cron.job
    WHERE jobname IN ('quote-expiration-hourly', 'quote-followup-daily')
  LOOP
    PERFORM cron.unschedule(v_job.jobname);
  END LOOP;
END;
$$;

SELECT cron.schedule(
  'quote-expiration-hourly',
  '12 * * * *',
  $$
    SELECT public.invoke_internal_edge_function(
      'quote-dispatcher',
      '{"mode":"expire_quotes","limit":100}'::jsonb
    );
  $$
);

SELECT cron.schedule(
  'quote-followup-daily',
  '35 13 * * *',
  $$
    SELECT public.invoke_internal_edge_function(
      'quote-dispatcher',
      '{"mode":"followup_quotes","limit":50}'::jsonb
    );
  $$
);

-- Rollback:
-- SELECT cron.unschedule('quote-expiration-hourly');
-- SELECT cron.unschedule('quote-followup-daily');
