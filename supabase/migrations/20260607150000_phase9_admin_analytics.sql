-- ============================================================
-- Phase 9: Admin Analytics foundation
--
-- Scope:
-- - platform daily snapshots
-- - professional platform health scores
-- - admin-only RPCs for global dashboard/professional list
--
-- Security:
-- - no direct authenticated access to platform/global tables
-- - admin reads only through SECURITY DEFINER RPCs validating master_admins
-- - platform health is internal admin telemetry in this phase
-- ============================================================

CREATE TABLE IF NOT EXISTS public.platform_metrics_daily (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  date                  date NOT NULL UNIQUE,

  total_professionals   integer NOT NULL DEFAULT 0 CHECK (total_professionals >= 0),
  new_professionals     integer NOT NULL DEFAULT 0 CHECK (new_professionals >= 0),
  active_professionals  integer NOT NULL DEFAULT 0 CHECK (active_professionals >= 0),
  churned_professionals integer NOT NULL DEFAULT 0 CHECK (churned_professionals >= 0),

  mrr                   numeric(12,2) NOT NULL DEFAULT 0 CHECK (mrr >= 0),
  new_mrr               numeric(12,2) NOT NULL DEFAULT 0 CHECK (new_mrr >= 0),
  churned_mrr           numeric(12,2) NOT NULL DEFAULT 0 CHECK (churned_mrr >= 0),
  total_revenue_day     numeric(12,2) NOT NULL DEFAULT 0 CHECK (total_revenue_day >= 0),

  total_sessions        integer NOT NULL DEFAULT 0 CHECK (total_sessions >= 0),
  total_messages_sent   integer NOT NULL DEFAULT 0 CHECK (total_messages_sent >= 0),
  total_ai_credits_used integer NOT NULL DEFAULT 0 CHECK (total_ai_credits_used >= 0),
  total_appointments    integer NOT NULL DEFAULT 0 CHECK (total_appointments >= 0),

  plan_breakdown        jsonb NOT NULL DEFAULT '{}',
  created_at            timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.platform_metrics_daily IS
  'Admin-only daily platform snapshot. Written by service-role RPC/cron; read only through admin RPCs.';
COMMENT ON COLUMN public.platform_metrics_daily.mrr IS
  'MRR from real configured billing data only. Do not infer revenue from plan names when prices are absent.';

CREATE INDEX IF NOT EXISTS idx_platform_metrics_daily_date
  ON public.platform_metrics_daily(date DESC);

ALTER TABLE public.platform_metrics_daily ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.platform_metrics_daily FROM anon, authenticated;

CREATE TABLE IF NOT EXISTS public.professional_platform_health_scores (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  professional_id        uuid NOT NULL UNIQUE REFERENCES public.professionals(id) ON DELETE RESTRICT,

  whatsapp_connected     integer NOT NULL DEFAULT 0 CHECK (whatsapp_connected BETWEEN 0 AND 20),
  clients_active         integer NOT NULL DEFAULT 0 CHECK (clients_active BETWEEN 0 AND 20),
  appointments_monthly   integer NOT NULL DEFAULT 0 CHECK (appointments_monthly BETWEEN 0 AND 20),
  rosane_active          integer NOT NULL DEFAULT 0 CHECK (rosane_active BETWEEN 0 AND 20),
  financial_registered   integer NOT NULL DEFAULT 0 CHECK (financial_registered BETWEEN 0 AND 10),
  nps_collected          integer NOT NULL DEFAULT 0 CHECK (nps_collected BETWEEN 0 AND 10),

  total_score            integer GENERATED ALWAYS AS (
                           whatsapp_connected + clients_active + appointments_monthly +
                           rosane_active + financial_registered + nps_collected
                         ) STORED,
  health_level           text NOT NULL DEFAULT 'critico'
                         CHECK (health_level IN ('critico','baixo','medio','alto','excelente')),
  components             jsonb NOT NULL DEFAULT '{}',
  calculated_at          timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.professional_platform_health_scores IS
  'Admin-only platform adoption/churn-risk score for professionals. Not exposed directly to professionals in Phase 9.';

CREATE INDEX IF NOT EXISTS idx_prof_platform_health_level
  ON public.professional_platform_health_scores(health_level, calculated_at DESC);
CREATE INDEX IF NOT EXISTS idx_prof_platform_health_calculated
  ON public.professional_platform_health_scores(calculated_at DESC);

ALTER TABLE public.professional_platform_health_scores ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.professional_platform_health_scores FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.admin_is_master()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.master_admins ma
    WHERE ma.user_id = auth.uid()
  );
$$;

REVOKE ALL ON FUNCTION public.admin_is_master() FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.is_master_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT public.admin_is_master();
$$;

REVOKE ALL ON FUNCTION public.is_master_admin() FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_master_admin() TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_assert_master()
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_master_admin_id uuid;
BEGIN
  SELECT ma.id
  INTO v_master_admin_id
  FROM public.master_admins ma
  WHERE ma.user_id = auth.uid()
  LIMIT 1;

  IF v_master_admin_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  RETURN v_master_admin_id;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_assert_master() FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.platform_health_level(p_score integer)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT CASE
    WHEN COALESCE(p_score, 0) < 35 THEN 'critico'
    WHEN p_score < 55 THEN 'baixo'
    WHEN p_score < 75 THEN 'medio'
    WHEN p_score < 90 THEN 'alto'
    ELSE 'excelente'
  END;
$$;

REVOKE ALL ON FUNCTION public.platform_health_level(integer) FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.calculate_platform_health_scores_batch(
  p_limit integer DEFAULT 50,
  p_cursor uuid DEFAULT NULL,
  p_dry_run boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_limit integer := LEAST(GREATEST(COALESCE(p_limit, 50), 1), 200);
  v_row record;
  v_processed integer := 0;
  v_next_cursor uuid := NULL;
  v_whatsapp integer;
  v_clients integer;
  v_appointments integer;
  v_rosane integer;
  v_financial integer;
  v_nps integer;
  v_total integer;
  v_level text;
  v_month_start timestamptz := date_trunc('month', now());
  v_components jsonb;
BEGIN
  FOR v_row IN
    SELECT p.id, p.whatsapp_connected, p.onboarding_completed, p.plan_type
    FROM public.professionals p
    WHERE p.deleted_at IS NULL
      AND (p_cursor IS NULL OR p.id > p_cursor)
    ORDER BY p.id
    LIMIT v_limit
  LOOP
    SELECT CASE WHEN COALESCE(v_row.whatsapp_connected, false) THEN 20 ELSE 0 END
    INTO v_whatsapp;

    SELECT LEAST(COUNT(*)::integer * 2, 20)
    INTO v_clients
    FROM public.clients c
    WHERE c.professional_id = v_row.id
      AND c.is_active = true
      AND c.deleted_at IS NULL;

    SELECT LEAST(COUNT(*)::integer * 2, 20)
    INTO v_appointments
    FROM public.appointments a
    WHERE a.professional_id = v_row.id
      AND a.scheduled_at >= v_month_start;

    SELECT CASE
      WHEN EXISTS (
        SELECT 1
        FROM public.professional_agents pa
        WHERE pa.professional_id = v_row.id
          AND pa.agent_slug = 'rosane'
          AND pa.is_active = true
      ) THEN 20
      ELSE 0
    END
    INTO v_rosane;

    SELECT CASE
      WHEN EXISTS (
        SELECT 1
        FROM public.financial_transactions ft
        WHERE ft.professional_id = v_row.id
          AND ft.status IN ('pago','pendente')
      ) THEN 10
      ELSE 0
    END
    INTO v_financial;

    SELECT CASE
      WHEN EXISTS (
        SELECT 1
        FROM public.sessions s
        WHERE s.professional_id = v_row.id
          AND s.nps_score IS NOT NULL
      ) THEN 10
      ELSE 0
    END
    INTO v_nps;

    v_total := v_whatsapp + v_clients + v_appointments + v_rosane + v_financial + v_nps;
    v_level := public.platform_health_level(v_total);
    v_components := jsonb_build_object(
      'whatsapp_connected', v_whatsapp,
      'clients_active', v_clients,
      'appointments_monthly', v_appointments,
      'rosane_active', v_rosane,
      'financial_registered', v_financial,
      'nps_collected', v_nps,
      'plan_type', v_row.plan_type,
      'dry_run', p_dry_run
    );

    IF NOT p_dry_run THEN
      INSERT INTO public.professional_platform_health_scores (
        professional_id,
        whatsapp_connected,
        clients_active,
        appointments_monthly,
        rosane_active,
        financial_registered,
        nps_collected,
        health_level,
        components,
        calculated_at
      )
      VALUES (
        v_row.id,
        v_whatsapp,
        v_clients,
        v_appointments,
        v_rosane,
        v_financial,
        v_nps,
        v_level,
        v_components,
        now()
      )
      ON CONFLICT (professional_id) DO UPDATE
      SET whatsapp_connected = EXCLUDED.whatsapp_connected,
          clients_active = EXCLUDED.clients_active,
          appointments_monthly = EXCLUDED.appointments_monthly,
          rosane_active = EXCLUDED.rosane_active,
          financial_registered = EXCLUDED.financial_registered,
          nps_collected = EXCLUDED.nps_collected,
          health_level = EXCLUDED.health_level,
          components = EXCLUDED.components,
          calculated_at = EXCLUDED.calculated_at;
    END IF;

    v_processed := v_processed + 1;
    v_next_cursor := v_row.id;
  END LOOP;

  RETURN jsonb_build_object(
    'ok', true,
    'processed', v_processed,
    'next_cursor', v_next_cursor,
    'dry_run', p_dry_run
  );
END;
$$;

REVOKE ALL ON FUNCTION public.calculate_platform_health_scores_batch(integer, uuid, boolean) FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.refresh_platform_metrics_daily(
  p_date date DEFAULT CURRENT_DATE,
  p_dry_run boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_date date := COALESCE(p_date, CURRENT_DATE);
  v_start timestamptz := v_date::timestamptz;
  v_end timestamptz := (v_date + 1)::timestamptz;
  v_month_start timestamptz := date_trunc('month', v_date::timestamptz);
  v_month_end timestamptz := (date_trunc('month', v_date::timestamptz) + interval '1 month');
  v_metrics jsonb;
  v_total_professionals integer;
  v_new_professionals integer;
  v_active_professionals integer;
  v_churned_professionals integer;
  v_mrr numeric(12,2);
  v_new_mrr numeric(12,2);
  v_churned_mrr numeric(12,2);
  v_total_revenue_day numeric(12,2);
  v_total_sessions integer;
  v_total_messages_sent integer;
  v_total_ai_credits_used integer := 0;
  v_total_appointments integer;
  v_plan_breakdown jsonb;
BEGIN
  SELECT COUNT(*)::integer
  INTO v_total_professionals
  FROM public.professionals p
  WHERE p.deleted_at IS NULL;

  SELECT COUNT(*)::integer
  INTO v_new_professionals
  FROM public.professionals p
  WHERE p.deleted_at IS NULL
    AND p.created_at >= v_start
    AND p.created_at < v_end;

  SELECT COUNT(DISTINCT s.professional_id)::integer
  INTO v_active_professionals
  FROM public.sessions s
  WHERE s.session_date >= v_date
    AND s.session_date < (v_date + 1);

  SELECT COUNT(*)::integer
  INTO v_churned_professionals
  FROM public.professional_platform_health_scores h
  WHERE h.health_level = 'critico'
    AND h.calculated_at >= (v_start - interval '7 days');

  SELECT COALESCE(SUM(NULLIF(p.settings->'billing_info'->>'monthly_amount', '')::numeric), 0)::numeric(12,2)
  INTO v_mrr
  FROM public.professionals p
  WHERE p.deleted_at IS NULL
    AND p.plan_type IN ('individual','equipe','team','enterprise')
    AND NULLIF(p.settings->'billing_info'->>'monthly_amount', '') IS NOT NULL;

  SELECT COALESCE(SUM(NULLIF(p.settings->'billing_info'->>'monthly_amount', '')::numeric), 0)::numeric(12,2)
  INTO v_new_mrr
  FROM public.professionals p
  WHERE p.deleted_at IS NULL
    AND p.plan_type IN ('individual','equipe','team','enterprise')
    AND p.created_at >= v_month_start
    AND p.created_at < v_month_end
    AND NULLIF(p.settings->'billing_info'->>'monthly_amount', '') IS NOT NULL;

  v_churned_mrr := 0;

  SELECT COALESCE(SUM(ft.net_amount), 0)::numeric(12,2)
  INTO v_total_revenue_day
  FROM public.financial_transactions ft
  WHERE ft.status = 'pago'
    AND ft.type = 'receita'
    AND ft.paid_at >= v_start
    AND ft.paid_at < v_end;

  SELECT COUNT(*)::integer
  INTO v_total_sessions
  FROM public.sessions s
  WHERE s.session_date >= v_date
    AND s.session_date < (v_date + 1);

  SELECT COUNT(*)::integer
  INTO v_total_messages_sent
  FROM public.message_events me
  WHERE me.direction = 'outbound'
    AND me.status IN ('sent','delivered','read','dry_run')
    AND me.created_at >= v_start
    AND me.created_at < v_end;

  SELECT COUNT(*)::integer
  INTO v_total_appointments
  FROM public.appointments a
  WHERE a.scheduled_at >= v_start
    AND a.scheduled_at < v_end;

  SELECT COALESCE(jsonb_object_agg(plan_type, total), '{}'::jsonb)
  INTO v_plan_breakdown
  FROM (
    SELECT p.plan_type, COUNT(*)::integer AS total
    FROM public.professionals p
    WHERE p.deleted_at IS NULL
    GROUP BY p.plan_type
  ) plans;

  v_metrics := jsonb_build_object(
    'date', v_date,
    'total_professionals', v_total_professionals,
    'new_professionals', v_new_professionals,
    'active_professionals', v_active_professionals,
    'churned_professionals', v_churned_professionals,
    'mrr', v_mrr,
    'new_mrr', v_new_mrr,
    'churned_mrr', v_churned_mrr,
    'total_revenue_day', v_total_revenue_day,
    'total_sessions', v_total_sessions,
    'total_messages_sent', v_total_messages_sent,
    'total_ai_credits_used', v_total_ai_credits_used,
    'total_appointments', v_total_appointments,
    'plan_breakdown', v_plan_breakdown,
    'dry_run', p_dry_run
  );

  IF NOT p_dry_run THEN
    INSERT INTO public.platform_metrics_daily (
      date,
      total_professionals,
      new_professionals,
      active_professionals,
      churned_professionals,
      mrr,
      new_mrr,
      churned_mrr,
      total_revenue_day,
      total_sessions,
      total_messages_sent,
      total_ai_credits_used,
      total_appointments,
      plan_breakdown
    )
    VALUES (
      v_date,
      v_total_professionals,
      v_new_professionals,
      v_active_professionals,
      v_churned_professionals,
      v_mrr,
      v_new_mrr,
      v_churned_mrr,
      v_total_revenue_day,
      v_total_sessions,
      v_total_messages_sent,
      v_total_ai_credits_used,
      v_total_appointments,
      v_plan_breakdown
    )
    ON CONFLICT (date) DO UPDATE
    SET total_professionals = EXCLUDED.total_professionals,
        new_professionals = EXCLUDED.new_professionals,
        active_professionals = EXCLUDED.active_professionals,
        churned_professionals = EXCLUDED.churned_professionals,
        mrr = EXCLUDED.mrr,
        new_mrr = EXCLUDED.new_mrr,
        churned_mrr = EXCLUDED.churned_mrr,
        total_revenue_day = EXCLUDED.total_revenue_day,
        total_sessions = EXCLUDED.total_sessions,
        total_messages_sent = EXCLUDED.total_messages_sent,
        total_ai_credits_used = EXCLUDED.total_ai_credits_used,
        total_appointments = EXCLUDED.total_appointments,
        plan_breakdown = EXCLUDED.plan_breakdown;
  END IF;

  RETURN jsonb_build_object('ok', true, 'metrics', v_metrics);
END;
$$;

REVOKE ALL ON FUNCTION public.refresh_platform_metrics_daily(date, boolean) FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_admin_dashboard_rpc()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_admin_id uuid;
  v_today date := CURRENT_DATE;
  v_snapshot jsonb;
  v_health jsonb;
  v_recent_metrics jsonb;
BEGIN
  v_admin_id := public.admin_assert_master();

  SELECT COALESCE(to_jsonb(pmd), '{}'::jsonb)
  INTO v_snapshot
  FROM public.platform_metrics_daily pmd
  WHERE pmd.date = (
    SELECT MAX(date) FROM public.platform_metrics_daily
  );

  IF v_snapshot = '{}'::jsonb THEN
    SELECT public.refresh_platform_metrics_daily(v_today, true)->'metrics'
    INTO v_snapshot;
  END IF;

  SELECT jsonb_build_object(
    'critico', COUNT(*) FILTER (WHERE health_level = 'critico'),
    'baixo', COUNT(*) FILTER (WHERE health_level = 'baixo'),
    'medio', COUNT(*) FILTER (WHERE health_level = 'medio'),
    'alto', COUNT(*) FILTER (WHERE health_level = 'alto'),
    'excelente', COUNT(*) FILTER (WHERE health_level = 'excelente')
  )
  INTO v_health
  FROM public.professional_platform_health_scores;

  SELECT COALESCE(jsonb_agg(to_jsonb(m) ORDER BY m.date DESC), '[]'::jsonb)
  INTO v_recent_metrics
  FROM (
    SELECT *
    FROM public.platform_metrics_daily
    ORDER BY date DESC
    LIMIT 14
  ) m;

  RETURN jsonb_build_object(
    'ok', true,
    'admin_id', v_admin_id,
    'snapshot', COALESCE(v_snapshot, '{}'::jsonb),
    'health_breakdown', COALESCE(v_health, '{}'::jsonb),
    'recent_metrics', v_recent_metrics
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_admin_dashboard_rpc() FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_admin_dashboard_rpc() TO authenticated;

CREATE OR REPLACE FUNCTION public.get_admin_professionals_rpc(
  p_limit integer DEFAULT 50,
  p_cursor uuid DEFAULT NULL,
  p_search text DEFAULT NULL,
  p_health_level text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_admin_id uuid;
  v_limit integer := LEAST(GREATEST(COALESCE(p_limit, 50), 1), 100);
  v_items jsonb;
  v_next_cursor uuid;
BEGIN
  v_admin_id := public.admin_assert_master();

  WITH filtered AS (
    SELECT
      p.id,
      p.name,
      p.business_name,
      p.email,
      p.phone_whatsapp,
      p.slug,
      p.plan_type,
      p.trial_ends_at,
      p.whatsapp_connected,
      p.onboarding_completed,
      p.created_at,
      h.total_score,
      h.health_level,
      h.calculated_at AS health_calculated_at,
      (
        SELECT COUNT(*)::integer
        FROM public.clients c
        WHERE c.professional_id = p.id
          AND c.is_active = true
          AND c.deleted_at IS NULL
      ) AS active_clients,
      (
        SELECT COUNT(*)::integer
        FROM public.sessions s
        WHERE s.professional_id = p.id
      ) AS total_sessions,
      (
        SELECT MAX(me.created_at)
        FROM public.message_events me
        WHERE me.professional_id = p.id
      ) AS last_message_at
    FROM public.professionals p
    LEFT JOIN public.professional_platform_health_scores h
      ON h.professional_id = p.id
    WHERE p.deleted_at IS NULL
      AND (p_cursor IS NULL OR p.id > p_cursor)
      AND (
        NULLIF(trim(COALESCE(p_search, '')), '') IS NULL
        OR p.name ILIKE '%' || trim(p_search) || '%'
        OR p.email ILIKE '%' || trim(p_search) || '%'
        OR p.business_name ILIKE '%' || trim(p_search) || '%'
      )
      AND (
        NULLIF(trim(COALESCE(p_health_level, '')), '') IS NULL
        OR h.health_level = trim(p_health_level)
      )
    ORDER BY p.id
    LIMIT v_limit
  )
  SELECT
    COALESCE(jsonb_agg(to_jsonb(filtered)), '[]'::jsonb),
    (SELECT f.id FROM filtered f ORDER BY f.id DESC LIMIT 1)
  INTO v_items, v_next_cursor
  FROM filtered;

  RETURN jsonb_build_object(
    'ok', true,
    'admin_id', v_admin_id,
    'items', COALESCE(v_items, '[]'::jsonb),
    'next_cursor', v_next_cursor
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_admin_professionals_rpc(integer, uuid, text, text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_admin_professionals_rpc(integer, uuid, text, text) TO authenticated;

-- Rollback:
-- DROP FUNCTION IF EXISTS public.get_admin_professionals_rpc(integer, uuid, text, text);
-- DROP FUNCTION IF EXISTS public.get_admin_dashboard_rpc();
-- DROP FUNCTION IF EXISTS public.refresh_platform_metrics_daily(date, boolean);
-- DROP FUNCTION IF EXISTS public.calculate_platform_health_scores_batch(integer, uuid, boolean);
-- DROP FUNCTION IF EXISTS public.platform_health_level(integer);
-- DROP FUNCTION IF EXISTS public.admin_assert_master();
-- DROP FUNCTION IF EXISTS public.is_master_admin();
-- DROP FUNCTION IF EXISTS public.admin_is_master();
-- DROP TABLE IF EXISTS public.professional_platform_health_scores;
-- DROP TABLE IF EXISTS public.platform_metrics_daily;
