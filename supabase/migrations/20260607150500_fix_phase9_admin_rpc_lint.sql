-- ============================================================
-- Phase 9: Fix admin RPC lint errors
--
-- Fixes:
-- - professional_agents uses is_active, not status
-- - PostgreSQL has no max(uuid); cursor must be selected by ordering
-- ============================================================

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
-- Re-apply 20260607150000 function definitions if needed.
