-- Fix Phase 12 RPC lint warnings: unused/shadowed variables.

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
  v_service public.services%ROWTYPE;
  v_series public.appointment_series%ROWTYPE;
  v_occurrence timestamptz;
  v_created_ids uuid[] := ARRAY[]::uuid[];
  v_conflicts jsonb := '[]'::jsonb;
  v_adjusted text;
  v_appointment_id uuid;
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

  PERFORM 1
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

  FOR v_index IN 1..p_occurrence_count LOOP
    SELECT elem->>'scheduled_at'
    INTO v_adjusted
    FROM jsonb_array_elements(COALESCE(p_adjusted_occurrences, '[]'::jsonb)) elem
    WHERE (elem->>'index')::integer = v_index
    LIMIT 1;

    IF v_adjusted IS NOT NULL THEN
      v_occurrence := v_adjusted::timestamptz;
    ELSE
      v_occurrence := CASE p_frequency
        WHEN 'weekly' THEN p_first_scheduled_at + ((v_index - 1) * interval '7 days')
        WHEN 'biweekly' THEN p_first_scheduled_at + ((v_index - 1) * interval '14 days')
        WHEN 'monthly_day' THEN p_first_scheduled_at + make_interval(months => v_index - 1)
        WHEN 'monthly_week' THEN p_first_scheduled_at + make_interval(months => v_index - 1)
      END;
    END IF;

    IF p_ends_at IS NOT NULL AND v_occurrence > p_ends_at THEN
      EXIT;
    END IF;

    IF v_occurrence > p_first_scheduled_at + interval '3 months' THEN
      EXIT;
    END IF;

    IF public.phase12_appointment_conflicts(v_professional_id, v_occurrence, v_service.duration_minutes, NULL) THEN
      v_conflicts := v_conflicts || jsonb_build_array(jsonb_build_object('index', v_index, 'scheduled_at', v_occurrence));
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

  FOR v_index IN 1..p_occurrence_count LOOP
    SELECT elem->>'scheduled_at'
    INTO v_adjusted
    FROM jsonb_array_elements(COALESCE(p_adjusted_occurrences, '[]'::jsonb)) elem
    WHERE (elem->>'index')::integer = v_index
    LIMIT 1;

    IF v_adjusted IS NOT NULL THEN
      v_occurrence := v_adjusted::timestamptz;
    ELSE
      v_occurrence := CASE p_frequency
        WHEN 'weekly' THEN p_first_scheduled_at + ((v_index - 1) * interval '7 days')
        WHEN 'biweekly' THEN p_first_scheduled_at + ((v_index - 1) * interval '14 days')
        WHEN 'monthly_day' THEN p_first_scheduled_at + make_interval(months => v_index - 1)
        WHEN 'monthly_week' THEN p_first_scheduled_at + make_interval(months => v_index - 1)
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
      v_index,
      jsonb_build_object('series_id', v_series.id, 'series_occurrence_index', v_index)
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

  PERFORM 1
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
    WHERE id = p_series_id;
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

