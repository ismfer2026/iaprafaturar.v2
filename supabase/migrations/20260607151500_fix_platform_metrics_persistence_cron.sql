-- Phase 9: persist internal platform metrics independently from external DRY_RUN.
--
-- DRY_RUN remains the global safety switch for external actions such as WhatsApp
-- and LLM calls. Platform metrics snapshots are internal database state and must
-- not be blocked by that external-action safety switch.

DO $$
DECLARE
  v_job record;
BEGIN
  FOR v_job IN
    SELECT jobname
    FROM cron.job
    WHERE jobname = 'platform-health-daily'
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
      '{"mode":"daily","limit":50,"persist_snapshot":true}'::jsonb
    );
  $$
);

-- Rollback:
-- SELECT cron.unschedule('platform-health-daily');
