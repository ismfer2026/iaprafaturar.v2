-- ============================================================
-- Phase 1: WhatsApp observability and dual-channel foundation
--
-- Scope:
-- - idempotent webhook claim
-- - conversation/message event logs
-- - agent execution logs
-- - QStash telemetry
-- - professional agent defaults
-- - shadow suggestions table prepared for future shadow mode writes
--
-- Important:
-- - clients/campaigns do not exist yet in the clean v2 schema.
--   Therefore this phase does not create client_id/campaign_id columns.
--   The CRM/Core phases must add those columns together with real FKs.
-- - Do not create legacy tables: whatsapp_inbound_events,
--   whatsapp_outbound_events, whatsapp_message_logs, agent_logs,
--   confirmation_messages, processed_webhooks.
-- ============================================================

CREATE TABLE public.idempotency_log (
  idempotency_key text PRIMARY KEY,
  agent           text,
  status          text NOT NULL DEFAULT 'processing'
                  CHECK (status IN ('processing','done','failed')),
  payload         jsonb NOT NULL DEFAULT '{}',
  error           text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  expires_at      timestamptz NOT NULL DEFAULT (now() + interval '7 days')
);

COMMENT ON TABLE public.idempotency_log IS
  'Atomic idempotency claim. Webhook pattern: INSERT ... ON CONFLICT DO NOTHING RETURNING idempotency_key.';
COMMENT ON COLUMN public.idempotency_log.idempotency_key IS
  'Format examples: professional:{instance_name}:{external_message_id}, admin:{instance_name}:{external_message_id}, qstash:{job_id}, stripe:{event_id}.';

CREATE OR REPLACE FUNCTION public.prevent_idempotency_update()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'idempotency_log rows are immutable for UPDATE';
END;
$$;

CREATE OR REPLACE FUNCTION public.prevent_idempotency_delete_before_expiry()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.expires_at > now() THEN
    RAISE EXCEPTION 'idempotency_log row is still valid and cannot be deleted before expires_at';
  END IF;

  RETURN OLD;
END;
$$;

CREATE TRIGGER idempotency_log_no_update
  BEFORE UPDATE ON public.idempotency_log
  FOR EACH ROW EXECUTE FUNCTION public.prevent_idempotency_update();

CREATE TRIGGER idempotency_log_ttl_delete_only
  BEFORE DELETE ON public.idempotency_log
  FOR EACH ROW EXECUTE FUNCTION public.prevent_idempotency_delete_before_expiry();

REVOKE ALL ON public.idempotency_log FROM anon, authenticated;

CREATE TABLE public.conversations (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  professional_id      uuid NOT NULL REFERENCES public.professionals(id) ON DELETE RESTRICT,
  channel              text NOT NULL DEFAULT 'whatsapp'
                       CHECK (channel IN ('whatsapp','email','web_chat','instagram','messenger')),
  phone                text,
  email_address        text,
  session_id_anon      text,
  rosane_status        text NOT NULL DEFAULT 'active'
                       CHECK (rosane_status IN ('active','shadow','paused','human_takeover')),
  human_takeover_at    timestamptz,
  human_takeover_by    uuid REFERENCES public.team_members(id) ON DELETE SET NULL,
  last_message_at      timestamptz,
  last_message_preview text,
  unread_count         integer NOT NULL DEFAULT 0 CHECK (unread_count >= 0),
  metadata             jsonb NOT NULL DEFAULT '{}',
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);


CREATE TRIGGER conversations_updated_at
  BEFORE UPDATE ON public.conversations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX idx_conversations_professional ON public.conversations(professional_id);
CREATE INDEX idx_conversations_last_message ON public.conversations(professional_id, last_message_at DESC);
CREATE INDEX idx_conversations_phone ON public.conversations(professional_id, phone) WHERE phone IS NOT NULL;

ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "conversations_isolation"
ON public.conversations FOR ALL TO authenticated
USING (professional_id = public.auth_professional_id())
WITH CHECK (professional_id = public.auth_professional_id());

REVOKE ALL ON public.conversations FROM authenticated;
GRANT SELECT, INSERT, UPDATE ON public.conversations TO authenticated;

