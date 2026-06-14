-- Phase 24 C24-05 - Distributed broadcast delivery, retry, dead-letter and safe resume.
-- ROLLBACK: drop phase24_claim/complete functions and added columns/indexes; restore prior recipient status check.

ALTER TABLE public.platform_broadcasts
  ADD COLUMN idempotency_key text,
  ADD COLUMN last_worker_at timestamptz;

CREATE UNIQUE INDEX uq_platform_broadcasts_idempotency_key
ON public.platform_broadcasts(idempotency_key)
WHERE idempotency_key IS NOT NULL;

ALTER TABLE public.platform_broadcast_recipients
  DROP CONSTRAINT platform_broadcast_recipients_status_check;

ALTER TABLE public.platform_broadcast_recipients
  ADD CONSTRAINT platform_broadcast_recipients_status_check
  CHECK (status IN ('queued','processing','retrying','sent','failed','dead_letter','skipped','delivered','read','responded')),
  ADD COLUMN max_attempts integer NOT NULL DEFAULT 4 CHECK (max_attempts BETWEEN 1 AND 10),
  ADD COLUMN next_attempt_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN locked_at timestamptz,
  ADD COLUMN lock_token uuid;

CREATE INDEX idx_platform_broadcast_recipients_claim
ON public.platform_broadcast_recipients(status, next_attempt_at, created_at)
WHERE status IN ('queued','retrying','processing');

CREATE OR REPLACE FUNCTION public.phase24_claim_broadcast_batch(
  p_broadcast_id uuid DEFAULT NULL,
  p_limit integer DEFAULT 10,
  p_lock_token uuid DEFAULT gen_random_uuid()
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_limit integer := LEAST(GREATEST(COALESCE(p_limit, 10), 1), 25);
  v_items jsonb;
BEGIN
  WITH candidates AS (
    SELECT r.id
    FROM public.platform_broadcast_recipients r
    WHERE (p_broadcast_id IS NULL OR r.broadcast_id = p_broadcast_id)
      AND (
        (r.status IN ('queued','retrying') AND r.next_attempt_at <= now())
        OR (r.status = 'processing' AND r.locked_at < now() - interval '5 minutes')
      )
    ORDER BY r.next_attempt_at, r.created_at
    FOR UPDATE SKIP LOCKED
    LIMIT v_limit
  ),
  claimed AS (
    UPDATE public.platform_broadcast_recipients r
    SET status = 'processing',
        attempt_count = r.attempt_count + 1,
        locked_at = now(),
        lock_token = p_lock_token,
        updated_at = now()
    FROM candidates c
    WHERE r.id = c.id
    RETURNING r.id, r.broadcast_id, r.professional_id, r.channel, r.attempt_count, r.max_attempts
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'recipient_id', c.id,
    'broadcast_id', c.broadcast_id,
    'professional_id', c.professional_id,
    'channel', c.channel,
    'attempt_count', c.attempt_count,
    'max_attempts', c.max_attempts,
    'message', b.message,
    'phone_whatsapp', p.phone_whatsapp
  ) ORDER BY c.id), '[]'::jsonb)
  INTO v_items
  FROM claimed c
  JOIN public.platform_broadcasts b ON b.id = c.broadcast_id
  JOIN public.professionals p ON p.id = c.professional_id;

  UPDATE public.platform_broadcasts b
  SET status = 'processing',
      started_at = COALESCE(started_at, now()),
      last_worker_at = now(),
      updated_at = now()
  WHERE b.id IN (SELECT DISTINCT (item->>'broadcast_id')::uuid FROM jsonb_array_elements(v_items) item);

  RETURN jsonb_build_object('lock_token', p_lock_token, 'items', v_items);
END;
$$;

