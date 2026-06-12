-- Phase 19 (PR 19.6) - amplia get_dashboard_rpc com pulso do funil
-- (oportunidades abertas) e fichas de anamnese aguardando revisao.
-- Rollback: reaplicar a definicao de get_dashboard_rpc de
-- 20260605121400_phase4_financeiro_basico.sql.

CREATE OR REPLACE FUNCTION public.get_dashboard_rpc()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_professional_id uuid;
  v_today_start timestamptz;
  v_today_end timestamptz;
  v_month_start timestamptz;
  v_month_end timestamptz;
  v_today jsonb;
  v_attention jsonb;
  v_pulse jsonb;
BEGIN
  v_professional_id := public.auth_professional_id();

  IF v_professional_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  v_today_start := ((now() AT TIME ZONE 'America/Sao_Paulo')::date AT TIME ZONE 'America/Sao_Paulo');
  v_today_end := v_today_start + interval '1 day';
  v_month_start := (date_trunc('month', now() AT TIME ZONE 'America/Sao_Paulo') AT TIME ZONE 'America/Sao_Paulo');
  v_month_end := v_month_start + interval '1 month';

  SELECT COALESCE(jsonb_agg(to_jsonb(a) ORDER BY a.scheduled_at), '[]'::jsonb)
  INTO v_today
  FROM (
    SELECT
      ap.id,
      ap.client_id,
      c.full_name AS client_name,
      ap.service_id,
      s.name AS service_name,
      ap.scheduled_at,
      ap.duration_minutes,
      ap.status
    FROM public.appointments ap
    LEFT JOIN public.clients c ON c.id = ap.client_id
    LEFT JOIN public.services s ON s.id = ap.service_id
    WHERE ap.professional_id = v_professional_id
      AND ap.deleted_at IS NULL
      AND ap.scheduled_at >= v_today_start
      AND ap.scheduled_at < v_today_end
      AND ap.status IN ('agendado','confirmado')
    ORDER BY ap.scheduled_at
    LIMIT 20
  ) a;

  SELECT COALESCE(jsonb_agg(to_jsonb(a) ORDER BY a.scheduled_at DESC), '[]'::jsonb)
  INTO v_attention
  FROM (
    SELECT
      ap.id,
      ap.client_id,
      c.full_name AS client_name,
      ap.scheduled_at,
      ap.status,
      'appointment_overdue' AS reason
    FROM public.appointments ap
    LEFT JOIN public.clients c ON c.id = ap.client_id
    WHERE ap.professional_id = v_professional_id
      AND ap.deleted_at IS NULL
      AND ap.scheduled_at < now()
      AND ap.status = 'agendado'
      AND NOT EXISTS (
        SELECT 1 FROM public.sessions se
        WHERE se.appointment_id = ap.id
          AND se.deleted_at IS NULL
      )

    UNION ALL

    SELECT
      af.id,
      af.client_id,
      c.full_name AS client_name,
      COALESCE(af.preenchido_em, af.updated_at) AS scheduled_at,
      NULL::public.appointment_status_enum AS status,
      'anamnese_pending_review' AS reason
    FROM public.anamnese_fichas af
    LEFT JOIN public.clients c ON c.id = af.client_id
    WHERE af.professional_id = v_professional_id
      AND af.status = 'preenchido'

    ORDER BY scheduled_at DESC
    LIMIT 20
  ) a;

  SELECT jsonb_build_object(
    'clientsInTreatmentCount', (
      SELECT COUNT(*)
      FROM public.clients c
      WHERE c.professional_id = v_professional_id
        AND c.journey_stage = 'em_tratamento'
        AND c.deleted_at IS NULL
    ),
    'activeClientsCount', (
      SELECT COUNT(*)
      FROM public.clients c
      WHERE c.professional_id = v_professional_id
        AND c.is_active = true
        AND c.deleted_at IS NULL
    ),
    'appointmentsTodayCount', (
      SELECT COUNT(*)
      FROM public.appointments ap
      WHERE ap.professional_id = v_professional_id
        AND ap.deleted_at IS NULL
        AND ap.scheduled_at >= v_today_start
        AND ap.scheduled_at < v_today_end
    ),
    'monthRevenuePaid', (
      SELECT COALESCE(SUM(ft.net_amount), 0)
      FROM public.financial_transactions ft
      WHERE ft.professional_id = v_professional_id
        AND ft.type = 'receita'
        AND ft.status = 'pago'
        AND ft.paid_at >= v_month_start
        AND ft.paid_at < v_month_end
    ),
    'monthRevenuePending', (
      SELECT COALESCE(SUM(ft.net_amount), 0)
      FROM public.financial_transactions ft
      WHERE ft.professional_id = v_professional_id
        AND ft.type = 'receita'
        AND ft.status = 'pendente'
        AND COALESCE(ft.due_date, ft.created_at::date) >= v_month_start::date
        AND COALESCE(ft.due_date, ft.created_at::date) < v_month_end::date
    ),
    'monthExpensesPaid', (
      SELECT COALESCE(SUM(ft.net_amount), 0)
      FROM public.financial_transactions ft
      WHERE ft.professional_id = v_professional_id
        AND ft.type = 'despesa'
        AND ft.status = 'pago'
        AND ft.paid_at >= v_month_start
        AND ft.paid_at < v_month_end
    ),
    'openOpportunitiesCount', (
      SELECT COUNT(*)
      FROM public.funnel_opportunities fo
      WHERE fo.professional_id = v_professional_id
        AND fo.status = 'open'
    ),
    'openOpportunitiesValue', (
      SELECT COALESCE(SUM(fo.value), 0)
      FROM public.funnel_opportunities fo
      WHERE fo.professional_id = v_professional_id
        AND fo.status = 'open'
    ),
    'pendingAnamneseReviewCount', (
      SELECT COUNT(*)
      FROM public.anamnese_fichas af
      WHERE af.professional_id = v_professional_id
        AND af.status = 'preenchido'
    )
  )
  INTO v_pulse;

  RETURN jsonb_build_object(
    'todayAppointments', v_today,
    'attentionItems', v_attention,
    'pulse', v_pulse
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_dashboard_rpc() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_dashboard_rpc() TO authenticated;
