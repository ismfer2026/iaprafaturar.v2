-- Phase 9: support targeted platform health calculation without RPC overloads.

DROP FUNCTION IF EXISTS public.calculate_platform_health_scores_batch(integer, uuid, boolean);

CREATE OR REPLACE FUNCTION public.calculate_platform_health_scores_batch(
  p_limit integer DEFAULT 50,
  p_cursor uuid DEFAULT NULL,
  p_dry_run boolean DEFAULT false,
  p_professional_id uuid DEFAULT NULL
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
      AND (p_professional_id IS NULL OR p.id = p_professional_id)
      AND (p_professional_id IS NOT NULL OR p_cursor IS NULL OR p.id > p_cursor)
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
    'next_cursor', CASE WHEN p_professional_id IS NULL THEN v_next_cursor ELSE NULL END,
    'dry_run', p_dry_run
  );
END;
$$;

REVOKE ALL ON FUNCTION public.calculate_platform_health_scores_batch(integer, uuid, boolean, uuid) FROM anon, authenticated;

-- Rollback:
-- DROP FUNCTION IF EXISTS public.calculate_platform_health_scores_batch(integer, uuid, boolean, uuid);
