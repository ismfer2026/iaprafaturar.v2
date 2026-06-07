-- ============================================================
-- Phase 5: Rosane Agents Base
--
-- Scope:
-- - operational columns for appointment confirmation/reminders
-- - NPS/follow-up columns on sessions
-- - shadow suggestion traceability
-- - WhatsApp confirmation/cancellation RPCs
-- - shadow suggestion approve/reject RPCs
-- - secure cron invocation wrapper foundation
--
-- Explicitly out of scope:
-- - public booking
-- - anamnese/public forms
-- - documents/contracts/budgets
-- - new parallel WhatsApp/event tables
-- ============================================================

CREATE SCHEMA IF NOT EXISTS vault;
CREATE EXTENSION IF NOT EXISTS supabase_vault WITH SCHEMA vault;

ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS confirmation_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS confirmation_responded_at timestamptz,
  ADD COLUMN IF NOT EXISTS reminder_d1_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS reminder_1h_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS reminder_day_sent_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_appointments_confirmation_due
  ON public.appointments(professional_id, scheduled_at)
  WHERE deleted_at IS NULL
    AND status = 'agendado'
    AND confirmation_sent_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_appointments_reminder_d1_due
  ON public.appointments(professional_id, scheduled_at)
  WHERE deleted_at IS NULL
    AND status IN ('agendado','confirmado')
    AND reminder_d1_sent_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_appointments_reminder_1h_due
  ON public.appointments(professional_id, scheduled_at)
  WHERE deleted_at IS NULL
    AND status IN ('agendado','confirmado')
    AND reminder_1h_sent_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_appointments_reminder_day_due
  ON public.appointments(professional_id, scheduled_at)
  WHERE deleted_at IS NULL
    AND status IN ('agendado','confirmado')
    AND reminder_day_sent_at IS NULL;

ALTER TABLE public.sessions
  ADD COLUMN IF NOT EXISTS nps_score integer
    CHECK (nps_score IS NULL OR (nps_score >= 1 AND nps_score <= 5)),
  ADD COLUMN IF NOT EXISTS nps_comment text,
  ADD COLUMN IF NOT EXISTS nps_requested_at timestamptz,
  ADD COLUMN IF NOT EXISTS nps_responded_at timestamptz,
  ADD COLUMN IF NOT EXISTS followup_sent_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_sessions_followup_due
  ON public.sessions(professional_id, session_date)
  WHERE deleted_at IS NULL
    AND followup_sent_at IS NULL
    AND nps_requested_at IS NULL;

