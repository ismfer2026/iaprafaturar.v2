-- Phase 12: reschedule appointment from WhatsApp conversation.
-- Internal RPC only. Tenant is derived from message_event_id.

CREATE OR REPLACE FUNCTION public.reschedule_appointment_from_conversation(
  p_message_event_id uuid,
  p_appointment_id uuid,
  p_new_scheduled_at timestamptz,
  p_confirmed boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_event public.message_events%ROWTYPE;
  v_appointment public.appointments%ROWTYPE;
  v_new_appointment public.appointments%ROWTYPE;
  v_window_hours integer;
BEGIN
  IF p_new_scheduled_at IS NULL OR p_new_scheduled_at <= now() THEN
    RETURN jsonb_build_object('ok', false, 'error', 'scheduled_at_must_be_future');
  END IF;

  SELECT *
  INTO v_event
  FROM public.message_events
  WHERE id = p_message_event_id
    AND direction = 'inbound'
    AND source_webhook = 'professional'
    AND professional_id IS NOT NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'message_event_not_found';
  END IF;

  SELECT *
  INTO v_appointment
  FROM public.appointments
  WHERE id = p_appointment_id
    AND professional_id = v_event.professional_id
    AND deleted_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'appointment_not_found';
  END IF;

  IF v_event.client_id IS NOT NULL AND v_appointment.client_id IS DISTINCT FROM v_event.client_id THEN
    RAISE EXCEPTION 'appointment_client_mismatch';
  END IF;

  IF v_appointment.status NOT IN ('agendado','confirmado') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_status', 'status', v_appointment.status);
  END IF;

  SELECT public.phase12_operational_rules_hours(p.settings, ARRAY['appointment_rules','reschedule_window_hours'], 24)
  INTO v_window_hours
  FROM public.professionals p
  WHERE p.id = v_event.professional_id;

  IF v_appointment.scheduled_at - now() < (v_window_hours || ' hours')::interval THEN
    RETURN jsonb_build_object('ok', false, 'error', 'window_closed', 'window_hours', v_window_hours);
  END IF;

  IF NOT COALESCE(p_confirmed, false) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'confirmation_required', 'appointment_id', v_appointment.id);
  END IF;

  IF public.phase12_appointment_conflicts(v_event.professional_id, p_new_scheduled_at, v_appointment.duration_minutes, v_appointment.id) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'slot_unavailable');
  END IF;

  UPDATE public.appointments
  SET status = 'reagendado',
      cancelled_at = now(),
      cancellation_reason = 'Reagendado via conversa WhatsApp.'
  WHERE id = v_appointment.id
  RETURNING * INTO v_appointment;

  INSERT INTO public.appointments (
    professional_id,
    client_id,
    service_id,
    scheduled_at,
    duration_minutes,
    status,
    source,
    notes,
    metadata
  )
  VALUES (
    v_appointment.professional_id,
    v_appointment.client_id,
    v_appointment.service_id,
    p_new_scheduled_at,
    v_appointment.duration_minutes,
    'agendado',
    'whatsapp',
    'Agendamento criado por remarcacao via conversa WhatsApp.',
    jsonb_build_object(
      'rescheduled_from_appointment_id', v_appointment.id,
      'source_message_event_id', p_message_event_id,
      'source_conversation_id', v_event.conversation_id
    )
  )
  RETURNING * INTO v_new_appointment;

  UPDATE public.conversation_contexts
  SET status = 'closed',
      closed_at = now(),
      metadata = metadata || jsonb_build_object(
        'from_appointment_id', v_appointment.id,
        'appointment_id', v_new_appointment.id,
        'closed_reason', 'appointment_rescheduled'
      )
  WHERE professional_id = v_event.professional_id
    AND conversation_id = v_event.conversation_id
    AND status = 'active'
    AND context_type = 'conversation'
    AND metadata->>'operational_route' = 'reschedule_intake';

  PERFORM public.log_audit_event(
    v_event.professional_id,
    'client',
    'appointment.rescheduled',
    'appointment',
    v_new_appointment.id,
    jsonb_build_object(
      'source', 'whatsapp',
      'message_event_id', p_message_event_id,
      'from_appointment_id', v_appointment.id,
      'to_appointment_id', v_new_appointment.id,
      'client_id', v_appointment.client_id
    )
  );

  RETURN jsonb_build_object(
    'ok', true,
    'from_appointment_id', v_appointment.id,
    'appointment_id', v_new_appointment.id,
    'status', v_new_appointment.status,
    'scheduled_at', v_new_appointment.scheduled_at
  );
END;
$$;

REVOKE ALL ON FUNCTION public.reschedule_appointment_from_conversation(uuid, uuid, timestamptz, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reschedule_appointment_from_conversation(uuid, uuid, timestamptz, boolean) TO service_role;

-- Rollback:
-- DROP FUNCTION IF EXISTS public.reschedule_appointment_from_conversation(uuid, uuid, timestamptz, boolean);
