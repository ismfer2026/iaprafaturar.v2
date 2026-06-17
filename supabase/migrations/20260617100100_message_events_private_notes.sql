-- Migration: notas internas em message_events (Conversas Rodada 3)
-- ROLLBACK:
--   DROP FUNCTION IF EXISTS add_conversation_note(uuid, text);
--   ALTER TABLE message_events DROP COLUMN IF EXISTS is_private;

-- ── Coluna ────────────────────────────────────────────────────────────────────

ALTER TABLE message_events
  ADD COLUMN IF NOT EXISTS is_private boolean NOT NULL DEFAULT false;

-- ── RPC: add_conversation_note ────────────────────────────────────────────────
-- SECURITY DEFINER obrigatório: message_events tem REVOKE INSERT FROM authenticated

CREATE OR REPLACE FUNCTION add_conversation_note(
  p_conversation_id uuid,
  p_text            text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_professional_id uuid;
  v_message_event_id uuid;
BEGIN
  IF p_text IS NULL OR trim(p_text) = '' THEN
    RAISE EXCEPTION 'Note text cannot be empty';
  END IF;

  -- IDOR check: conversa deve pertencer ao profissional autenticado
  SELECT professional_id INTO v_professional_id
  FROM public.conversations
  WHERE id = p_conversation_id
    AND professional_id = public.auth_professional_id();

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Unauthorized or conversation not found';
  END IF;

  INSERT INTO public.message_events (
    professional_id,
    conversation_id,
    direction,
    channel,
    message_type,
    sent_by,
    status,
    is_private,
    content
  ) VALUES (
    v_professional_id,
    p_conversation_id,
    'outbound',
    'whatsapp',
    'text',
    'human',
    'skipped',
    true,
    trim(p_text)
  )
  RETURNING id INTO v_message_event_id;

  RETURN jsonb_build_object(
    'ok',               true,
    'message_event_id', v_message_event_id
  );
END;
$$;

REVOKE ALL ON FUNCTION add_conversation_note(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION add_conversation_note(uuid, text) TO authenticated;