CREATE TABLE public.conversation_contexts (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  professional_id     uuid NOT NULL REFERENCES public.professionals(id) ON DELETE RESTRICT,
  conversation_id     uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  context_type        text NOT NULL CHECK (
                        context_type IN (
                          'appointment_confirmation','confirmation','reminder','post_care','referral',
                          'relationship','lead_followup','sales','reactivation','private','upsell',
                          'onboarding','support','conversation'
                        )
                      ),
  status              text NOT NULL DEFAULT 'active'
                      CHECK (status IN ('active','paused','closed','expired')),
  source_function     text,
  ref_type            text,
  ref_id              text,
  privacy_classification text CHECK (
                        privacy_classification IS NULL OR privacy_classification IN ('business','private','unknown')
                      ),
  metadata            jsonb NOT NULL DEFAULT '{}',
  expires_at          timestamptz,
  closed_at           timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);


CREATE TRIGGER conversation_contexts_updated_at
  BEFORE UPDATE ON public.conversation_contexts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX idx_conv_contexts_conversation ON public.conversation_contexts(conversation_id);
CREATE INDEX idx_conv_contexts_professional ON public.conversation_contexts(professional_id);
CREATE INDEX idx_conv_contexts_active ON public.conversation_contexts(professional_id, context_type, status)
  WHERE status = 'active';

ALTER TABLE public.conversation_contexts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "conversation_contexts_isolation"
ON public.conversation_contexts FOR ALL TO authenticated
USING (professional_id = public.auth_professional_id())
WITH CHECK (professional_id = public.auth_professional_id());

REVOKE ALL ON public.conversation_contexts FROM authenticated;
GRANT SELECT, INSERT, UPDATE ON public.conversation_contexts TO authenticated;

CREATE TABLE public.message_events (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  professional_id     uuid REFERENCES public.professionals(id) ON DELETE RESTRICT,
  conversation_id     uuid REFERENCES public.conversations(id) ON DELETE SET NULL,
  direction           text NOT NULL CHECK (direction IN ('inbound','outbound')),
  channel             text NOT NULL DEFAULT 'whatsapp'
                      CHECK (channel IN ('whatsapp','instagram','messenger','email','push')),
  message_type        text NOT NULL DEFAULT 'text'
                      CHECK (message_type IN ('text','audio','image','document','template','button','unknown')),
  source_webhook      text CHECK (source_webhook IN ('admin','professional')),
  instance_name       text,
  content             text,
  media_url           text,
  media_size_bytes    integer CHECK (media_size_bytes IS NULL OR media_size_bytes >= 0),
  sent_by             text CHECK (sent_by IN ('ai','human','cron','campaign')),
  agent_slug          text,
  context_type        text CHECK (
                        context_type IS NULL OR context_type IN (
                          'conversation','confirmation','reminder','campaign','follow_up',
                          'post_care','reactivation','onboarding','support'
                        )
                      ),
  external_message_id text,
  status              text NOT NULL DEFAULT 'queued'
                      CHECK (status IN (
                        'queued','processing','processed','sent','delivered','read',
                        'failed','dead_lettered','dry_run','skipped'
                      )),
  error_code          text,
  metadata            jsonb NOT NULL DEFAULT '{}',
  provider_payload    jsonb NOT NULL DEFAULT '{}',
  created_at          timestamptz NOT NULL DEFAULT now(),
  sent_at             timestamptz,
  delivered_at        timestamptz,
  read_at             timestamptz,
  CONSTRAINT message_events_ai_agent_slug_required CHECK (sent_by IS DISTINCT FROM 'ai' OR agent_slug IS NOT NULL)
);

COMMENT ON TABLE public.message_events IS
  'Single source of truth for inbound/outbound message traffic. Only routing, idempotency, search, audit, and basic display columns belong here.';
COMMENT ON COLUMN public.message_events.metadata IS
  'Variable context/debug fields. Do not store routing, frequent filters, or idempotency data here.';

CREATE INDEX idx_message_events_professional ON public.message_events(professional_id, created_at DESC);
CREATE INDEX idx_message_events_conversation ON public.message_events(conversation_id, created_at DESC);
CREATE INDEX idx_message_events_external_id ON public.message_events(external_message_id)
  WHERE external_message_id IS NOT NULL;
CREATE INDEX idx_message_events_idempotency ON public.message_events(source_webhook, instance_name, external_message_id)
  WHERE external_message_id IS NOT NULL;
CREATE INDEX idx_message_events_source_created ON public.message_events(source_webhook, created_at DESC);

