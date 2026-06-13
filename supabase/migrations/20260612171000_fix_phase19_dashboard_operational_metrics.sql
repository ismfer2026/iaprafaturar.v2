-- Completes the Phase 19 dashboard pulse while preserving get_dashboard_rpc
-- as the single public dashboard contract.
ALTER FUNCTION public.get_dashboard_rpc() RENAME TO phase19_get_dashboard_base_rpc;

REVOKE ALL ON FUNCTION public.phase19_get_dashboard_base_rpc() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_dashboard_rpc()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_professional_id uuid := public.auth_professional_id();
  v_dashboard jsonb;
  v_operational_pulse jsonb;
BEGIN
  IF v_professional_id IS NULL THEN RAISE EXCEPTION 'Unauthorized'; END IF;

  v_dashboard := public.phase19_get_dashboard_base_rpc();
  v_operational_pulse := jsonb_build_object(
    'hotLeadsCount', (
      SELECT count(*)
      FROM public.funnel_opportunities fo
      JOIN public.clients c ON c.id = fo.client_id
      WHERE fo.professional_id = v_professional_id
        AND fo.status = 'open'
        AND c.journey_stage = 'lead'
        AND COALESCE(fo.last_activity_at, fo.created_at) >= now() - interval '7 days'
    ),
    'clientsAtRiskCount', (
      SELECT count(*)
      FROM public.client_health_scores chs
      WHERE chs.professional_id = v_professional_id
        AND chs.risk_level IN ('risk', 'churn')
    ),
    'aiExecutionsTodayCount', (
      SELECT count(*)
      FROM public.agent_executions ae
      WHERE ae.professional_id = v_professional_id
        AND ae.started_at >= date_trunc('day', now())
    )
  );

  RETURN jsonb_set(
    v_dashboard,
    '{pulse}',
    COALESCE(v_dashboard->'pulse', '{}'::jsonb) || v_operational_pulse,
    true
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_dashboard_rpc() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_dashboard_rpc() TO authenticated;
