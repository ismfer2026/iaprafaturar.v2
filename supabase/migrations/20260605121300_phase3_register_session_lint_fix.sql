-- ============================================================
-- Phase 3: lint fix for register_session
--
-- Removes an unused row variable reported by `supabase db lint --linked`.
-- Behavior is unchanged.
-- ============================================================

CREATE OR REPLACE FUNCTION public.register_session(
  p_appointment_id uuid,
  p_client_id uuid,
  p_service_id uuid DEFAULT NULL,
  p_session_date timestamptz DEFAULT now(),
  p_clinical_evolution text DEFAULT NULL,
  p_notes text DEFAULT NULL,
  p_session_value numeric DEFAULT 0,
  p_procedures_performed text[] DEFAULT '{}',
  p_products_used text[] DEFAULT '{}'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_professional_id uuid;
  v_appointment public.appointments%ROWTYPE;
  v_session public.sessions%ROWTYPE;
  v_from_status public.appointment_status_enum;
  v_service_id uuid;
BEGIN
  v_professional_id := public.auth_professional_id();

  IF v_professional_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.clients
    WHERE id = p_client_id
      AND professional_id = v_professional_id
      AND deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Client not found';
  END IF;

  SELECT *
  INTO v_appointment
  FROM public.appointments
  WHERE id = p_appointment_id
    AND professional_id = v_professional_id
    AND client_id = p_client_id
    AND deleted_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Appointment not found';
  END IF;

  IF v_appointment.status NOT IN ('agendado','confirmado') THEN
    RAISE EXCEPTION 'Cannot register session for appointment with status %', v_appointment.status;
  END IF;

  v_service_id := COALESCE(p_service_id, v_appointment.service_id);

  IF v_service_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.services
    WHERE id = v_service_id
      AND professional_id = v_professional_id
      AND deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Service not found';
  END IF;

  v_from_status := v_appointment.status;

  INSERT INTO public.sessions (
    professional_id,
    client_id,
    appointment_id,
    service_id,
    session_date,
    clinical_evolution,
    notes,
    session_value,
    procedures_performed,
    products_used,
    created_by
  )
  VALUES (
    v_professional_id,
    p_client_id,
    p_appointment_id,
    v_service_id,
    COALESCE(p_session_date, now()),
    p_clinical_evolution,
    p_notes,
    COALESCE(p_session_value, 0),
    COALESCE(p_procedures_performed, '{}'),
    COALESCE(p_products_used, '{}'),
    auth.uid()
  )
  RETURNING * INTO v_session;

  UPDATE public.appointments
  SET status = 'realizado',
      completed_at = now(),
      outcome_notes = p_notes
  WHERE id = v_appointment.id
  RETURNING * INTO v_appointment;

  PERFORM public.log_audit_event(
    v_professional_id,
    'professional',
    'session.registered',
    'session',
    v_session.id,
    jsonb_build_object(
      'session_id', v_session.id,
      'appointment_id', p_appointment_id,
      'client_id', p_client_id,
      'service_id', v_service_id
    )
  );

  PERFORM public.log_audit_event(
    v_professional_id,
    'professional',
    'appointment.completed',
    'appointment',
    v_appointment.id,
    jsonb_build_object(
      'appointment_id', v_appointment.id,
      'from_status', v_from_status,
      'to_status', 'realizado',
      'session_id', v_session.id
    )
  );

  RETURN jsonb_build_object(
    'session_id', v_session.id,
    'appointment_id', v_appointment.id,
    'appointment_status', v_appointment.status
  );
END;
$$;

-- Rollback note:
-- Reapply the register_session definition from 20260605121200_phase3_crm_core.sql.

