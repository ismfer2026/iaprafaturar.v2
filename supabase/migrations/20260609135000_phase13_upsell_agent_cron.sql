-- Phase 13: schedule upsell shadow suggestions through the secure internal wrapper.
-- The function creates shadow_suggestions only. It does not send WhatsApp directly.

DO $$
DECLARE
  v_job record;
BEGIN
  FOR v_job IN
    SELECT jobname
    FROM cron.job
    WHERE jobname IN ('upsell-shadow-daily')
  LOOP
    PERFORM cron.unschedule(v_job.jobname);
  END LOOP;
END;
$$;

SELECT cron.schedule(
  'upsell-shadow-daily',
  '05 14 * * *',
  $$
    SELECT public.invoke_internal_edge_function(
      'upsell-agent',
      '{"mode":"shadow_scan","limit":50}'::jsonb
    );
  $$
);

-- Rollback:
-- SELECT cron.unschedule('upsell-shadow-daily');
