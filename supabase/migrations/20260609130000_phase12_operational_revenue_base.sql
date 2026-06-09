-- ============================================================
-- Phase 12 - Operational client revenue base
--
-- Scope:
-- - appointment_series canonical recurring appointments table
-- - appointment series link + opaque public action token
-- - handoff RPCs
-- - recurring series RPCs
-- - public/internal cancellation/rescheduling RPCs
-- - operational rules RPC
--
-- Explicitly out of scope:
-- - Meta/Instagram/Messenger
-- - Google Calendar
-- - waitlist automation
-- - advanced RLHF/drift graduation
-- ============================================================

CREATE TABLE IF NOT EXISTS public.appointment_series (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  professional_id     uuid NOT NULL REFERENCES public.professionals(id) ON DELETE RESTRICT,
  client_id           uuid NOT NULL REFERENCES public.clients(id) ON DELETE RESTRICT,
  service_id          uuid REFERENCES public.services(id) ON DELETE RESTRICT,
  frequency           text NOT NULL
                       CHECK (frequency IN ('weekly','biweekly','monthly_day','monthly_week')),
  first_scheduled_at  timestamptz NOT NULL,
  ends_at             timestamptz,
  occurrence_count    integer NOT NULL CHECK (occurrence_count > 0 AND occurrence_count <= 52),
  status              text NOT NULL DEFAULT 'active'
                       CHECK (status IN ('active','paused','cancelled','completed')),
  metadata            jsonb NOT NULL DEFAULT '{}',
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.appointment_series IS
  'Canonical v2 recurring appointment series table. Replaces product-flow legacy name recurring_series.';

CREATE TRIGGER appointment_series_updated_at
  BEFORE UPDATE ON public.appointment_series
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX IF NOT EXISTS idx_appointment_series_professional_status
  ON public.appointment_series(professional_id, status);

CREATE INDEX IF NOT EXISTS idx_appointment_series_professional_client
  ON public.appointment_series(professional_id, client_id);

CREATE INDEX IF NOT EXISTS idx_appointment_series_service
  ON public.appointment_series(service_id)
  WHERE service_id IS NOT NULL;

ALTER TABLE public.appointment_series ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "appointment_series_isolation" ON public.appointment_series;
CREATE POLICY "appointment_series_isolation"
ON public.appointment_series FOR ALL TO authenticated
USING (professional_id = public.auth_professional_id())
WITH CHECK (professional_id = public.auth_professional_id());

REVOKE ALL ON public.appointment_series FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.appointment_series TO authenticated;

ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS series_id uuid REFERENCES public.appointment_series(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS series_occurrence_index integer CHECK (series_occurrence_index IS NULL OR series_occurrence_index > 0),
  ADD COLUMN IF NOT EXISTS public_action_token uuid NOT NULL DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS public_action_token_expires_at timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS idx_appointments_public_action_token
  ON public.appointments(public_action_token);

CREATE INDEX IF NOT EXISTS idx_appointments_series
  ON public.appointments(professional_id, series_id, scheduled_at)
  WHERE series_id IS NOT NULL AND deleted_at IS NULL;

CREATE OR REPLACE FUNCTION public.phase12_operational_rules_hours(
  p_settings jsonb,
  p_path text[],
  p_default integer
)
RETURNS integer
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $$
DECLARE
  v_raw text;
BEGIN
  v_raw := p_settings #>> p_path;

  IF v_raw IS NULL OR v_raw !~ '^\d+$' THEN
    RETURN p_default;
  END IF;

  RETURN greatest(0, least(v_raw::integer, 720));
END;
$$;

REVOKE ALL ON FUNCTION public.phase12_operational_rules_hours(jsonb, text[], integer) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.phase12_appointment_conflicts(
  p_professional_id uuid,
  p_scheduled_at timestamptz,
  p_duration_minutes integer,
  p_exclude_appointment_id uuid DEFAULT NULL
)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.appointments a
    WHERE a.professional_id = p_professional_id
      AND a.deleted_at IS NULL
      AND a.status IN ('agendado','confirmado')
      AND (p_exclude_appointment_id IS NULL OR a.id <> p_exclude_appointment_id)
      AND a.scheduled_at < p_scheduled_at + (COALESCE(p_duration_minutes, 60) || ' minutes')::interval
      AND a.scheduled_at + (a.duration_minutes || ' minutes')::interval > p_scheduled_at
  );
$$;

REVOKE ALL ON FUNCTION public.phase12_appointment_conflicts(uuid, timestamptz, integer, uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.take_over_conversation(p_conversation_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_professional_id uuid;
  v_conversation public.conversations%ROWTYPE;
  v_previous_status text;
BEGIN
  v_professional_id := public.auth_professional_id();

  IF v_professional_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  SELECT *
  INTO v_conversation
  FROM public.conversations
  WHERE id = p_conversation_id
    AND professional_id = v_professional_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'conversation_not_found';
  END IF;

  v_previous_status := v_conversation.rosane_status;

  UPDATE public.conversations
  SET rosane_status = 'human_takeover',
      human_takeover_at = now(),
      metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
        'previous_rosane_status', CASE WHEN v_previous_status = 'human_takeover' THEN COALESCE(metadata->>'previous_rosane_status', 'active') ELSE v_previous_status END,
        'human_takeover_auth_user_id', auth.uid(),
        'human_takeover_started_at', now()
      )
  WHERE id = v_conversation.id
  RETURNING * INTO v_conversation;

  PERFORM public.log_audit_event(
    v_professional_id,
    'professional',
    'conversation.handoff.started',
    'conversation',
    v_conversation.id,
    jsonb_build_object(
      'previous_status', v_previous_status,
      'auth_user_id', auth.uid()
    )
  );

  RETURN jsonb_build_object(
    'ok', true,
    'conversation_id', v_conversation.id,
    'rosane_status', v_conversation.rosane_status,
    'human_takeover_at', v_conversation.human_takeover_at
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.release_conversation(
  p_conversation_id uuid,
  p_summary text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_professional_id uuid;
  v_conversation public.conversations%ROWTYPE;
  v_previous_status text;
  v_next_status text;
BEGIN
  v_professional_id := public.auth_professional_id();

  IF v_professional_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  SELECT *
  INTO v_conversation
  FROM public.conversations
  WHERE id = p_conversation_id
    AND professional_id = v_professional_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'conversation_not_found';
  END IF;

  IF v_conversation.rosane_status <> 'human_takeover' THEN
    RAISE EXCEPTION 'conversation_not_in_handoff';
  END IF;

  v_previous_status := COALESCE(NULLIF(v_conversation.metadata->>'previous_rosane_status', ''), 'active');
  v_next_status := CASE WHEN v_previous_status IN ('active','shadow','paused') THEN v_previous_status ELSE 'active' END;

  UPDATE public.conversations
  SET rosane_status = v_next_status,
      human_takeover_at = NULL,
      human_takeover_by = NULL,
      metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
        'last_handoff_summary', NULLIF(left(trim(COALESCE(p_summary, '')), 2000), ''),
        'human_takeover_released_at', now(),
        'human_takeover_released_by_auth_user_id', auth.uid()
      )
  WHERE id = v_conversation.id
  RETURNING * INTO v_conversation;

  PERFORM public.log_audit_event(
    v_professional_id,
    'professional',
    'conversation.handoff.ended',
    'conversation',
    v_conversation.id,
    jsonb_build_object(
      'restored_status', v_next_status,
      'summary_present', NULLIF(trim(COALESCE(p_summary, '')), '') IS NOT NULL,
      'auth_user_id', auth.uid()
    )
  );

  RETURN jsonb_build_object(
    'ok', true,
    'conversation_id', v_conversation.id,
    'rosane_status', v_conversation.rosane_status
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.update_operational_rules(p_rules jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_professional_id uuid;
  v_rules jsonb;
BEGIN
  v_professional_id := public.auth_professional_id();

  IF v_professional_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  v_rules := COALESCE(p_rules, '{}'::jsonb);

  IF jsonb_typeof(v_rules) <> 'object' THEN
    RAISE EXCEPTION 'invalid_rules';
  END IF;

  UPDATE public.professionals
  SET settings = jsonb_set(
        COALESCE(settings, '{}'::jsonb),
        '{appointment_rules}',
        COALESCE(settings->'appointment_rules', '{}'::jsonb) || v_rules,
        true
      ),
      updated_at = now()
  WHERE id = v_professional_id;

  PERFORM public.log_audit_event(
    v_professional_id,
    'professional',
    'operational_rules.updated',
    'professional',
    v_professional_id,
    jsonb_build_object('keys', (SELECT jsonb_agg(key) FROM jsonb_object_keys(v_rules) AS key))
  );

  RETURN jsonb_build_object('ok', true, 'rules', v_rules);
END;
$$;

CREATE OR REPLACE FUNCTION public.create_appointment_series(
  p_client_id uuid,
  p_service_id uuid,
  p_first_scheduled_at timestamptz,
  p_frequency text,
  p_occurrence_count integer,
  p_ends_at timestamptz DEFAULT NULL,
  p_adjusted_occurrences jsonb DEFAULT '[]'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_professional_id uuid;
  v_client public.clients%ROWTYPE;
  v_service public.services%ROWTYPE;
  v_series public.appointment_series%ROWTYPE;
  v_occurrence timestamptz;
  v_created_ids uuid[] := ARRAY[]::uuid[];
  v_conflicts jsonb := '[]'::jsonb;
  v_adjusted text;
  v_appointment_id uuid;
  i integer;
BEGIN
  v_professional_id := public.auth_professional_id();

  IF v_professional_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  IF p_frequency NOT IN ('weekly','biweekly','monthly_day','monthly_week') THEN
    RAISE EXCEPTION 'invalid_frequency';
  END IF;

  IF p_first_scheduled_at IS NULL OR p_first_scheduled_at <= now() THEN
    RAISE EXCEPTION 'first_scheduled_at_must_be_future';
  END IF;

  IF p_occurrence_count IS NULL OR p_occurrence_count < 1 OR p_occurrence_count > 52 THEN
    RAISE EXCEPTION 'invalid_occurrence_count';
  END IF;

  IF jsonb_typeof(COALESCE(p_adjusted_occurrences, '[]'::jsonb)) <> 'array' THEN
    RAISE EXCEPTION 'invalid_adjusted_occurrences';
  END IF;

  SELECT *
  INTO v_client
  FROM public.clients
  WHERE id = p_client_id
    AND professional_id = v_professional_id
    AND deleted_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'client_not_found';
  END IF;

  SELECT *
  INTO v_service
  FROM public.services
  WHERE id = p_service_id
    AND professional_id = v_professional_id
    AND deleted_at IS NULL
    AND is_active = true;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'service_not_found';
  END IF;

  FOR i IN 1..p_occurrence_count LOOP
    SELECT elem->>'scheduled_at'
    INTO v_adjusted
    FROM jsonb_array_elements(COALESCE(p_adjusted_occurrences, '[]'::jsonb)) elem
    WHERE (elem->>'index')::integer = i
    LIMIT 1;

    IF v_adjusted IS NOT NULL THEN
      v_occurrence := v_adjusted::timestamptz;
    ELSE
      v_occurrence := CASE p_frequency
        WHEN 'weekly' THEN p_first_scheduled_at + ((i - 1) * interval '7 days')
        WHEN 'biweekly' THEN p_first_scheduled_at + ((i - 1) * interval '14 days')
        WHEN 'monthly_day' THEN p_first_scheduled_at + make_interval(months => i - 1)
        WHEN 'monthly_week' THEN p_first_scheduled_at + make_interval(months => i - 1)
      END;
    END IF;

    IF p_ends_at IS NOT NULL AND v_occurrence > p_ends_at THEN
      EXIT;
    END IF;

    IF v_occurrence > p_first_scheduled_at + interval '3 months' THEN
      EXIT;
    END IF;

    IF public.phase12_appointment_conflicts(v_professional_id, v_occurrence, v_service.duration_minutes, NULL) THEN
      v_conflicts := v_conflicts || jsonb_build_array(jsonb_build_object('index', i, 'scheduled_at', v_occurrence));
    END IF;
  END LOOP;

  IF jsonb_array_length(v_conflicts) > 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'series_conflicts', 'conflicts', v_conflicts);
  END IF;

  INSERT INTO public.appointment_series (
    professional_id,
    client_id,
    service_id,
    frequency,
    first_scheduled_at,
    ends_at,
    occurrence_count,
    status,
    metadata
  )
  VALUES (
    v_professional_id,
    p_client_id,
    p_service_id,
    p_frequency,
    p_first_scheduled_at,
    p_ends_at,
    p_occurrence_count,
    'active',
    jsonb_build_object('created_by_auth_user_id', auth.uid())
  )
  RETURNING * INTO v_series;

  FOR i IN 1..p_occurrence_count LOOP
    SELECT elem->>'scheduled_at'
    INTO v_adjusted
    FROM jsonb_array_elements(COALESCE(p_adjusted_occurrences, '[]'::jsonb)) elem
    WHERE (elem->>'index')::integer = i
    LIMIT 1;

    IF v_adjusted IS NOT NULL THEN
      v_occurrence := v_adjusted::timestamptz;
    ELSE
      v_occurrence := CASE p_frequency
        WHEN 'weekly' THEN p_first_scheduled_at + ((i - 1) * interval '7 days')
        WHEN 'biweekly' THEN p_first_scheduled_at + ((i - 1) * interval '14 days')
        WHEN 'monthly_day' THEN p_first_scheduled_at + make_interval(months => i - 1)
        WHEN 'monthly_week' THEN p_first_scheduled_at + make_interval(months => i - 1)
      END;
    END IF;

    IF p_ends_at IS NOT NULL AND v_occurrence > p_ends_at THEN
      EXIT;
    END IF;

    IF v_occurrence > p_first_scheduled_at + interval '3 months' THEN
      EXIT;
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
      series_id,
      series_occurrence_index,
      metadata
    )
    VALUES (
      v_professional_id,
      p_client_id,
      p_service_id,
      v_occurrence,
      v_service.duration_minutes,
      'agendado',
      'crm',
      'Agendamento criado como parte de serie recorrente.',
      auth.uid(),
      v_series.id,
      i,
      jsonb_build_object('series_id', v_series.id, 'series_occurrence_index', i)
    )
    RETURNING id INTO v_appointment_id;

    v_created_ids := array_append(v_created_ids, v_appointment_id);
  END LOOP;

  PERFORM public.log_audit_event(
    v_professional_id,
    'professional',
    'appointment.series.created',
    'appointment_series',
    v_series.id,
    jsonb_build_object(
      'client_id', p_client_id,
      'service_id', p_service_id,
      'frequency', p_frequency,
      'created_appointment_ids', v_created_ids
    )
  );

  RETURN jsonb_build_object(
    'ok', true,
    'series_id', v_series.id,
    'created_appointment_ids', to_jsonb(v_created_ids),
    'created_count', cardinality(v_created_ids)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.cancel_appointment_series(
  p_series_id uuid,
  p_scope text,
  p_from_appointment_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_professional_id uuid;
  v_series public.appointment_series%ROWTYPE;
  v_from_appointment public.appointments%ROWTYPE;
  v_cancelled_count integer := 0;
  v_skipped_terminal_count integer := 0;
BEGIN
  v_professional_id := public.auth_professional_id();

  IF v_professional_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  IF p_scope NOT IN ('occurrence','from_here','all') THEN
    RAISE EXCEPTION 'invalid_series_cancel_scope';
  END IF;

  IF p_scope IN ('occurrence','from_here') AND p_from_appointment_id IS NULL THEN
    RAISE EXCEPTION 'from_appointment_required';
  END IF;

  SELECT *
  INTO v_series
  FROM public.appointment_series
  WHERE id = p_series_id
    AND professional_id = v_professional_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'series_not_found';
  END IF;

  IF p_from_appointment_id IS NOT NULL THEN
    SELECT *
    INTO v_from_appointment
    FROM public.appointments
    WHERE id = p_from_appointment_id
      AND professional_id = v_professional_id
      AND series_id = p_series_id
      AND deleted_at IS NULL
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'series_appointment_not_found';
    END IF;
  END IF;

  WITH target AS (
    SELECT id
    FROM public.appointments
    WHERE professional_id = v_professional_id
      AND series_id = p_series_id
      AND deleted_at IS NULL
      AND (
        (p_scope = 'occurrence' AND id = p_from_appointment_id)
        OR (p_scope = 'from_here' AND scheduled_at >= v_from_appointment.scheduled_at)
        OR (p_scope = 'all' AND scheduled_at >= now())
      )
      AND status IN ('agendado','confirmado')
  ),
  updated AS (
    UPDATE public.appointments a
    SET status = 'cancelado',
        cancelled_at = now(),
        cancellation_reason = 'Cancelado por acao de serie recorrente.'
    FROM target
    WHERE a.id = target.id
    RETURNING a.id
  )
  SELECT count(*) INTO v_cancelled_count FROM updated;

  SELECT count(*)
  INTO v_skipped_terminal_count
  FROM public.appointments
  WHERE professional_id = v_professional_id
    AND series_id = p_series_id
    AND deleted_at IS NULL
    AND (
      (p_scope = 'occurrence' AND id = p_from_appointment_id)
      OR (p_scope = 'from_here' AND scheduled_at >= v_from_appointment.scheduled_at)
      OR (p_scope = 'all' AND scheduled_at >= now())
    )
    AND status NOT IN ('agendado','confirmado','cancelado');

  IF p_scope IN ('all','from_here') THEN
    UPDATE public.appointment_series
    SET status = 'cancelled',
        metadata = metadata || jsonb_build_object('cancelled_scope', p_scope, 'cancelled_at', now())
    WHERE id = p_series_id
    RETURNING * INTO v_series;
  END IF;

  PERFORM public.log_audit_event(
    v_professional_id,
    'professional',
    CASE WHEN p_scope = 'occurrence' THEN 'appointment.series.occurrence.cancelled' ELSE 'appointment.series.cancelled' END,
    'appointment_series',
    p_series_id,
    jsonb_build_object(
      'scope', p_scope,
      'from_appointment_id', p_from_appointment_id,
      'cancelled_count', v_cancelled_count,
      'skipped_terminal_count', v_skipped_terminal_count
    )
  );

  RETURN jsonb_build_object(
    'ok', true,
    'series_id', p_series_id,
    'scope', p_scope,
    'cancelled_count', v_cancelled_count,
    'skipped_terminal_count', v_skipped_terminal_count
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.cancel_appointment_from_conversation(
  p_message_event_id uuid,
  p_appointment_id uuid,
  p_reason text DEFAULT NULL,
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
  v_window_hours integer;
BEGIN
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

  IF v_appointment.status NOT IN ('agendado','confirmado') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_status', 'status', v_appointment.status);
  END IF;

  SELECT public.phase12_operational_rules_hours(p.settings, ARRAY['appointment_rules','cancel_window_hours'], 24)
  INTO v_window_hours
  FROM public.professionals p
  WHERE p.id = v_event.professional_id;

  IF v_appointment.scheduled_at - now() < (v_window_hours || ' hours')::interval THEN
    RETURN jsonb_build_object('ok', false, 'error', 'window_closed', 'window_hours', v_window_hours);
  END IF;

  IF NOT COALESCE(p_confirmed, false) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'confirmation_required', 'appointment_id', v_appointment.id);
  END IF;

  UPDATE public.appointments
  SET status = 'cancelado',
      cancelled_at = now(),
      cancellation_reason = COALESCE(NULLIF(left(trim(COALESCE(p_reason, '')), 500), ''), 'Cancelado via conversa WhatsApp.')
  WHERE id = v_appointment.id
  RETURNING * INTO v_appointment;

  PERFORM public.log_audit_event(
    v_event.professional_id,
    'client',
    'appointment.cancelled',
    'appointment',
    v_appointment.id,
    jsonb_build_object('source', 'whatsapp', 'message_event_id', p_message_event_id)
  );

  RETURN jsonb_build_object('ok', true, 'appointment_id', v_appointment.id, 'status', v_appointment.status);
END;
$$;

CREATE OR REPLACE FUNCTION public.cancel_public_appointment(
  p_appointment_token text,
  p_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_appointment public.appointments%ROWTYPE;
  v_window_hours integer;
BEGIN
  SELECT *
  INTO v_appointment
  FROM public.appointments
  WHERE public_action_token::text = NULLIF(trim(COALESCE(p_appointment_token, '')), '')
    AND deleted_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'appointment_not_found');
  END IF;

  IF v_appointment.public_action_token_expires_at IS NOT NULL AND v_appointment.public_action_token_expires_at <= now() THEN
    RETURN jsonb_build_object('ok', false, 'error', 'token_expired');
  END IF;

  IF v_appointment.status = 'cancelado' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'already_cancelled');
  END IF;

  IF v_appointment.status NOT IN ('agendado','confirmado') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_status', 'status', v_appointment.status);
  END IF;

  SELECT public.phase12_operational_rules_hours(p.settings, ARRAY['appointment_rules','cancel_window_hours'], 24)
  INTO v_window_hours
  FROM public.professionals p
  WHERE p.id = v_appointment.professional_id;

  IF v_appointment.scheduled_at - now() < (v_window_hours || ' hours')::interval THEN
    RETURN jsonb_build_object('ok', false, 'error', 'window_closed', 'window_hours', v_window_hours);
  END IF;

  UPDATE public.appointments
  SET status = 'cancelado',
      cancelled_at = now(),
      cancellation_reason = COALESCE(NULLIF(left(trim(COALESCE(p_reason, '')), 500), ''), 'Cancelado pelo cliente no PWA.')
  WHERE id = v_appointment.id
  RETURNING * INTO v_appointment;

  PERFORM public.log_audit_event(
    v_appointment.professional_id,
    'client',
    'appointment.cancelled',
    'appointment',
    v_appointment.id,
    jsonb_build_object('source', 'client_pwa', 'client_id', v_appointment.client_id)
  );

  RETURN jsonb_build_object('ok', true, 'appointment_id', v_appointment.id, 'status', v_appointment.status);
END;
$$;

CREATE OR REPLACE FUNCTION public.reschedule_public_appointment(
  p_appointment_token text,
  p_new_scheduled_at timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_appointment public.appointments%ROWTYPE;
  v_new_appointment public.appointments%ROWTYPE;
  v_window_hours integer;
BEGIN
  IF p_new_scheduled_at IS NULL OR p_new_scheduled_at <= now() THEN
    RETURN jsonb_build_object('ok', false, 'error', 'scheduled_at_must_be_future');
  END IF;

  SELECT *
  INTO v_appointment
  FROM public.appointments
  WHERE public_action_token::text = NULLIF(trim(COALESCE(p_appointment_token, '')), '')
    AND deleted_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'appointment_not_found');
  END IF;

  IF v_appointment.public_action_token_expires_at IS NOT NULL AND v_appointment.public_action_token_expires_at <= now() THEN
    RETURN jsonb_build_object('ok', false, 'error', 'token_expired');
  END IF;

  IF v_appointment.status NOT IN ('agendado','confirmado') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_status', 'status', v_appointment.status);
  END IF;

  SELECT public.phase12_operational_rules_hours(p.settings, ARRAY['appointment_rules','reschedule_window_hours'], 24)
  INTO v_window_hours
  FROM public.professionals p
  WHERE p.id = v_appointment.professional_id;

  IF v_appointment.scheduled_at - now() < (v_window_hours || ' hours')::interval THEN
    RETURN jsonb_build_object('ok', false, 'error', 'window_closed', 'window_hours', v_window_hours);
  END IF;

  IF public.phase12_appointment_conflicts(v_appointment.professional_id, p_new_scheduled_at, v_appointment.duration_minutes, v_appointment.id) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'slot_unavailable');
  END IF;

  UPDATE public.appointments
  SET status = 'reagendado',
      cancelled_at = now(),
      cancellation_reason = 'Reagendado pelo cliente no PWA.'
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
    booked_by_client,
    booked_at,
    metadata
  )
  VALUES (
    v_appointment.professional_id,
    v_appointment.client_id,
    v_appointment.service_id,
    p_new_scheduled_at,
    v_appointment.duration_minutes,
    'agendado',
    'public_link',
    'Agendamento criado por remarcacao no PWA.',
    true,
    now(),
    jsonb_build_object('rescheduled_from_appointment_id', v_appointment.id)
  )
  RETURNING * INTO v_new_appointment;

  PERFORM public.log_audit_event(
    v_appointment.professional_id,
    'client',
    'appointment.rescheduled',
    'appointment',
    v_new_appointment.id,
    jsonb_build_object(
      'source', 'client_pwa',
      'from_appointment_id', v_appointment.id,
      'to_appointment_id', v_new_appointment.id,
      'client_id', v_appointment.client_id
    )
  );

  RETURN jsonb_build_object(
    'ok', true,
    'from_appointment_id', v_appointment.id,
    'appointment_id', v_new_appointment.id,
    'status', v_new_appointment.status
  );
END;
$$;

REVOKE ALL ON FUNCTION public.take_over_conversation(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.release_conversation(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.update_operational_rules(jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.create_appointment_series(uuid, uuid, timestamptz, text, integer, timestamptz, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.cancel_appointment_series(uuid, text, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.cancel_appointment_from_conversation(uuid, uuid, text, boolean) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.cancel_public_appointment(text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.reschedule_public_appointment(text, timestamptz) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.take_over_conversation(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.release_conversation(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_operational_rules(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_appointment_series(uuid, uuid, timestamptz, text, integer, timestamptz, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_appointment_series(uuid, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_appointment_from_conversation(uuid, uuid, text, boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public.cancel_public_appointment(text, text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.reschedule_public_appointment(text, timestamptz) TO anon, authenticated, service_role;

-- Rollback notes:
-- DROP FUNCTION IF EXISTS public.reschedule_public_appointment(text, timestamptz);
-- DROP FUNCTION IF EXISTS public.cancel_public_appointment(text, text);
-- DROP FUNCTION IF EXISTS public.cancel_appointment_from_conversation(uuid, uuid, text, boolean);
-- DROP FUNCTION IF EXISTS public.cancel_appointment_series(uuid, text, uuid);
-- DROP FUNCTION IF EXISTS public.create_appointment_series(uuid, uuid, timestamptz, text, integer, timestamptz, jsonb);
-- DROP FUNCTION IF EXISTS public.update_operational_rules(jsonb);
-- DROP FUNCTION IF EXISTS public.release_conversation(uuid, text);
-- DROP FUNCTION IF EXISTS public.take_over_conversation(uuid);
-- DROP FUNCTION IF EXISTS public.phase12_appointment_conflicts(uuid, timestamptz, integer, uuid);
-- DROP FUNCTION IF EXISTS public.phase12_operational_rules_hours(jsonb, text[], integer);
-- DROP INDEX IF EXISTS public.idx_appointments_series;
-- DROP INDEX IF EXISTS public.idx_appointments_public_action_token;
-- ALTER TABLE public.appointments
--   DROP COLUMN IF EXISTS public_action_token_expires_at,
--   DROP COLUMN IF EXISTS public_action_token,
--   DROP COLUMN IF EXISTS series_occurrence_index,
--   DROP COLUMN IF EXISTS series_id;
-- DROP TABLE IF EXISTS public.appointment_series;
