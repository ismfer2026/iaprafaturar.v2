-- Fix Phase 8 Growth RPC lint errors:
-- - PostgreSQL has no max(uuid); use ordered subquery for next cursor.
-- - pgcrypto is installed in extensions schema; call extensions.gen_random_bytes() with search_path=''.

CREATE OR REPLACE FUNCTION public.calculate_rfm_for_professional(
  p_professional_id uuid DEFAULT NULL,
  p_limit integer DEFAULT 500,
  p_cursor uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_professional_id uuid;
  v_limit integer;
  v_processed integer;
  v_next_cursor uuid;
BEGIN
  IF COALESCE(auth.role(), '') = 'service_role' THEN
    v_professional_id := p_professional_id;
  ELSE
    v_professional_id := public.auth_professional_id();
  END IF;

  IF v_professional_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  v_limit := LEAST(GREATEST(COALESCE(p_limit, 500), 1), 1000);

  WITH batch AS (
    SELECT c.id AS client_id
    FROM public.clients c
    WHERE c.professional_id = v_professional_id
      AND c.deleted_at IS NULL
      AND c.is_active = true
      AND (p_cursor IS NULL OR c.id > p_cursor)
    ORDER BY c.id
    LIMIT v_limit
  ),
  metrics AS (
    SELECT
      b.client_id,
      max(s.session_date) AS last_session_at,
      count(s.id)::integer AS session_count,
      COALESCE(sum(ft.net_amount) FILTER (
        WHERE ft.type = 'receita' AND ft.status = 'pago'
      ), 0)::numeric AS paid_total
    FROM batch b
    LEFT JOIN public.sessions s
      ON s.client_id = b.client_id
     AND s.professional_id = v_professional_id
     AND s.deleted_at IS NULL
    LEFT JOIN public.financial_transactions ft
      ON ft.client_id = b.client_id
     AND ft.professional_id = v_professional_id
     AND ft.status = 'pago'
     AND ft.type = 'receita'
    GROUP BY b.client_id
  ),
  scored AS (
    SELECT
      client_id,
      CASE
        WHEN last_session_at IS NULL THEN 1
        WHEN now() - last_session_at <= interval '30 days' THEN 5
        WHEN now() - last_session_at <= interval '60 days' THEN 4
        WHEN now() - last_session_at <= interval '90 days' THEN 3
        WHEN now() - last_session_at <= interval '180 days' THEN 2
        ELSE 1
      END AS recency_score,
      CASE
        WHEN session_count >= 10 THEN 5
        WHEN session_count >= 5 THEN 4
        WHEN session_count >= 3 THEN 3
        WHEN session_count >= 1 THEN 2
        ELSE 1
      END AS frequency_score,
      CASE
        WHEN paid_total >= 5000 THEN 5
        WHEN paid_total >= 2000 THEN 4
        WHEN paid_total >= 1000 THEN 3
        WHEN paid_total >= 100 THEN 2
        ELSE 1
      END AS monetary_score,
      last_session_at,
      session_count,
      paid_total
    FROM metrics
  ),
  upserted AS (
    INSERT INTO public.rfm_scores (
      professional_id,
      client_id,
      recency_score,
      frequency_score,
      monetary_score,
      rfm_code,
      segment,
      calculated_at,
      metadata
    )
    SELECT
      v_professional_id,
      client_id,
      recency_score,
      frequency_score,
      monetary_score,
      recency_score::text || frequency_score::text || monetary_score::text,
      CASE
        WHEN recency_score >= 4 AND frequency_score >= 4 AND monetary_score >= 4 THEN 'champions'
        WHEN recency_score <= 2 AND frequency_score >= 3 THEN 'at_risk'
        WHEN recency_score <= 2 THEN 'inactive'
        WHEN frequency_score <= 2 THEN 'new_or_low_frequency'
        ELSE 'regular'
      END,
      now(),
      jsonb_build_object('last_session_at', last_session_at, 'session_count', session_count, 'paid_total', paid_total)
    FROM scored
    ON CONFLICT (professional_id, client_id) DO UPDATE
    SET recency_score = EXCLUDED.recency_score,
        frequency_score = EXCLUDED.frequency_score,
        monetary_score = EXCLUDED.monetary_score,
        rfm_code = EXCLUDED.rfm_code,
        segment = EXCLUDED.segment,
        calculated_at = EXCLUDED.calculated_at,
        metadata = EXCLUDED.metadata
    RETURNING client_id
  )
  SELECT
    (SELECT count(*)::integer FROM upserted),
    (SELECT client_id FROM upserted ORDER BY client_id DESC LIMIT 1)
  INTO v_processed, v_next_cursor;

  PERFORM public.log_audit_event(
    v_professional_id,
    'cron',
    'client.rfm.recalculated',
    'rfm_scores',
    NULL,
    jsonb_build_object('processed', COALESCE(v_processed, 0), 'next_cursor', v_next_cursor)
  );

  RETURN jsonb_build_object('ok', true, 'processed', COALESCE(v_processed, 0), 'next_cursor', v_next_cursor);
END;
$$;

CREATE OR REPLACE FUNCTION public.calculate_client_health_for_professional(
  p_professional_id uuid DEFAULT NULL,
  p_limit integer DEFAULT 500,
  p_cursor uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_professional_id uuid;
  v_limit integer;
  v_processed integer;
  v_next_cursor uuid;
BEGIN
  IF COALESCE(auth.role(), '') = 'service_role' THEN
    v_professional_id := p_professional_id;
  ELSE
    v_professional_id := public.auth_professional_id();
  END IF;

  IF v_professional_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  v_limit := LEAST(GREATEST(COALESCE(p_limit, 500), 1), 1000);

  WITH batch AS (
    SELECT c.id AS client_id
    FROM public.clients c
    WHERE c.professional_id = v_professional_id
      AND c.deleted_at IS NULL
      AND c.is_active = true
      AND (p_cursor IS NULL OR c.id > p_cursor)
    ORDER BY c.id
    LIMIT v_limit
  ),
  metrics AS (
    SELECT
      b.client_id,
      max(s.session_date) AS last_session_at,
      max(ft.paid_at) FILTER (WHERE ft.status = 'pago' AND ft.type = 'receita') AS last_payment_at,
      (
        SELECT s2.nps_score
        FROM public.sessions s2
        WHERE s2.professional_id = v_professional_id
          AND s2.client_id = b.client_id
          AND s2.nps_score IS NOT NULL
          AND s2.deleted_at IS NULL
        ORDER BY COALESCE(s2.nps_responded_at, s2.session_date) DESC
        LIMIT 1
      ) AS last_nps_score,
      count(s.id)::integer AS session_count,
      COALESCE(sum(ft.net_amount) FILTER (WHERE ft.status = 'pago' AND ft.type = 'receita'), 0)::numeric AS paid_total
    FROM batch b
    LEFT JOIN public.sessions s
      ON s.professional_id = v_professional_id
     AND s.client_id = b.client_id
     AND s.deleted_at IS NULL
    LEFT JOIN public.financial_transactions ft
      ON ft.professional_id = v_professional_id
     AND ft.client_id = b.client_id
     AND ft.status = 'pago'
     AND ft.type = 'receita'
    GROUP BY b.client_id
  ),
  scored AS (
    SELECT
      client_id,
      last_session_at,
      last_payment_at,
      last_nps_score,
      session_count,
      paid_total,
      LEAST(
        100,
        GREATEST(
          0,
          (CASE
            WHEN last_session_at IS NULL THEN 0
            WHEN now() - last_session_at <= interval '30 days' THEN 40
            WHEN now() - last_session_at <= interval '60 days' THEN 30
            WHEN now() - last_session_at <= interval '90 days' THEN 20
            WHEN now() - last_session_at <= interval '180 days' THEN 10
            ELSE 0
          END)
          + LEAST(session_count * 5, 25)
          + (CASE WHEN last_nps_score IS NULL THEN 10 WHEN last_nps_score >= 4 THEN 20 WHEN last_nps_score = 3 THEN 10 ELSE 0 END)
          + (CASE WHEN paid_total > 0 THEN 15 ELSE 0 END)
        )
      )::integer AS score
    FROM metrics
  ),
  upserted AS (
    INSERT INTO public.client_health_scores (
      professional_id,
      client_id,
      score,
      risk_level,
      last_session_at,
      last_payment_at,
      last_nps_score,
      signals,
      calculated_at
    )
    SELECT
      v_professional_id,
      client_id,
      score,
      CASE WHEN score >= 80 THEN 'healthy' WHEN score >= 50 THEN 'attention' WHEN score >= 20 THEN 'risk' ELSE 'churn' END,
      last_session_at,
      last_payment_at,
      last_nps_score,
      jsonb_build_object('session_count', session_count, 'paid_total', paid_total, 'formula_version', 'phase8_v1'),
      now()
    FROM scored
    ON CONFLICT (professional_id, client_id) DO UPDATE
    SET score = EXCLUDED.score,
        risk_level = EXCLUDED.risk_level,
        last_session_at = EXCLUDED.last_session_at,
        last_payment_at = EXCLUDED.last_payment_at,
        last_nps_score = EXCLUDED.last_nps_score,
        signals = EXCLUDED.signals,
        calculated_at = EXCLUDED.calculated_at
    RETURNING client_id
  )
  SELECT
    (SELECT count(*)::integer FROM upserted),
    (SELECT client_id FROM upserted ORDER BY client_id DESC LIMIT 1)
  INTO v_processed, v_next_cursor;

  PERFORM public.log_audit_event(
    v_professional_id,
    'cron',
    'client.health_score.recalculated',
    'client_health_scores',
    NULL,
    jsonb_build_object('processed', COALESCE(v_processed, 0), 'next_cursor', v_next_cursor)
  );

  RETURN jsonb_build_object('ok', true, 'processed', COALESCE(v_processed, 0), 'next_cursor', v_next_cursor);
END;
$$;

CREATE OR REPLACE FUNCTION public.create_or_get_referral_link(
  p_client_id uuid,
  p_expires_at timestamptz DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_professional_id uuid;
  v_client_id uuid;
  v_link public.referral_links%ROWTYPE;
  v_code text;
BEGIN
  v_professional_id := public.auth_professional_id();

  IF v_professional_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  SELECT id INTO v_client_id
  FROM public.clients
  WHERE id = p_client_id
    AND professional_id = v_professional_id
    AND deleted_at IS NULL;

  IF v_client_id IS NULL THEN
    RAISE EXCEPTION 'client_not_found';
  END IF;

  SELECT * INTO v_link
  FROM public.referral_links
  WHERE professional_id = v_professional_id
    AND client_id = v_client_id
    AND type = 'client_to_client'
    AND status = 'active'
    AND (expires_at IS NULL OR expires_at > now())
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_link.id IS NULL THEN
    LOOP
      v_code := upper(substr(encode(extensions.gen_random_bytes(8), 'hex'), 1, 10));
      EXIT WHEN NOT EXISTS (SELECT 1 FROM public.referral_links WHERE code = v_code);
    END LOOP;

    INSERT INTO public.referral_links (professional_id, client_id, code, expires_at)
    VALUES (v_professional_id, v_client_id, v_code, p_expires_at)
    RETURNING * INTO v_link;
  END IF;

  INSERT INTO public.referral_events (
    professional_id,
    referral_link_id,
    referrer_client_id,
    event_type,
    payload
  )
  VALUES (
    v_professional_id,
    v_link.id,
    v_client_id,
    'requested',
    jsonb_build_object('source', 'crm')
  );

  RETURN jsonb_build_object('ok', true, 'referral_link_id', v_link.id, 'code', v_link.code);
END;
$$;

-- ROLLBACK (documented):
-- Reapply function bodies from 20260607140000_phase8_growth_core.sql if needed.