CREATE OR REPLACE FUNCTION public.phase24_complete_broadcast_recipient(
  p_recipient_id uuid,
  p_lock_token uuid,
  p_success boolean,
  p_error text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_row public.platform_broadcast_recipients%ROWTYPE;
  v_next_status text;
  v_broadcast_status text;
  v_pending integer;
  v_sent integer;
  v_dead integer;
  v_failed integer;
BEGIN
  SELECT * INTO v_row
  FROM public.platform_broadcast_recipients
  WHERE id = p_recipient_id AND lock_token = p_lock_token AND status = 'processing'
  FOR UPDATE;

  IF v_row.id IS NULL THEN RAISE EXCEPTION 'recipient_claim_not_found'; END IF;

  IF p_success THEN
    v_next_status := 'sent';
  ELSIF v_row.attempt_count >= v_row.max_attempts THEN
    v_next_status := 'dead_letter';
  ELSE
    v_next_status := 'retrying';
  END IF;

  UPDATE public.platform_broadcast_recipients
  SET status = v_next_status,
      sent_at = CASE WHEN p_success THEN now() ELSE sent_at END,
      next_attempt_at = CASE
        WHEN v_next_status = 'retrying' THEN now() + make_interval(secs => LEAST(300, (power(2, v_row.attempt_count)::integer * 5)))
        ELSE next_attempt_at
      END,
      last_error = CASE WHEN p_success THEN NULL ELSE left(COALESCE(p_error, 'send_failed'), 500) END,
      locked_at = NULL,
      lock_token = NULL,
      updated_at = now()
  WHERE id = p_recipient_id;

  SELECT
    COUNT(*) FILTER (WHERE status IN ('queued','processing','retrying')),
    COUNT(*) FILTER (WHERE status IN ('sent','delivered','read','responded')),
    COUNT(*) FILTER (WHERE status = 'dead_letter'),
    COUNT(*) FILTER (WHERE status = 'failed')
  INTO v_pending, v_sent, v_dead, v_failed
  FROM public.platform_broadcast_recipients
  WHERE broadcast_id = v_row.broadcast_id;

  v_broadcast_status := CASE
    WHEN v_pending > 0 THEN 'processing'
    WHEN v_dead + v_failed > 0 AND v_sent > 0 THEN 'partial'
    WHEN v_dead + v_failed > 0 THEN 'failed'
    ELSE 'completed'
  END;

  UPDATE public.platform_broadcasts
  SET status = v_broadcast_status,
      sent_count = v_sent,
      failed_count = v_dead + v_failed,
      completed_at = CASE WHEN v_pending = 0 THEN now() ELSE NULL END,
      last_worker_at = now(),
      updated_at = now()
  WHERE id = v_row.broadcast_id;

  RETURN jsonb_build_object(
    'recipient_id', p_recipient_id,
    'recipient_status', v_next_status,
    'broadcast_id', v_row.broadcast_id,
    'broadcast_status', v_broadcast_status,
    'remaining', v_pending
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.phase24_get_broadcast_worker_state(p_broadcast_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE v_result jsonb;
BEGIN
  SELECT jsonb_build_object(
    'broadcast_id', b.id,
    'status', b.status,
    'remaining', COUNT(r.id) FILTER (WHERE r.status IN ('queued','processing','retrying')),
    'ready', COUNT(r.id) FILTER (WHERE r.status IN ('queued','retrying') AND r.next_attempt_at <= now()),
    'next_attempt_at', MIN(r.next_attempt_at) FILTER (WHERE r.status = 'retrying'),
    'dead_letter', COUNT(r.id) FILTER (WHERE r.status = 'dead_letter')
  )
  INTO v_result
  FROM public.platform_broadcasts b
  LEFT JOIN public.platform_broadcast_recipients r ON r.broadcast_id = b.id
  WHERE b.id = p_broadcast_id
  GROUP BY b.id;
  RETURN COALESCE(v_result, jsonb_build_object('broadcast_id', p_broadcast_id, 'status', 'not_found', 'remaining', 0, 'ready', 0));
END;
$$;

REVOKE ALL ON FUNCTION public.phase24_claim_broadcast_batch(uuid,integer,uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.phase24_complete_broadcast_recipient(uuid,uuid,boolean,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.phase24_get_broadcast_worker_state(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.phase24_claim_broadcast_batch(uuid,integer,uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.phase24_complete_broadcast_recipient(uuid,uuid,boolean,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.phase24_get_broadcast_worker_state(uuid) TO service_role;
