-- Phase 12: create appointment from WhatsApp conversation.
-- Internal RPC only. Tenant/client are derived from message_event_id, never from caller payload.

CREATE OR REPLACE FUNCTION public.create_appointment_from_conversation(
  p_message_event_id uuid,
  p_service_id uuid,
  p_scheduled_at timestamptz,
  p_confirmed boolean,
  p_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_message public.message_events%ROWTYPE;
  v_client public.clients%ROWTYPE;
  v_service public.services%ROWTYPE;
  v_appointment public.appointments%ROWTYPE;
BEGIN
  SELECT *
  INTO v_message
  FROM public.message_events
  WHERE id = p_message_event_id
    AND source_webhook = 'professional'
    AND direction = 'inbound'
  FOR UPDATE;

  IF NOT FOUND OR v_message.professional_id IS NULL THEN
    RAISE EXCEPTION 'message_event_not_found';
  END IF;

  IF v_message.client_id IS NULL THEN
    RAISE EXCEPTION 'client_required';
  END IF;

  IF p_confirmed IS DISTINCT FROM true THEN
    RETURN jsonb_build_object(
      'ok', true,
      'status', 'pending_confirmation',
      'message_event_id', p_message_event_id,
      'client_id', v_message.client_id
    );
  END IF;

  IF p_scheduled_at IS NULL OR p_scheduled_at <= now() THEN
    RAISE EXCEPTION 'scheduled_at_must_be_future';
  END IF;

  SELECT *
  INTO v_client
  FROM public.clients
  WHERE id = v_message.client_id
    AND professional_id = v_message.professional_id
    AND deleted_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'client_not_found';
  END IF;

  SELECT *
  INTO v_service
  FROM public.services
  WHERE id = p_service_id
    AND professional_id = v_message.professional_id
    AND deleted_at IS NULL
    AND is_active = true;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'service_not_found';
  END IF;

  IF public.phase12_appointment_conflicts(
    v_message.professional_id,
    p_scheduled_at,
    v_service.duration_minutes,
    NULL
  ) THEN
    RETURN jsonb_build_object(
      'ok', false,
      'status', 'no_slots',
      'error', 'slot_unavailable',
      'scheduled_at', p_scheduled_at
    );
  END IF;

  INSERT INTO public.appointments (
    professional_id,
    client_id,
    service_id,
    scheduled_at,
    duration_minutes,
    status,
    source,
    notes,
    created_by,
    metadata
  )
  VALUES (
    v_message.professional_id,
    v_message.client_id,
    p_service_id,
    p_scheduled_at,
    v_service.duration_minutes,
    'agendado',
    'whatsapp',
    p_notes,
    NULL,
    jsonb_build_object(
      'source_message_event_id', p_message_event_id,
      'source_conversation_id', v_message.conversation_id
    )
  )
  RETURNING * INTO v_appointment;

  IF v_client.journey_stage = 'lead' THEN
    UPDATE public.clients
    SET journey_stage = 'agendado'
    WHERE id = v_client.id;

    PERFORM public.log_audit_event(
      v_message.professional_id,
      'ai',
      'client.journey_stage.changed',
      'client',
      v_client.id,
      jsonb_build_object(
        'from_stage', 'lead',
        'to_stage', 'agendado',
        'triggered_by', 'whatsapp',
        'trigger_ref', v_appointment.id,
        'message_event_id', p_message_event_id
      )
    );
  END IF;

  UPDATE public.conversation_contexts
  SET status = 'closed',
      closed_at = now(),
      metadata = metadata || jsonb_build_object(
        'appointment_id', v_appointment.id,
        'closed_reason', 'appointment_created'
      )
  WHERE professional_id = v_message.professional_id
    AND conversation_id = v_message.conversation_id
    AND status = 'active'
    AND context_type = 'conversation'
    AND metadata->>'operational_route' = 'appointment_intake';

  PERFORM public.log_audit_event(
    v_message.professional_id,
    'ai',
    'appointment.created',
    'appointment',
    v_appointment.id,
    jsonb_build_object(
      'appointment_id', v_appointment.id,
      'client_id', v_appointment.client_id,
      'service_id', v_appointment.service_id,
      'scheduled_at', v_appointment.scheduled_at,
      'duration_minutes', v_appointment.duration_minutes,
      'initial_status', 'agendado',
      'source', 'whatsapp',
      'message_event_id', p_message_event_id
    )
  );

  RETURN jsonb_build_object(
    'ok', true,
    'status', 'appointment_created',
    'appointment_id', v_appointment.id,
    'client_id', v_appointment.client_id,
    'service_id', v_appointment.service_id,
    'scheduled_at', v_appointment.scheduled_at,
    'duration_minutes', v_appointment.duration_minutes
  );
END;
$$;

REVOKE ALL ON FUNCTION public.create_appointment_from_conversation(uuid, uuid, timestamptz, boolean, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_appointment_from_conversation(uuid, uuid, timestamptz, boolean, text) TO service_role;

-- Rollback:
-- DROP FUNCTION IF EXISTS public.create_appointment_from_conversation(uuid, uuid, timestamptz, boolean, text);
