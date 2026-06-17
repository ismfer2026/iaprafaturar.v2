-- Migration: conversations resolve/reopen (Conversas Rodada 2)
-- ROLLBACK:
--   DROP FUNCTION IF EXISTS reopen_conversation(uuid);
--   DROP FUNCTION IF EXISTS resolve_conversation(uuid);
--   DROP INDEX IF EXISTS idx_conversations_status;
--   ALTER TABLE conversations DROP COLUMN IF EXISTS resolved_by;
--   ALTER TABLE conversations DROP COLUMN IF EXISTS resolved_at;
--   ALTER TABLE conversations DROP COLUMN IF EXISTS status;

-- ── Colunas ───────────────────────────────────────────────────────────────────

ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS status      text NOT NULL DEFAULT 'open'
                                       CHECK (status IN ('open', 'resolved')),
  ADD COLUMN IF NOT EXISTS resolved_at  timestamptz,
  ADD COLUMN IF NOT EXISTS resolved_by  uuid REFERENCES auth.users(id) ON DELETE SET NULL;

-- Índice para filtro de status por clínica (query: professional_id + status)
CREATE INDEX IF NOT EXISTS idx_conversations_status
  ON conversations(professional_id, status);

-- ── RPC: resolve_conversation ─────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION resolve_conversation(p_conversation_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_professional_id uuid;
BEGIN
  -- IDOR check
  SELECT professional_id INTO v_professional_id
  FROM public.conversations
  WHERE id = p_conversation_id
    AND professional_id = public.auth_professional_id();

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Unauthorized or conversation not found';
  END IF;

  UPDATE public.conversations
  SET status      = 'resolved',
      resolved_at = now(),
      resolved_by = auth.uid(),
      updated_at  = now()
  WHERE id = p_conversation_id;

  PERFORM public.log_audit_event(
    p_professional_id := v_professional_id,
    p_entity_type     := 'conversation',
    p_entity_id       := p_conversation_id,
    p_action          := 'resolved',
    p_actor_type      := 'professional',
    p_new_values      := jsonb_build_object('status', 'resolved')
  );

  RETURN jsonb_build_object(
    'ok',              true,
    'conversation_id', p_conversation_id,
    'status',          'resolved'
  );
END;
$$;

REVOKE ALL ON FUNCTION resolve_conversation(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION resolve_conversation(uuid) TO authenticated;

-- ── RPC: reopen_conversation ──────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION reopen_conversation(p_conversation_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_professional_id uuid;
BEGIN
  -- IDOR check
  SELECT professional_id INTO v_professional_id
  FROM public.conversations
  WHERE id = p_conversation_id
    AND professional_id = public.auth_professional_id();

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Unauthorized or conversation not found';
  END IF;

  UPDATE public.conversations
  SET status      = 'open',
      resolved_at = NULL,
      resolved_by = NULL,
      updated_at  = now()
  WHERE id = p_conversation_id;

  PERFORM public.log_audit_event(
    p_professional_id := v_professional_id,
    p_entity_type     := 'conversation',
    p_entity_id       := p_conversation_id,
    p_action          := 'reopened',
    p_actor_type      := 'professional',
    p_new_values      := jsonb_build_object('status', 'open')
  );

  RETURN jsonb_build_object(
    'ok',              true,
    'conversation_id', p_conversation_id,
    'status',          'open'
  );
END;
$$;

REVOKE ALL ON FUNCTION reopen_conversation(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION reopen_conversation(uuid) TO authenticated;
