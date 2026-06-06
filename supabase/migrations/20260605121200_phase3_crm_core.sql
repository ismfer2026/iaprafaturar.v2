-- ============================================================
-- Phase 3: CRM Core
--
-- Scope:
-- - clients, services, appointments, sessions
-- - manual CRM audit events
-- - dashboard RPC
-- - client_id links for message/conversation tables created before clients
--
-- Explicitly out of scope:
-- - automatic WhatsApp confirmation/reminders
-- - finance transactions
-- - packages, stock, anamnese, public booking, calendar sync
-- ============================================================

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typnamespace = 'public'::regnamespace AND typname = 'journey_stage_enum') THEN
    CREATE TYPE public.journey_stage_enum AS ENUM (
      'lead',
      'agendado',
      'em_tratamento',
      'pos_tratamento',
      'cliente_fiel',
      'inativo'
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typnamespace = 'public'::regnamespace AND typname = 'appointment_status_enum') THEN
    CREATE TYPE public.appointment_status_enum AS ENUM (
      'agendado',
      'confirmado',
      'cancelado',
      'reagendado',
      'realizado',
      'falta'
    );
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.fn_log_immutable()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'Log rows are immutable';
END;
$$;

CREATE TABLE public.audit_log (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  professional_id uuid NOT NULL REFERENCES public.professionals(id) ON DELETE RESTRICT,
  actor_type      text NOT NULL CHECK (actor_type IN ('professional','team_member','client','admin','ai','system','cron','integration')),
  event_type      text NOT NULL,
  entity_type     text NOT NULL,
  entity_id       uuid,
  payload         jsonb NOT NULL DEFAULT '{}',
  created_at      timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.audit_log IS
  'Immutable audit/event log for manual CRM business events. Agent executions use agent_executions; messages use message_events.';

CREATE INDEX idx_audit_log_professional ON public.audit_log(professional_id, created_at DESC);
CREATE INDEX idx_audit_log_event ON public.audit_log(professional_id, event_type, created_at DESC);
CREATE INDEX idx_audit_log_entity ON public.audit_log(entity_type, entity_id)
  WHERE entity_id IS NOT NULL;

CREATE TRIGGER prevent_audit_log_change
  BEFORE UPDATE OR DELETE ON public.audit_log
  FOR EACH ROW EXECUTE FUNCTION public.fn_log_immutable();

ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "audit_log_isolation"
ON public.audit_log FOR SELECT TO authenticated
USING (professional_id = public.auth_professional_id());

REVOKE ALL ON public.audit_log FROM anon, authenticated;
GRANT SELECT ON public.audit_log TO authenticated;

CREATE TABLE public.clients (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  professional_id    uuid NOT NULL REFERENCES public.professionals(id) ON DELETE RESTRICT,
  full_name          text NOT NULL CHECK (length(trim(full_name)) > 0),
  phone_whatsapp     text,
  email              text,
  cpf                text,
  birth_date         date,
  gender             text,
  city               text,
  neighborhood       text,
  full_address       text,
  journey_stage      public.journey_stage_enum NOT NULL DEFAULT 'lead',
  source             text NOT NULL DEFAULT 'manual'
                     CHECK (source IN ('manual','public_link','whatsapp','import','referral')),
  referral_client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  lgpd_consent_at    timestamptz,
  lgpd_consent_source text,
  pwa_installed      boolean NOT NULL DEFAULT false,
  loyalty_points     integer NOT NULL DEFAULT 0 CHECK (loyalty_points >= 0),
  is_active          boolean NOT NULL DEFAULT true,
  is_blocked         boolean NOT NULL DEFAULT false,
  internal_notes     text,
  metadata           jsonb NOT NULL DEFAULT '{}',
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  deleted_at         timestamptz
);

CREATE TRIGGER clients_updated_at
  BEFORE UPDATE ON public.clients
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX idx_clients_professional ON public.clients(professional_id);
CREATE INDEX idx_clients_professional_phone ON public.clients(professional_id, phone_whatsapp)
  WHERE deleted_at IS NULL AND phone_whatsapp IS NOT NULL;
CREATE INDEX idx_clients_journey ON public.clients(professional_id, journey_stage)
  WHERE deleted_at IS NULL;
CREATE INDEX idx_clients_active ON public.clients(professional_id)
  WHERE deleted_at IS NULL AND is_active = true;
CREATE INDEX idx_clients_birth_date ON public.clients(professional_id, birth_date)
  WHERE deleted_at IS NULL AND birth_date IS NOT NULL;

ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;

CREATE POLICY "clients_isolation"
ON public.clients FOR ALL TO authenticated
USING (professional_id = public.auth_professional_id())
WITH CHECK (professional_id = public.auth_professional_id());

REVOKE ALL ON public.clients FROM authenticated;
GRANT SELECT ON public.clients TO authenticated;

CREATE TABLE public.service_categories (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  professional_id uuid NOT NULL REFERENCES public.professionals(id) ON DELETE RESTRICT,
  name            text NOT NULL CHECK (length(trim(name)) > 0),
  description     text,
  color           text,
  sort_order      integer NOT NULL DEFAULT 0,
  is_active       boolean NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  deleted_at      timestamptz
);

CREATE TRIGGER service_categories_updated_at
  BEFORE UPDATE ON public.service_categories
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX idx_service_categories_professional ON public.service_categories(professional_id);
CREATE INDEX idx_service_categories_active ON public.service_categories(professional_id, sort_order)
  WHERE deleted_at IS NULL AND is_active = true;

ALTER TABLE public.service_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_categories_isolation"
ON public.service_categories FOR ALL TO authenticated
USING (professional_id = public.auth_professional_id())
WITH CHECK (professional_id = public.auth_professional_id());

REVOKE ALL ON public.service_categories FROM authenticated;
GRANT SELECT ON public.service_categories TO authenticated;

CREATE TABLE public.services (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  professional_id  uuid NOT NULL REFERENCES public.professionals(id) ON DELETE RESTRICT,
  category_id      uuid REFERENCES public.service_categories(id) ON DELETE RESTRICT,
  name             text NOT NULL CHECK (length(trim(name)) > 0),
  description      text,
  duration_minutes integer NOT NULL DEFAULT 60 CHECK (duration_minutes > 0),
  price            numeric(10,2) NOT NULL DEFAULT 0 CHECK (price >= 0),
  is_active        boolean NOT NULL DEFAULT true,
  is_public        boolean NOT NULL DEFAULT true,
  metadata         jsonb NOT NULL DEFAULT '{}',
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  deleted_at       timestamptz
);

CREATE TRIGGER services_updated_at
  BEFORE UPDATE ON public.services
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX idx_services_professional ON public.services(professional_id);
CREATE INDEX idx_services_category ON public.services(category_id)
  WHERE category_id IS NOT NULL;
CREATE INDEX idx_services_active ON public.services(professional_id, name)
  WHERE deleted_at IS NULL AND is_active = true;

ALTER TABLE public.services ENABLE ROW LEVEL SECURITY;

CREATE POLICY "services_isolation"
ON public.services FOR ALL TO authenticated
USING (professional_id = public.auth_professional_id())
WITH CHECK (professional_id = public.auth_professional_id());

REVOKE ALL ON public.services FROM authenticated;
GRANT SELECT ON public.services TO authenticated;

CREATE TABLE public.appointments (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  professional_id     uuid NOT NULL REFERENCES public.professionals(id) ON DELETE RESTRICT,
  client_id           uuid REFERENCES public.clients(id) ON DELETE RESTRICT,
  service_id          uuid REFERENCES public.services(id) ON DELETE RESTRICT,
  scheduled_at        timestamptz NOT NULL,
  duration_minutes    integer NOT NULL DEFAULT 60 CHECK (duration_minutes > 0),
  status              public.appointment_status_enum NOT NULL DEFAULT 'agendado',
  source              text NOT NULL DEFAULT 'crm'
                      CHECK (source IN ('crm','public_link','whatsapp','import')),
  notes               text,
  cancellation_reason text,
  outcome_notes       text,
  cancelled_at        timestamptz,
  completed_at        timestamptz,
  no_show_at          timestamptz,
  created_by          uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  metadata            jsonb NOT NULL DEFAULT '{}',
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  deleted_at          timestamptz
);

CREATE TRIGGER appointments_updated_at
  BEFORE UPDATE ON public.appointments
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX idx_appointments_professional ON public.appointments(professional_id);
CREATE INDEX idx_appointments_scheduled ON public.appointments(professional_id, scheduled_at);
CREATE INDEX idx_appointments_status ON public.appointments(professional_id, status);
CREATE INDEX idx_appointments_client ON public.appointments(client_id)
  WHERE client_id IS NOT NULL;
CREATE INDEX idx_appointments_service ON public.appointments(service_id)
  WHERE service_id IS NOT NULL;
CREATE INDEX idx_appointments_active ON public.appointments(professional_id, scheduled_at)
  WHERE deleted_at IS NULL;

ALTER TABLE public.appointments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "appointments_isolation"
ON public.appointments FOR ALL TO authenticated
USING (professional_id = public.auth_professional_id())
WITH CHECK (professional_id = public.auth_professional_id());

REVOKE ALL ON public.appointments FROM authenticated;
GRANT SELECT ON public.appointments TO authenticated;

CREATE TABLE public.sessions (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  professional_id      uuid NOT NULL REFERENCES public.professionals(id) ON DELETE RESTRICT,
  client_id            uuid NOT NULL REFERENCES public.clients(id) ON DELETE RESTRICT,
  appointment_id       uuid REFERENCES public.appointments(id) ON DELETE RESTRICT,
  service_id           uuid REFERENCES public.services(id) ON DELETE RESTRICT,
  session_date         timestamptz NOT NULL DEFAULT now(),
  session_time         text,
  clinical_evolution   text,
  notes                text,
  session_value        numeric(10,2) NOT NULL DEFAULT 0 CHECK (session_value >= 0),
  procedures_performed text[] NOT NULL DEFAULT '{}',
  products_used        text[] NOT NULL DEFAULT '{}',
  ai_registered        boolean NOT NULL DEFAULT false,
  ai_raw_transcript    text,
  ai_confidence_score  numeric(4,3) CHECK (
                         ai_confidence_score IS NULL OR
                         (ai_confidence_score >= 0 AND ai_confidence_score <= 1)
                       ),
  created_by           uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  metadata             jsonb NOT NULL DEFAULT '{}',
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  deleted_at           timestamptz
);

COMMENT ON COLUMN public.sessions.session_value IS
  'Snapshot informativo do valor da sessao. Nao cria financial_transactions e nao substitui modulo financeiro futuro.';

CREATE TRIGGER sessions_updated_at
  BEFORE UPDATE ON public.sessions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX idx_sessions_professional ON public.sessions(professional_id);
CREATE INDEX idx_sessions_client_date ON public.sessions(professional_id, client_id, session_date DESC);
CREATE INDEX idx_sessions_appointment ON public.sessions(appointment_id)
  WHERE appointment_id IS NOT NULL;
CREATE INDEX idx_sessions_service ON public.sessions(service_id)
  WHERE service_id IS NOT NULL;
CREATE UNIQUE INDEX idx_sessions_one_per_appointment ON public.sessions(appointment_id)
  WHERE appointment_id IS NOT NULL AND deleted_at IS NULL;

ALTER TABLE public.sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sessions_isolation"
ON public.sessions FOR ALL TO authenticated
USING (professional_id = public.auth_professional_id())
WITH CHECK (professional_id = public.auth_professional_id());

REVOKE ALL ON public.sessions FROM authenticated;
GRANT SELECT ON public.sessions TO authenticated;

ALTER TABLE public.conversations
  ADD COLUMN IF NOT EXISTS client_id uuid;

ALTER TABLE public.conversation_contexts
  ADD COLUMN IF NOT EXISTS client_id uuid;

ALTER TABLE public.message_events
  ADD COLUMN IF NOT EXISTS client_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'fk_conversations_client'
      AND conrelid = 'public.conversations'::regclass
  ) THEN
    ALTER TABLE public.conversations
      ADD CONSTRAINT fk_conversations_client
      FOREIGN KEY (client_id) REFERENCES public.clients(id)
      ON DELETE RESTRICT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'fk_conversation_contexts_client'
      AND conrelid = 'public.conversation_contexts'::regclass
  ) THEN
    ALTER TABLE public.conversation_contexts
      ADD CONSTRAINT fk_conversation_contexts_client
      FOREIGN KEY (client_id) REFERENCES public.clients(id)
      ON DELETE RESTRICT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'fk_message_events_client'
      AND conrelid = 'public.message_events'::regclass
  ) THEN
    ALTER TABLE public.message_events
      ADD CONSTRAINT fk_message_events_client
      FOREIGN KEY (client_id) REFERENCES public.clients(id)
      ON DELETE RESTRICT;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_conversations_client ON public.conversations(professional_id, client_id)
  WHERE client_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_conv_contexts_client ON public.conversation_contexts(professional_id, client_id)
  WHERE client_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_message_events_client ON public.message_events(professional_id, client_id, created_at DESC)
  WHERE client_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.log_audit_event(
  p_professional_id uuid,
  p_actor_type text,
  p_event_type text,
  p_entity_type text,
  p_entity_id uuid,
  p_payload jsonb DEFAULT '{}'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_id uuid;
BEGIN
  INSERT INTO public.audit_log (
    professional_id,
    actor_type,
    event_type,
    entity_type,
    entity_id,
    payload
  )
  VALUES (
    p_professional_id,
    p_actor_type,
    p_event_type,
    p_entity_type,
    p_entity_id,
    COALESCE(p_payload, '{}')
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.log_audit_event(uuid, text, text, text, uuid, jsonb) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.create_client_manual(
  p_full_name text,
  p_phone_whatsapp text DEFAULT NULL,
  p_email text DEFAULT NULL,
  p_birth_date date DEFAULT NULL,
  p_journey_stage public.journey_stage_enum DEFAULT 'lead',
  p_source text DEFAULT 'manual'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_professional_id uuid;
  v_client public.clients%ROWTYPE;
  v_phone text;
BEGIN
  v_professional_id := public.auth_professional_id();

  IF v_professional_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  IF p_full_name IS NULL OR length(trim(p_full_name)) = 0 THEN
    RAISE EXCEPTION 'full_name is required';
  END IF;

  v_phone := NULLIF(regexp_replace(COALESCE(p_phone_whatsapp, ''), '\D', '', 'g'), '');

  INSERT INTO public.clients (
    professional_id,
    full_name,
    phone_whatsapp,
    email,
    birth_date,
    journey_stage,
    source
  )
  VALUES (
    v_professional_id,
    trim(p_full_name),
    v_phone,
    NULLIF(trim(COALESCE(p_email, '')), ''),
    p_birth_date,
    COALESCE(p_journey_stage, 'lead'),
    COALESCE(p_source, 'manual')
  )
  RETURNING * INTO v_client;

  PERFORM public.log_audit_event(
    v_professional_id,
    'professional',
    'client.created',
    'client',
    v_client.id,
    jsonb_build_object(
      'client_id', v_client.id,
      'source', v_client.source,
      'initial_stage', v_client.journey_stage
    )
  );

  RETURN jsonb_build_object(
    'client_id', v_client.id,
    'client', to_jsonb(v_client)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.move_client_stage(
  p_client_id uuid,
  p_to_stage public.journey_stage_enum,
  p_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_professional_id uuid;
  v_client public.clients%ROWTYPE;
  v_from_stage public.journey_stage_enum;
BEGIN
  v_professional_id := public.auth_professional_id();

  IF v_professional_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  SELECT *
  INTO v_client
  FROM public.clients
  WHERE id = p_client_id
    AND professional_id = v_professional_id
    AND deleted_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Client not found';
  END IF;

  v_from_stage := v_client.journey_stage;

  IF v_from_stage = p_to_stage THEN
    RETURN jsonb_build_object(
      'client_id', v_client.id,
      'from_stage', v_from_stage,
      'to_stage', p_to_stage,
      'changed', false
    );
  END IF;

  UPDATE public.clients
  SET journey_stage = p_to_stage
  WHERE id = v_client.id
  RETURNING * INTO v_client;

  PERFORM public.log_audit_event(
    v_professional_id,
    'professional',
    'client.journey_stage.changed',
    'client',
    v_client.id,
    jsonb_build_object(
      'client_id', v_client.id,
      'from_stage', v_from_stage,
      'to_stage', p_to_stage,
      'triggered_by', 'manual',
      'reason', p_reason
    )
  );

  RETURN jsonb_build_object(
    'client_id', v_client.id,
    'from_stage', v_from_stage,
    'to_stage', p_to_stage,
    'changed', true
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.create_service(
  p_name text,
  p_duration_minutes integer DEFAULT 60,
  p_price numeric DEFAULT 0,
  p_category_id uuid DEFAULT NULL,
  p_description text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_professional_id uuid;
  v_service public.services%ROWTYPE;
BEGIN
  v_professional_id := public.auth_professional_id();

  IF v_professional_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  IF p_name IS NULL OR length(trim(p_name)) = 0 THEN
    RAISE EXCEPTION 'Service name is required';
  END IF;

  IF p_category_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.service_categories
    WHERE id = p_category_id
      AND professional_id = v_professional_id
      AND deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Service category not found';
  END IF;

  INSERT INTO public.services (
    professional_id,
    category_id,
    name,
    description,
    duration_minutes,
    price
  )
  VALUES (
    v_professional_id,
    p_category_id,
    trim(p_name),
    p_description,
    COALESCE(p_duration_minutes, 60),
    COALESCE(p_price, 0)
  )
  RETURNING * INTO v_service;

  RETURN jsonb_build_object('service_id', v_service.id, 'service', to_jsonb(v_service));
END;
$$;

CREATE OR REPLACE FUNCTION public.update_service(
  p_service_id uuid,
  p_name text,
  p_duration_minutes integer,
  p_price numeric,
  p_category_id uuid DEFAULT NULL,
  p_description text DEFAULT NULL,
  p_is_public boolean DEFAULT true
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_professional_id uuid;
  v_service public.services%ROWTYPE;
BEGIN
  v_professional_id := public.auth_professional_id();

  IF v_professional_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  IF p_name IS NULL OR length(trim(p_name)) = 0 THEN
    RAISE EXCEPTION 'Service name is required';
  END IF;

  IF p_category_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.service_categories
    WHERE id = p_category_id
      AND professional_id = v_professional_id
      AND deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Service category not found';
  END IF;

  UPDATE public.services
  SET name = trim(p_name),
      duration_minutes = COALESCE(p_duration_minutes, duration_minutes),
      price = COALESCE(p_price, price),
      category_id = p_category_id,
      description = p_description,
      is_public = COALESCE(p_is_public, true)
  WHERE id = p_service_id
    AND professional_id = v_professional_id
    AND deleted_at IS NULL
  RETURNING * INTO v_service;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Service not found';
  END IF;

  RETURN jsonb_build_object('service_id', v_service.id, 'service', to_jsonb(v_service));
END;
$$;

CREATE OR REPLACE FUNCTION public.deactivate_service(p_service_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_professional_id uuid;
  v_service public.services%ROWTYPE;
BEGIN
  v_professional_id := public.auth_professional_id();

  IF v_professional_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  UPDATE public.services
  SET is_active = false,
      deleted_at = COALESCE(deleted_at, now())
  WHERE id = p_service_id
    AND professional_id = v_professional_id
    AND deleted_at IS NULL
  RETURNING * INTO v_service;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Service not found';
  END IF;

  RETURN jsonb_build_object('service_id', v_service.id, 'deactivated', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.create_appointment(
  p_client_id uuid,
  p_service_id uuid DEFAULT NULL,
  p_scheduled_at timestamptz DEFAULT NULL,
  p_duration_minutes integer DEFAULT NULL,
  p_notes text DEFAULT NULL
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
  v_appointment public.appointments%ROWTYPE;
  v_duration integer;
  v_from_stage public.journey_stage_enum;
BEGIN
  v_professional_id := public.auth_professional_id();

  IF v_professional_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  IF p_scheduled_at IS NULL THEN
    RAISE EXCEPTION 'scheduled_at is required';
  END IF;

  SELECT *
  INTO v_client
  FROM public.clients
  WHERE id = p_client_id
    AND professional_id = v_professional_id
    AND deleted_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Client not found';
  END IF;

  IF p_service_id IS NOT NULL THEN
    SELECT *
    INTO v_service
    FROM public.services
    WHERE id = p_service_id
      AND professional_id = v_professional_id
      AND deleted_at IS NULL
      AND is_active = true;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Service not found';
    END IF;
  END IF;

  v_duration := COALESCE(p_duration_minutes, v_service.duration_minutes, 60);

  INSERT INTO public.appointments (
    professional_id,
    client_id,
    service_id,
    scheduled_at,
    duration_minutes,
    status,
    source,
    notes,
    created_by
  )
  VALUES (
    v_professional_id,
    p_client_id,
    p_service_id,
    p_scheduled_at,
    v_duration,
    'agendado',
    'crm',
    p_notes,
    auth.uid()
  )
  RETURNING * INTO v_appointment;

  PERFORM public.log_audit_event(
    v_professional_id,
    'professional',
    'appointment.created',
    'appointment',
    v_appointment.id,
    jsonb_build_object(
      'appointment_id', v_appointment.id,
      'client_id', p_client_id,
      'service_id', p_service_id,
      'scheduled_at', p_scheduled_at,
      'duration_minutes', v_duration,
      'initial_status', 'agendado',
      'source', 'crm'
    )
  );

  IF v_client.journey_stage = 'lead' THEN
    v_from_stage := v_client.journey_stage;

    UPDATE public.clients
    SET journey_stage = 'agendado'
    WHERE id = v_client.id;

    PERFORM public.log_audit_event(
      v_professional_id,
      'professional',
      'client.journey_stage.changed',
      'client',
      v_client.id,
      jsonb_build_object(
        'client_id', v_client.id,
        'from_stage', v_from_stage,
        'to_stage', 'agendado',
        'triggered_by', 'manual',
        'trigger_ref', v_appointment.id
      )
    );
  END IF;

  RETURN jsonb_build_object(
    'appointment_id', v_appointment.id,
    'status', v_appointment.status,
    'appointment', to_jsonb(v_appointment)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.cancel_appointment(
  p_appointment_id uuid,
  p_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_professional_id uuid;
  v_appointment public.appointments%ROWTYPE;
  v_from_status public.appointment_status_enum;
BEGIN
  v_professional_id := public.auth_professional_id();

  IF v_professional_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  SELECT *
  INTO v_appointment
  FROM public.appointments
  WHERE id = p_appointment_id
    AND professional_id = v_professional_id
    AND deleted_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Appointment not found';
  END IF;

  IF v_appointment.status NOT IN ('agendado','confirmado') THEN
    RAISE EXCEPTION 'Cannot cancel appointment with status %', v_appointment.status;
  END IF;

  v_from_status := v_appointment.status;

  UPDATE public.appointments
  SET status = 'cancelado',
      cancellation_reason = p_reason,
      cancelled_at = now()
  WHERE id = v_appointment.id
  RETURNING * INTO v_appointment;

  PERFORM public.log_audit_event(
    v_professional_id,
    'professional',
    'appointment.cancelled',
    'appointment',
    v_appointment.id,
    jsonb_build_object(
      'appointment_id', v_appointment.id,
      'from_status', v_from_status,
      'to_status', 'cancelado',
      'reason', p_reason
    )
  );

  RETURN jsonb_build_object(
    'appointment_id', v_appointment.id,
    'status', v_appointment.status
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.register_appointment_outcome(
  p_appointment_id uuid,
  p_outcome text,
  p_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_professional_id uuid;
  v_appointment public.appointments%ROWTYPE;
  v_from_status public.appointment_status_enum;
  v_event_type text;
BEGIN
  v_professional_id := public.auth_professional_id();

  IF v_professional_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  IF p_outcome NOT IN ('realizado','falta') THEN
    RAISE EXCEPTION 'Invalid appointment outcome';
  END IF;

  SELECT *
  INTO v_appointment
  FROM public.appointments
  WHERE id = p_appointment_id
    AND professional_id = v_professional_id
    AND deleted_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Appointment not found';
  END IF;

  IF v_appointment.status NOT IN ('agendado','confirmado') THEN
    RAISE EXCEPTION 'Cannot register outcome for appointment with status %', v_appointment.status;
  END IF;

  v_from_status := v_appointment.status;
  v_event_type := CASE WHEN p_outcome = 'falta' THEN 'appointment.no_show' ELSE 'appointment.completed' END;

  UPDATE public.appointments
  SET status = p_outcome::public.appointment_status_enum,
      outcome_notes = p_notes,
      completed_at = CASE WHEN p_outcome = 'realizado' THEN now() ELSE completed_at END,
      no_show_at = CASE WHEN p_outcome = 'falta' THEN now() ELSE no_show_at END
  WHERE id = v_appointment.id
  RETURNING * INTO v_appointment;

  PERFORM public.log_audit_event(
    v_professional_id,
    'professional',
    v_event_type,
    'appointment',
    v_appointment.id,
    jsonb_build_object(
      'appointment_id', v_appointment.id,
      'from_status', v_from_status,
      'to_status', p_outcome,
      'notes', p_notes
    )
  );

  RETURN jsonb_build_object(
    'appointment_id', v_appointment.id,
    'status', v_appointment.status
  );
END;
$$;

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
  v_client public.clients%ROWTYPE;
  v_appointment public.appointments%ROWTYPE;
  v_session public.sessions%ROWTYPE;
  v_from_status public.appointment_status_enum;
  v_service_id uuid;
BEGIN
  v_professional_id := public.auth_professional_id();

  IF v_professional_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  SELECT *
  INTO v_client
  FROM public.clients
  WHERE id = p_client_id
    AND professional_id = v_professional_id
    AND deleted_at IS NULL;

  IF NOT FOUND THEN
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

CREATE OR REPLACE FUNCTION public.get_dashboard_rpc()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_professional_id uuid;
  v_today_start timestamptz;
  v_today_end timestamptz;
  v_today jsonb;
  v_attention jsonb;
  v_pulse jsonb;
BEGIN
  v_professional_id := public.auth_professional_id();

  IF v_professional_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  v_today_start := ((now() AT TIME ZONE 'America/Sao_Paulo')::date AT TIME ZONE 'America/Sao_Paulo');
  v_today_end := v_today_start + interval '1 day';

  SELECT COALESCE(jsonb_agg(to_jsonb(a) ORDER BY a.scheduled_at), '[]'::jsonb)
  INTO v_today
  FROM (
    SELECT
      ap.id,
      ap.client_id,
      c.full_name AS client_name,
      ap.service_id,
      s.name AS service_name,
      ap.scheduled_at,
      ap.duration_minutes,
      ap.status
    FROM public.appointments ap
    LEFT JOIN public.clients c ON c.id = ap.client_id
    LEFT JOIN public.services s ON s.id = ap.service_id
    WHERE ap.professional_id = v_professional_id
      AND ap.deleted_at IS NULL
      AND ap.scheduled_at >= v_today_start
      AND ap.scheduled_at < v_today_end
      AND ap.status IN ('agendado','confirmado')
    ORDER BY ap.scheduled_at
    LIMIT 20
  ) a;

  SELECT COALESCE(jsonb_agg(to_jsonb(a) ORDER BY a.scheduled_at), '[]'::jsonb)
  INTO v_attention
  FROM (
    SELECT
      ap.id,
      ap.client_id,
      c.full_name AS client_name,
      ap.scheduled_at,
      ap.status,
      'appointment_overdue' AS reason
    FROM public.appointments ap
    LEFT JOIN public.clients c ON c.id = ap.client_id
    WHERE ap.professional_id = v_professional_id
      AND ap.deleted_at IS NULL
      AND ap.scheduled_at < now()
      AND ap.status = 'agendado'
      AND NOT EXISTS (
        SELECT 1 FROM public.sessions se
        WHERE se.appointment_id = ap.id
          AND se.deleted_at IS NULL
      )
    ORDER BY ap.scheduled_at DESC
    LIMIT 20
  ) a;

  SELECT jsonb_build_object(
    'clientsInTreatmentCount', COUNT(*) FILTER (WHERE journey_stage = 'em_tratamento' AND deleted_at IS NULL),
    'activeClientsCount', COUNT(*) FILTER (WHERE is_active = true AND deleted_at IS NULL),
    'appointmentsTodayCount', (
      SELECT COUNT(*)
      FROM public.appointments ap
      WHERE ap.professional_id = v_professional_id
        AND ap.deleted_at IS NULL
        AND ap.scheduled_at >= v_today_start
        AND ap.scheduled_at < v_today_end
    )
  )
  INTO v_pulse
  FROM public.clients
  WHERE professional_id = v_professional_id;

  RETURN jsonb_build_object(
    'todayAppointments', v_today,
    'attentionItems', v_attention,
    'pulse', v_pulse
  );
END;
$$;

REVOKE ALL ON FUNCTION public.create_client_manual(text, text, text, date, public.journey_stage_enum, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.move_client_stage(uuid, public.journey_stage_enum, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.create_service(text, integer, numeric, uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.update_service(uuid, text, integer, numeric, uuid, text, boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.deactivate_service(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.create_appointment(uuid, uuid, timestamptz, integer, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.cancel_appointment(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.register_appointment_outcome(uuid, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.register_session(uuid, uuid, uuid, timestamptz, text, text, numeric, text[], text[]) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_dashboard_rpc() FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.create_client_manual(text, text, text, date, public.journey_stage_enum, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.move_client_stage(uuid, public.journey_stage_enum, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_service(text, integer, numeric, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_service(uuid, text, integer, numeric, uuid, text, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.deactivate_service(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_appointment(uuid, uuid, timestamptz, integer, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_appointment(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.register_appointment_outcome(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.register_session(uuid, uuid, uuid, timestamptz, text, text, numeric, text[], text[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_dashboard_rpc() TO authenticated;

-- Rollback note for development-only reset:
-- DROP FUNCTION IF EXISTS public.get_dashboard_rpc();
-- DROP FUNCTION IF EXISTS public.register_session(uuid, uuid, uuid, timestamptz, text, text, numeric, text[], text[]);
-- DROP FUNCTION IF EXISTS public.register_appointment_outcome(uuid, text, text);
-- DROP FUNCTION IF EXISTS public.cancel_appointment(uuid, text);
-- DROP FUNCTION IF EXISTS public.create_appointment(uuid, uuid, timestamptz, integer, text);
-- DROP FUNCTION IF EXISTS public.deactivate_service(uuid);
-- DROP FUNCTION IF EXISTS public.update_service(uuid, text, integer, numeric, uuid, text, boolean);
-- DROP FUNCTION IF EXISTS public.create_service(text, integer, numeric, uuid, text);
-- DROP FUNCTION IF EXISTS public.move_client_stage(uuid, public.journey_stage_enum, text);
-- DROP FUNCTION IF EXISTS public.create_client_manual(text, text, text, date, public.journey_stage_enum, text);
-- DROP FUNCTION IF EXISTS public.log_audit_event(uuid, text, text, text, uuid, jsonb);
-- ALTER TABLE public.message_events DROP CONSTRAINT IF EXISTS fk_message_events_client;
-- ALTER TABLE public.message_events DROP COLUMN IF EXISTS client_id;
-- ALTER TABLE public.conversation_contexts DROP CONSTRAINT IF EXISTS fk_conversation_contexts_client;
-- ALTER TABLE public.conversation_contexts DROP COLUMN IF EXISTS client_id;
-- ALTER TABLE public.conversations DROP CONSTRAINT IF EXISTS fk_conversations_client;
-- ALTER TABLE public.conversations DROP COLUMN IF EXISTS client_id;
-- DROP TABLE IF EXISTS public.sessions;
-- DROP TABLE IF EXISTS public.appointments;
-- DROP TABLE IF EXISTS public.services;
-- DROP TABLE IF EXISTS public.service_categories;
-- DROP TABLE IF EXISTS public.clients;
-- DROP TABLE IF EXISTS public.audit_log;
-- DROP TYPE IF EXISTS public.appointment_status_enum;
-- DROP TYPE IF EXISTS public.journey_stage_enum;
