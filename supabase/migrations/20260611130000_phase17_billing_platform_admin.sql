-- Phase 17 - Billing SaaS, platform admin, credits, Nexus, agents and feature requests.
-- Rollback: drop functions/triggers/tables created here in reverse dependency order and restore
-- professionals.plan_type CHECK to ('trial','individual','equipe','team','enterprise').

ALTER TABLE public.professionals
  DROP CONSTRAINT IF EXISTS professionals_plan_type_check;

ALTER TABLE public.professionals
  ADD CONSTRAINT professionals_plan_type_check
  CHECK (plan_type IN ('trial','individual','equipe','team','enterprise','free_internal'));

CREATE TABLE public.platform_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE CHECK (slug IN ('trial','individual','equipe','team','enterprise','free_internal')),
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  monthly_price_cents integer NOT NULL DEFAULT 0 CHECK (monthly_price_cents >= 0),
  annual_price_cents integer NOT NULL DEFAULT 0 CHECK (annual_price_cents >= 0),
  included_ai_credits integer NOT NULL DEFAULT 0 CHECK (included_ai_credits >= 0),
  client_limit integer,
  team_limit integer,
  is_public boolean NOT NULL DEFAULT true,
  is_active boolean NOT NULL DEFAULT true,
  metadata jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.platform_billing_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id uuid REFERENCES public.platform_plans(id) ON DELETE RESTRICT,
  product_type text NOT NULL CHECK (product_type IN ('subscription','credits')),
  slug text NOT NULL UNIQUE,
  stripe_product_id text,
  stripe_price_id text,
  billing_cycle text CHECK (billing_cycle IN ('monthly','annual','one_time')),
  credits_amount integer NOT NULL DEFAULT 0 CHECK (credits_amount >= 0),
  amount_cents integer NOT NULL DEFAULT 0 CHECK (amount_cents >= 0),
  currency text NOT NULL DEFAULT 'brl',
  is_active boolean NOT NULL DEFAULT true,
  metadata jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.professional_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  professional_id uuid NOT NULL REFERENCES public.professionals(id) ON DELETE RESTRICT,
  plan_id uuid NOT NULL REFERENCES public.platform_plans(id) ON DELETE RESTRICT,
  status text NOT NULL CHECK (status IN ('trialing','active','past_due','cancelled','read_only','churned','free_internal')),
  source text NOT NULL CHECK (source IN ('stripe','admin','system')),
  stripe_customer_id text,
  stripe_subscription_id text UNIQUE,
  trial_started_at timestamptz,
  trial_ends_at timestamptz,
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean NOT NULL DEFAULT false,
  readonly_since timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (professional_id)
);

CREATE TABLE public.subscription_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  professional_id uuid NOT NULL REFERENCES public.professionals(id) ON DELETE RESTRICT,
  subscription_id uuid REFERENCES public.professional_subscriptions(id) ON DELETE RESTRICT,
  event_type text NOT NULL,
  from_status text,
  to_status text,
  from_plan_slug text,
  to_plan_slug text,
  source text NOT NULL CHECK (source IN ('stripe','admin','system')),
  external_event_id text,
  payload jsonb NOT NULL DEFAULT '{}',
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.processed_stripe_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stripe_event_id text NOT NULL UNIQUE,
  event_type text NOT NULL,
  processed_at timestamptz NOT NULL DEFAULT now(),
  payload jsonb NOT NULL DEFAULT '{}'
);

CREATE TABLE public.professional_access_states (
  professional_id uuid PRIMARY KEY REFERENCES public.professionals(id) ON DELETE RESTRICT,
  access_status text NOT NULL CHECK (access_status IN ('full','read_only','suspended')),
  reason text NOT NULL DEFAULT 'active',
  readonly_since timestamptz,
  locked_since timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}',
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.entitlement_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  professional_id uuid NOT NULL REFERENCES public.professionals(id) ON DELETE RESTRICT,
  plan_slug text NOT NULL,
  access_status text NOT NULL,
  can_write boolean NOT NULL,
  can_run_ai boolean NOT NULL,
  ai_credit_balance integer NOT NULL DEFAULT 0,
  reason text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.ai_credit_wallets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  professional_id uuid NOT NULL REFERENCES public.professionals(id) ON DELETE RESTRICT,
  wallet_type text NOT NULL CHECK (wallet_type IN ('monthly','purchased','manual')),
  balance integer NOT NULL DEFAULT 0 CHECK (balance >= 0),
  expires_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.ai_credit_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  professional_id uuid NOT NULL REFERENCES public.professionals(id) ON DELETE RESTRICT,
  wallet_id uuid REFERENCES public.ai_credit_wallets(id) ON DELETE RESTRICT,
  amount integer NOT NULL,
  transaction_type text NOT NULL CHECK (transaction_type IN ('grant','reserve','commit','release','purchase','expire','adjustment')),
  source text NOT NULL CHECK (source IN ('plan','purchase','admin','agent','system','stripe')),
  idempotency_key text,
  reason text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}',
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (idempotency_key)
);

CREATE TABLE public.ai_credit_reservations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  professional_id uuid NOT NULL REFERENCES public.professionals(id) ON DELETE RESTRICT,
  wallet_id uuid NOT NULL REFERENCES public.ai_credit_wallets(id) ON DELETE RESTRICT,
  amount integer NOT NULL CHECK (amount > 0),
  status text NOT NULL DEFAULT 'reserved' CHECK (status IN ('reserved','committed','released','expired')),
  idempotency_key text NOT NULL UNIQUE,
  reason text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.ai_usage_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  professional_id uuid NOT NULL REFERENCES public.professionals(id) ON DELETE RESTRICT,
  reservation_id uuid REFERENCES public.ai_credit_reservations(id) ON DELETE RESTRICT,
  agent_slug text NOT NULL,
  credits_used integer NOT NULL DEFAULT 0 CHECK (credits_used >= 0),
  provider text,
  model_used text,
  correlation_id text UNIQUE,
  metadata jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.admin_action_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  action_type text NOT NULL,
  target_professional_id uuid REFERENCES public.professionals(id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'proposed' CHECK (status IN ('proposed','confirmed','executed','cancelled','expired','failed')),
  payload jsonb NOT NULL DEFAULT '{}',
  reason text NOT NULL,
  confirmation_token text NOT NULL DEFAULT substring(replace(gen_random_uuid()::text, '-', '') from 1 for 8),
  proposed_by uuid NOT NULL DEFAULT auth.uid(),
  confirmed_by uuid,
  executed_by uuid,
  expires_at timestamptz NOT NULL DEFAULT now() + interval '30 minutes',
  created_at timestamptz NOT NULL DEFAULT now(),
  confirmed_at timestamptz,
  executed_at timestamptz
);

CREATE TABLE public.admin_action_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL REFERENCES public.admin_action_requests(id) ON DELETE RESTRICT,
  status text NOT NULL CHECK (status IN ('success','failed')),
  result_payload jsonb NOT NULL DEFAULT '{}',
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.platform_affiliate_partners (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  professional_id uuid NOT NULL UNIQUE REFERENCES public.professionals(id) ON DELETE RESTRICT,
  affiliate_code text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','active','rejected','suspended')),
  commission_rate numeric(5,2) NOT NULL DEFAULT 15 CHECK (commission_rate >= 0 AND commission_rate <= 100),
  pending_balance_cents integer NOT NULL DEFAULT 0 CHECK (pending_balance_cents >= 0),
  approved_by uuid,
  rejected_reason text,
  metadata jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.platform_affiliate_referrals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id uuid NOT NULL REFERENCES public.platform_affiliate_partners(id) ON DELETE RESTRICT,
  referred_professional_id uuid REFERENCES public.professionals(id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'clicked' CHECK (status IN ('clicked','registered','trial','paid','cancelled','disqualified')),
  attribution_code text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.platform_affiliate_commissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id uuid NOT NULL REFERENCES public.platform_affiliate_partners(id) ON DELETE RESTRICT,
  referral_id uuid REFERENCES public.platform_affiliate_referrals(id) ON DELETE RESTRICT,
  professional_id uuid NOT NULL REFERENCES public.professionals(id) ON DELETE RESTRICT,
  amount_cents integer NOT NULL CHECK (amount_cents >= 0),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','paid','cancelled')),
  reference_month date NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (partner_id, professional_id, reference_month)
);

CREATE TABLE public.platform_affiliate_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id uuid NOT NULL REFERENCES public.platform_affiliate_partners(id) ON DELETE RESTRICT,
  amount_cents integer NOT NULL CHECK (amount_cents >= 0),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','processing','paid','failed','cancelled')),
  reference_month date NOT NULL,
  payment_reference text,
  metadata jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  paid_at timestamptz
);

