-- ============================================================
-- Phase 10 fix - reports month boundaries use America/Sao_Paulo
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_professional_reports_rpc(
  p_month date DEFAULT CURRENT_DATE
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_professional_id uuid;
  v_month_start date;
  v_month_end date;
  v_start_ts timestamptz;
  v_end_ts timestamptz;
  v_summary jsonb;
  v_top_clients jsonb;
  v_service_ranking jsonb;
  v_occupancy jsonb;
BEGIN
  v_professional_id := public.auth_professional_id();

  IF v_professional_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  v_month_start := date_trunc('month', COALESCE(p_month, CURRENT_DATE))::date;
  v_month_end := (v_month_start + interval '1 month')::date;
  v_start_ts := v_month_start::timestamp AT TIME ZONE 'America/Sao_Paulo';
  v_end_ts := v_month_end::timestamp AT TIME ZONE 'America/Sao_Paulo';

  SELECT jsonb_build_object(
    'month', to_char(v_month_start, 'YYYY-MM'),
    'revenuePaid', (
      SELECT COALESCE(SUM(ft.net_amount), 0)
      FROM public.financial_transactions ft
      WHERE ft.professional_id = v_professional_id
        AND ft.type = 'receita'
        AND ft.status = 'pago'
        AND ft.paid_at >= v_start_ts
        AND ft.paid_at < v_end_ts
    ),
    'revenuePending', (
      SELECT COALESCE(SUM(ft.net_amount), 0)
      FROM public.financial_transactions ft
      WHERE ft.professional_id = v_professional_id
        AND ft.type = 'receita'
        AND ft.status = 'pendente'
        AND COALESCE(ft.due_date, (ft.created_at AT TIME ZONE 'America/Sao_Paulo')::date) >= v_month_start
        AND COALESCE(ft.due_date, (ft.created_at AT TIME ZONE 'America/Sao_Paulo')::date) < v_month_end
    ),
    'expensesPaid', (
      SELECT COALESCE(SUM(ft.net_amount), 0)
      FROM public.financial_transactions ft
      WHERE ft.professional_id = v_professional_id
        AND ft.type = 'despesa'
        AND ft.status = 'pago'
        AND ft.paid_at >= v_start_ts
        AND ft.paid_at < v_end_ts
    ),
    'projectedRevenue', (
      SELECT COALESCE(SUM(s.price), 0)
      FROM public.appointments ap
      LEFT JOIN public.services s ON s.id = ap.service_id
      WHERE ap.professional_id = v_professional_id
        AND ap.deleted_at IS NULL
        AND ap.scheduled_at >= GREATEST(now(), v_start_ts)
        AND ap.scheduled_at < v_end_ts
        AND ap.status IN ('agendado','confirmado')
    ),
    'averageTicket', (
      SELECT COALESCE(ROUND(SUM(ft.net_amount) / NULLIF(COUNT(*), 0), 2), 0)
      FROM public.financial_transactions ft
      WHERE ft.professional_id = v_professional_id
        AND ft.type = 'receita'
        AND ft.status = 'pago'
        AND ft.paid_at >= v_start_ts
        AND ft.paid_at < v_end_ts
    ),
    'activeClients', (
      SELECT COUNT(*)
      FROM public.clients c
      WHERE c.professional_id = v_professional_id
        AND c.deleted_at IS NULL
        AND c.is_active = true
    ),
    'riskClients', (
      SELECT COUNT(*)
      FROM public.client_health_scores hs
      WHERE hs.professional_id = v_professional_id
        AND hs.risk_level IN ('risk','churn')
    ),
    'championClients', (
      SELECT COUNT(*)
      FROM public.rfm_scores r
      WHERE r.professional_id = v_professional_id
        AND r.segment = 'champions'
    ),
    'appointmentsCompleted', (
      SELECT COUNT(*)
      FROM public.appointments ap
      WHERE ap.professional_id = v_professional_id
        AND ap.deleted_at IS NULL
        AND ap.scheduled_at >= v_start_ts
        AND ap.scheduled_at < v_end_ts
        AND ap.status = 'realizado'
    )
  )
  INTO v_summary;

  SELECT COALESCE(jsonb_agg(to_jsonb(row_data) ORDER BY row_data.revenue DESC, row_data.client_name), '[]'::jsonb)
  INTO v_top_clients
  FROM (
    SELECT
      c.id AS client_id,
      c.full_name AS client_name,
      COALESCE(SUM(ft.net_amount), 0) AS revenue,
      COUNT(ft.id) AS transaction_count,
      hs.score AS health_score,
      hs.risk_level,
      r.segment AS rfm_segment
    FROM public.financial_transactions ft
    JOIN public.clients c
      ON c.id = ft.client_id
     AND c.professional_id = v_professional_id
    LEFT JOIN public.client_health_scores hs
      ON hs.client_id = c.id
     AND hs.professional_id = v_professional_id
    LEFT JOIN public.rfm_scores r
      ON r.client_id = c.id
     AND r.professional_id = v_professional_id
    WHERE ft.professional_id = v_professional_id
      AND ft.type = 'receita'
      AND ft.status = 'pago'
      AND ft.paid_at >= v_start_ts
      AND ft.paid_at < v_end_ts
      AND c.deleted_at IS NULL
    GROUP BY c.id, c.full_name, hs.score, hs.risk_level, r.segment
    ORDER BY revenue DESC, c.full_name
    LIMIT 10
  ) row_data;

  SELECT COALESCE(jsonb_agg(to_jsonb(row_data) ORDER BY row_data.revenue DESC, row_data.sessions_count DESC), '[]'::jsonb)
  INTO v_service_ranking
  FROM (
    SELECT
      s.id AS service_id,
      s.name AS service_name,
      COUNT(sess.id) AS sessions_count,
      COALESCE(SUM(sess.session_value), 0) AS session_value,
      COALESCE(SUM(ft.net_amount), 0) AS revenue
    FROM public.sessions sess
    LEFT JOIN public.services s
      ON s.id = sess.service_id
     AND s.professional_id = v_professional_id
    LEFT JOIN public.financial_transactions ft
      ON ft.session_id = sess.id
     AND ft.professional_id = v_professional_id
     AND ft.type = 'receita'
     AND ft.status = 'pago'
     AND ft.paid_at >= v_start_ts
     AND ft.paid_at < v_end_ts
    WHERE sess.professional_id = v_professional_id
      AND sess.deleted_at IS NULL
      AND sess.session_date >= v_start_ts
      AND sess.session_date < v_end_ts
    GROUP BY s.id, s.name
    ORDER BY revenue DESC, sessions_count DESC
    LIMIT 10
  ) row_data;

  SELECT COALESCE(jsonb_agg(to_jsonb(row_data) ORDER BY row_data.weekday, row_data.hour), '[]'::jsonb)
  INTO v_occupancy
  FROM (
    SELECT
      EXTRACT(ISODOW FROM ap.scheduled_at AT TIME ZONE 'America/Sao_Paulo')::integer AS weekday,
      EXTRACT(HOUR FROM ap.scheduled_at AT TIME ZONE 'America/Sao_Paulo')::integer AS hour,
      COUNT(*) AS appointments_count,
      COALESCE(SUM(ap.duration_minutes), 0) AS duration_minutes
    FROM public.appointments ap
    WHERE ap.professional_id = v_professional_id
      AND ap.deleted_at IS NULL
      AND ap.scheduled_at >= v_start_ts
      AND ap.scheduled_at < v_end_ts
      AND ap.status IN ('agendado','confirmado','realizado')
    GROUP BY weekday, hour
    ORDER BY weekday, hour
  ) row_data;

  RETURN jsonb_build_object(
    'summary', v_summary,
    'topClients', v_top_clients,
    'serviceRanking', v_service_ranking,
    'occupancy', v_occupancy,
    'generatedAt', now()
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_professional_reports_rpc(date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_professional_reports_rpc(date) TO authenticated;

COMMENT ON FUNCTION public.get_professional_reports_rpc(date) IS
  'Read-only professional reports RPC. Uses auth_professional_id() and America/Sao_Paulo month boundaries.';
