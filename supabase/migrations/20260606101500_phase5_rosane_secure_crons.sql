-- ============================================================
-- Phase 5: Secure Rosane cron schedules
--
-- These schedules must never store internal tokens, service role
-- keys, or provider credentials in cron.job. They call the
-- SECURITY DEFINER wrapper created in 20260606100000, which reads
-- FUNCTIONS_BASE_URL and INTERNAL_FUNCTION_TOKEN from Supabase Vault.
-- ============================================================

DO $$
DECLARE
  v_job record;
BEGIN
  FOR v_job IN
    SELECT jobname
    FROM cron.job
    WHERE jobname IN (
      'appointment-confirmation-fallback',
      'lembrete-1h',
      'lembrete-d1',
      'lembrete-dia',
      'pos-atendimento-d1'
    )
  LOOP
    PERFORM cron.unschedule(v_job.jobname);
  END LOOP;
END;
$$;

SELECT cron.schedule(
  'appointment-confirmation-fallback',
  '*/15 * * * *',
  $$
    SELECT public.invoke_internal_edge_function(
      'appointment-confirmation-agent',
      '{"mode":"fallback"}'::jsonb
    );
  $$
);

SELECT cron.schedule(
  'lembrete-1h',
  '0 * * * *',
  $$
    SELECT public.invoke_internal_edge_function(
      'lembrete-agent',
      '{"mode":"1h"}'::jsonb
    );
  $$
);

SELECT cron.schedule(
  'lembrete-d1',
  '0 21 * * *',
  $$
    SELECT public.invoke_internal_edge_function(
      'lembrete-agent',
      '{"mode":"d1"}'::jsonb
    );
  $$
);

SELECT cron.schedule(
  'lembrete-dia',
  '0 10 * * *',
  $$
    SELECT public.invoke_internal_edge_function(
      'lembrete-agent',
      '{"mode":"dia"}'::jsonb
    );
  $$
);

SELECT cron.schedule(
  'pos-atendimento-d1',
  '30 11 * * *',
  $$
    SELECT public.invoke_internal_edge_function(
      'pos-atendimento-agent',
      '{"mode":"d1"}'::jsonb
    );
  $$
);

-- Rollback:
-- SELECT cron.unschedule('appointment-confirmation-fallback');
-- SELECT cron.unschedule('lembrete-1h');
-- SELECT cron.unschedule('lembrete-d1');
-- SELECT cron.unschedule('lembrete-dia');
-- SELECT cron.unschedule('pos-atendimento-d1');