ALTER TABLE public.message_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "message_events_professional_select"
ON public.message_events FOR SELECT TO authenticated
USING (professional_id = public.auth_professional_id());

REVOKE ALL ON public.message_events FROM authenticated;
GRANT SELECT ON public.message_events TO authenticated;

CREATE TABLE public.agent_executions (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  professional_id  uuid REFERENCES public.professionals(id) ON DELETE RESTRICT,
  agent_slug       text NOT NULL,
  trigger_type     text CHECK (trigger_type IS NULL OR trigger_type IN ('webhook','cron','manual','rpc','qstash')),
  trigger_ref      text,
  trigger_payload  jsonb NOT NULL DEFAULT '{}',
  status           text NOT NULL DEFAULT 'running'
                   CHECK (status IN ('running','success','failed','skipped')),
  tokens_input     integer NOT NULL DEFAULT 0 CHECK (tokens_input >= 0),
  tokens_output    integer NOT NULL DEFAULT 0 CHECK (tokens_output >= 0),
  cost_usd         numeric(10,6) NOT NULL DEFAULT 0 CHECK (cost_usd >= 0),
  duration_ms      integer CHECK (duration_ms IS NULL OR duration_ms >= 0),
  conversation_id  uuid REFERENCES public.conversations(id) ON DELETE SET NULL,
  message_event_id uuid REFERENCES public.message_events(id) ON DELETE SET NULL,
  error_message    text,
  started_at       timestamptz NOT NULL DEFAULT now(),
  completed_at     timestamptz
);

COMMENT ON TABLE public.agent_executions IS
  'Agent/processor execution log. Replaces legacy agent_logs. Separate from message_events because agents may execute without sending messages.';

CREATE INDEX idx_agent_executions_professional ON public.agent_executions(professional_id, started_at DESC);
CREATE INDEX idx_agent_executions_agent ON public.agent_executions(agent_slug, status, started_at);
CREATE INDEX idx_agent_executions_message_event ON public.agent_executions(message_event_id)
  WHERE message_event_id IS NOT NULL;

ALTER TABLE public.agent_executions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "agent_executions_professional_select"
ON public.agent_executions FOR SELECT TO authenticated
USING (professional_id = public.auth_professional_id());

REVOKE ALL ON public.agent_executions FROM authenticated;
GRANT SELECT ON public.agent_executions TO authenticated;