ALTER TABLE public.shadow_suggestions
  ADD COLUMN IF NOT EXISTS message_event_id uuid REFERENCES public.message_events(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS expires_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_shadow_suggestions_message_event
  ON public.shadow_suggestions(message_event_id)
  WHERE message_event_id IS NOT NULL;

-- Config defaults stay in professional_agents.agent_configs because these are
-- behavioral agent settings, not relational search keys.
UPDATE public.professional_agents
SET agent_configs = jsonb_set(
  jsonb_set(
    COALESCE(agent_configs, '{}'::jsonb),
    '{post_care}',
    COALESCE(agent_configs->'post_care', '{}'::jsonb),
    true
  ),
  '{post_care,send_google_review_after_positive_nps}',
  COALESCE(agent_configs #> '{post_care,send_google_review_after_positive_nps}', 'false'::jsonb),
  true
)
WHERE agent_slug = 'rosane';

CREATE OR REPLACE FUNCTION public.get_vault_secret(p_secret_name text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_secret text;
BEGIN
  SELECT decrypted_secret
  INTO v_secret
  FROM vault.decrypted_secrets
  WHERE name = p_secret_name
  LIMIT 1;

  IF v_secret IS NULL OR length(v_secret) = 0 THEN
    RAISE EXCEPTION 'Vault secret % is not configured', p_secret_name;
  END IF;

  RETURN v_secret;
END;
$$;

REVOKE ALL ON FUNCTION public.get_vault_secret(text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.invoke_internal_edge_function(
  p_function_name text,
  p_payload jsonb DEFAULT '{}'::jsonb
)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_base_url text;
  v_internal_token text;
  v_request_id bigint;
BEGIN
  IF p_function_name IS NULL OR p_function_name !~ '^[a-z0-9-]+$' THEN
    RAISE EXCEPTION 'Invalid function name';
  END IF;

  v_base_url := rtrim(public.get_vault_secret('FUNCTIONS_BASE_URL'), '/');
  v_internal_token := public.get_vault_secret('INTERNAL_FUNCTION_TOKEN');

  SELECT net.http_post(
    url := v_base_url || '/' || p_function_name,
    headers := jsonb_build_object(
      'content-type', 'application/json',
      'x-internal-token', v_internal_token
    ),
    body := COALESCE(p_payload, '{}'::jsonb),
    timeout_milliseconds := 15000
  )
  INTO v_request_id;

  RETURN v_request_id;
END;
$$;

REVOKE ALL ON FUNCTION public.invoke_internal_edge_function(text, jsonb) FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION public.invoke_internal_edge_function(text, jsonb) IS
  'SECURITY DEFINER wrapper for pg_cron -> pg_net calls. cron.schedule must call this wrapper and never store secrets in cron.job.';

CREATE OR REPLACE FUNCTION public.confirm_appointment_from_whatsapp(
  p_message_event_id uuid,
  p_response_text text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_event public.message_events%ROWTYPE;
  v_context public.conversation_contexts%ROWTYPE;
  v_appointment public.appointments%ROWTYPE;
  v_from_status public.appointment_status_enum;
BEGIN
  SELECT *
  INTO v_event
  FROM public.message_events
  WHERE id = p_message_event_id
    AND direction = 'inbound'
    AND source_webhook = 'professional'
    AND professional_id IS NOT NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Inbound professional message event not found';
  END IF;

  IF v_event.conversation_id IS NULL THEN
    RAISE EXCEPTION 'Message event has no conversation';
  END IF;

  SELECT *
  INTO v_context
  FROM public.conversation_contexts
  WHERE professional_id = v_event.professional_id
    AND conversation_id = v_event.conversation_id
    AND context_type = 'appointment_confirmation'
    AND status = 'active'
    AND (expires_at IS NULL OR expires_at > now())
  ORDER BY created_at DESC
  LIMIT 1
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Active appointment confirmation context not found';
  END IF;

  SELECT *
  INTO v_appointment
  FROM public.appointments
  WHERE id = v_context.ref_id::uuid
    AND professional_id = v_event.professional_id
    AND deleted_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Appointment not found';
  END IF;

  IF v_appointment.status <> 'agendado' THEN
    RAISE EXCEPTION 'Cannot confirm appointment with status %', v_appointment.status;
  END IF;

  v_from_status := v_appointment.status;

  UPDATE public.appointments
  SET status = 'confirmado',
      confirmation_responded_at = now()
  WHERE id = v_appointment.id
  RETURNING * INTO v_appointment;

  UPDATE public.conversation_contexts
  SET status = 'closed',
      closed_at = now(),
      metadata = metadata || jsonb_build_object(
        'closed_reason', 'appointment_confirmed',
        'message_event_id', p_message_event_id
      )
  WHERE id = v_context.id;

  PERFORM public.log_audit_event(
    v_event.professional_id,
    'client',
    'appointment.confirmed',
    'appointment',
    v_appointment.id,
    jsonb_build_object(
      'appointment_id', v_appointment.id,
      'client_id', v_appointment.client_id,
      'from_status', v_from_status,
      'to_status', 'confirmado',
      'source', 'whatsapp',
      'processed_by', 'appointment-confirmation-agent',
      'message_event_id', p_message_event_id,
      'response_text_present', p_response_text IS NOT NULL
    )
  );

  RETURN jsonb_build_object(
    'appointment_id', v_appointment.id,
    'status', v_appointment.status,
    'confirmed', true
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.cancel_appointment_from_whatsapp(
  p_message_event_id uuid,
  p_response_text text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_event public.message_events%ROWTYPE;
  v_context public.conversation_contexts%ROWTYPE;
  v_appointment public.appointments%ROWTYPE;
  v_from_status public.appointment_status_enum;
  v_reason text;
BEGIN
  SELECT *
  INTO v_event
  FROM public.message_events
  WHERE id = p_message_event_id
    AND direction = 'inbound'
    AND source_webhook = 'professional'
    AND professional_id IS NOT NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Inbound professional message event not found';
  END IF;

  IF v_event.conversation_id IS NULL THEN
    RAISE EXCEPTION 'Message event has no conversation';
  END IF;

  SELECT *
  INTO v_context
  FROM public.conversation_contexts
  WHERE professional_id = v_event.professional_id
    AND conversation_id = v_event.conversation_id
    AND context_type = 'appointment_confirmation'
    AND status = 'active'
    AND (expires_at IS NULL OR expires_at > now())
  ORDER BY created_at DESC
  LIMIT 1
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Active appointment confirmation context not found';
  END IF;

  SELECT *
  INTO v_appointment
  FROM public.appointments
  WHERE id = v_context.ref_id::uuid
    AND professional_id = v_event.professional_id
    AND deleted_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Appointment not found';
  END IF;

  IF v_appointment.status NOT IN ('agendado','confirmado') THEN
    RAISE EXCEPTION 'Cannot cancel appointment with status %', v_appointment.status;
  END IF;

  v_from_status := v_appointment.status;
  v_reason := NULLIF(left(trim(COALESCE(p_response_text, v_event.content, '')), 500), '');

  UPDATE public.appointments
  SET status = 'cancelado',
      cancellation_reason = COALESCE(v_reason, 'Cancelado via WhatsApp'),
      cancelled_at = now(),
      confirmation_responded_at = now()
  WHERE id = v_appointment.id
  RETURNING * INTO v_appointment;

  UPDATE public.conversation_contexts
  SET status = 'closed',
      closed_at = now(),
      metadata = metadata || jsonb_build_object(
        'closed_reason', 'appointment_cancelled',
        'message_event_id', p_message_event_id
      )
  WHERE id = v_context.id;

  PERFORM public.log_audit_event(
    v_event.professional_id,
    'client',
    'appointment.cancelled',
    'appointment',
    v_appointment.id,
    jsonb_build_object(
      'appointment_id', v_appointment.id,
      'client_id', v_appointment.client_id,
      'from_status', v_from_status,
      'to_status', 'cancelado',
      'source', 'whatsapp',
      'processed_by', 'appointment-confirmation-agent',
      'message_event_id', p_message_event_id,
      'reason_present', v_reason IS NOT NULL
    )
  );

  RETURN jsonb_build_object(
    'appointment_id', v_appointment.id,
    'status', v_appointment.status,
    'cancelled', true
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.approve_shadow_suggestion(
  p_suggestion_id uuid,
  p_actual_text text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_professional_id uuid;
  v_suggestion public.shadow_suggestions%ROWTYPE;
  v_text text;
  v_status text;
BEGIN
  v_professional_id := public.auth_professional_id();

  IF v_professional_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  SELECT *
  INTO v_suggestion
  FROM public.shadow_suggestions
  WHERE id = p_suggestion_id
    AND professional_id = v_professional_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Shadow suggestion not found';
  END IF;

  IF v_suggestion.status <> 'pending' THEN
    RAISE EXCEPTION 'Shadow suggestion is not pending';
  END IF;

  v_text := COALESCE(NULLIF(trim(p_actual_text), ''), v_suggestion.suggested_text);
  v_status := CASE WHEN v_text IS DISTINCT FROM v_suggestion.suggested_text THEN 'edited' ELSE 'approved' END;

  UPDATE public.shadow_suggestions
  SET status = v_status,
      actual_text = v_text,
      approved_at = CASE WHEN v_status = 'approved' THEN now() ELSE approved_at END,
      edited_at = CASE WHEN v_status = 'edited' THEN now() ELSE edited_at END
  WHERE id = v_suggestion.id
  RETURNING * INTO v_suggestion;

  PERFORM public.log_audit_event(
    v_professional_id,
    'professional',
    CASE WHEN v_status = 'edited' THEN 'shadow_suggestion.edited' ELSE 'shadow_suggestion.approved' END,
    'shadow_suggestion',
    v_suggestion.id,
    jsonb_build_object(
      'conversation_id', v_suggestion.conversation_id,
      'message_event_id', v_suggestion.message_event_id,
      'status', v_suggestion.status
    )
  );

  RETURN jsonb_build_object(
    'suggestion_id', v_suggestion.id,
    'status', v_suggestion.status,
    'conversation_id', v_suggestion.conversation_id,
    'message_event_id', v_suggestion.message_event_id,
    'text_to_send', v_suggestion.actual_text
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.reject_shadow_suggestion(
  p_suggestion_id uuid,
  p_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_professional_id uuid;
  v_suggestion public.shadow_suggestions%ROWTYPE;
BEGIN
  v_professional_id := public.auth_professional_id();

  IF v_professional_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  SELECT *
  INTO v_suggestion
  FROM public.shadow_suggestions
  WHERE id = p_suggestion_id
    AND professional_id = v_professional_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Shadow suggestion not found';
  END IF;

  IF v_suggestion.status <> 'pending' THEN
    RAISE EXCEPTION 'Shadow suggestion is not pending';
  END IF;

  UPDATE public.shadow_suggestions
  SET status = 'rejected',
      rejected_at = now(),
      metadata = metadata || jsonb_build_object('reject_reason_present', NULLIF(trim(COALESCE(p_reason, '')), '') IS NOT NULL)
  WHERE id = v_suggestion.id
  RETURNING * INTO v_suggestion;

  PERFORM public.log_audit_event(
    v_professional_id,
    'professional',
    'shadow_suggestion.rejected',
    'shadow_suggestion',
    v_suggestion.id,
    jsonb_build_object(
      'conversation_id', v_suggestion.conversation_id,
      'message_event_id', v_suggestion.message_event_id,
      'reason_present', NULLIF(trim(COALESCE(p_reason, '')), '') IS NOT NULL
    )
  );

  RETURN jsonb_build_object(
    'suggestion_id', v_suggestion.id,
    'status', v_suggestion.status
  );
END;
$$;

REVOKE ALL ON FUNCTION public.confirm_appointment_from_whatsapp(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.cancel_appointment_from_whatsapp(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.approve_shadow_suggestion(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.reject_shadow_suggestion(uuid, text) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.confirm_appointment_from_whatsapp(uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.cancel_appointment_from_whatsapp(uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.approve_shadow_suggestion(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reject_shadow_suggestion(uuid, text) TO authenticated;

-- Rollback note:
-- DROP FUNCTION IF EXISTS public.reject_shadow_suggestion(uuid, text);
-- DROP FUNCTION IF EXISTS public.approve_shadow_suggestion(uuid, text);
-- DROP FUNCTION IF EXISTS public.cancel_appointment_from_whatsapp(uuid, text);
-- DROP FUNCTION IF EXISTS public.confirm_appointment_from_whatsapp(uuid, text);
-- DROP FUNCTION IF EXISTS public.invoke_internal_edge_function(text, jsonb);
-- DROP FUNCTION IF EXISTS public.get_vault_secret(text);
-- DROP INDEX IF EXISTS public.idx_shadow_suggestions_message_event;
-- ALTER TABLE public.shadow_suggestions DROP COLUMN IF EXISTS expires_at;
-- ALTER TABLE public.shadow_suggestions DROP COLUMN IF EXISTS message_event_id;
-- DROP INDEX IF EXISTS public.idx_sessions_followup_due;
-- ALTER TABLE public.sessions DROP COLUMN IF EXISTS followup_sent_at;
-- ALTER TABLE public.sessions DROP COLUMN IF EXISTS nps_responded_at;
-- ALTER TABLE public.sessions DROP COLUMN IF EXISTS nps_requested_at;
-- ALTER TABLE public.sessions DROP COLUMN IF EXISTS nps_comment;
-- ALTER TABLE public.sessions DROP COLUMN IF EXISTS nps_score;
-- DROP INDEX IF EXISTS public.idx_appointments_reminder_day_due;
-- DROP INDEX IF EXISTS public.idx_appointments_reminder_1h_due;
-- DROP INDEX IF EXISTS public.idx_appointments_reminder_d1_due;
-- DROP INDEX IF EXISTS public.idx_appointments_confirmation_due;
-- ALTER TABLE public.appointments DROP COLUMN IF EXISTS reminder_day_sent_at;
-- ALTER TABLE public.appointments DROP COLUMN IF EXISTS reminder_1h_sent_at;
-- ALTER TABLE public.appointments DROP COLUMN IF EXISTS reminder_d1_sent_at;
-- ALTER TABLE public.appointments DROP COLUMN IF EXISTS confirmation_responded_at;
-- ALTER TABLE public.appointments DROP COLUMN IF EXISTS confirmation_sent_at;
