-- Phase 21 blocking fixes discovered by remote database lint.

DO $$
DECLARE
  v_definition text;
  v_updated text;
BEGIN
  SELECT pg_get_functiondef('public.phase19_get_dashboard_base_rpc()'::regprocedure)
  INTO v_definition;
  v_updated := replace(
    v_definition,
    'COALESCE(af.preenchido_em, af.updated_at)',
    'COALESCE(af.preenchido_em, af.created_at)'
  );
  IF v_updated = v_definition THEN
    RAISE EXCEPTION 'phase19_dashboard_expected_definition_not_found';
  END IF;
  EXECUTE v_updated;

  SELECT pg_get_functiondef('public.get_reactivation_queue(integer)'::regprocedure)
  INTO v_definition;
  v_updated := replace(
    v_definition,
    'h.reactivation_attempts_in_cycle,' || chr(10) || '        h.signals',
    'h.reactivation_attempts_in_cycle,' || chr(10) || '        h.last_session_at,' || chr(10) || '        h.signals'
  );
  IF v_updated = v_definition THEN
    RAISE EXCEPTION 'reactivation_queue_expected_definition_not_found';
  END IF;
  EXECUTE v_updated;

  SELECT pg_get_functiondef('public.calculate_client_health_for_professional(uuid,integer,uuid)'::regprocedure)
  INTO v_definition;
  v_updated := replace(v_definition, 'max(client_id)', 'max(client_id::text)::uuid');
  IF v_updated = v_definition THEN
    RAISE EXCEPTION 'health_cursor_expected_definition_not_found';
  END IF;
  EXECUTE v_updated;
END;
$$;

ALTER FUNCTION public.phase21_get_growth_dashboard() VOLATILE;
ALTER FUNCTION public.phase21_get_ambassador_dashboard() VOLATILE;
