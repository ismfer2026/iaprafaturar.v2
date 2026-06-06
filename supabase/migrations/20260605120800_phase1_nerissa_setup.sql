-- ============================================================
-- Phase 1: Nerissa setup state tables
--
-- Scope:
-- - track admin-channel setup sessions for professionals
-- - track setup checklist items
-- - append-only setup event audit
-- ============================================================

CREATE TABLE public.nerissa_setup_sessions (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  professional_id     uuid NOT NULL UNIQUE REFERENCES public.professionals(id) ON DELETE RESTRICT,
  status              text NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending','in_progress','paused','completed','abandoned')),
  current_step        text,
  completed_steps     text[] NOT NULL DEFAULT '{}',
  started_at          timestamptz,
  completed_at        timestamptz,
  abandoned_at        timestamptz,
  metadata            jsonb NOT NULL DEFAULT '{}',
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER nerissa_setup_sessions_updated_at
  BEFORE UPDATE ON public.nerissa_setup_sessions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX idx_nerissa_setup_sessions_professional ON public.nerissa_setup_sessions(professional_id);
CREATE INDEX idx_nerissa_setup_sessions_status ON public.nerissa_setup_sessions(status, created_at DESC);

ALTER TABLE public.nerissa_setup_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "nerissa_setup_sessions_self"
ON public.nerissa_setup_sessions FOR SELECT TO authenticated
USING (professional_id = public.auth_professional_id());

REVOKE ALL ON public.nerissa_setup_sessions FROM authenticated;
GRANT SELECT ON public.nerissa_setup_sessions TO authenticated;

CREATE TABLE public.nerissa_setup_items (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id     uuid NOT NULL REFERENCES public.nerissa_setup_sessions(id) ON DELETE CASCADE,
  professional_id uuid NOT NULL REFERENCES public.professionals(id) ON DELETE RESTRICT,
  category       text NOT NULL CHECK (category IN ('whatsapp','servicos','agenda','agentes','financeiro','plano','perfil','produtos')),
  item_key       text NOT NULL,
  status         text NOT NULL DEFAULT 'pending'
                 CHECK (status IN ('pending','in_progress','completed','skipped')),
  data           jsonb NOT NULL DEFAULT '{}',
  completed_at   timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (session_id, item_key)
);

CREATE TRIGGER nerissa_setup_items_updated_at
  BEFORE UPDATE ON public.nerissa_setup_items
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX idx_nerissa_setup_items_session ON public.nerissa_setup_items(session_id);
CREATE INDEX idx_nerissa_setup_items_professional ON public.nerissa_setup_items(professional_id);
CREATE INDEX idx_nerissa_setup_items_status ON public.nerissa_setup_items(professional_id, status);

ALTER TABLE public.nerissa_setup_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "nerissa_setup_items_self"
ON public.nerissa_setup_items FOR SELECT TO authenticated
USING (professional_id = public.auth_professional_id());

REVOKE ALL ON public.nerissa_setup_items FROM authenticated;
GRANT SELECT ON public.nerissa_setup_items TO authenticated;

CREATE TABLE public.nerissa_setup_events (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id      uuid NOT NULL REFERENCES public.nerissa_setup_sessions(id) ON DELETE CASCADE,
  professional_id uuid NOT NULL REFERENCES public.professionals(id) ON DELETE RESTRICT,
  event_type      text NOT NULL,
  agent_slug      text,
  data            jsonb NOT NULL DEFAULT '{}',
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_nerissa_setup_events_session ON public.nerissa_setup_events(session_id, created_at DESC);
CREATE INDEX idx_nerissa_setup_events_professional ON public.nerissa_setup_events(professional_id, created_at DESC);

ALTER TABLE public.nerissa_setup_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "nerissa_setup_events_self"
ON public.nerissa_setup_events FOR SELECT TO authenticated
USING (professional_id = public.auth_professional_id());

REVOKE ALL ON public.nerissa_setup_events FROM authenticated;
GRANT SELECT ON public.nerissa_setup_events TO authenticated;

-- Rollback note for development-only reset:
-- DROP TABLE IF EXISTS public.nerissa_setup_events;
-- DROP TABLE IF EXISTS public.nerissa_setup_items;
-- DROP TABLE IF EXISTS public.nerissa_setup_sessions;