CREATE TABLE public.qstash_job_log (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id             text NOT NULL,
  queue_name         text NOT NULL,
  event_type         text NOT NULL CHECK (event_type IN ('published','consumed','failed','dead_lettered')),
  message_event_id   uuid REFERENCES public.message_events(id) ON DELETE SET NULL,
  professional_id    uuid REFERENCES public.professionals(id) ON DELETE RESTRICT,
  retry_count        integer NOT NULL DEFAULT 0 CHECK (retry_count >= 0),
  max_retries        integer NOT NULL DEFAULT 3 CHECK (max_retries >= 0),
  error_type         text,
  error_message      text,
  published_at       timestamptz,
  consumed_at        timestamptz,
  failed_at          timestamptz,
  dead_lettered_at   timestamptz,
  created_at         timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.qstash_job_log IS
  'Single source of truth for QStash telemetry events: published, consumed, failed, dead_lettered.';

CREATE INDEX idx_qstash_job_log_job_id ON public.qstash_job_log(job_id);
CREATE INDEX idx_qstash_job_log_message_event ON public.qstash_job_log(message_event_id)
  WHERE message_event_id IS NOT NULL;
CREATE INDEX idx_qstash_job_log_failed ON public.qstash_job_log(event_type, created_at DESC)
  WHERE event_type IN ('failed','dead_lettered');

REVOKE ALL ON public.qstash_job_log FROM anon, authenticated;

CREATE TABLE public.professional_agents (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  professional_id        uuid NOT NULL REFERENCES public.professionals(id) ON DELETE RESTRICT,
  agent_slug             text NOT NULL DEFAULT 'rosane',
  agent_name             text NOT NULL DEFAULT 'Rosane',
  shadow_mode            boolean NOT NULL DEFAULT true,
  auto_respond           boolean NOT NULL DEFAULT true,
  working_hours          jsonb NOT NULL DEFAULT '{}',
  respond_outside_hours  boolean NOT NULL DEFAULT false,
  enabled_agents         text[] NOT NULL DEFAULT ARRAY['duvidas','agendamento','lembrete'],
  agent_configs          jsonb NOT NULL DEFAULT '{}',
  persona_base           text,
  clinic_context         text,
  is_active              boolean NOT NULL DEFAULT true,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now(),
  UNIQUE (professional_id, agent_slug)
);

CREATE TRIGGER professional_agents_updated_at
  BEFORE UPDATE ON public.professional_agents
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX idx_professional_agents_professional ON public.professional_agents(professional_id);
CREATE INDEX idx_professional_agents_slug ON public.professional_agents(agent_slug, is_active);

ALTER TABLE public.professional_agents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "professional_agents_isolation"
ON public.professional_agents FOR ALL TO authenticated
USING (professional_id = public.auth_professional_id())
WITH CHECK (professional_id = public.auth_professional_id());

REVOKE ALL ON public.professional_agents FROM authenticated;
GRANT SELECT, UPDATE ON public.professional_agents TO authenticated;

CREATE TABLE public.shadow_suggestions (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  professional_id   uuid NOT NULL REFERENCES public.professionals(id) ON DELETE RESTRICT,
  conversation_id   uuid REFERENCES public.conversations(id) ON DELETE SET NULL,
  suggested_text    text NOT NULL,
  actual_text       text,
  status            text NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending','approved','edited','rejected','ignored')),
  approved_at       timestamptz,
  edited_at         timestamptz,
  rejected_at       timestamptz,
  rlhf_processed    boolean NOT NULL DEFAULT false,
  metadata          jsonb NOT NULL DEFAULT '{}',
  created_at        timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.shadow_suggestions IS
  'Prepared in Phase 1. Write path belongs to shadow mode/training subtask unless explicitly enabled.';

CREATE INDEX idx_shadow_suggestions_professional ON public.shadow_suggestions(professional_id, created_at DESC);
CREATE INDEX idx_shadow_suggestions_conversation ON public.shadow_suggestions(conversation_id)
  WHERE conversation_id IS NOT NULL;
CREATE INDEX idx_shadow_suggestions_pending ON public.shadow_suggestions(professional_id, status, created_at DESC)
  WHERE status = 'pending';

ALTER TABLE public.shadow_suggestions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "shadow_suggestions_isolation"
ON public.shadow_suggestions FOR ALL TO authenticated
USING (professional_id = public.auth_professional_id())
WITH CHECK (professional_id = public.auth_professional_id());

REVOKE ALL ON public.shadow_suggestions FROM authenticated;
GRANT SELECT, UPDATE ON public.shadow_suggestions TO authenticated;

-- Seed default Rosane agent for existing professionals. Future professional inserts
-- will get this row through the trigger below.
INSERT INTO public.professional_agents (professional_id, agent_slug, agent_name)
SELECT p.id, 'rosane', COALESCE(NULLIF(p.settings->>'assistant_name', ''), 'Rosane')
FROM public.professionals p
ON CONFLICT (professional_id, agent_slug) DO NOTHING;

CREATE OR REPLACE FUNCTION public.initialize_professional_agents()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.professional_agents (professional_id, agent_slug, agent_name)
  VALUES (NEW.id, 'rosane', COALESCE(NULLIF(NEW.settings->>'assistant_name', ''), 'Rosane'))
  ON CONFLICT (professional_id, agent_slug) DO NOTHING;

  RETURN NEW;
END;
$$;

CREATE TRIGGER professionals_initialize_agents
  AFTER INSERT ON public.professionals
  FOR EACH ROW EXECUTE FUNCTION public.initialize_professional_agents();

-- Rollback note for development-only reset:
-- DROP TRIGGER IF EXISTS professionals_initialize_agents ON public.professionals;
-- DROP FUNCTION IF EXISTS public.initialize_professional_agents();
-- DROP TABLE IF EXISTS public.shadow_suggestions;
-- DROP TABLE IF EXISTS public.professional_agents;
-- DROP TABLE IF EXISTS public.qstash_job_log;
-- DROP TABLE IF EXISTS public.agent_executions;
-- DROP TABLE IF EXISTS public.message_events;
-- DROP TABLE IF EXISTS public.conversation_contexts;
-- DROP TABLE IF EXISTS public.conversations;
-- DROP TABLE IF EXISTS public.idempotency_log;