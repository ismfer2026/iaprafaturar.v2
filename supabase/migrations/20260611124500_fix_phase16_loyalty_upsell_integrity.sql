-- Phase 16 follow-up: harden loyalty reward idempotency and upsell metric immutability.

CREATE UNIQUE INDEX IF NOT EXISTS idx_loyalty_transactions_referral_reward_once
  ON public.loyalty_transactions(referral_event_id)
  WHERE referral_event_id IS NOT NULL
    AND source = 'referral'
    AND reason = 'referral_reward';

DROP TRIGGER IF EXISTS prevent_upsell_metrics_change ON public.upsell_metrics;
CREATE TRIGGER prevent_upsell_metrics_change
  BEFORE UPDATE OR DELETE ON public.upsell_metrics
  FOR EACH ROW EXECUTE FUNCTION public.fn_log_immutable();

CREATE OR REPLACE FUNCTION public.record_referral_reward_delivered(
  p_referral_event_id uuid,
  p_points integer DEFAULT 100,
  p_reward_payload jsonb DEFAULT '{}'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_professional_id uuid;
  v_event public.referral_events%ROWTYPE;
  v_tx public.loyalty_transactions%ROWTYPE;
  v_reward_event_id uuid;
BEGIN
  v_professional_id := public.auth_professional_id();
  IF v_professional_id IS NULL THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  IF COALESCE(p_points, 0) <= 0 THEN RAISE EXCEPTION 'points_must_be_positive'; END IF;

  SELECT * INTO v_event
  FROM public.referral_events
  WHERE id = p_referral_event_id
    AND professional_id = v_professional_id
    AND referrer_client_id IS NOT NULL
  LIMIT 1;

  IF v_event.id IS NULL THEN RAISE EXCEPTION 'referral_event_not_found'; END IF;

  INSERT INTO public.loyalty_transactions (
    professional_id,
    client_id,
    referral_event_id,
    points_delta,
    reason,
    source,
    metadata,
    created_by
  )
  VALUES (
    v_professional_id,
    v_event.referrer_client_id,
    v_event.id,
    p_points,
    'referral_reward',
    'referral',
    COALESCE(p_reward_payload, '{}'),
    auth.uid()
  )
  ON CONFLICT DO NOTHING
  RETURNING * INTO v_tx;

  IF v_tx.id IS NULL THEN
    SELECT * INTO v_tx
    FROM public.loyalty_transactions
    WHERE professional_id = v_professional_id
      AND referral_event_id = v_event.id
      AND source = 'referral'
      AND reason = 'referral_reward'
    LIMIT 1;

    RETURN jsonb_build_object(
      'ok', true,
      'already_delivered', true,
      'transaction_id', v_tx.id,
      'points', v_tx.points_delta
    );
  END IF;

  UPDATE public.clients
  SET loyalty_points = loyalty_points + p_points
  WHERE id = v_event.referrer_client_id
    AND professional_id = v_professional_id;

  INSERT INTO public.referral_events (
    professional_id,
    referral_link_id,
    referrer_client_id,
    referred_client_id,
    event_type,
    payload
  )
  VALUES (
    v_professional_id,
    v_event.referral_link_id,
    v_event.referrer_client_id,
    v_event.referred_client_id,
    'reward_delivered',
    jsonb_build_object('loyalty_transaction_id', v_tx.id, 'points', p_points)
  )
  RETURNING id INTO v_reward_event_id;

  PERFORM public.log_audit_event(
    v_professional_id,
    'professional',
    'loyalty.referral_reward.delivered',
    'loyalty_transaction',
    v_tx.id,
    jsonb_build_object('referral_event_id', v_event.id, 'reward_event_id', v_reward_event_id, 'points', p_points)
  );

  RETURN jsonb_build_object('ok', true, 'already_delivered', false, 'transaction_id', v_tx.id, 'points', p_points);
END;
$$;

REVOKE ALL ON FUNCTION public.record_referral_reward_delivered(uuid, integer, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_referral_reward_delivered(uuid, integer, jsonb) TO authenticated;
