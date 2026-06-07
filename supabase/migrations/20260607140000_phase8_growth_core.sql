-- Phase 8: Growth CRM Core
--
-- Scope:
-- - client opt-out and reactivation lifecycle state
-- - RFM scores
-- - final-client health scores
-- - campaign core tables
-- - client-to-client referral core tables
-- - base RPCs for later agents/UI
--
-- Explicitly out of scope:
-- - SaaS billing / Stripe / credit wallets
-- - affiliate professional -> professional
-- - sales funnel Kanban / opportunities
-- - public chat widget
-- - email channel
-- ============================================================

ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS whatsapp_opt_out boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS whatsapp_opt_out_at timestamptz,
  ADD COLUMN IF NOT EXISTS reactivation_status text NOT NULL DEFAULT 'eligible'
    CHECK (reactivation_status IN ('eligible','paused','closed','lost')),
  ADD COLUMN IF NOT EXISTS reactivation_status_reason text;

CREATE INDEX IF NOT EXISTS idx_clients_whatsapp_opt_out
  ON public.clients(professional_id, whatsapp_opt_out)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_clients_reactivation_status
  ON public.clients(professional_id, reactivation_status)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.rfm_scores (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  professional_id uuid NOT NULL REFERENCES public.professionals(id) ON DELETE RESTRICT,
  client_id       uuid NOT NULL REFERENCES public.clients(id) ON DELETE RESTRICT,
  recency_score   integer NOT NULL CHECK (recency_score BETWEEN 1 AND 5),
  frequency_score integer NOT NULL CHECK (frequency_score BETWEEN 1 AND 5),
  monetary_score  integer NOT NULL CHECK (monetary_score BETWEEN 1 AND 5),
  rfm_code        text NOT NULL,
  segment         text NOT NULL,
  calculated_at   timestamptz NOT NULL DEFAULT now(),
  metadata        jsonb NOT NULL DEFAULT '{}',
  CONSTRAINT rfm_scores_unique_client UNIQUE (professional_id, client_id)
);

CREATE INDEX IF NOT EXISTS idx_rfm_scores_professional
  ON public.rfm_scores(professional_id);
CREATE INDEX IF NOT EXISTS idx_rfm_scores_client
  ON public.rfm_scores(client_id);
CREATE INDEX IF NOT EXISTS idx_rfm_scores_segment
  ON public.rfm_scores(professional_id, segment);

ALTER TABLE public.rfm_scores ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "rfm_scores_isolation" ON public.rfm_scores;
CREATE POLICY "rfm_scores_isolation"
ON public.rfm_scores FOR ALL TO authenticated
USING (professional_id = public.auth_professional_id())
WITH CHECK (professional_id = public.auth_professional_id());

REVOKE ALL ON public.rfm_scores FROM anon, authenticated;
GRANT SELECT ON public.rfm_scores TO authenticated;

CREATE TABLE IF NOT EXISTS public.client_health_scores (
  id                              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  professional_id                 uuid NOT NULL REFERENCES public.professionals(id) ON DELETE RESTRICT,
  client_id                       uuid NOT NULL REFERENCES public.clients(id) ON DELETE RESTRICT,
  score                           integer NOT NULL CHECK (score BETWEEN 0 AND 100),
  risk_level                      text NOT NULL CHECK (risk_level IN ('healthy','attention','risk','churn')),
  last_session_at                 timestamptz,
  last_payment_at                 timestamptz,
  last_nps_score                  integer CHECK (last_nps_score IS NULL OR last_nps_score BETWEEN 1 AND 5),
  reactivation_cooldown_until     timestamptz,
  reactivation_attempts_in_cycle  integer NOT NULL DEFAULT 0 CHECK (reactivation_attempts_in_cycle >= 0),
  last_reactivation_attempt_at    timestamptz,
  last_reactivation_reason        text,
  signals                         jsonb NOT NULL DEFAULT '{}',
  calculated_at                   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT client_health_scores_unique_client UNIQUE (professional_id, client_id)
);

COMMENT ON COLUMN public.client_health_scores.reactivation_cooldown_until IS
  'Owned by reactivation flow only. Health-score recalculation must not overwrite this column.';
