-- Phase 8: Secure Growth cron schedules
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
      'growth-calculate-rfm',
      'growth-calculate-client-health',
      'growth-campaign-dispatcher',
      'growth-reativacao',
      'growth-indicacao'
    )
  LOOP
    PERFORM cron.unschedule(v_job.jobname);
  END LOOP;
END;
$$;

SELECT cron.schedule(
  'growth-calculate-rfm',
  '15 6 * * *',
  $$
    SELECT public.invoke_internal_edge_function(
      'calculate-rfm',
      '{"professional_limit":25,"client_limit":500}'::jsonb
    );
  $$
);

SELECT cron.schedule(
  'growth-calculate-client-health',
  '30 6 * * *',
  $$
    SELECT public.invoke_internal_edge_function(
      'calculate-client-health-scores',
      '{"professional_limit":25,"client_limit":500}'::jsonb
    );
  $$
);

SELECT cron.schedule(
  'growth-campaign-dispatcher',
  '*/10 * * * *',
  $$
    SELECT public.invoke_internal_edge_function(
      'campaign-dispatcher',
      '{"limit":50}'::jsonb
    );
  $$
);

SELECT cron.schedule(
  'growth-reativacao',
  '0 15 * * *',
  $$
    SELECT public.invoke_internal_edge_function(
      'reativacao-agent',
      '{"limit":50}'::jsonb
    );
  $$
);

SELECT cron.schedule(
  'growth-indicacao',
  '30 15 * * *',
  $$
    SELECT public.invoke_internal_edge_function(
      'indicacao-agent',
      '{"limit":50}'::jsonb
    );
  $$
);

-- Rollback:
-- SELECT cron.unschedule('growth-calculate-rfm');
-- SELECT cron.unschedule('growth-calculate-client-health');
-- SELECT cron.unschedule('growth-campaign-dispatcher');
-- SELECT cron.unschedule('growth-reativacao');
-- SELECT cron.unschedule('growth-indicacao');
