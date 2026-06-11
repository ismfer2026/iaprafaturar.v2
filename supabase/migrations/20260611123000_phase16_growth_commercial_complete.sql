-- ============================================================
-- Phase 16b-16g: Growth Comercial Completo
--
-- Extends Phase 8 growth objects without recreating campaigns,
-- referrals, RFM or client health score tables.
-- ============================================================

ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS email_opt_out boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS email_opt_out_at timestamptz,
  ADD COLUMN IF NOT EXISTS email_opt_out_reason text;

CREATE INDEX IF NOT EXISTS idx_clients_email_opt_out
  ON public.clients(professional_id, email_opt_out)
  WHERE deleted_at IS NULL;

ALTER TABLE public.campaigns
  ADD COLUMN IF NOT EXISTS audience_filter jsonb NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS cooldown_days integer NOT NULL DEFAULT 30 CHECK (cooldown_days >= 0),
  ADD COLUMN IF NOT EXISTS conversion_goal text,
  ADD COLUMN IF NOT EXISTS last_result_snapshot_id uuid;

ALTER TABLE public.message_events DROP CONSTRAINT IF EXISTS message_events_channel_check;
ALTER TABLE public.message_events
  ADD CONSTRAINT message_events_channel_check
  CHECK (channel IN ('whatsapp','instagram','messenger','email','push','web_chat'));

CREATE TABLE public.campaign_cooldowns (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  professional_id uuid NOT NULL REFERENCES public.professionals(id) ON DELETE RESTRICT,
  campaign_id     uuid NOT NULL REFERENCES public.campaigns(id) ON DELETE RESTRICT,
  client_id       uuid NOT NULL REFERENCES public.clients(id) ON DELETE RESTRICT,
  channel         text NOT NULL CHECK (channel IN ('whatsapp','email')),
  cooldown_until  timestamptz NOT NULL,
  reason          text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (campaign_id, client_id, channel)
);