COMMENT ON COLUMN public.client_health_scores.reactivation_attempts_in_cycle IS
  'Owned by reactivation flow only. Health-score recalculation must not overwrite this column.';
COMMENT ON COLUMN public.client_health_scores.last_reactivation_attempt_at IS
  'Owned by reactivation flow only. Health-score recalculation must not overwrite this column.';
COMMENT ON COLUMN public.client_health_scores.last_reactivation_reason IS
  'Owned by reactivation flow only. Health-score recalculation must not overwrite this column.';

CREATE INDEX IF NOT EXISTS idx_client_health_scores_professional
  ON public.client_health_scores(professional_id);
CREATE INDEX IF NOT EXISTS idx_client_health_scores_client
  ON public.client_health_scores(client_id);
CREATE INDEX IF NOT EXISTS idx_client_health_scores_risk
  ON public.client_health_scores(professional_id, risk_level);
CREATE INDEX IF NOT EXISTS idx_client_health_scores_reactivation_cooldown
  ON public.client_health_scores(professional_id, reactivation_cooldown_until);

ALTER TABLE public.client_health_scores ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "client_health_scores_isolation" ON public.client_health_scores;
CREATE POLICY "client_health_scores_isolation"
ON public.client_health_scores FOR ALL TO authenticated
USING (professional_id = public.auth_professional_id())
WITH CHECK (professional_id = public.auth_professional_id());

REVOKE ALL ON public.client_health_scores FROM anon, authenticated;
GRANT SELECT ON public.client_health_scores TO authenticated;

CREATE TABLE IF NOT EXISTS public.campaigns (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  professional_id  uuid NOT NULL REFERENCES public.professionals(id) ON DELETE RESTRICT,
  name             text NOT NULL CHECK (length(trim(name)) > 0),
  channel          text NOT NULL DEFAULT 'whatsapp' CHECK (channel IN ('whatsapp')),
  segment_type     text NOT NULL,
  message_template text NOT NULL CHECK (length(trim(message_template)) > 0),
  status           text NOT NULL DEFAULT 'draft'
                   CHECK (status IN ('draft','scheduled','sending','sent','cancelled','failed')),
  scheduled_at     timestamptz,
  created_by       uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  metadata         jsonb NOT NULL DEFAULT '{}',
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'campaigns_updated_at'
      AND tgrelid = 'public.campaigns'::regclass
  ) THEN
    CREATE TRIGGER campaigns_updated_at
      BEFORE UPDATE ON public.campaigns
      FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_campaigns_professional
  ON public.campaigns(professional_id);
CREATE INDEX IF NOT EXISTS idx_campaigns_status_scheduled
  ON public.campaigns(professional_id, status, scheduled_at);

ALTER TABLE public.campaigns ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "campaigns_isolation" ON public.campaigns;
CREATE POLICY "campaigns_isolation"
ON public.campaigns FOR ALL TO authenticated
USING (professional_id = public.auth_professional_id())
WITH CHECK (professional_id = public.auth_professional_id());

REVOKE ALL ON public.campaigns FROM anon, authenticated;
GRANT SELECT ON public.campaigns TO authenticated;

CREATE TABLE IF NOT EXISTS public.campaign_recipients (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  professional_id uuid NOT NULL REFERENCES public.professionals(id) ON DELETE RESTRICT,
  campaign_id     uuid NOT NULL REFERENCES public.campaigns(id) ON DELETE RESTRICT,
  client_id       uuid NOT NULL REFERENCES public.clients(id) ON DELETE RESTRICT,
  phone_whatsapp  text,
  status          text NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending','queued','sent','dry_run','skipped','failed','opted_out')),
  skip_reason     text,
  metadata        jsonb NOT NULL DEFAULT '{}',
  created_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT campaign_recipients_unique_client UNIQUE (campaign_id, client_id)
);

CREATE INDEX IF NOT EXISTS idx_campaign_recipients_professional
  ON public.campaign_recipients(professional_id);
CREATE INDEX IF NOT EXISTS idx_campaign_recipients_campaign_status
  ON public.campaign_recipients(professional_id, campaign_id, status);
CREATE INDEX IF NOT EXISTS idx_campaign_recipients_client
  ON public.campaign_recipients(client_id);