CREATE TABLE public.nexus_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_user_id uuid,
  channel text NOT NULL CHECK (channel IN ('panel','whatsapp')),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','closed')),
  metadata jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.nexus_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.nexus_conversations(id) ON DELETE RESTRICT,
  role text NOT NULL CHECK (role IN ('admin','nexus','system')),
  content text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.nexus_action_proposals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid REFERENCES public.nexus_conversations(id) ON DELETE RESTRICT,
  action_request_id uuid REFERENCES public.admin_action_requests(id) ON DELETE RESTRICT,
  action_type text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'proposed' CHECK (status IN ('proposed','confirmed','executed','cancelled','failed')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.nexus_action_executions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id uuid NOT NULL REFERENCES public.nexus_action_proposals(id) ON DELETE RESTRICT,
  status text NOT NULL CHECK (status IN ('success','failed')),
  result_payload jsonb NOT NULL DEFAULT '{}',
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.agent_registry (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_slug text NOT NULL UNIQUE,
  display_name text NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','paused','disabled')),
  owner text NOT NULL DEFAULT 'platform',
  metadata jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.agent_prompt_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id uuid NOT NULL REFERENCES public.agent_registry(id) ON DELETE RESTRICT,
  version integer NOT NULL,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','staging','active','rolled_back','archived')),
  prompt_body text NOT NULL,
  changelog text NOT NULL DEFAULT '',
  created_by uuid,
  promoted_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  promoted_at timestamptz,
  UNIQUE (agent_id, version)
);

CREATE TABLE public.agent_pause_windows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id uuid NOT NULL REFERENCES public.agent_registry(id) ON DELETE RESTRICT,
  paused_until timestamptz NOT NULL,
  reason text NOT NULL,
  created_by uuid NOT NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.feature_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  professional_id uuid NOT NULL REFERENCES public.professionals(id) ON DELETE RESTRICT,
  title text NOT NULL CHECK (char_length(title) BETWEEN 3 AND 120),
  description text NOT NULL CHECK (char_length(description) BETWEEN 3 AND 1000),
  category text NOT NULL DEFAULT 'outro',
  priority text NOT NULL DEFAULT 'nice_to_have' CHECK (priority IN ('critical','important','nice_to_have')),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','reviewing','planned','in_progress','delivered','rejected')),
  status_reason text,
  metadata jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.feature_request_votes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  feature_request_id uuid NOT NULL REFERENCES public.feature_requests(id) ON DELETE RESTRICT,
  professional_id uuid NOT NULL REFERENCES public.professionals(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (feature_request_id, professional_id)
);

CREATE TABLE public.feature_request_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  feature_request_id uuid NOT NULL REFERENCES public.feature_requests(id) ON DELETE RESTRICT,
  author_type text NOT NULL CHECK (author_type IN ('professional','admin')),
  author_id uuid,
  visibility text NOT NULL DEFAULT 'public' CHECK (visibility IN ('public','private')),
  comment text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_professional_subscriptions_professional ON public.professional_subscriptions(professional_id, status);
CREATE INDEX idx_subscription_events_professional ON public.subscription_events(professional_id, created_at DESC);
CREATE INDEX idx_ai_credit_wallets_professional ON public.ai_credit_wallets(professional_id, wallet_type);
CREATE INDEX idx_ai_credit_transactions_professional ON public.ai_credit_transactions(professional_id, created_at DESC);
CREATE INDEX idx_admin_action_requests_status ON public.admin_action_requests(status, expires_at);
CREATE INDEX idx_affiliate_referrals_partner ON public.platform_affiliate_referrals(partner_id, status);
CREATE INDEX idx_nexus_messages_conversation ON public.nexus_messages(conversation_id, created_at);
CREATE INDEX idx_feature_requests_status ON public.feature_requests(status, created_at DESC);

ALTER TABLE public.platform_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_billing_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.professional_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscription_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.processed_stripe_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.professional_access_states ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.entitlement_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_credit_wallets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_credit_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_credit_reservations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_usage_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_action_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_action_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_affiliate_partners ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_affiliate_referrals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_affiliate_commissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_affiliate_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.nexus_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.nexus_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.nexus_action_proposals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.nexus_action_executions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_registry ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_prompt_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_pause_windows ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.feature_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.feature_request_votes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.feature_request_comments ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.platform_plans FROM anon, authenticated;
REVOKE ALL ON public.platform_billing_products FROM anon, authenticated;
REVOKE ALL ON public.professional_subscriptions FROM anon, authenticated;
REVOKE ALL ON public.subscription_events FROM anon, authenticated;
REVOKE ALL ON public.processed_stripe_events FROM anon, authenticated;
REVOKE ALL ON public.professional_access_states FROM anon, authenticated;
REVOKE ALL ON public.entitlement_snapshots FROM anon, authenticated;
REVOKE ALL ON public.ai_credit_wallets FROM anon, authenticated;
REVOKE ALL ON public.ai_credit_transactions FROM anon, authenticated;
REVOKE ALL ON public.ai_credit_reservations FROM anon, authenticated;
REVOKE ALL ON public.ai_usage_events FROM anon, authenticated;
REVOKE ALL ON public.admin_action_requests FROM anon, authenticated;
REVOKE ALL ON public.admin_action_results FROM anon, authenticated;
REVOKE ALL ON public.platform_affiliate_partners FROM anon, authenticated;
REVOKE ALL ON public.platform_affiliate_referrals FROM anon, authenticated;
REVOKE ALL ON public.platform_affiliate_commissions FROM anon, authenticated;
REVOKE ALL ON public.platform_affiliate_payments FROM anon, authenticated;
REVOKE ALL ON public.nexus_conversations FROM anon, authenticated;
REVOKE ALL ON public.nexus_messages FROM anon, authenticated;
REVOKE ALL ON public.nexus_action_proposals FROM anon, authenticated;
REVOKE ALL ON public.nexus_action_executions FROM anon, authenticated;
REVOKE ALL ON public.agent_registry FROM anon, authenticated;
REVOKE ALL ON public.agent_prompt_versions FROM anon, authenticated;
REVOKE ALL ON public.agent_pause_windows FROM anon, authenticated;
REVOKE ALL ON public.feature_requests FROM anon, authenticated;
REVOKE ALL ON public.feature_request_votes FROM anon, authenticated;
REVOKE ALL ON public.feature_request_comments FROM anon, authenticated;

GRANT SELECT ON public.platform_plans TO authenticated;
GRANT SELECT ON public.platform_billing_products TO authenticated;
GRANT SELECT ON public.professional_subscriptions TO authenticated;
GRANT SELECT ON public.subscription_events TO authenticated;
GRANT SELECT ON public.professional_access_states TO authenticated;
GRANT SELECT ON public.entitlement_snapshots TO authenticated;
GRANT SELECT ON public.ai_credit_wallets TO authenticated;
GRANT SELECT ON public.ai_credit_transactions TO authenticated;
GRANT SELECT ON public.ai_credit_reservations TO authenticated;
GRANT SELECT ON public.ai_usage_events TO authenticated;
GRANT SELECT ON public.platform_affiliate_partners TO authenticated;
GRANT SELECT ON public.platform_affiliate_referrals TO authenticated;
GRANT SELECT ON public.platform_affiliate_commissions TO authenticated;
GRANT SELECT ON public.platform_affiliate_payments TO authenticated;
GRANT SELECT ON public.agent_registry TO authenticated;
GRANT SELECT ON public.agent_prompt_versions TO authenticated;
GRANT SELECT ON public.agent_pause_windows TO authenticated;
GRANT SELECT ON public.feature_requests TO authenticated;
GRANT SELECT ON public.feature_request_votes TO authenticated;
GRANT SELECT ON public.feature_request_comments TO authenticated;

CREATE POLICY "platform_plans_public_active" ON public.platform_plans
  FOR SELECT TO authenticated USING (is_active = true AND is_public = true);
CREATE POLICY "platform_billing_products_public_active" ON public.platform_billing_products
  FOR SELECT TO authenticated USING (is_active = true);

CREATE POLICY "professional_subscriptions_own_or_admin" ON public.professional_subscriptions
  FOR SELECT TO authenticated USING (professional_id = public.auth_professional_id() OR public.admin_is_master());
CREATE POLICY "subscription_events_own_or_admin" ON public.subscription_events
  FOR SELECT TO authenticated USING (professional_id = public.auth_professional_id() OR public.admin_is_master());
CREATE POLICY "access_states_own_or_admin" ON public.professional_access_states
  FOR SELECT TO authenticated USING (professional_id = public.auth_professional_id() OR public.admin_is_master());
CREATE POLICY "entitlements_own_or_admin" ON public.entitlement_snapshots
  FOR SELECT TO authenticated USING (professional_id = public.auth_professional_id() OR public.admin_is_master());
CREATE POLICY "ai_wallets_own_or_admin" ON public.ai_credit_wallets
  FOR SELECT TO authenticated USING (professional_id = public.auth_professional_id() OR public.admin_is_master());
CREATE POLICY "ai_transactions_own_or_admin" ON public.ai_credit_transactions
  FOR SELECT TO authenticated USING (professional_id = public.auth_professional_id() OR public.admin_is_master());
CREATE POLICY "ai_reservations_own_or_admin" ON public.ai_credit_reservations
  FOR SELECT TO authenticated USING (professional_id = public.auth_professional_id() OR public.admin_is_master());
CREATE POLICY "ai_usage_own_or_admin" ON public.ai_usage_events
  FOR SELECT TO authenticated USING (professional_id = public.auth_professional_id() OR public.admin_is_master());

CREATE POLICY "admin_action_requests_admin" ON public.admin_action_requests
  FOR SELECT TO authenticated USING (public.admin_is_master());
CREATE POLICY "admin_action_results_admin" ON public.admin_action_results
  FOR SELECT TO authenticated USING (public.admin_is_master());
CREATE POLICY "nexus_conversations_admin" ON public.nexus_conversations
  FOR SELECT TO authenticated USING (public.admin_is_master());
CREATE POLICY "nexus_messages_admin" ON public.nexus_messages
  FOR SELECT TO authenticated USING (public.admin_is_master());
CREATE POLICY "nexus_proposals_admin" ON public.nexus_action_proposals
  FOR SELECT TO authenticated USING (public.admin_is_master());
CREATE POLICY "nexus_executions_admin" ON public.nexus_action_executions
  FOR SELECT TO authenticated USING (public.admin_is_master());

CREATE POLICY "affiliate_partners_own_or_admin" ON public.platform_affiliate_partners
  FOR SELECT TO authenticated USING (professional_id = public.auth_professional_id() OR public.admin_is_master());
CREATE POLICY "affiliate_referrals_own_or_admin" ON public.platform_affiliate_referrals
  FOR SELECT TO authenticated USING (public.admin_is_master() OR partner_id IN (SELECT id FROM public.platform_affiliate_partners WHERE professional_id = public.auth_professional_id()));
CREATE POLICY "affiliate_commissions_own_or_admin" ON public.platform_affiliate_commissions
  FOR SELECT TO authenticated USING (public.admin_is_master() OR partner_id IN (SELECT id FROM public.platform_affiliate_partners WHERE professional_id = public.auth_professional_id()));
CREATE POLICY "affiliate_payments_own_or_admin" ON public.platform_affiliate_payments
  FOR SELECT TO authenticated USING (public.admin_is_master() OR partner_id IN (SELECT id FROM public.platform_affiliate_partners WHERE professional_id = public.auth_professional_id()));

CREATE POLICY "agent_registry_admin" ON public.agent_registry FOR SELECT TO authenticated USING (public.admin_is_master());
CREATE POLICY "agent_prompt_versions_admin" ON public.agent_prompt_versions FOR SELECT TO authenticated USING (public.admin_is_master());
CREATE POLICY "agent_pause_windows_admin" ON public.agent_pause_windows FOR SELECT TO authenticated USING (public.admin_is_master());

CREATE POLICY "feature_requests_public_read" ON public.feature_requests FOR SELECT TO authenticated USING (true);
CREATE POLICY "feature_votes_public_read" ON public.feature_request_votes FOR SELECT TO authenticated USING (true);
CREATE POLICY "feature_comments_public_read" ON public.feature_request_comments FOR SELECT TO authenticated USING (visibility = 'public' OR public.admin_is_master());

CREATE TRIGGER prevent_subscription_events_change BEFORE UPDATE OR DELETE ON public.subscription_events FOR EACH ROW EXECUTE FUNCTION public.fn_log_immutable();
CREATE TRIGGER prevent_processed_stripe_events_change BEFORE UPDATE OR DELETE ON public.processed_stripe_events FOR EACH ROW EXECUTE FUNCTION public.fn_log_immutable();
CREATE TRIGGER prevent_entitlement_snapshots_change BEFORE UPDATE OR DELETE ON public.entitlement_snapshots FOR EACH ROW EXECUTE FUNCTION public.fn_log_immutable();
CREATE TRIGGER prevent_ai_credit_transactions_change BEFORE UPDATE OR DELETE ON public.ai_credit_transactions FOR EACH ROW EXECUTE FUNCTION public.fn_log_immutable();
CREATE TRIGGER prevent_ai_usage_events_change BEFORE UPDATE OR DELETE ON public.ai_usage_events FOR EACH ROW EXECUTE FUNCTION public.fn_log_immutable();
CREATE TRIGGER prevent_admin_action_results_change BEFORE UPDATE OR DELETE ON public.admin_action_results FOR EACH ROW EXECUTE FUNCTION public.fn_log_immutable();
CREATE TRIGGER prevent_nexus_messages_change BEFORE UPDATE OR DELETE ON public.nexus_messages FOR EACH ROW EXECUTE FUNCTION public.fn_log_immutable();
CREATE TRIGGER prevent_nexus_action_executions_change BEFORE UPDATE OR DELETE ON public.nexus_action_executions FOR EACH ROW EXECUTE FUNCTION public.fn_log_immutable();

CREATE TRIGGER set_platform_plans_updated_at BEFORE UPDATE ON public.platform_plans FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER set_platform_billing_products_updated_at BEFORE UPDATE ON public.platform_billing_products FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER set_professional_subscriptions_updated_at BEFORE UPDATE ON public.professional_subscriptions FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER set_ai_credit_wallets_updated_at BEFORE UPDATE ON public.ai_credit_wallets FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER set_affiliate_partners_updated_at BEFORE UPDATE ON public.platform_affiliate_partners FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER set_affiliate_referrals_updated_at BEFORE UPDATE ON public.platform_affiliate_referrals FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER set_nexus_conversations_updated_at BEFORE UPDATE ON public.nexus_conversations FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER set_agent_registry_updated_at BEFORE UPDATE ON public.agent_registry FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER set_feature_requests_updated_at BEFORE UPDATE ON public.feature_requests FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

INSERT INTO public.platform_plans (slug, name, description, monthly_price_cents, annual_price_cents, included_ai_credits, client_limit, team_limit, is_public, metadata)
VALUES
  ('trial', 'Trial', 'Acesso completo por 14 dias.', 0, 0, 1200, NULL, 1, false, '{"trial_days":14}'),
  ('individual', 'Individual', 'Para profissional solo.', 9700, 97000, 1200, 300, 1, true, '{}'),
  ('equipe', 'Equipe', 'Para pequenas equipes.', 19700, 197000, 4500, 2000, 3, true, '{}'),
  ('team', 'Team', 'Para clinicas em crescimento.', 39700, 397000, 13000, 10000, 10, true, '{}'),
  ('enterprise', 'Enterprise', 'Operacao personalizada.', 0, 0, 30000, NULL, NULL, true, '{"contact_sales":true}'),
  ('free_internal', 'Free internal', 'Plano interno concedido manualmente.', 0, 0, 400, 300, 1, false, '{}')
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  monthly_price_cents = EXCLUDED.monthly_price_cents,
  annual_price_cents = EXCLUDED.annual_price_cents,
  included_ai_credits = EXCLUDED.included_ai_credits,
  client_limit = EXCLUDED.client_limit,
  team_limit = EXCLUDED.team_limit,
  is_public = EXCLUDED.is_public,
  metadata = EXCLUDED.metadata;

INSERT INTO public.platform_billing_products (plan_id, product_type, slug, billing_cycle, credits_amount, amount_cents, metadata)
SELECT id, 'subscription', slug || '_monthly', 'monthly', included_ai_credits, monthly_price_cents, '{}'::jsonb
FROM public.platform_plans
WHERE slug IN ('individual','equipe','team')
ON CONFLICT (slug) DO NOTHING;

INSERT INTO public.platform_billing_products (product_type, slug, billing_cycle, credits_amount, amount_cents, metadata)
VALUES
  ('credits', 'credits_600', 'one_time', 600, 3900, '{}'),
  ('credits', 'credits_2400', 'one_time', 2400, 12900, '{}'),
  ('credits', 'credits_5000', 'one_time', 5000, 24900, '{}')
ON CONFLICT (slug) DO NOTHING;

CREATE OR REPLACE FUNCTION public.phase17_current_professional_id(p_professional_id uuid DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_professional_id uuid;
BEGIN
  IF COALESCE(auth.role(), '') = 'service_role' THEN
    RETURN p_professional_id;
  END IF;
  v_professional_id := public.auth_professional_id();
  RETURN COALESCE(p_professional_id, v_professional_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.platform_refresh_access_state(p_professional_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_professional public.professionals%ROWTYPE;
  v_subscription public.professional_subscriptions%ROWTYPE;
  v_access_status text := 'full';
  v_reason text := 'active';
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role' THEN
    PERFORM public.admin_assert_master();
  END IF;

  SELECT * INTO v_professional
  FROM public.professionals
  WHERE id = p_professional_id;

  IF v_professional.id IS NULL THEN RAISE EXCEPTION 'professional_not_found'; END IF;

  SELECT * INTO v_subscription
  FROM public.professional_subscriptions
  WHERE professional_id = p_professional_id;

  IF v_professional.plan_type = 'free_internal' THEN
    v_access_status := 'full';
    v_reason := 'free_internal';
  ELSIF v_subscription.status IN ('active','trialing','free_internal') THEN
    v_access_status := 'full';
    v_reason := v_subscription.status;
  ELSIF v_professional.plan_type = 'trial' AND v_professional.trial_ends_at IS NOT NULL AND v_professional.trial_ends_at < now() THEN
    v_access_status := 'read_only';
    v_reason := 'trial_expired';
  ELSIF v_subscription.status IN ('past_due','read_only','cancelled','churned') THEN
    v_access_status := 'read_only';
    v_reason := v_subscription.status;
  END IF;

  INSERT INTO public.professional_access_states (professional_id, access_status, reason, readonly_since, metadata)
  VALUES (
    p_professional_id,
    v_access_status,
    v_reason,
    CASE WHEN v_access_status = 'read_only' THEN now() ELSE NULL END,
    jsonb_build_object('plan_type', v_professional.plan_type)
  )
  ON CONFLICT (professional_id) DO UPDATE SET
    access_status = EXCLUDED.access_status,
    reason = EXCLUDED.reason,
    readonly_since = CASE
      WHEN EXCLUDED.access_status = 'read_only' THEN COALESCE(public.professional_access_states.readonly_since, now())
      ELSE NULL
    END,
    metadata = EXCLUDED.metadata,
    updated_at = now();

  RETURN jsonb_build_object('professional_id', p_professional_id, 'access_status', v_access_status, 'reason', v_reason);
END;
$$;

CREATE OR REPLACE FUNCTION public.platform_can_write(p_professional_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_access text;
  v_plan text;
  v_trial_ends_at timestamptz;
BEGIN
  SELECT access_status INTO v_access
  FROM public.professional_access_states
  WHERE professional_id = p_professional_id;

  IF v_access IN ('read_only','suspended') THEN
    RETURN false;
  END IF;

  SELECT plan_type, trial_ends_at INTO v_plan, v_trial_ends_at
  FROM public.professionals
  WHERE id = p_professional_id;

  IF v_plan = 'trial' AND v_trial_ends_at IS NOT NULL AND v_trial_ends_at < now() THEN
    RETURN false;
  END IF;

  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.enforce_professional_write_access()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_professional_id uuid;
BEGIN
  IF COALESCE(auth.role(), '') = 'service_role' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  v_professional_id := COALESCE(NEW.professional_id, OLD.professional_id);
  IF v_professional_id IS NOT NULL AND NOT public.platform_can_write(v_professional_id) THEN
    RAISE EXCEPTION 'read_only_access';
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS enforce_clients_write_access ON public.clients;
CREATE TRIGGER enforce_clients_write_access BEFORE INSERT OR UPDATE OR DELETE ON public.clients FOR EACH ROW EXECUTE FUNCTION public.enforce_professional_write_access();
DROP TRIGGER IF EXISTS enforce_services_write_access ON public.services;
CREATE TRIGGER enforce_services_write_access BEFORE INSERT OR UPDATE OR DELETE ON public.services FOR EACH ROW EXECUTE FUNCTION public.enforce_professional_write_access();
DROP TRIGGER IF EXISTS enforce_appointments_write_access ON public.appointments;
CREATE TRIGGER enforce_appointments_write_access BEFORE INSERT OR UPDATE OR DELETE ON public.appointments FOR EACH ROW EXECUTE FUNCTION public.enforce_professional_write_access();
DROP TRIGGER IF EXISTS enforce_sessions_write_access ON public.sessions;
CREATE TRIGGER enforce_sessions_write_access BEFORE INSERT OR UPDATE OR DELETE ON public.sessions FOR EACH ROW EXECUTE FUNCTION public.enforce_professional_write_access();
DROP TRIGGER IF EXISTS enforce_financial_transactions_write_access ON public.financial_transactions;
CREATE TRIGGER enforce_financial_transactions_write_access BEFORE INSERT OR UPDATE OR DELETE ON public.financial_transactions FOR EACH ROW EXECUTE FUNCTION public.enforce_professional_write_access();
DROP TRIGGER IF EXISTS enforce_client_packages_write_access ON public.client_packages;
CREATE TRIGGER enforce_client_packages_write_access BEFORE INSERT OR UPDATE OR DELETE ON public.client_packages FOR EACH ROW EXECUTE FUNCTION public.enforce_professional_write_access();
DROP TRIGGER IF EXISTS enforce_conversations_write_access ON public.conversations;
CREATE TRIGGER enforce_conversations_write_access BEFORE INSERT OR UPDATE OR DELETE ON public.conversations FOR EACH ROW EXECUTE FUNCTION public.enforce_professional_write_access();

CREATE OR REPLACE FUNCTION public.get_platform_plans()
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT COALESCE(jsonb_agg(to_jsonb(p) ORDER BY p.monthly_price_cents), '[]'::jsonb)
  FROM public.platform_plans p
  WHERE p.is_active = true AND p.is_public = true;
$$;

CREATE OR REPLACE FUNCTION public.get_my_subscription_state()
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
    'subscription', COALESCE((
      SELECT to_jsonb(s) || jsonb_build_object('plan', to_jsonb(p))
      FROM public.professional_subscriptions s
      JOIN public.platform_plans p ON p.id = s.plan_id
      WHERE s.professional_id = v_professional_id
    ), '{}'::jsonb),
    'access', COALESCE((SELECT to_jsonb(a) FROM public.professional_access_states a WHERE a.professional_id = v_professional_id), '{}'::jsonb),
    'credits', COALESCE((SELECT SUM(balance)::integer FROM public.ai_credit_wallets WHERE professional_id = v_professional_id AND (expires_at IS NULL OR expires_at > now())), 0)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_my_entitlements()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_professional_id uuid;
  v_plan text;
  v_trial_ends_at timestamptz;
  v_access text;
  v_credits integer;
  v_payload jsonb;
BEGIN
  v_professional_id := public.auth_professional_id();
  IF v_professional_id IS NULL THEN RAISE EXCEPTION 'Unauthorized'; END IF;

  SELECT plan_type, trial_ends_at INTO v_plan, v_trial_ends_at FROM public.professionals WHERE id = v_professional_id;
  SELECT COALESCE(access_status, 'full') INTO v_access FROM public.professional_access_states WHERE professional_id = v_professional_id;
  v_access := COALESCE(v_access, 'full');
  IF v_plan = 'trial' AND v_trial_ends_at IS NOT NULL AND v_trial_ends_at < now() THEN
    v_access := 'read_only';
  END IF;
  SELECT COALESCE(SUM(balance), 0)::integer INTO v_credits
  FROM public.ai_credit_wallets
  WHERE professional_id = v_professional_id
    AND (expires_at IS NULL OR expires_at > now());

  v_payload := jsonb_build_object(
    'plan_slug', v_plan,
    'access_status', v_access,
    'can_write', v_access = 'full',
    'can_run_ai', v_access = 'full' AND v_credits > 0,
    'ai_credit_balance', v_credits
  );

  INSERT INTO public.entitlement_snapshots (professional_id, plan_slug, access_status, can_write, can_run_ai, ai_credit_balance, reason, payload)
  VALUES (v_professional_id, v_plan, v_access, v_access = 'full', v_access = 'full' AND v_credits > 0, v_credits, v_access, v_payload);

  RETURN v_payload;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_grant_free_internal(
  p_professional_id uuid,
  p_reason text,
  p_expires_at timestamptz DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_admin_id uuid;
  v_plan_id uuid;
  v_subscription_id uuid;
BEGIN
  v_admin_id := public.admin_assert_master();
  IF NULLIF(trim(COALESCE(p_reason, '')), '') IS NULL THEN RAISE EXCEPTION 'reason_required'; END IF;

  SELECT id INTO v_plan_id FROM public.platform_plans WHERE slug = 'free_internal';
  IF v_plan_id IS NULL THEN RAISE EXCEPTION 'free_internal_plan_missing'; END IF;

  UPDATE public.professionals
  SET plan_type = 'free_internal',
      updated_at = now()
  WHERE id = p_professional_id
  RETURNING id INTO v_subscription_id;
  IF v_subscription_id IS NULL THEN RAISE EXCEPTION 'professional_not_found'; END IF;

  INSERT INTO public.professional_subscriptions (professional_id, plan_id, status, source, current_period_start, current_period_end, metadata)
  VALUES (p_professional_id, v_plan_id, 'free_internal', 'admin', now(), p_expires_at, jsonb_build_object('reason', p_reason))
  ON CONFLICT (professional_id) DO UPDATE SET
    plan_id = EXCLUDED.plan_id,
    status = 'free_internal',
    source = 'admin',
    current_period_start = EXCLUDED.current_period_start,
    current_period_end = EXCLUDED.current_period_end,
    metadata = EXCLUDED.metadata,
    updated_at = now()
  RETURNING id INTO v_subscription_id;

  INSERT INTO public.subscription_events (professional_id, subscription_id, event_type, to_status, to_plan_slug, source, payload, created_by)
  VALUES (p_professional_id, v_subscription_id, 'admin.free_internal.granted', 'free_internal', 'free_internal', 'admin', jsonb_build_object('reason', p_reason), auth.uid());

  PERFORM public.platform_refresh_access_state(p_professional_id);

  PERFORM public.log_audit_event(p_professional_id, 'admin', 'admin.free_internal.granted', 'professional', p_professional_id, jsonb_build_object('admin_id', v_admin_id, 'reason', p_reason));

  RETURN jsonb_build_object('ok', true, 'professional_id', p_professional_id, 'plan_type', 'free_internal');
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_add_ai_credits(
  p_professional_id uuid,
  p_amount integer,
  p_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_admin_id uuid;
  v_wallet_id uuid;
BEGIN
  v_admin_id := public.admin_assert_master();
  IF COALESCE(p_amount, 0) <= 0 THEN RAISE EXCEPTION 'amount_must_be_positive'; END IF;
  IF NULLIF(trim(COALESCE(p_reason, '')), '') IS NULL THEN RAISE EXCEPTION 'reason_required'; END IF;

  INSERT INTO public.ai_credit_wallets (professional_id, wallet_type, balance, metadata)
  VALUES (p_professional_id, 'manual', p_amount, jsonb_build_object('reason', p_reason))
  RETURNING id INTO v_wallet_id;

  INSERT INTO public.ai_credit_transactions (professional_id, wallet_id, amount, transaction_type, source, reason, metadata, created_by)
  VALUES (p_professional_id, v_wallet_id, p_amount, 'grant', 'admin', p_reason, '{}'::jsonb, auth.uid());

  PERFORM public.log_audit_event(p_professional_id, 'admin', 'admin.ai_credits.added', 'professional', p_professional_id, jsonb_build_object('admin_id', v_admin_id, 'amount', p_amount, 'reason', p_reason));

  RETURN jsonb_build_object('ok', true, 'wallet_id', v_wallet_id, 'amount', p_amount);
END;
$$;

CREATE OR REPLACE FUNCTION public.reserve_ai_credits(
  p_professional_id uuid,
  p_amount integer,
  p_idempotency_key text,
  p_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_professional_id uuid;
  v_wallet public.ai_credit_wallets%ROWTYPE;
  v_reservation public.ai_credit_reservations%ROWTYPE;
BEGIN
  v_professional_id := public.phase17_current_professional_id(p_professional_id);
  IF v_professional_id IS NULL THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  IF COALESCE(p_amount, 0) <= 0 THEN RAISE EXCEPTION 'amount_must_be_positive'; END IF;

  SELECT * INTO v_reservation FROM public.ai_credit_reservations WHERE idempotency_key = p_idempotency_key;
  IF v_reservation.id IS NOT NULL THEN
    RETURN jsonb_build_object('ok', true, 'reservation_id', v_reservation.id, 'status', v_reservation.status, 'idempotent', true);
  END IF;

  SELECT * INTO v_wallet
  FROM public.ai_credit_wallets
  WHERE professional_id = v_professional_id
    AND balance >= p_amount
    AND (expires_at IS NULL OR expires_at > now())
  ORDER BY CASE wallet_type WHEN 'monthly' THEN 1 WHEN 'purchased' THEN 2 ELSE 3 END, expires_at NULLS LAST, created_at
  LIMIT 1
  FOR UPDATE;

  IF v_wallet.id IS NULL THEN RAISE EXCEPTION 'insufficient_ai_credits'; END IF;

  UPDATE public.ai_credit_wallets
  SET balance = balance - p_amount
  WHERE id = v_wallet.id;

  INSERT INTO public.ai_credit_reservations (professional_id, wallet_id, amount, idempotency_key, reason)
  VALUES (v_professional_id, v_wallet.id, p_amount, p_idempotency_key, p_reason)
  RETURNING * INTO v_reservation;

  INSERT INTO public.ai_credit_transactions (professional_id, wallet_id, amount, transaction_type, source, idempotency_key, reason)
  VALUES (v_professional_id, v_wallet.id, -p_amount, 'reserve', 'agent', p_idempotency_key, p_reason);

  RETURN jsonb_build_object('ok', true, 'reservation_id', v_reservation.id, 'status', v_reservation.status);
END;
$$;

CREATE OR REPLACE FUNCTION public.commit_ai_credits(
  p_reservation_id uuid,
  p_agent_slug text,
  p_correlation_id text DEFAULT NULL,
  p_metadata jsonb DEFAULT '{}'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_reservation public.ai_credit_reservations%ROWTYPE;
  v_usage_id uuid;
BEGIN
  SELECT * INTO v_reservation
  FROM public.ai_credit_reservations
  WHERE id = p_reservation_id
  FOR UPDATE;

  IF v_reservation.id IS NULL THEN RAISE EXCEPTION 'reservation_not_found'; END IF;
  IF v_reservation.status = 'committed' THEN
    RETURN jsonb_build_object('ok', true, 'status', 'committed', 'idempotent', true);
  END IF;
  IF v_reservation.status <> 'reserved' THEN RAISE EXCEPTION 'reservation_not_reserved'; END IF;

  UPDATE public.ai_credit_reservations SET status = 'committed', updated_at = now() WHERE id = v_reservation.id;
  INSERT INTO public.ai_usage_events (professional_id, reservation_id, agent_slug, credits_used, correlation_id, metadata)
  VALUES (v_reservation.professional_id, v_reservation.id, p_agent_slug, v_reservation.amount, p_correlation_id, COALESCE(p_metadata, '{}'))
  ON CONFLICT (correlation_id) DO NOTHING
  RETURNING id INTO v_usage_id;

  INSERT INTO public.ai_credit_transactions (professional_id, wallet_id, amount, transaction_type, source, reason, metadata)
  VALUES (v_reservation.professional_id, v_reservation.wallet_id, 0, 'commit', 'agent', 'usage_committed', jsonb_build_object('reservation_id', v_reservation.id, 'usage_event_id', v_usage_id));

  RETURN jsonb_build_object('ok', true, 'status', 'committed', 'usage_event_id', v_usage_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.release_ai_credits(
  p_reservation_id uuid,
  p_reason text DEFAULT 'released'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_reservation public.ai_credit_reservations%ROWTYPE;
BEGIN
  SELECT * INTO v_reservation
  FROM public.ai_credit_reservations
  WHERE id = p_reservation_id
  FOR UPDATE;

  IF v_reservation.id IS NULL THEN RAISE EXCEPTION 'reservation_not_found'; END IF;
  IF v_reservation.status = 'released' THEN
    RETURN jsonb_build_object('ok', true, 'status', 'released', 'idempotent', true);
  END IF;
  IF v_reservation.status <> 'reserved' THEN RAISE EXCEPTION 'reservation_not_reserved'; END IF;

  UPDATE public.ai_credit_reservations SET status = 'released', updated_at = now() WHERE id = v_reservation.id;
  UPDATE public.ai_credit_wallets SET balance = balance + v_reservation.amount WHERE id = v_reservation.wallet_id;

  INSERT INTO public.ai_credit_transactions (professional_id, wallet_id, amount, transaction_type, source, reason, metadata)
  VALUES (v_reservation.professional_id, v_reservation.wallet_id, v_reservation.amount, 'release', 'agent', p_reason, jsonb_build_object('reservation_id', v_reservation.id));

  RETURN jsonb_build_object('ok', true, 'status', 'released');
END;
$$;

CREATE OR REPLACE FUNCTION public.request_ambassador_program()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_professional_id uuid;
  v_code text;
  v_partner_id uuid;
BEGIN
  v_professional_id := public.auth_professional_id();
  IF v_professional_id IS NULL THEN RAISE EXCEPTION 'Unauthorized'; END IF;

  SELECT upper(regexp_replace(COALESCE(display_name, name, 'PRO'), '[^A-Za-z0-9]+', '', 'g')) || substring(replace(gen_random_uuid()::text, '-', '') from 1 for 4)
  INTO v_code
  FROM public.professionals
  WHERE id = v_professional_id;

  INSERT INTO public.platform_affiliate_partners (professional_id, affiliate_code, status)
  VALUES (v_professional_id, v_code, 'pending')
  ON CONFLICT (professional_id) DO UPDATE SET updated_at = now()
  RETURNING id INTO v_partner_id;

  RETURN jsonb_build_object('ok', true, 'partner_id', v_partner_id, 'status', 'pending');
END;
$$;

CREATE OR REPLACE FUNCTION public.get_my_ambassador_dashboard()
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT COALESCE((
    SELECT to_jsonb(p) || jsonb_build_object(
      'referrals', COALESCE((SELECT jsonb_agg(to_jsonb(r) ORDER BY r.created_at DESC) FROM public.platform_affiliate_referrals r WHERE r.partner_id = p.id), '[]'::jsonb),
      'commissions', COALESCE((SELECT jsonb_agg(to_jsonb(c) ORDER BY c.created_at DESC) FROM public.platform_affiliate_commissions c WHERE c.partner_id = p.id), '[]'::jsonb),
      'payments', COALESCE((SELECT jsonb_agg(to_jsonb(pay) ORDER BY pay.created_at DESC) FROM public.platform_affiliate_payments pay WHERE pay.partner_id = p.id), '[]'::jsonb)
    )
    FROM public.platform_affiliate_partners p
    WHERE p.professional_id = public.auth_professional_id()
  ), '{}'::jsonb);
$$;

CREATE OR REPLACE FUNCTION public.admin_review_ambassador_request(
  p_partner_id uuid,
  p_decision text,
  p_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_admin_id uuid;
  v_status text;
  v_partner public.platform_affiliate_partners%ROWTYPE;
BEGIN
  v_admin_id := public.admin_assert_master();
  IF p_decision NOT IN ('active','rejected','suspended') THEN RAISE EXCEPTION 'invalid_decision'; END IF;
  IF p_decision IN ('rejected','suspended') AND NULLIF(trim(COALESCE(p_reason, '')), '') IS NULL THEN RAISE EXCEPTION 'reason_required'; END IF;
  v_status := p_decision;

  UPDATE public.platform_affiliate_partners
  SET status = v_status,
      approved_by = CASE WHEN v_status = 'active' THEN auth.uid() ELSE approved_by END,
      rejected_reason = CASE WHEN v_status = 'rejected' THEN p_reason ELSE rejected_reason END,
      updated_at = now()
  WHERE id = p_partner_id
  RETURNING * INTO v_partner;

  IF v_partner.id IS NULL THEN RAISE EXCEPTION 'partner_not_found'; END IF;

  PERFORM public.log_audit_event(v_partner.professional_id, 'admin', 'admin.ambassador.reviewed', 'platform_affiliate_partner', p_partner_id, jsonb_build_object('admin_id', v_admin_id, 'decision', v_status, 'reason', p_reason));
  RETURN jsonb_build_object('ok', true, 'partner_id', p_partner_id, 'status', v_status);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_confirm_affiliate_payment(
  p_payment_id uuid,
  p_reference text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_admin_id uuid;
  v_professional_id uuid;
BEGIN
  v_admin_id := public.admin_assert_master();
  SELECT partner.professional_id INTO v_professional_id
  FROM public.platform_affiliate_payments payment
  JOIN public.platform_affiliate_partners partner ON partner.id = payment.partner_id
  WHERE payment.id = p_payment_id;
  UPDATE public.platform_affiliate_payments
  SET status = 'paid', payment_reference = p_reference, paid_at = now()
  WHERE id = p_payment_id AND status IN ('pending','processing');
  IF v_professional_id IS NOT NULL THEN
    PERFORM public.log_audit_event(v_professional_id, 'admin', 'admin.affiliate_payment.confirmed', 'platform_affiliate_payment', p_payment_id, jsonb_build_object('admin_id', v_admin_id, 'reference', p_reference));
  END IF;
  RETURN jsonb_build_object('ok', true, 'payment_id', p_payment_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.nexus_create_action_proposal(
  p_action_type text,
  p_payload jsonb,
  p_reason text DEFAULT 'nexus proposal'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_admin_id uuid;
  v_request public.admin_action_requests%ROWTYPE;
  v_proposal_id uuid;
BEGIN
  v_admin_id := public.admin_assert_master();
  IF p_action_type NOT IN ('add_ai_credits','grant_free_internal') THEN RAISE EXCEPTION 'action_not_allowed'; END IF;
  IF NULLIF(p_payload->>'professional_id', '') IS NULL THEN RAISE EXCEPTION 'professional_id_required'; END IF;

  INSERT INTO public.admin_action_requests (action_type, target_professional_id, payload, reason, proposed_by)
  VALUES (p_action_type, NULLIF(p_payload->>'professional_id', '')::uuid, COALESCE(p_payload, '{}'), p_reason, auth.uid())
  RETURNING * INTO v_request;

  INSERT INTO public.nexus_action_proposals (action_request_id, action_type, payload)
  VALUES (v_request.id, p_action_type, COALESCE(p_payload, '{}'))
  RETURNING id INTO v_proposal_id;

  PERFORM public.log_audit_event(v_request.target_professional_id, 'admin', 'nexus.action.proposed', 'admin_action_request', v_request.id, jsonb_build_object('admin_id', v_admin_id, 'action_type', p_action_type));

  RETURN jsonb_build_object('ok', true, 'proposal_id', v_proposal_id, 'request_id', v_request.id, 'confirmation_token', v_request.confirmation_token);
END;
$$;

CREATE OR REPLACE FUNCTION public.nexus_confirm_action(
  p_proposal_id uuid,
  p_confirmation_token text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_admin_id uuid;
  v_request public.admin_action_requests%ROWTYPE;
BEGIN
  v_admin_id := public.admin_assert_master();
  SELECT r.* INTO v_request
  FROM public.admin_action_requests r
  JOIN public.nexus_action_proposals p ON p.action_request_id = r.id
  WHERE p.id = p_proposal_id
  FOR UPDATE;

  IF v_request.id IS NULL THEN RAISE EXCEPTION 'proposal_not_found'; END IF;
  IF v_request.status <> 'proposed' THEN RAISE EXCEPTION 'proposal_not_pending'; END IF;
  IF v_request.expires_at < now() THEN RAISE EXCEPTION 'proposal_expired'; END IF;
  IF v_request.confirmation_token <> p_confirmation_token THEN RAISE EXCEPTION 'invalid_confirmation'; END IF;

  UPDATE public.admin_action_requests
  SET status = 'confirmed', confirmed_by = auth.uid(), confirmed_at = now()
  WHERE id = v_request.id;
  UPDATE public.nexus_action_proposals SET status = 'confirmed' WHERE id = p_proposal_id;

  PERFORM public.log_audit_event(v_request.target_professional_id, 'admin', 'nexus.action.confirmed', 'admin_action_request', v_request.id, jsonb_build_object('admin_id', v_admin_id));
  RETURN jsonb_build_object('ok', true, 'proposal_id', p_proposal_id, 'status', 'confirmed');
END;
$$;

CREATE OR REPLACE FUNCTION public.nexus_execute_confirmed_action(p_proposal_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_admin_id uuid;
  v_request public.admin_action_requests%ROWTYPE;
  v_result jsonb;
BEGIN
  v_admin_id := public.admin_assert_master();
  SELECT r.* INTO v_request
  FROM public.admin_action_requests r
  JOIN public.nexus_action_proposals p ON p.action_request_id = r.id
  WHERE p.id = p_proposal_id
  FOR UPDATE;

  IF v_request.id IS NULL THEN RAISE EXCEPTION 'proposal_not_found'; END IF;
  IF v_request.status = 'executed' THEN RETURN jsonb_build_object('ok', true, 'status', 'executed', 'idempotent', true); END IF;
  IF v_request.status <> 'confirmed' THEN RAISE EXCEPTION 'proposal_not_confirmed'; END IF;

  IF v_request.action_type = 'add_ai_credits' THEN
    v_result := public.admin_add_ai_credits(v_request.target_professional_id, (v_request.payload->>'amount')::integer, COALESCE(v_request.payload->>'reason', v_request.reason));
  ELSIF v_request.action_type = 'grant_free_internal' THEN
    v_result := public.admin_grant_free_internal(v_request.target_professional_id, COALESCE(v_request.payload->>'reason', v_request.reason), NULL);
  ELSE
    RAISE EXCEPTION 'action_not_allowed';
  END IF;

  UPDATE public.admin_action_requests SET status = 'executed', executed_by = auth.uid(), executed_at = now() WHERE id = v_request.id;
  UPDATE public.nexus_action_proposals SET status = 'executed' WHERE id = p_proposal_id;
  INSERT INTO public.admin_action_results (request_id, status, result_payload) VALUES (v_request.id, 'success', v_result);
  INSERT INTO public.nexus_action_executions (proposal_id, status, result_payload) VALUES (p_proposal_id, 'success', v_result);

  PERFORM public.log_audit_event(v_request.target_professional_id, 'admin', 'nexus.action.executed', 'admin_action_request', v_request.id, jsonb_build_object('admin_id', v_admin_id, 'result', v_result));
  RETURN jsonb_build_object('ok', true, 'status', 'executed', 'result', v_result);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_register_agent_prompt_version(
  p_agent_slug text,
  p_display_name text,
  p_prompt_body text,
  p_changelog text DEFAULT ''
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_admin_id uuid;
  v_agent_id uuid;
  v_version integer;
  v_version_id uuid;
BEGIN
  v_admin_id := public.admin_assert_master();
  INSERT INTO public.agent_registry (agent_slug, display_name)
  VALUES (p_agent_slug, p_display_name)
  ON CONFLICT (agent_slug) DO UPDATE SET display_name = EXCLUDED.display_name, updated_at = now()
  RETURNING id INTO v_agent_id;

  SELECT COALESCE(MAX(version), 0) + 1 INTO v_version FROM public.agent_prompt_versions WHERE agent_id = v_agent_id;
  INSERT INTO public.agent_prompt_versions (agent_id, version, status, prompt_body, changelog, created_by)
  VALUES (v_agent_id, v_version, 'staging', p_prompt_body, COALESCE(p_changelog, ''), auth.uid())
  RETURNING id INTO v_version_id;

  RETURN jsonb_build_object('ok', true, 'version_id', v_version_id, 'version', v_version);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_promote_agent_prompt_version(p_version_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_admin_id uuid;
  v_version public.agent_prompt_versions%ROWTYPE;
BEGIN
  v_admin_id := public.admin_assert_master();
  SELECT * INTO v_version FROM public.agent_prompt_versions WHERE id = p_version_id FOR UPDATE;
  IF v_version.id IS NULL THEN RAISE EXCEPTION 'version_not_found'; END IF;
  IF v_version.status <> 'staging' THEN RAISE EXCEPTION 'version_must_be_staging'; END IF;
  UPDATE public.agent_prompt_versions SET status = 'archived' WHERE agent_id = v_version.agent_id AND status = 'active';
  UPDATE public.agent_prompt_versions SET status = 'active', promoted_by = auth.uid(), promoted_at = now() WHERE id = p_version_id;
  RETURN jsonb_build_object('ok', true, 'version_id', p_version_id, 'status', 'active');
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_pause_agent(
  p_agent_slug text,
  p_until timestamptz,
  p_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_admin_id uuid;
  v_agent_id uuid;
BEGIN
  v_admin_id := public.admin_assert_master();
  IF p_agent_slug = 'webhook-whatsapp' THEN RAISE EXCEPTION 'webhook_cannot_be_paused'; END IF;
  SELECT id INTO v_agent_id FROM public.agent_registry WHERE agent_slug = p_agent_slug;
  IF v_agent_id IS NULL THEN
    INSERT INTO public.agent_registry (agent_slug, display_name, status) VALUES (p_agent_slug, p_agent_slug, 'paused') RETURNING id INTO v_agent_id;
  ELSE
    UPDATE public.agent_registry SET status = 'paused', updated_at = now() WHERE id = v_agent_id;
  END IF;
  INSERT INTO public.agent_pause_windows (agent_id, paused_until, reason, created_by) VALUES (v_agent_id, p_until, p_reason, auth.uid());
  RETURN jsonb_build_object('ok', true, 'agent_id', v_agent_id, 'paused_until', p_until);
END;
$$;

CREATE OR REPLACE FUNCTION public.submit_feature_request(
  p_title text,
  p_description text,
  p_category text DEFAULT 'outro',
  p_priority text DEFAULT 'nice_to_have'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_professional_id uuid;
  v_id uuid;
BEGIN
  v_professional_id := public.auth_professional_id();
  IF v_professional_id IS NULL THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  INSERT INTO public.feature_requests (professional_id, title, description, category, priority)
  VALUES (v_professional_id, p_title, p_description, COALESCE(p_category, 'outro'), COALESCE(p_priority, 'nice_to_have'))
  RETURNING id INTO v_id;
  INSERT INTO public.feature_request_votes (feature_request_id, professional_id) VALUES (v_id, v_professional_id);
  RETURN jsonb_build_object('ok', true, 'feature_request_id', v_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.vote_feature_request(p_feature_request_id uuid)
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
  INSERT INTO public.feature_request_votes (feature_request_id, professional_id)
  VALUES (p_feature_request_id, v_professional_id)
  ON CONFLICT (feature_request_id, professional_id) DO NOTHING;
  RETURN jsonb_build_object('ok', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_update_feature_request_status(
  p_feature_request_id uuid,
  p_status text,
  p_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_admin_id uuid;
  v_professional_id uuid;
BEGIN
  v_admin_id := public.admin_assert_master();
  IF p_status NOT IN ('reviewing','planned','in_progress','delivered','rejected') THEN RAISE EXCEPTION 'invalid_status'; END IF;
  IF p_status = 'rejected' AND NULLIF(trim(COALESCE(p_reason, '')), '') IS NULL THEN RAISE EXCEPTION 'reason_required'; END IF;
  SELECT professional_id INTO v_professional_id FROM public.feature_requests WHERE id = p_feature_request_id;
  UPDATE public.feature_requests SET status = p_status, status_reason = p_reason, updated_at = now() WHERE id = p_feature_request_id;
  IF v_professional_id IS NOT NULL THEN
    PERFORM public.log_audit_event(v_professional_id, 'admin', 'admin.feature_request.updated', 'feature_request', p_feature_request_id, jsonb_build_object('admin_id', v_admin_id, 'status', p_status, 'reason', p_reason));
  END IF;
  RETURN jsonb_build_object('ok', true, 'feature_request_id', p_feature_request_id, 'status', p_status);
END;
$$;

CREATE OR REPLACE FUNCTION public.get_admin_phase17_dashboard()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM public.admin_assert_master();
  RETURN jsonb_build_object(
    'plans', COALESCE((SELECT jsonb_agg(to_jsonb(p) ORDER BY p.monthly_price_cents) FROM public.platform_plans p), '[]'::jsonb),
    'subscriptions', COALESCE((SELECT jsonb_agg(to_jsonb(s) ORDER BY s.updated_at DESC) FROM public.professional_subscriptions s LIMIT 100), '[]'::jsonb),
    'ambassadors', COALESCE((SELECT jsonb_agg(to_jsonb(a) ORDER BY a.created_at DESC) FROM public.platform_affiliate_partners a LIMIT 100), '[]'::jsonb),
    'agents', COALESCE((SELECT jsonb_agg(to_jsonb(a) ORDER BY a.agent_slug) FROM public.agent_registry a), '[]'::jsonb),
    'feature_requests', COALESCE((SELECT jsonb_agg(to_jsonb(f) ORDER BY f.created_at DESC) FROM public.feature_requests f LIMIT 100), '[]'::jsonb),
    'nexus_actions', COALESCE((SELECT jsonb_agg(to_jsonb(n) ORDER BY n.created_at DESC) FROM public.nexus_action_proposals n LIMIT 50), '[]'::jsonb)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.phase17_current_professional_id(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.platform_refresh_access_state(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.platform_can_write(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.enforce_professional_write_access() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_platform_plans() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_my_subscription_state() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_my_entitlements() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_grant_free_internal(uuid, text, timestamptz) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_add_ai_credits(uuid, integer, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.reserve_ai_credits(uuid, integer, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.commit_ai_credits(uuid, text, text, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.release_ai_credits(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.request_ambassador_program() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_my_ambassador_dashboard() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_review_ambassador_request(uuid, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_confirm_affiliate_payment(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.nexus_create_action_proposal(text, jsonb, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.nexus_confirm_action(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.nexus_execute_confirmed_action(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_register_agent_prompt_version(text, text, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_promote_agent_prompt_version(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_pause_agent(text, timestamptz, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.submit_feature_request(text, text, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.vote_feature_request(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_update_feature_request_status(uuid, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_admin_phase17_dashboard() FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.get_platform_plans() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_subscription_state() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_entitlements() TO authenticated;
GRANT EXECUTE ON FUNCTION public.request_ambassador_program() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_ambassador_dashboard() TO authenticated;
GRANT EXECUTE ON FUNCTION public.submit_feature_request(text, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.vote_feature_request(uuid) TO authenticated;

GRANT EXECUTE ON FUNCTION public.admin_grant_free_internal(uuid, text, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_add_ai_credits(uuid, integer, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_review_ambassador_request(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_confirm_affiliate_payment(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.nexus_create_action_proposal(text, jsonb, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.nexus_confirm_action(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.nexus_execute_confirmed_action(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_register_agent_prompt_version(text, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_promote_agent_prompt_version(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_pause_agent(text, timestamptz, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_update_feature_request_status(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_admin_phase17_dashboard() TO authenticated;

GRANT EXECUTE ON FUNCTION public.platform_refresh_access_state(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.reserve_ai_credits(uuid, integer, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.commit_ai_credits(uuid, text, text, jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.release_ai_credits(uuid, text) TO authenticated, service_role;