CREATE TABLE public.campaign_result_snapshots (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  professional_id uuid NOT NULL REFERENCES public.professionals(id) ON DELETE RESTRICT,
  campaign_id     uuid NOT NULL REFERENCES public.campaigns(id) ON DELETE RESTRICT,
  channel         text NOT NULL CHECK (channel IN ('whatsapp','email')),
  eligible_count  integer NOT NULL DEFAULT 0 CHECK (eligible_count >= 0),
  blocked_opt_out integer NOT NULL DEFAULT 0 CHECK (blocked_opt_out >= 0),
  blocked_cooldown integer NOT NULL DEFAULT 0 CHECK (blocked_cooldown >= 0),
  queued_count    integer NOT NULL DEFAULT 0 CHECK (queued_count >= 0),
  sent_count      integer NOT NULL DEFAULT 0 CHECK (sent_count >= 0),
  dry_run_count   integer NOT NULL DEFAULT 0 CHECK (dry_run_count >= 0),
  failed_count    integer NOT NULL DEFAULT 0 CHECK (failed_count >= 0),
  replied_count   integer NOT NULL DEFAULT 0 CHECK (replied_count >= 0),
  converted_count integer NOT NULL DEFAULT 0 CHECK (converted_count >= 0),
  metadata        jsonb NOT NULL DEFAULT '{}',
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.loyalty_transactions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  professional_id uuid NOT NULL REFERENCES public.professionals(id) ON DELETE RESTRICT,
  client_id       uuid NOT NULL REFERENCES public.clients(id) ON DELETE RESTRICT,
  referral_event_id uuid REFERENCES public.referral_events(id) ON DELETE RESTRICT,
  points_delta    integer NOT NULL CHECK (points_delta <> 0),
  reason          text NOT NULL CHECK (length(trim(reason)) > 0),
  source          text NOT NULL DEFAULT 'manual' CHECK (source IN ('manual','referral','campaign','adjustment','redemption')),
  metadata        jsonb NOT NULL DEFAULT '{}',
  created_by      uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.loyalty_redemptions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  professional_id uuid NOT NULL REFERENCES public.professionals(id) ON DELETE RESTRICT,
  client_id       uuid NOT NULL REFERENCES public.clients(id) ON DELETE RESTRICT,
  transaction_id  uuid NOT NULL REFERENCES public.loyalty_transactions(id) ON DELETE RESTRICT,
  points_redeemed integer NOT NULL CHECK (points_redeemed > 0),
  reward_type     text NOT NULL DEFAULT 'manual_credit' CHECK (reward_type IN ('manual_credit','discount_note','service_bonus','product_bonus')),
  reward_payload  jsonb NOT NULL DEFAULT '{}',
  status          text NOT NULL DEFAULT 'issued' CHECK (status IN ('issued','used','cancelled')),
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.email_channel_settings (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  professional_id uuid NOT NULL REFERENCES public.professionals(id) ON DELETE RESTRICT UNIQUE,
  provider        text NOT NULL DEFAULT 'resend' CHECK (provider IN ('resend','smtp','disabled')),
  from_email      text,
  from_name       text,
  reply_to_email  text,
  enabled         boolean NOT NULL DEFAULT false,
  dry_run_only    boolean NOT NULL DEFAULT true,
  metadata        jsonb NOT NULL DEFAULT '{}',
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.email_outbox (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  professional_id uuid NOT NULL REFERENCES public.professionals(id) ON DELETE RESTRICT,
  client_id       uuid REFERENCES public.clients(id) ON DELETE RESTRICT,
  campaign_id     uuid REFERENCES public.campaigns(id) ON DELETE RESTRICT,
  to_email        text NOT NULL CHECK (position('@' in to_email) > 1),
  subject         text NOT NULL CHECK (length(trim(subject)) > 0),
  body_text       text NOT NULL CHECK (length(trim(body_text)) > 0),
  status          text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','sent','dry_run','skipped','failed')),
  skip_reason     text,
  provider_message_id text,
  metadata        jsonb NOT NULL DEFAULT '{}',
  created_at      timestamptz NOT NULL DEFAULT now(),
  sent_at         timestamptz
);

CREATE TABLE public.public_chat_configs (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  professional_id uuid NOT NULL REFERENCES public.professionals(id) ON DELETE RESTRICT UNIQUE,
  enabled         boolean NOT NULL DEFAULT true,
  welcome_message text NOT NULL DEFAULT 'Ola! Como posso ajudar?',
  handoff_mode    text NOT NULL DEFAULT 'shadow' CHECK (handoff_mode IN ('active','shadow','human_takeover')),
  require_contact boolean NOT NULL DEFAULT true,
  rate_limit_per_hour integer NOT NULL DEFAULT 12 CHECK (rate_limit_per_hour BETWEEN 1 AND 120),
  metadata        jsonb NOT NULL DEFAULT '{}',
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.public_chat_rate_limits (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  professional_id uuid NOT NULL REFERENCES public.professionals(id) ON DELETE RESTRICT,
  fingerprint     text NOT NULL,
  window_starts_at timestamptz NOT NULL,
  message_count   integer NOT NULL DEFAULT 1 CHECK (message_count > 0),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (professional_id, fingerprint, window_starts_at)
);

CREATE TABLE public.upsell_metrics (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  professional_id uuid NOT NULL REFERENCES public.professionals(id) ON DELETE RESTRICT,
  client_id       uuid REFERENCES public.clients(id) ON DELETE RESTRICT,
  suggestion_id   uuid REFERENCES public.shadow_suggestions(id) ON DELETE SET NULL,
  event_type      text NOT NULL CHECK (event_type IN ('eligible','suggested','approved','sent','converted','skipped')),
  reason          text,
  payload         jsonb NOT NULL DEFAULT '{}',
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_campaign_cooldowns_lookup
  ON public.campaign_cooldowns(professional_id, client_id, channel, cooldown_until);
CREATE INDEX idx_campaign_result_snapshots_campaign
  ON public.campaign_result_snapshots(professional_id, campaign_id, created_at DESC);
CREATE INDEX idx_loyalty_transactions_client
  ON public.loyalty_transactions(professional_id, client_id, created_at DESC);
CREATE INDEX idx_loyalty_redemptions_client
  ON public.loyalty_redemptions(professional_id, client_id, created_at DESC);
CREATE INDEX idx_email_outbox_status
  ON public.email_outbox(status, created_at);
CREATE INDEX idx_email_outbox_professional
  ON public.email_outbox(professional_id, created_at DESC);
CREATE INDEX idx_public_chat_rate_limits_lookup
  ON public.public_chat_rate_limits(professional_id, fingerprint, window_starts_at);
CREATE INDEX idx_upsell_metrics_professional
  ON public.upsell_metrics(professional_id, event_type, created_at DESC);

CREATE TRIGGER email_channel_settings_updated_at
  BEFORE UPDATE ON public.email_channel_settings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER public_chat_configs_updated_at
  BEFORE UPDATE ON public.public_chat_configs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER public_chat_rate_limits_updated_at
  BEFORE UPDATE ON public.public_chat_rate_limits
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER prevent_loyalty_transactions_change
  BEFORE UPDATE OR DELETE ON public.loyalty_transactions
  FOR EACH ROW EXECUTE FUNCTION public.fn_log_immutable();

CREATE TRIGGER prevent_campaign_result_snapshots_change
  BEFORE UPDATE OR DELETE ON public.campaign_result_snapshots
  FOR EACH ROW EXECUTE FUNCTION public.fn_log_immutable();

ALTER TABLE public.campaign_cooldowns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaign_result_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.loyalty_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.loyalty_redemptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_channel_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_outbox ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.public_chat_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.public_chat_rate_limits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.upsell_metrics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "campaign_cooldowns_select_isolation" ON public.campaign_cooldowns
FOR SELECT TO authenticated USING (professional_id = public.auth_professional_id());
CREATE POLICY "campaign_result_snapshots_select_isolation" ON public.campaign_result_snapshots
FOR SELECT TO authenticated USING (professional_id = public.auth_professional_id());
CREATE POLICY "loyalty_transactions_select_isolation" ON public.loyalty_transactions
FOR SELECT TO authenticated USING (professional_id = public.auth_professional_id());
CREATE POLICY "loyalty_redemptions_select_isolation" ON public.loyalty_redemptions
FOR SELECT TO authenticated USING (professional_id = public.auth_professional_id());
CREATE POLICY "email_channel_settings_select_isolation" ON public.email_channel_settings
FOR SELECT TO authenticated USING (professional_id = public.auth_professional_id());
CREATE POLICY "email_outbox_select_isolation" ON public.email_outbox
FOR SELECT TO authenticated USING (professional_id = public.auth_professional_id());
CREATE POLICY "public_chat_configs_select_isolation" ON public.public_chat_configs
FOR SELECT TO authenticated USING (professional_id = public.auth_professional_id());
CREATE POLICY "public_chat_rate_limits_select_isolation" ON public.public_chat_rate_limits
FOR SELECT TO authenticated USING (professional_id = public.auth_professional_id());
CREATE POLICY "upsell_metrics_select_isolation" ON public.upsell_metrics
FOR SELECT TO authenticated USING (professional_id = public.auth_professional_id());

REVOKE ALL ON public.campaign_cooldowns FROM anon, authenticated;
REVOKE ALL ON public.campaign_result_snapshots FROM anon, authenticated;
REVOKE ALL ON public.loyalty_transactions FROM anon, authenticated;
REVOKE ALL ON public.loyalty_redemptions FROM anon, authenticated;
REVOKE ALL ON public.email_channel_settings FROM anon, authenticated;
REVOKE ALL ON public.email_outbox FROM anon, authenticated;
REVOKE ALL ON public.public_chat_configs FROM anon, authenticated;
REVOKE ALL ON public.public_chat_rate_limits FROM anon, authenticated;
REVOKE ALL ON public.upsell_metrics FROM anon, authenticated;

GRANT SELECT ON public.campaign_cooldowns TO authenticated;
GRANT SELECT ON public.campaign_result_snapshots TO authenticated;
GRANT SELECT ON public.loyalty_transactions TO authenticated;
GRANT SELECT ON public.loyalty_redemptions TO authenticated;
GRANT SELECT ON public.email_channel_settings TO authenticated;
GRANT SELECT ON public.email_outbox TO authenticated;
GRANT SELECT ON public.public_chat_configs TO authenticated;
GRANT SELECT ON public.public_chat_rate_limits TO authenticated;
GRANT SELECT ON public.upsell_metrics TO authenticated;

CREATE OR REPLACE FUNCTION public.set_client_email_opt_out(
  p_client_id uuid,
  p_opt_out boolean,
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
BEGIN
  v_professional_id := public.auth_professional_id();
  IF v_professional_id IS NULL THEN RAISE EXCEPTION 'Unauthorized'; END IF;

  UPDATE public.clients
  SET email_opt_out = COALESCE(p_opt_out, false),
      email_opt_out_at = CASE WHEN COALESCE(p_opt_out, false) THEN now() ELSE NULL END,
      email_opt_out_reason = NULLIF(trim(COALESCE(p_reason, '')), '')
  WHERE id = p_client_id
    AND professional_id = v_professional_id
    AND deleted_at IS NULL
  RETURNING * INTO v_client;

  IF v_client.id IS NULL THEN RAISE EXCEPTION 'client_not_found'; END IF;

  PERFORM public.log_audit_event(
    v_professional_id,
    'professional',
    'client.email_opt_out.changed',
    'client',
    v_client.id,
    jsonb_build_object('email_opt_out', v_client.email_opt_out, 'reason', p_reason)
  );

  RETURN jsonb_build_object('ok', true, 'client_id', v_client.id, 'email_opt_out', v_client.email_opt_out);
END;
$$;

CREATE OR REPLACE FUNCTION public.get_growth_commercial_dashboard()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_professional_id uuid;
BEGIN
  v_professional_id := public.auth_professional_id();
  IF v_professional_id IS NULL THEN RAISE EXCEPTION 'Unauthorized'; END IF;

  RETURN jsonb_build_object(
    'campaign_results', COALESCE((
      SELECT jsonb_agg(to_jsonb(x) ORDER BY x.created_at DESC)
      FROM (
        SELECT crs.*, c.name AS campaign_name
        FROM public.campaign_result_snapshots crs
        JOIN public.campaigns c ON c.id = crs.campaign_id
        WHERE crs.professional_id = v_professional_id
        ORDER BY crs.created_at DESC
        LIMIT 20
      ) x
    ), '[]'::jsonb),
    'loyalty', COALESCE((
      SELECT jsonb_agg(to_jsonb(x) ORDER BY x.created_at DESC)
      FROM (
        SELECT lt.*, c.full_name AS client_name
        FROM public.loyalty_transactions lt
        JOIN public.clients c ON c.id = lt.client_id
        WHERE lt.professional_id = v_professional_id
        ORDER BY lt.created_at DESC
        LIMIT 50
      ) x
    ), '[]'::jsonb),
    'email_outbox', COALESCE((
      SELECT jsonb_agg(to_jsonb(e) ORDER BY e.created_at DESC)
      FROM (
        SELECT id, client_id, campaign_id, to_email, subject, status, skip_reason, created_at, sent_at
        FROM public.email_outbox
        WHERE professional_id = v_professional_id
        ORDER BY created_at DESC
        LIMIT 50
      ) e
    ), '[]'::jsonb),
    'public_chat_config', (
      SELECT to_jsonb(pcc)
      FROM public.public_chat_configs pcc
      WHERE pcc.professional_id = v_professional_id
      LIMIT 1
    ),
    'upsell_metrics', COALESCE((
      SELECT jsonb_agg(to_jsonb(u) ORDER BY u.created_at DESC)
      FROM (
        SELECT event_type, reason, count(*)::integer AS count, max(created_at) AS created_at
        FROM public.upsell_metrics
        WHERE professional_id = v_professional_id
        GROUP BY event_type, reason
      ) u
    ), '[]'::jsonb)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.run_segmented_campaign(
  p_campaign_id uuid,
  p_channel text DEFAULT 'whatsapp',
  p_dry_run boolean DEFAULT true
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_professional_id uuid;
  v_campaign public.campaigns%ROWTYPE;
  v_snapshot_id uuid;
  v_eligible integer := 0;
  v_opt_out integer := 0;
  v_cooldown integer := 0;
  v_queued integer := 0;
  v_dry integer := 0;
BEGIN
  v_professional_id := public.auth_professional_id();
  IF v_professional_id IS NULL THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  IF p_channel NOT IN ('whatsapp','email') THEN RAISE EXCEPTION 'invalid_channel'; END IF;

  SELECT * INTO v_campaign
  FROM public.campaigns
  WHERE id = p_campaign_id
    AND professional_id = v_professional_id
    AND status IN ('draft','scheduled','sent')
  FOR UPDATE;

  IF v_campaign.id IS NULL THEN RAISE EXCEPTION 'campaign_not_found'; END IF;

  WITH base AS (
    SELECT c.*
    FROM public.clients c
    LEFT JOIN public.client_health_scores h
      ON h.client_id = c.id AND h.professional_id = c.professional_id
    LEFT JOIN public.rfm_scores r
      ON r.client_id = c.id AND r.professional_id = c.professional_id
    WHERE c.professional_id = v_professional_id
      AND c.deleted_at IS NULL
      AND c.is_active = true
      AND (
        v_campaign.segment_type = 'all'
        OR (v_campaign.segment_type = 'inactive' AND c.journey_stage = 'inativo')
        OR (v_campaign.segment_type = 'risk' AND h.risk_level IN ('risk','churn'))
        OR (v_campaign.segment_type = 'champions' AND r.segment ILIKE '%champion%')
      )
  ),
  classified AS (
    SELECT
      b.*,
      CASE
        WHEN p_channel = 'whatsapp' AND (b.whatsapp_opt_out OR b.phone_whatsapp IS NULL) THEN 'opt_out'
        WHEN p_channel = 'email' AND (b.email_opt_out OR b.email IS NULL) THEN 'opt_out'
        WHEN EXISTS (
          SELECT 1 FROM public.campaign_cooldowns cc
          WHERE cc.professional_id = v_professional_id
            AND cc.client_id = b.id
            AND cc.channel = p_channel
            AND cc.cooldown_until > now()
        ) THEN 'cooldown'
        ELSE 'eligible'
      END AS decision
    FROM base b
  ),
  inserted AS (
    INSERT INTO public.campaign_recipients (
      professional_id,
      campaign_id,
      client_id,
      phone_whatsapp,
      status,
      skip_reason,
      metadata
    )
    SELECT
      v_professional_id,
      v_campaign.id,
      id,
      phone_whatsapp,
      CASE
        WHEN decision = 'eligible' THEN CASE WHEN COALESCE(p_dry_run, true) THEN 'dry_run' ELSE 'queued' END
        WHEN decision = 'opt_out' THEN 'opted_out'
        ELSE 'skipped'
      END,
      CASE WHEN decision = 'cooldown' THEN 'cooldown' WHEN decision = 'opt_out' THEN 'opt_out' ELSE NULL END,
      jsonb_build_object('channel', p_channel, 'decision', decision, 'dry_run', COALESCE(p_dry_run, true))
    FROM classified
    ON CONFLICT (campaign_id, client_id) DO UPDATE
    SET status = EXCLUDED.status,
        skip_reason = EXCLUDED.skip_reason,
        metadata = campaign_recipients.metadata || EXCLUDED.metadata
    RETURNING status, skip_reason
  )
  SELECT
    count(*) FILTER (WHERE status IN ('queued','dry_run')),
    count(*) FILTER (WHERE status = 'opted_out'),
    count(*) FILTER (WHERE skip_reason = 'cooldown'),
    count(*) FILTER (WHERE status = 'queued'),
    count(*) FILTER (WHERE status = 'dry_run')
  INTO v_eligible, v_opt_out, v_cooldown, v_queued, v_dry
  FROM inserted;

  INSERT INTO public.campaign_cooldowns (
    professional_id,
    campaign_id,
    client_id,
    channel,
    cooldown_until,
    reason
  )
  SELECT
    v_professional_id,
    v_campaign.id,
    cr.client_id,
    p_channel,
    now() + make_interval(days => v_campaign.cooldown_days),
    'campaign_run'
  FROM public.campaign_recipients cr
  WHERE cr.professional_id = v_professional_id
    AND cr.campaign_id = v_campaign.id
    AND cr.status IN ('queued','dry_run')
  ON CONFLICT (campaign_id, client_id, channel) DO UPDATE
  SET cooldown_until = EXCLUDED.cooldown_until,
      reason = EXCLUDED.reason;

  INSERT INTO public.campaign_result_snapshots (
    professional_id,
    campaign_id,
    channel,
    eligible_count,
    blocked_opt_out,
    blocked_cooldown,
    queued_count,
    dry_run_count,
    metadata
  )
  VALUES (
    v_professional_id,
    v_campaign.id,
    p_channel,
    COALESCE(v_eligible, 0),
    COALESCE(v_opt_out, 0),
    COALESCE(v_cooldown, 0),
    COALESCE(v_queued, 0),
    COALESCE(v_dry, 0),
    jsonb_build_object('dry_run', COALESCE(p_dry_run, true))
  )
  RETURNING id INTO v_snapshot_id;

  UPDATE public.campaigns
  SET status = CASE WHEN COALESCE(p_dry_run, true) THEN status ELSE 'sending' END,
      last_result_snapshot_id = v_snapshot_id
  WHERE id = v_campaign.id;

  PERFORM public.log_audit_event(
    v_professional_id,
    'professional',
    'campaign.segmented_run.created',
    'campaign',
    v_campaign.id,
    jsonb_build_object('channel', p_channel, 'dry_run', COALESCE(p_dry_run, true), 'snapshot_id', v_snapshot_id)
  );

  RETURN jsonb_build_object(
    'ok', true,
    'campaign_id', v_campaign.id,
    'snapshot_id', v_snapshot_id,
    'eligible', COALESCE(v_eligible, 0),
    'blocked_opt_out', COALESCE(v_opt_out, 0),
    'blocked_cooldown', COALESCE(v_cooldown, 0),
    'queued', COALESCE(v_queued, 0),
    'dry_run', COALESCE(v_dry, 0)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_campaign_results(p_campaign_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_professional_id uuid;
BEGIN
  v_professional_id := public.auth_professional_id();
  IF v_professional_id IS NULL THEN RAISE EXCEPTION 'Unauthorized'; END IF;

  RETURN COALESCE((
    SELECT jsonb_agg(to_jsonb(crs) ORDER BY crs.created_at DESC)
    FROM public.campaign_result_snapshots crs
    WHERE crs.professional_id = v_professional_id
      AND crs.campaign_id = p_campaign_id
  ), '[]'::jsonb);
END;
$$;

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
  RETURNING * INTO v_tx;

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

  RETURN jsonb_build_object('ok', true, 'transaction_id', v_tx.id, 'points', p_points);
END;
$$;

CREATE OR REPLACE FUNCTION public.redeem_loyalty_reward(
  p_client_id uuid,
  p_points integer,
  p_reward_type text DEFAULT 'manual_credit',
  p_reward_payload jsonb DEFAULT '{}'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_professional_id uuid;
  v_client public.clients%ROWTYPE;
  v_tx public.loyalty_transactions%ROWTYPE;
  v_redemption public.loyalty_redemptions%ROWTYPE;
BEGIN
  v_professional_id := public.auth_professional_id();
  IF v_professional_id IS NULL THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  IF COALESCE(p_points, 0) <= 0 THEN RAISE EXCEPTION 'points_must_be_positive'; END IF;

  SELECT * INTO v_client
  FROM public.clients
  WHERE id = p_client_id
    AND professional_id = v_professional_id
    AND deleted_at IS NULL
  FOR UPDATE;

  IF v_client.id IS NULL THEN RAISE EXCEPTION 'client_not_found'; END IF;
  IF v_client.loyalty_points < p_points THEN RAISE EXCEPTION 'insufficient_points'; END IF;

  INSERT INTO public.loyalty_transactions (
    professional_id,
    client_id,
    points_delta,
    reason,
    source,
    metadata,
    created_by
  )
  VALUES (
    v_professional_id,
    v_client.id,
    -p_points,
    'loyalty_redemption',
    'redemption',
    COALESCE(p_reward_payload, '{}'),
    auth.uid()
  )
  RETURNING * INTO v_tx;

  INSERT INTO public.loyalty_redemptions (
    professional_id,
    client_id,
    transaction_id,
    points_redeemed,
    reward_type,
    reward_payload
  )
  VALUES (
    v_professional_id,
    v_client.id,
    v_tx.id,
    p_points,
    COALESCE(NULLIF(p_reward_type, ''), 'manual_credit'),
    COALESCE(p_reward_payload, '{}')
  )
  RETURNING * INTO v_redemption;

  UPDATE public.clients
  SET loyalty_points = loyalty_points - p_points
  WHERE id = v_client.id;

  PERFORM public.log_audit_event(
    v_professional_id,
    'professional',
    'loyalty.reward.redeemed',
    'loyalty_redemption',
    v_redemption.id,
    jsonb_build_object('client_id', v_client.id, 'points', p_points, 'reward_type', v_redemption.reward_type)
  );

  RETURN jsonb_build_object('ok', true, 'redemption_id', v_redemption.id, 'transaction_id', v_tx.id);
END;
$$;

CREATE OR REPLACE FUNCTION public.upsert_email_channel_settings(p_settings jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_professional_id uuid;
  v_settings public.email_channel_settings%ROWTYPE;
BEGIN
  v_professional_id := public.auth_professional_id();
  IF v_professional_id IS NULL THEN RAISE EXCEPTION 'Unauthorized'; END IF;

  INSERT INTO public.email_channel_settings (
    professional_id,
    provider,
    from_email,
    from_name,
    reply_to_email,
    enabled,
    dry_run_only,
    metadata
  )
  VALUES (
    v_professional_id,
    COALESCE(NULLIF(p_settings->>'provider', ''), 'resend'),
    NULLIF(p_settings->>'from_email', ''),
    NULLIF(p_settings->>'from_name', ''),
    NULLIF(p_settings->>'reply_to_email', ''),
    COALESCE((p_settings->>'enabled')::boolean, false),
    COALESCE((p_settings->>'dry_run_only')::boolean, true),
    COALESCE(p_settings->'metadata', '{}')
  )
  ON CONFLICT (professional_id) DO UPDATE
  SET provider = EXCLUDED.provider,
      from_email = EXCLUDED.from_email,
      from_name = EXCLUDED.from_name,
      reply_to_email = EXCLUDED.reply_to_email,
      enabled = EXCLUDED.enabled,
      dry_run_only = EXCLUDED.dry_run_only,
      metadata = EXCLUDED.metadata
  RETURNING * INTO v_settings;

  PERFORM public.log_audit_event(
    v_professional_id,
    'professional',
    'email.settings.updated',
    'email_channel_settings',
    v_settings.id,
    jsonb_build_object('enabled', v_settings.enabled, 'provider', v_settings.provider, 'dry_run_only', v_settings.dry_run_only)
  );

  RETURN jsonb_build_object('ok', true, 'settings', to_jsonb(v_settings));
END;
$$;

CREATE OR REPLACE FUNCTION public.queue_email_to_client(
  p_client_id uuid,
  p_subject text,
  p_body_text text,
  p_campaign_id uuid DEFAULT NULL,
  p_dry_run boolean DEFAULT true
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_professional_id uuid;
  v_client public.clients%ROWTYPE;
  v_outbox public.email_outbox%ROWTYPE;
  v_status text;
  v_skip text;
BEGIN
  v_professional_id := public.auth_professional_id();
  IF v_professional_id IS NULL THEN RAISE EXCEPTION 'Unauthorized'; END IF;

  SELECT * INTO v_client
  FROM public.clients
  WHERE id = p_client_id
    AND professional_id = v_professional_id
    AND deleted_at IS NULL;

  IF v_client.id IS NULL THEN RAISE EXCEPTION 'client_not_found'; END IF;
  IF length(trim(COALESCE(p_subject, ''))) = 0 OR length(trim(COALESCE(p_body_text, ''))) = 0 THEN
    RAISE EXCEPTION 'email_subject_and_body_required';
  END IF;

  IF v_client.email IS NULL OR v_client.email_opt_out THEN
    v_status := 'skipped';
    v_skip := CASE WHEN v_client.email IS NULL THEN 'missing_email' ELSE 'email_opt_out' END;
  ELSIF COALESCE(p_dry_run, true) THEN
    v_status := 'dry_run';
  ELSE
    v_status := 'queued';
  END IF;

  INSERT INTO public.email_outbox (
    professional_id,
    client_id,
    campaign_id,
    to_email,
    subject,
    body_text,
    status,
    skip_reason,
    metadata,
    sent_at
  )
  VALUES (
    v_professional_id,
    v_client.id,
    p_campaign_id,
    COALESCE(v_client.email, 'missing@example.invalid'),
    trim(p_subject),
    trim(p_body_text),
    v_status,
    v_skip,
    jsonb_build_object('dry_run', COALESCE(p_dry_run, true)),
    CASE WHEN v_status = 'dry_run' THEN now() ELSE NULL END
  )
  RETURNING * INTO v_outbox;

  PERFORM public.log_audit_event(
    v_professional_id,
    'professional',
    'email.outbox.queued',
    'email_outbox',
    v_outbox.id,
    jsonb_build_object('client_id', v_client.id, 'status', v_status, 'skip_reason', v_skip)
  );

  RETURN jsonb_build_object('ok', true, 'email_outbox_id', v_outbox.id, 'status', v_status, 'skip_reason', v_skip);
END;
$$;

CREATE OR REPLACE FUNCTION public.mark_email_outbox_sent(
  p_email_outbox_id uuid,
  p_status text,
  p_provider_message_id text DEFAULT NULL,
  p_error text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_email public.email_outbox%ROWTYPE;
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  IF p_status NOT IN ('sent','dry_run','failed','skipped') THEN
    RAISE EXCEPTION 'invalid_email_status';
  END IF;

  UPDATE public.email_outbox
  SET status = p_status,
      provider_message_id = p_provider_message_id,
      skip_reason = COALESCE(NULLIF(p_error, ''), skip_reason),
      sent_at = CASE WHEN p_status IN ('sent','dry_run') THEN now() ELSE sent_at END
  WHERE id = p_email_outbox_id
  RETURNING * INTO v_email;

  IF v_email.id IS NULL THEN RAISE EXCEPTION 'email_outbox_not_found'; END IF;

  PERFORM public.log_audit_event(
    v_email.professional_id,
    'integration',
    'email.outbox.dispatched',
    'email_outbox',
    v_email.id,
    jsonb_build_object('status', p_status, 'provider_message_id', p_provider_message_id, 'error', p_error)
  );

  RETURN jsonb_build_object('ok', true, 'email_outbox_id', v_email.id, 'status', v_email.status);
END;
$$;

CREATE OR REPLACE FUNCTION public.upsert_public_chat_config(p_config jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_professional_id uuid;
  v_config public.public_chat_configs%ROWTYPE;
BEGIN
  v_professional_id := public.auth_professional_id();
  IF v_professional_id IS NULL THEN RAISE EXCEPTION 'Unauthorized'; END IF;

  INSERT INTO public.public_chat_configs (
    professional_id,
    enabled,
    welcome_message,
    handoff_mode,
    require_contact,
    rate_limit_per_hour,
    metadata
  )
  VALUES (
    v_professional_id,
    COALESCE((p_config->>'enabled')::boolean, true),
    COALESCE(NULLIF(p_config->>'welcome_message', ''), 'Ola! Como posso ajudar?'),
    COALESCE(NULLIF(p_config->>'handoff_mode', ''), 'shadow'),
    COALESCE((p_config->>'require_contact')::boolean, true),
    LEAST(GREATEST(COALESCE((p_config->>'rate_limit_per_hour')::integer, 12), 1), 120),
    COALESCE(p_config->'metadata', '{}')
  )
  ON CONFLICT (professional_id) DO UPDATE
  SET enabled = EXCLUDED.enabled,
      welcome_message = EXCLUDED.welcome_message,
      handoff_mode = EXCLUDED.handoff_mode,
      require_contact = EXCLUDED.require_contact,
      rate_limit_per_hour = EXCLUDED.rate_limit_per_hour,
      metadata = EXCLUDED.metadata
  RETURNING * INTO v_config;

  PERFORM public.log_audit_event(
    v_professional_id,
    'professional',
    'public_chat.config.updated',
    'public_chat_config',
    v_config.id,
    jsonb_build_object('enabled', v_config.enabled, 'handoff_mode', v_config.handoff_mode)
  );

  RETURN jsonb_build_object('ok', true, 'config', to_jsonb(v_config));
END;
$$;

CREATE OR REPLACE FUNCTION public.register_public_chat_message(
  p_slug text,
  p_name text,
  p_email text,
  p_phone text,
  p_message text,
  p_fingerprint text DEFAULT NULL,
  p_honeypot text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_professional public.professionals%ROWTYPE;
  v_config public.public_chat_configs%ROWTYPE;
  v_client public.clients%ROWTYPE;
  v_conversation public.conversations%ROWTYPE;
  v_message_id uuid;
  v_funnel_id uuid;
  v_stage_id uuid;
  v_opportunity_id uuid;
  v_window timestamptz;
  v_count integer;
  v_fingerprint text;
BEGIN
  IF NULLIF(trim(COALESCE(p_honeypot, '')), '') IS NOT NULL THEN
    RAISE EXCEPTION 'spam_detected';
  END IF;

  IF length(trim(COALESCE(p_message, ''))) < 2 THEN
    RAISE EXCEPTION 'message_required';
  END IF;

  SELECT * INTO v_professional
  FROM public.professionals
  WHERE slug = lower(trim(COALESCE(p_slug, '')))
  LIMIT 1;

  IF v_professional.id IS NULL THEN RAISE EXCEPTION 'professional_not_found'; END IF;

  INSERT INTO public.public_chat_configs (professional_id)
  VALUES (v_professional.id)
  ON CONFLICT (professional_id) DO NOTHING;

  SELECT * INTO v_config
  FROM public.public_chat_configs
  WHERE professional_id = v_professional.id;

  IF NOT v_config.enabled THEN RAISE EXCEPTION 'public_chat_disabled'; END IF;

  IF v_config.require_contact AND NULLIF(trim(COALESCE(p_email, p_phone, '')), '') IS NULL THEN
    RAISE EXCEPTION 'contact_required';
  END IF;

  v_fingerprint := COALESCE(NULLIF(trim(p_fingerprint), ''), md5(COALESCE(p_email, '') || ':' || COALESCE(p_phone, '')));
  v_window := date_trunc('hour', now());

  INSERT INTO public.public_chat_rate_limits (professional_id, fingerprint, window_starts_at, message_count)
  VALUES (v_professional.id, v_fingerprint, v_window, 1)
  ON CONFLICT (professional_id, fingerprint, window_starts_at) DO UPDATE
  SET message_count = public.public_chat_rate_limits.message_count + 1
  RETURNING message_count INTO v_count;

  IF v_count > v_config.rate_limit_per_hour THEN
    RAISE EXCEPTION 'rate_limited';
  END IF;

  SELECT * INTO v_client
  FROM public.clients
  WHERE professional_id = v_professional.id
    AND deleted_at IS NULL
    AND (
      (p_email IS NOT NULL AND email = NULLIF(trim(p_email), ''))
      OR (p_phone IS NOT NULL AND regexp_replace(COALESCE(phone_whatsapp, ''), '\D', '', 'g') = regexp_replace(COALESCE(p_phone, ''), '\D', '', 'g'))
    )
  ORDER BY updated_at DESC
  LIMIT 1;

  IF v_client.id IS NULL THEN
    INSERT INTO public.clients (
      professional_id,
      full_name,
      phone_whatsapp,
      email,
      journey_stage,
      source,
      lgpd_consent_at,
      lgpd_consent_source,
      metadata
    )
    VALUES (
      v_professional.id,
      COALESCE(NULLIF(trim(p_name), ''), 'Lead chat publico'),
      NULLIF(regexp_replace(COALESCE(p_phone, ''), '\D', '', 'g'), ''),
      NULLIF(trim(COALESCE(p_email, '')), ''),
      'lead',
      'public_link',
      now(),
      'public_chat',
      jsonb_build_object('public_chat_fingerprint', v_fingerprint)
    )
    RETURNING * INTO v_client;
  END IF;

  INSERT INTO public.conversations (
    professional_id,
    channel,
    phone,
    email_address,
    rosane_status,
    last_message_at,
    last_message_preview,
    metadata,
    client_id
  )
  VALUES (
    v_professional.id,
    'web_chat',
    v_client.phone_whatsapp,
    v_client.email,
    CASE WHEN v_config.handoff_mode = 'human_takeover' THEN 'human_takeover' ELSE v_config.handoff_mode END,
    now(),
    left(trim(p_message), 160),
    jsonb_build_object('source', 'public_chat', 'fingerprint', v_fingerprint),
    v_client.id
  )
  RETURNING * INTO v_conversation;

  INSERT INTO public.message_events (
    professional_id,
    conversation_id,
    direction,
    channel,
    message_type,
    source_webhook,
    content,
    sent_by,
    context_type,
    status,
    metadata,
    client_id
  )
  VALUES (
    v_professional.id,
    v_conversation.id,
    'inbound',
    'web_chat',
    'text',
    'professional',
    trim(p_message),
    'human',
    'conversation',
    'processed',
    jsonb_build_object('source', 'public_chat', 'fingerprint', v_fingerprint),
    v_client.id
  )
  RETURNING id INTO v_message_id;

  SELECT id INTO v_funnel_id
  FROM public.sales_funnels
  WHERE professional_id = v_professional.id
    AND is_default = true
  LIMIT 1;

  IF v_funnel_id IS NULL THEN
    INSERT INTO public.sales_funnels (professional_id, name, is_default)
    VALUES (v_professional.id, 'Funil comercial', true)
    RETURNING id INTO v_funnel_id;
  END IF;

  INSERT INTO public.funnel_stages (funnel_id, professional_id, name, slug, color, position, is_won, is_lost)
  VALUES
    (v_funnel_id, v_professional.id, 'Novo', 'novo', '#0f766e', 10, false, false),
    (v_funnel_id, v_professional.id, 'Qualificado', 'qualificado', '#2563eb', 20, false, false),
    (v_funnel_id, v_professional.id, 'Proposta', 'proposta', '#7c3aed', 30, false, false),
    (v_funnel_id, v_professional.id, 'Ganhou', 'ganhou', '#16a34a', 40, true, false),
    (v_funnel_id, v_professional.id, 'Perdido', 'perdido', '#dc2626', 50, false, true)
  ON CONFLICT (funnel_id, slug) DO NOTHING;

  SELECT id INTO v_stage_id
  FROM public.funnel_stages
  WHERE funnel_id = v_funnel_id
    AND professional_id = v_professional.id
    AND is_active = true
    AND is_won = false
    AND is_lost = false
  ORDER BY position
  LIMIT 1;

  INSERT INTO public.funnel_opportunities (
    professional_id,
    funnel_id,
    stage_id,
    client_id,
    title,
    source,
    value,
    metadata,
    last_activity_at
  )
  VALUES (
    v_professional.id,
    v_funnel_id,
    v_stage_id,
    v_client.id,
    'Lead via chat publico',
    'web_chat',
    0,
    jsonb_build_object('conversation_id', v_conversation.id, 'message_event_id', v_message_id),
    now()
  )
  RETURNING id INTO v_opportunity_id;

  INSERT INTO public.funnel_events (
    professional_id,
    opportunity_id,
    event_type,
    to_stage_id,
    payload
  )
  VALUES (
    v_professional.id,
    v_opportunity_id,
    'created',
    v_stage_id,
    jsonb_build_object('source', 'public_chat', 'conversation_id', v_conversation.id, 'message_event_id', v_message_id)
  );

  PERFORM public.log_audit_event(
    v_professional.id,
    'client',
    'public_chat.message.created',
    'conversation',
    v_conversation.id,
    jsonb_build_object('client_id', v_client.id, 'message_event_id', v_message_id, 'opportunity_id', v_opportunity_id)
  );

  RETURN jsonb_build_object(
    'ok', true,
    'conversation_id', v_conversation.id,
    'message_event_id', v_message_id,
    'client_id', v_client.id,
    'opportunity_id', v_opportunity_id,
    'handoff_mode', v_config.handoff_mode
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_public_chat_context(p_slug text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_professional public.professionals%ROWTYPE;
  v_config public.public_chat_configs%ROWTYPE;
BEGIN
  SELECT * INTO v_professional
  FROM public.professionals
  WHERE slug = lower(trim(COALESCE(p_slug, '')))
  LIMIT 1;

  IF v_professional.id IS NULL THEN RAISE EXCEPTION 'professional_not_found'; END IF;

  INSERT INTO public.public_chat_configs (professional_id)
  VALUES (v_professional.id)
  ON CONFLICT (professional_id) DO NOTHING;

  SELECT * INTO v_config
  FROM public.public_chat_configs
  WHERE professional_id = v_professional.id;

  RETURN jsonb_build_object(
    'professional', jsonb_build_object('name', v_professional.name, 'slug', v_professional.slug),
    'config', jsonb_build_object(
      'enabled', v_config.enabled,
      'welcome_message', v_config.welcome_message,
      'require_contact', v_config.require_contact
    )
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_reactivation_queue(p_limit integer DEFAULT 50)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_professional_id uuid;
BEGIN
  v_professional_id := public.auth_professional_id();
  IF v_professional_id IS NULL THEN RAISE EXCEPTION 'Unauthorized'; END IF;

  RETURN COALESCE((
    SELECT jsonb_agg(to_jsonb(x) ORDER BY x.score ASC, x.last_session_at ASC NULLS FIRST)
    FROM (
      SELECT
        h.client_id,
        c.full_name,
        c.phone_whatsapp,
        c.email,
        h.score,
        h.risk_level,
        h.reactivation_cooldown_until,
        h.reactivation_attempts_in_cycle,
        h.signals
      FROM public.client_health_scores h
      JOIN public.clients c ON c.id = h.client_id
      WHERE h.professional_id = v_professional_id
        AND c.deleted_at IS NULL
        AND c.is_active = true
        AND h.risk_level IN ('risk','churn')
        AND (h.reactivation_cooldown_until IS NULL OR h.reactivation_cooldown_until <= now())
      ORDER BY h.score ASC, h.last_session_at ASC NULLS FIRST
      LIMIT LEAST(GREATEST(COALESCE(p_limit, 50), 1), 200)
    ) x
  ), '[]'::jsonb);
END;
$$;

CREATE OR REPLACE FUNCTION public.calculate_client_health_for_professional(
  p_professional_id uuid DEFAULT NULL,
  p_limit integer DEFAULT 500,
  p_cursor uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_professional_id uuid;
  v_limit integer;
  v_processed integer;
  v_next_cursor uuid;
BEGIN
  IF COALESCE(auth.role(), '') = 'service_role' THEN
    v_professional_id := p_professional_id;
  ELSE
    v_professional_id := public.auth_professional_id();
  END IF;

  IF v_professional_id IS NULL THEN RAISE EXCEPTION 'Unauthorized'; END IF;

  v_limit := LEAST(GREATEST(COALESCE(p_limit, 500), 1), 1000);

  WITH batch AS (
    SELECT c.id AS client_id
    FROM public.clients c
    WHERE c.professional_id = v_professional_id
      AND c.deleted_at IS NULL
      AND c.is_active = true
      AND (p_cursor IS NULL OR c.id > p_cursor)
    ORDER BY c.id
    LIMIT v_limit
  ),
  metrics AS (
    SELECT
      b.client_id,
      max(s.session_date) AS last_session_at,
      max(ft.paid_at) FILTER (WHERE ft.status = 'pago') AS last_payment_at,
      count(DISTINCT s.id) FILTER (WHERE s.session_date >= now() - interval '90 days') AS recent_sessions,
      count(DISTINCT ft.id) FILTER (WHERE ft.status = 'pendente' AND ft.due_date < current_date) AS overdue_payments,
      count(DISTINCT cp.id) FILTER (
        WHERE cp.status = 'ativo'
          AND (cp.sessions_remaining <= 2 OR cp.expires_at <= now() + interval '14 days')
      ) AS expiring_packages,
      max(r.segment) AS rfm_segment
    FROM batch b
    LEFT JOIN public.sessions s ON s.client_id = b.client_id AND s.professional_id = v_professional_id
    LEFT JOIN public.financial_transactions ft ON ft.client_id = b.client_id AND ft.professional_id = v_professional_id
    LEFT JOIN public.client_packages cp ON cp.client_id = b.client_id AND cp.professional_id = v_professional_id
    LEFT JOIN public.rfm_scores r ON r.client_id = b.client_id AND r.professional_id = v_professional_id
    GROUP BY b.client_id
  ),
  scored AS (
    SELECT
      client_id,
      last_session_at,
      last_payment_at,
      GREATEST(0, LEAST(100,
        35
        + CASE
            WHEN last_session_at IS NULL THEN -25
            WHEN last_session_at >= now() - interval '30 days' THEN 25
            WHEN last_session_at >= now() - interval '90 days' THEN 10
            ELSE -15
          END
        + CASE WHEN recent_sessions >= 4 THEN 15 WHEN recent_sessions >= 2 THEN 8 ELSE 0 END
        + CASE WHEN overdue_payments > 0 THEN -20 ELSE 5 END
        + CASE WHEN expiring_packages > 0 THEN 5 ELSE 0 END
        + CASE WHEN COALESCE(rfm_segment, '') ILIKE '%champion%' THEN 15 ELSE 0 END
      ))::integer AS score,
      jsonb_build_object(
        'formula_version', 'phase16_v2',
        'recent_sessions', recent_sessions,
        'overdue_payments', overdue_payments,
        'expiring_packages', expiring_packages,
        'rfm_segment', rfm_segment
      ) AS signals
    FROM metrics
  ),
  upserted AS (
    INSERT INTO public.client_health_scores (
      professional_id,
      client_id,
      score,
      risk_level,
      last_session_at,
      last_payment_at,
      signals,
      calculated_at
    )
    SELECT
      v_professional_id,
      client_id,
      score,
      CASE
        WHEN score >= 80 THEN 'healthy'
        WHEN score >= 60 THEN 'attention'
        WHEN score >= 40 THEN 'risk'
        ELSE 'churn'
      END,
      last_session_at,
      last_payment_at,
      signals,
      now()
    FROM scored
    ON CONFLICT (professional_id, client_id) DO UPDATE
    SET score = EXCLUDED.score,
        risk_level = EXCLUDED.risk_level,
        last_session_at = EXCLUDED.last_session_at,
        last_payment_at = EXCLUDED.last_payment_at,
        signals = EXCLUDED.signals,
        calculated_at = EXCLUDED.calculated_at
    RETURNING client_id
  )
  SELECT count(*)::integer, max(client_id)
  INTO v_processed, v_next_cursor
  FROM upserted;

  PERFORM public.log_audit_event(
    v_professional_id,
    'cron',
    'client.health_score.recalculated',
    'client_health_scores',
    NULL,
    jsonb_build_object('processed', COALESCE(v_processed, 0), 'next_cursor', v_next_cursor, 'formula_version', 'phase16_v2')
  );

  RETURN jsonb_build_object('ok', true, 'processed', COALESCE(v_processed, 0), 'next_cursor', v_next_cursor, 'formula_version', 'phase16_v2');
END;
$$;

CREATE OR REPLACE FUNCTION public.record_upsell_metric(
  p_client_id uuid,
  p_event_type text,
  p_reason text DEFAULT NULL,
  p_payload jsonb DEFAULT '{}',
  p_suggestion_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_professional_id uuid;
  v_metric_id uuid;
BEGIN
  IF COALESCE(auth.role(), '') = 'service_role' THEN
    SELECT professional_id INTO v_professional_id
    FROM public.clients
    WHERE id = p_client_id
      AND deleted_at IS NULL;
  ELSE
    v_professional_id := public.auth_professional_id();
  END IF;

  IF v_professional_id IS NULL THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  IF p_event_type NOT IN ('eligible','suggested','approved','sent','converted','skipped') THEN
    RAISE EXCEPTION 'invalid_upsell_metric_event';
  END IF;

  INSERT INTO public.upsell_metrics (
    professional_id,
    client_id,
    suggestion_id,
    event_type,
    reason,
    payload
  )
  VALUES (
    v_professional_id,
    p_client_id,
    p_suggestion_id,
    p_event_type,
    p_reason,
    COALESCE(p_payload, '{}')
  )
  RETURNING id INTO v_metric_id;

  RETURN jsonb_build_object('ok', true, 'metric_id', v_metric_id);
END;
$$;

REVOKE ALL ON FUNCTION public.set_client_email_opt_out(uuid, boolean, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_growth_commercial_dashboard() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.run_segmented_campaign(uuid, text, boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_campaign_results(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.record_referral_reward_delivered(uuid, integer, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.redeem_loyalty_reward(uuid, integer, text, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.upsert_email_channel_settings(jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.queue_email_to_client(uuid, text, text, uuid, boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.mark_email_outbox_sent(uuid, text, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.upsert_public_chat_config(jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.register_public_chat_message(text, text, text, text, text, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_public_chat_context(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_reactivation_queue(integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.calculate_client_health_for_professional(uuid, integer, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.record_upsell_metric(uuid, text, text, jsonb, uuid) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.set_client_email_opt_out(uuid, boolean, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_growth_commercial_dashboard() TO authenticated;
GRANT EXECUTE ON FUNCTION public.run_segmented_campaign(uuid, text, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_campaign_results(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_referral_reward_delivered(uuid, integer, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.redeem_loyalty_reward(uuid, integer, text, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_email_channel_settings(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.queue_email_to_client(uuid, text, text, uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_email_outbox_sent(uuid, text, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.upsert_public_chat_config(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.register_public_chat_message(text, text, text, text, text, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_public_chat_context(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_reactivation_queue(integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.calculate_client_health_for_professional(uuid, integer, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.record_upsell_metric(uuid, text, text, jsonb, uuid) TO service_role;