ALTER TABLE public.campaign_recipients ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "campaign_recipients_isolation" ON public.campaign_recipients;
CREATE POLICY "campaign_recipients_isolation"
ON public.campaign_recipients FOR ALL TO authenticated
USING (professional_id = public.auth_professional_id())
WITH CHECK (professional_id = public.auth_professional_id());

REVOKE ALL ON public.campaign_recipients FROM anon, authenticated;
GRANT SELECT ON public.campaign_recipients TO authenticated;

CREATE TABLE IF NOT EXISTS public.campaign_dispatches (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  professional_id  uuid NOT NULL REFERENCES public.professionals(id) ON DELETE RESTRICT,
  campaign_id      uuid NOT NULL REFERENCES public.campaigns(id) ON DELETE RESTRICT,
  recipient_id     uuid REFERENCES public.campaign_recipients(id) ON DELETE RESTRICT,
  message_event_id uuid REFERENCES public.message_events(id) ON DELETE SET NULL,
  status           text NOT NULL CHECK (status IN ('queued','sent','dry_run','skipped','failed')),
  provider_payload jsonb NOT NULL DEFAULT '{}',
  error_message    text,
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_campaign_dispatches_professional
  ON public.campaign_dispatches(professional_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_campaign_dispatches_campaign
  ON public.campaign_dispatches(campaign_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_campaign_dispatches_recipient
  ON public.campaign_dispatches(recipient_id)
  WHERE recipient_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_campaign_dispatches_message_event
  ON public.campaign_dispatches(message_event_id)
  WHERE message_event_id IS NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'prevent_campaign_dispatches_change'
      AND tgrelid = 'public.campaign_dispatches'::regclass
  ) THEN
    CREATE TRIGGER prevent_campaign_dispatches_change
      BEFORE UPDATE OR DELETE ON public.campaign_dispatches
      FOR EACH ROW EXECUTE FUNCTION public.fn_log_immutable();
  END IF;
END $$;

ALTER TABLE public.campaign_dispatches ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "campaign_dispatches_isolation" ON public.campaign_dispatches;
CREATE POLICY "campaign_dispatches_isolation"
ON public.campaign_dispatches FOR SELECT TO authenticated
USING (professional_id = public.auth_professional_id());

REVOKE ALL ON public.campaign_dispatches FROM anon, authenticated;
GRANT SELECT ON public.campaign_dispatches TO authenticated;

CREATE TABLE IF NOT EXISTS public.referral_links (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  professional_id uuid NOT NULL REFERENCES public.professionals(id) ON DELETE RESTRICT,
  client_id       uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  code            text NOT NULL UNIQUE,
  type            text NOT NULL DEFAULT 'client_to_client' CHECK (type IN ('client_to_client')),
  status          text NOT NULL DEFAULT 'active' CHECK (status IN ('active','paused','expired')),
  metadata        jsonb NOT NULL DEFAULT '{}',
  created_at      timestamptz NOT NULL DEFAULT now(),
  expires_at      timestamptz
);

CREATE INDEX IF NOT EXISTS idx_referral_links_professional
  ON public.referral_links(professional_id);
CREATE INDEX IF NOT EXISTS idx_referral_links_client
  ON public.referral_links(client_id)
  WHERE client_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_referral_links_code_unique
  ON public.referral_links(code);

ALTER TABLE public.referral_links ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "referral_links_isolation" ON public.referral_links;
CREATE POLICY "referral_links_isolation"
ON public.referral_links FOR ALL TO authenticated
USING (professional_id = public.auth_professional_id())
WITH CHECK (professional_id = public.auth_professional_id());

REVOKE ALL ON public.referral_links FROM anon, authenticated;
GRANT SELECT ON public.referral_links TO authenticated;

CREATE TABLE IF NOT EXISTS public.referral_events (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  professional_id    uuid NOT NULL REFERENCES public.professionals(id) ON DELETE RESTRICT,
  referral_link_id   uuid REFERENCES public.referral_links(id) ON DELETE SET NULL,
  referrer_client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  referred_client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  event_type         text NOT NULL CHECK (event_type IN ('requested','lead_created','booked','attended','reward_delivered')),
  payload            jsonb NOT NULL DEFAULT '{}',
  created_at         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_referral_events_professional
  ON public.referral_events(professional_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_referral_events_type
  ON public.referral_events(professional_id, event_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_referral_events_link
  ON public.referral_events(referral_link_id)
  WHERE referral_link_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_referral_events_referrer
  ON public.referral_events(referrer_client_id)
  WHERE referrer_client_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_referral_events_referred
  ON public.referral_events(referred_client_id)
  WHERE referred_client_id IS NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'prevent_referral_events_change'
      AND tgrelid = 'public.referral_events'::regclass
  ) THEN
    CREATE TRIGGER prevent_referral_events_change
      BEFORE UPDATE OR DELETE ON public.referral_events
      FOR EACH ROW EXECUTE FUNCTION public.fn_log_immutable();
  END IF;
END $$;

ALTER TABLE public.referral_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "referral_events_isolation" ON public.referral_events;
CREATE POLICY "referral_events_isolation"
ON public.referral_events FOR SELECT TO authenticated
USING (professional_id = public.auth_professional_id());

REVOKE ALL ON public.referral_events FROM anon, authenticated;
GRANT SELECT ON public.referral_events TO authenticated;

CREATE OR REPLACE FUNCTION public.set_client_whatsapp_opt_out(
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

  IF v_professional_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  UPDATE public.clients
  SET
    whatsapp_opt_out = COALESCE(p_opt_out, false),
    whatsapp_opt_out_at = CASE WHEN COALESCE(p_opt_out, false) THEN now() ELSE NULL END,
    metadata = jsonb_set(
      COALESCE(metadata, '{}'),
      '{whatsapp_opt_out_reason}',
      to_jsonb(NULLIF(trim(COALESCE(p_reason, '')), '')),
      true
    )
  WHERE id = p_client_id
    AND professional_id = v_professional_id
    AND deleted_at IS NULL
  RETURNING * INTO v_client;

  IF v_client.id IS NULL THEN
    RAISE EXCEPTION 'client_not_found';
  END IF;

  PERFORM public.log_audit_event(
    v_professional_id,
    'professional',
    CASE WHEN COALESCE(p_opt_out, false) THEN 'client.whatsapp.opted_out' ELSE 'client.whatsapp.opted_in' END,
    'client',
    v_client.id,
    jsonb_build_object('reason', p_reason)
  );

  RETURN jsonb_build_object('ok', true, 'client_id', v_client.id, 'whatsapp_opt_out', v_client.whatsapp_opt_out);
END;
$$;

CREATE OR REPLACE FUNCTION public.set_client_reactivation_status(
  p_client_id uuid,
  p_status text,
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

  IF v_professional_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  IF p_status NOT IN ('eligible','paused','closed','lost') THEN
    RAISE EXCEPTION 'invalid_reactivation_status';
  END IF;

  UPDATE public.clients
  SET
    reactivation_status = p_status,
    reactivation_status_reason = NULLIF(trim(COALESCE(p_reason, '')), '')
  WHERE id = p_client_id
    AND professional_id = v_professional_id
    AND deleted_at IS NULL
  RETURNING * INTO v_client;

  IF v_client.id IS NULL THEN
    RAISE EXCEPTION 'client_not_found';
  END IF;

  PERFORM public.log_audit_event(
    v_professional_id,
    'professional',
    'client.reactivation_status.changed',
    'client',
    v_client.id,
    jsonb_build_object('status', p_status, 'reason', p_reason)
  );

  RETURN jsonb_build_object('ok', true, 'client_id', v_client.id, 'reactivation_status', v_client.reactivation_status);
END;
$$;

CREATE OR REPLACE FUNCTION public.create_campaign(
  p_name text,
  p_segment_type text,
  p_message_template text,
  p_scheduled_at timestamptz DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_professional_id uuid;
  v_campaign public.campaigns%ROWTYPE;
BEGIN
  v_professional_id := public.auth_professional_id();

  IF v_professional_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  IF length(trim(COALESCE(p_name, ''))) = 0 THEN
    RAISE EXCEPTION 'campaign_name_required';
  END IF;

  IF length(trim(COALESCE(p_message_template, ''))) = 0 THEN
    RAISE EXCEPTION 'campaign_message_required';
  END IF;

  INSERT INTO public.campaigns (
    professional_id,
    name,
    segment_type,
    message_template,
    status,
    scheduled_at,
    created_by
  )
  VALUES (
    v_professional_id,
    trim(p_name),
    trim(COALESCE(p_segment_type, 'manual')),
    trim(p_message_template),
    CASE WHEN p_scheduled_at IS NULL THEN 'draft' ELSE 'scheduled' END,
    p_scheduled_at,
    auth.uid()
  )
  RETURNING * INTO v_campaign;

  PERFORM public.log_audit_event(
    v_professional_id,
    'professional',
    'campaign.created',
    'campaign',
    v_campaign.id,
    jsonb_build_object('segment_type', v_campaign.segment_type, 'status', v_campaign.status)
  );

  RETURN jsonb_build_object('ok', true, 'campaign_id', v_campaign.id, 'status', v_campaign.status);
END;
$$;

CREATE OR REPLACE FUNCTION public.schedule_campaign(
  p_campaign_id uuid,
  p_scheduled_at timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_professional_id uuid;
  v_campaign public.campaigns%ROWTYPE;
BEGIN
  v_professional_id := public.auth_professional_id();

  IF v_professional_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  IF p_scheduled_at IS NULL OR p_scheduled_at <= now() THEN
    RAISE EXCEPTION 'scheduled_at_must_be_future';
  END IF;

  UPDATE public.campaigns
  SET status = 'scheduled',
      scheduled_at = p_scheduled_at
  WHERE id = p_campaign_id
    AND professional_id = v_professional_id
    AND status IN ('draft','scheduled')
  RETURNING * INTO v_campaign;

  IF v_campaign.id IS NULL THEN
    RAISE EXCEPTION 'campaign_not_found_or_not_schedulable';
  END IF;

  PERFORM public.log_audit_event(
    v_professional_id,
    'professional',
    'campaign.scheduled',
    'campaign',
    v_campaign.id,
    jsonb_build_object('scheduled_at', p_scheduled_at)
  );

  RETURN jsonb_build_object('ok', true, 'campaign_id', v_campaign.id, 'status', v_campaign.status);
END;
$$;

CREATE OR REPLACE FUNCTION public.cancel_campaign(
  p_campaign_id uuid,
  p_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_professional_id uuid;
  v_campaign public.campaigns%ROWTYPE;
BEGIN
  v_professional_id := public.auth_professional_id();

  IF v_professional_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  UPDATE public.campaigns
  SET status = 'cancelled',
      metadata = jsonb_set(COALESCE(metadata, '{}'), '{cancel_reason}', to_jsonb(NULLIF(trim(COALESCE(p_reason, '')), '')), true)
  WHERE id = p_campaign_id
    AND professional_id = v_professional_id
    AND status IN ('draft','scheduled','failed')
  RETURNING * INTO v_campaign;

  IF v_campaign.id IS NULL THEN
    RAISE EXCEPTION 'campaign_not_found_or_not_cancellable';
  END IF;

  PERFORM public.log_audit_event(
    v_professional_id,
    'professional',
    'campaign.cancelled',
    'campaign',
    v_campaign.id,
    jsonb_build_object('reason', p_reason)
  );

  RETURN jsonb_build_object('ok', true, 'campaign_id', v_campaign.id, 'status', v_campaign.status);
END;
$$;

CREATE OR REPLACE FUNCTION public.calculate_rfm_for_professional(
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

  IF v_professional_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

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
      count(s.id)::integer AS session_count,
      COALESCE(sum(ft.net_amount) FILTER (
        WHERE ft.type = 'receita' AND ft.status = 'pago'
      ), 0)::numeric AS paid_total
    FROM batch b
    LEFT JOIN public.sessions s
      ON s.client_id = b.client_id
     AND s.professional_id = v_professional_id
     AND s.deleted_at IS NULL
    LEFT JOIN public.financial_transactions ft
      ON ft.client_id = b.client_id
     AND ft.professional_id = v_professional_id
     AND ft.status = 'pago'
     AND ft.type = 'receita'
    GROUP BY b.client_id
  ),
  scored AS (
    SELECT
      client_id,
      CASE
        WHEN last_session_at IS NULL THEN 1
        WHEN now() - last_session_at <= interval '30 days' THEN 5
        WHEN now() - last_session_at <= interval '60 days' THEN 4
        WHEN now() - last_session_at <= interval '90 days' THEN 3
        WHEN now() - last_session_at <= interval '180 days' THEN 2
        ELSE 1
      END AS recency_score,
      CASE
        WHEN session_count >= 10 THEN 5
        WHEN session_count >= 5 THEN 4
        WHEN session_count >= 3 THEN 3
        WHEN session_count >= 1 THEN 2
        ELSE 1
      END AS frequency_score,
      CASE
        WHEN paid_total >= 5000 THEN 5
        WHEN paid_total >= 2000 THEN 4
        WHEN paid_total >= 1000 THEN 3
        WHEN paid_total >= 100 THEN 2
        ELSE 1
      END AS monetary_score,
      last_session_at,
      session_count,
      paid_total
    FROM metrics
  ),
  upserted AS (
    INSERT INTO public.rfm_scores (
      professional_id,
      client_id,
      recency_score,
      frequency_score,
      monetary_score,
      rfm_code,
      segment,
      calculated_at,
      metadata
    )
    SELECT
      v_professional_id,
      client_id,
      recency_score,
      frequency_score,
      monetary_score,
      recency_score::text || frequency_score::text || monetary_score::text,
      CASE
        WHEN recency_score >= 4 AND frequency_score >= 4 AND monetary_score >= 4 THEN 'champions'
        WHEN recency_score <= 2 AND frequency_score >= 3 THEN 'at_risk'
        WHEN recency_score <= 2 THEN 'inactive'
        WHEN frequency_score <= 2 THEN 'new_or_low_frequency'
        ELSE 'regular'
      END,
      now(),
      jsonb_build_object(
        'last_session_at', last_session_at,
        'session_count', session_count,
        'paid_total', paid_total
      )
    FROM scored
    ON CONFLICT (professional_id, client_id) DO UPDATE
    SET recency_score = EXCLUDED.recency_score,
        frequency_score = EXCLUDED.frequency_score,
        monetary_score = EXCLUDED.monetary_score,
        rfm_code = EXCLUDED.rfm_code,
        segment = EXCLUDED.segment,
        calculated_at = EXCLUDED.calculated_at,
        metadata = EXCLUDED.metadata
    RETURNING client_id
  )
  SELECT count(*)::integer, max(client_id)
  INTO v_processed, v_next_cursor
  FROM upserted;

  PERFORM public.log_audit_event(
    v_professional_id,
    'cron',
    'client.rfm.recalculated',
    'rfm_scores',
    NULL,
    jsonb_build_object('processed', COALESCE(v_processed, 0), 'next_cursor', v_next_cursor)
  );

  RETURN jsonb_build_object(
    'ok', true,
    'processed', COALESCE(v_processed, 0),
    'next_cursor', v_next_cursor
  );
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

  IF v_professional_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

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
      max(ft.paid_at) FILTER (WHERE ft.status = 'pago' AND ft.type = 'receita') AS last_payment_at,
      (
        SELECT s2.nps_score
        FROM public.sessions s2
        WHERE s2.professional_id = v_professional_id
          AND s2.client_id = b.client_id
          AND s2.nps_score IS NOT NULL
          AND s2.deleted_at IS NULL
        ORDER BY COALESCE(s2.nps_responded_at, s2.session_date) DESC
        LIMIT 1
      ) AS last_nps_score,
      count(s.id)::integer AS session_count,
      COALESCE(sum(ft.net_amount) FILTER (
        WHERE ft.status = 'pago' AND ft.type = 'receita'
      ), 0)::numeric AS paid_total
    FROM batch b
    LEFT JOIN public.sessions s
      ON s.professional_id = v_professional_id
     AND s.client_id = b.client_id
     AND s.deleted_at IS NULL
    LEFT JOIN public.financial_transactions ft
      ON ft.professional_id = v_professional_id
     AND ft.client_id = b.client_id
     AND ft.status = 'pago'
     AND ft.type = 'receita'
    GROUP BY b.client_id
  ),
  scored AS (
    SELECT
      client_id,
      last_session_at,
      last_payment_at,
      last_nps_score,
      session_count,
      paid_total,
      LEAST(
        100,
        GREATEST(
          0,
          (CASE
            WHEN last_session_at IS NULL THEN 0
            WHEN now() - last_session_at <= interval '30 days' THEN 40
            WHEN now() - last_session_at <= interval '60 days' THEN 30
            WHEN now() - last_session_at <= interval '90 days' THEN 20
            WHEN now() - last_session_at <= interval '180 days' THEN 10
            ELSE 0
          END)
          + LEAST(session_count * 5, 25)
          + (CASE
            WHEN last_nps_score IS NULL THEN 10
            WHEN last_nps_score >= 4 THEN 20
            WHEN last_nps_score = 3 THEN 10
            ELSE 0
          END)
          + (CASE WHEN paid_total > 0 THEN 15 ELSE 0 END)
        )
      )::integer AS score
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
      last_nps_score,
      signals,
      calculated_at
    )
    SELECT
      v_professional_id,
      client_id,
      score,
      CASE
        WHEN score >= 80 THEN 'healthy'
        WHEN score >= 50 THEN 'attention'
        WHEN score >= 20 THEN 'risk'
        ELSE 'churn'
      END,
      last_session_at,
      last_payment_at,
      last_nps_score,
      jsonb_build_object(
        'session_count', session_count,
        'paid_total', paid_total,
        'formula_version', 'phase8_v1'
      ),
      now()
    FROM scored
    ON CONFLICT (professional_id, client_id) DO UPDATE
    SET score = EXCLUDED.score,
        risk_level = EXCLUDED.risk_level,
        last_session_at = EXCLUDED.last_session_at,
        last_payment_at = EXCLUDED.last_payment_at,
        last_nps_score = EXCLUDED.last_nps_score,
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
    jsonb_build_object('processed', COALESCE(v_processed, 0), 'next_cursor', v_next_cursor)
  );

  RETURN jsonb_build_object(
    'ok', true,
    'processed', COALESCE(v_processed, 0),
    'next_cursor', v_next_cursor
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.create_or_get_referral_link(
  p_client_id uuid,
  p_expires_at timestamptz DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_professional_id uuid;
  v_client_id uuid;
  v_link public.referral_links%ROWTYPE;
  v_code text;
BEGIN
  v_professional_id := public.auth_professional_id();

  IF v_professional_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  SELECT id INTO v_client_id
  FROM public.clients
  WHERE id = p_client_id
    AND professional_id = v_professional_id
    AND deleted_at IS NULL;

  IF v_client_id IS NULL THEN
    RAISE EXCEPTION 'client_not_found';
  END IF;

  SELECT * INTO v_link
  FROM public.referral_links
  WHERE professional_id = v_professional_id
    AND client_id = v_client_id
    AND type = 'client_to_client'
    AND status = 'active'
    AND (expires_at IS NULL OR expires_at > now())
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_link.id IS NULL THEN
    LOOP
      v_code := upper(substr(encode(gen_random_bytes(8), 'hex'), 1, 10));
      EXIT WHEN NOT EXISTS (SELECT 1 FROM public.referral_links WHERE code = v_code);
    END LOOP;

    INSERT INTO public.referral_links (
      professional_id,
      client_id,
      code,
      expires_at
    )
    VALUES (
      v_professional_id,
      v_client_id,
      v_code,
      p_expires_at
    )
    RETURNING * INTO v_link;
  END IF;

  INSERT INTO public.referral_events (
    professional_id,
    referral_link_id,
    referrer_client_id,
    event_type,
    payload
  )
  VALUES (
    v_professional_id,
    v_link.id,
    v_client_id,
    'requested',
    jsonb_build_object('source', 'crm')
  );

  RETURN jsonb_build_object('ok', true, 'referral_link_id', v_link.id, 'code', v_link.code);
END;
$$;

CREATE OR REPLACE FUNCTION public.register_referral_event(
  p_referral_code text,
  p_event_type text,
  p_referred_client_id uuid DEFAULT NULL,
  p_payload jsonb DEFAULT '{}'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_link public.referral_links%ROWTYPE;
  v_referred_client_id uuid;
  v_event public.referral_events%ROWTYPE;
BEGIN
  IF p_event_type NOT IN ('requested','lead_created','booked','attended','reward_delivered') THEN
    RAISE EXCEPTION 'invalid_referral_event_type';
  END IF;

  SELECT * INTO v_link
  FROM public.referral_links
  WHERE code = upper(trim(COALESCE(p_referral_code, '')))
    AND type = 'client_to_client'
    AND status = 'active'
    AND (expires_at IS NULL OR expires_at > now())
  LIMIT 1;

  IF v_link.id IS NULL THEN
    RAISE EXCEPTION 'referral_link_not_found';
  END IF;

  IF p_referred_client_id IS NOT NULL THEN
    SELECT id INTO v_referred_client_id
    FROM public.clients
    WHERE id = p_referred_client_id
      AND professional_id = v_link.professional_id
      AND deleted_at IS NULL;

    IF v_referred_client_id IS NULL THEN
      RAISE EXCEPTION 'referred_client_not_found';
    END IF;

    IF v_referred_client_id = v_link.client_id THEN
      RAISE EXCEPTION 'self_referral_not_allowed';
    END IF;
  END IF;

  INSERT INTO public.referral_events (
    professional_id,
    referral_link_id,
    referrer_client_id,
    referred_client_id,
    event_type,
    payload
  )
  VALUES (
    v_link.professional_id,
    v_link.id,
    v_link.client_id,
    v_referred_client_id,
    p_event_type,
    COALESCE(p_payload, '{}')
  )
  RETURNING * INTO v_event;

  RETURN jsonb_build_object('ok', true, 'referral_event_id', v_event.id);
END;
$$;

REVOKE ALL ON FUNCTION public.set_client_whatsapp_opt_out(uuid, boolean, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.set_client_reactivation_status(uuid, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.create_campaign(text, text, text, timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.schedule_campaign(uuid, timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.cancel_campaign(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.calculate_rfm_for_professional(uuid, integer, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.calculate_client_health_for_professional(uuid, integer, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.create_or_get_referral_link(uuid, timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.register_referral_event(text, text, uuid, jsonb) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.set_client_whatsapp_opt_out(uuid, boolean, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_client_reactivation_status(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_campaign(text, text, text, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.schedule_campaign(uuid, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_campaign(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.calculate_rfm_for_professional(uuid, integer, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.calculate_client_health_for_professional(uuid, integer, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.create_or_get_referral_link(uuid, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.register_referral_event(text, text, uuid, jsonb) TO authenticated, service_role;

-- ROLLBACK (documented):
-- DROP FUNCTION IF EXISTS public.register_referral_event(text, text, uuid, jsonb);
-- DROP FUNCTION IF EXISTS public.create_or_get_referral_link(uuid, timestamptz);
-- DROP FUNCTION IF EXISTS public.calculate_client_health_for_professional(uuid, integer, uuid);
-- DROP FUNCTION IF EXISTS public.calculate_rfm_for_professional(uuid, integer, uuid);
-- DROP FUNCTION IF EXISTS public.cancel_campaign(uuid, text);
-- DROP FUNCTION IF EXISTS public.schedule_campaign(uuid, timestamptz);
-- DROP FUNCTION IF EXISTS public.create_campaign(text, text, text, timestamptz);
-- DROP FUNCTION IF EXISTS public.set_client_reactivation_status(uuid, text, text);
-- DROP FUNCTION IF EXISTS public.set_client_whatsapp_opt_out(uuid, boolean, text);
-- DROP TABLE IF EXISTS public.referral_events;
-- DROP TABLE IF EXISTS public.referral_links;
-- DROP TABLE IF EXISTS public.campaign_dispatches;
-- DROP TABLE IF EXISTS public.campaign_recipients;
-- DROP TABLE IF EXISTS public.campaigns;
-- DROP TABLE IF EXISTS public.client_health_scores;
-- DROP TABLE IF EXISTS public.rfm_scores;
-- ALTER TABLE public.clients
--   DROP COLUMN IF EXISTS reactivation_status_reason,
--   DROP COLUMN IF EXISTS reactivation_status,
--   DROP COLUMN IF EXISTS whatsapp_opt_out_at,
--   DROP COLUMN IF EXISTS whatsapp_opt_out;
