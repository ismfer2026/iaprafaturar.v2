-- Phase 24 - Canonical platform broadcast, curated affiliate admin contracts and platform sales leads.
-- ROLLBACK: drop phase24_* functions, then platform_broadcast_recipients, platform_broadcasts and sales_leads.

CREATE TABLE public.platform_broadcasts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by uuid NOT NULL,
  audience_type text NOT NULL CHECK (audience_type IN ('all_professionals','risk_professionals','trial_professionals')),
  channel text NOT NULL DEFAULT 'whatsapp' CHECK (channel IN ('whatsapp')),
  message text NOT NULL CHECK (char_length(message) BETWEEN 1 AND 2000),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','queued','processing','completed','partial','failed','archived','dry_run')),
  dry_run boolean NOT NULL DEFAULT true,
  reason text NOT NULL,
  selected_count integer NOT NULL DEFAULT 0 CHECK (selected_count >= 0),
  eligible_count integer NOT NULL DEFAULT 0 CHECK (eligible_count >= 0),
  sent_count integer NOT NULL DEFAULT 0 CHECK (sent_count >= 0),
  failed_count integer NOT NULL DEFAULT 0 CHECK (failed_count >= 0),
  skipped_count integer NOT NULL DEFAULT 0 CHECK (skipped_count >= 0),
  started_at timestamptz,
  completed_at timestamptz,
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.platform_broadcast_recipients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  broadcast_id uuid NOT NULL REFERENCES public.platform_broadcasts(id) ON DELETE RESTRICT,
  professional_id uuid NOT NULL REFERENCES public.professionals(id) ON DELETE RESTRICT,
  channel text NOT NULL DEFAULT 'whatsapp' CHECK (channel IN ('whatsapp')),
  destination_masked text,
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','sent','failed','skipped','delivered','read','responded')),
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  last_error text,
  sent_at timestamptz,
  delivered_at timestamptz,
  read_at timestamptz,
  responded_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (broadcast_id, professional_id, channel)
);

CREATE TABLE public.sales_leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (char_length(name) BETWEEN 2 AND 160),
  business_name text,
  email text,
  phone text,
  source text NOT NULL DEFAULT 'nerissa',
  stage text NOT NULL DEFAULT 'new' CHECK (stage IN ('new','qualified','demo','proposal','converted','lost')),
  score integer NOT NULL DEFAULT 0 CHECK (score BETWEEN 0 AND 100),
  assigned_admin_user_id uuid,
  last_interaction_at timestamptz,
  next_follow_up_at timestamptz,
  loss_reason text,
  metadata jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.platform_broadcasts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_broadcast_recipients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales_leads ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.platform_broadcasts FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.platform_broadcast_recipients FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.sales_leads FROM PUBLIC, anon, authenticated;

CREATE INDEX idx_platform_broadcasts_created_at ON public.platform_broadcasts(created_at DESC);
CREATE INDEX idx_platform_broadcasts_status ON public.platform_broadcasts(status, created_at DESC);
CREATE INDEX idx_platform_broadcast_recipients_broadcast_status ON public.platform_broadcast_recipients(broadcast_id, status);
CREATE INDEX idx_platform_broadcast_recipients_professional ON public.platform_broadcast_recipients(professional_id);
CREATE INDEX idx_sales_leads_stage_follow_up ON public.sales_leads(stage, next_follow_up_at);
CREATE INDEX idx_sales_leads_updated_at ON public.sales_leads(updated_at DESC);

CREATE TRIGGER set_platform_broadcasts_updated_at BEFORE UPDATE ON public.platform_broadcasts
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER set_platform_broadcast_recipients_updated_at BEFORE UPDATE ON public.platform_broadcast_recipients
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER set_sales_leads_updated_at BEFORE UPDATE ON public.sales_leads
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.phase24_get_broadcasts(p_limit integer DEFAULT 50)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_limit integer := LEAST(GREATEST(COALESCE(p_limit, 50), 1), 100);
BEGIN
  PERFORM public.admin_assert_master();
  RETURN jsonb_build_object(
    'items', COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'id', b.id, 'audience_type', b.audience_type, 'channel', b.channel, 'message', b.message,
      'status', b.status, 'dry_run', b.dry_run, 'reason', b.reason,
      'selected_count', b.selected_count, 'eligible_count', b.eligible_count,
      'sent_count', b.sent_count, 'failed_count', b.failed_count, 'skipped_count', b.skipped_count,
      'created_at', b.created_at, 'completed_at', b.completed_at
    ) ORDER BY b.created_at DESC) FROM (SELECT * FROM public.platform_broadcasts ORDER BY created_at DESC LIMIT v_limit) b), '[]'::jsonb),
    'metrics', jsonb_build_object(
      'total', (SELECT COUNT(*) FROM public.platform_broadcasts),
      'sent', (SELECT COALESCE(SUM(sent_count),0) FROM public.platform_broadcasts),
      'failed', (SELECT COALESCE(SUM(failed_count),0) FROM public.platform_broadcasts),
      'active', (SELECT COUNT(*) FROM public.platform_broadcasts WHERE status IN ('queued','processing'))
    )
  );
END; $$;

CREATE OR REPLACE FUNCTION public.phase24_get_admin_ambassadors()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM public.admin_assert_master();
  RETURN jsonb_build_object(
    'partners', COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'id', a.id, 'professional_id', a.professional_id, 'professional_name', p.name,
      'business_name', p.business_name, 'affiliate_code', a.affiliate_code, 'status', a.status,
      'commission_rate', a.commission_rate, 'pending_balance_cents', a.pending_balance_cents,
      'referrals', (SELECT COUNT(*) FROM public.platform_affiliate_referrals r WHERE r.partner_id = a.id),
      'paid_referrals', (SELECT COUNT(*) FROM public.platform_affiliate_referrals r WHERE r.partner_id = a.id AND r.status = 'paid'),
      'created_at', a.created_at, 'updated_at', a.updated_at
    ) ORDER BY a.updated_at DESC) FROM public.platform_affiliate_partners a JOIN public.professionals p ON p.id = a.professional_id), '[]'::jsonb),
    'commissions', COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'id', c.id, 'partner_id', c.partner_id, 'affiliate_code', a.affiliate_code, 'amount_cents', c.amount_cents,
      'status', c.status, 'reference_month', c.reference_month, 'created_at', c.created_at
    ) ORDER BY c.created_at DESC) FROM public.platform_affiliate_commissions c JOIN public.platform_affiliate_partners a ON a.id = c.partner_id LIMIT 100), '[]'::jsonb),
    'payments', COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'id', py.id, 'partner_id', py.partner_id, 'affiliate_code', a.affiliate_code, 'amount_cents', py.amount_cents,
      'status', py.status, 'reference_month', py.reference_month, 'payment_reference', py.payment_reference,
      'created_at', py.created_at, 'paid_at', py.paid_at
    ) ORDER BY py.created_at DESC) FROM public.platform_affiliate_payments py JOIN public.platform_affiliate_partners a ON a.id = py.partner_id LIMIT 100), '[]'::jsonb)
  );
END; $$;

CREATE OR REPLACE FUNCTION public.phase24_create_ambassador(p_professional_id uuid, p_affiliate_code text, p_commission_rate numeric, p_reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_id uuid;
BEGIN
  PERFORM public.admin_assert_master();
  IF NULLIF(trim(COALESCE(p_reason,'')), '') IS NULL THEN RAISE EXCEPTION 'reason_required'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.professionals WHERE id = p_professional_id AND deleted_at IS NULL) THEN RAISE EXCEPTION 'professional_not_found'; END IF;
  INSERT INTO public.platform_affiliate_partners(professional_id, affiliate_code, status, commission_rate, approved_by)
  VALUES (p_professional_id, lower(trim(p_affiliate_code)), 'active', COALESCE(p_commission_rate,15), auth.uid())
  RETURNING id INTO v_id;
  PERFORM public.phase23_log_admin_event('admin.ambassador.created','platform_affiliate_partner',v_id,jsonb_build_object('professional_id',p_professional_id,'reason',trim(p_reason)));
  RETURN jsonb_build_object('ok',true,'partner_id',v_id);
END; $$;

CREATE OR REPLACE FUNCTION public.phase24_review_ambassador(p_partner_id uuid, p_decision text, p_reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_result jsonb;
BEGIN
  PERFORM public.admin_assert_master();
  IF NULLIF(trim(COALESCE(p_reason,'')), '') IS NULL THEN RAISE EXCEPTION 'reason_required'; END IF;
  v_result := public.admin_review_ambassador_request(p_partner_id,p_decision,p_reason);
  PERFORM public.phase23_log_admin_event('admin.ambassador.reviewed','platform_affiliate_partner',p_partner_id,jsonb_build_object('decision',p_decision,'reason',trim(p_reason)));
  RETURN v_result;
END; $$;

CREATE OR REPLACE FUNCTION public.phase24_confirm_affiliate_payment(p_payment_id uuid, p_reference text, p_reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_status text; v_result jsonb;
BEGIN
  PERFORM public.admin_assert_master();
  IF NULLIF(trim(COALESCE(p_reference,'')), '') IS NULL THEN RAISE EXCEPTION 'reference_required'; END IF;
  IF NULLIF(trim(COALESCE(p_reason,'')), '') IS NULL THEN RAISE EXCEPTION 'reason_required'; END IF;
  SELECT status INTO v_status FROM public.platform_affiliate_payments WHERE id = p_payment_id FOR UPDATE;
  IF v_status IS NULL THEN RAISE EXCEPTION 'payment_not_found'; END IF;
  IF v_status = 'paid' THEN RAISE EXCEPTION 'payment_already_paid'; END IF;
  IF v_status NOT IN ('pending','processing') THEN RAISE EXCEPTION 'invalid_payment_transition'; END IF;
  v_result := public.admin_confirm_affiliate_payment(p_payment_id, trim(p_reference));
  PERFORM public.phase23_log_admin_event('admin.affiliate_payment.confirmed','platform_affiliate_payment',p_payment_id,jsonb_build_object('reference',trim(p_reference),'reason',trim(p_reason)));
  RETURN v_result;
END; $$;

CREATE OR REPLACE FUNCTION public.phase24_get_sales_leads(p_stage text DEFAULT NULL, p_search text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM public.admin_assert_master();
  RETURN jsonb_build_object(
    'items', COALESCE((SELECT jsonb_agg(to_jsonb(l) ORDER BY l.updated_at DESC) FROM (
      SELECT id,name,business_name,email,phone,source,stage,score,last_interaction_at,next_follow_up_at,loss_reason,created_at,updated_at
      FROM public.sales_leads
      WHERE (NULLIF(trim(COALESCE(p_stage,'')),'') IS NULL OR stage = p_stage)
        AND (NULLIF(trim(COALESCE(p_search,'')),'') IS NULL OR name ILIKE '%'||trim(p_search)||'%' OR COALESCE(business_name,'') ILIKE '%'||trim(p_search)||'%' OR COALESCE(email,'') ILIKE '%'||trim(p_search)||'%')
      ORDER BY updated_at DESC LIMIT 200
    ) l), '[]'::jsonb),
    'metrics', jsonb_build_object(
      'total',(SELECT COUNT(*) FROM public.sales_leads),
      'follow_up_due',(SELECT COUNT(*) FROM public.sales_leads WHERE next_follow_up_at < now() AND stage NOT IN ('converted','lost')),
      'converted',(SELECT COUNT(*) FROM public.sales_leads WHERE stage='converted')
    )
  );
END; $$;

CREATE OR REPLACE FUNCTION public.phase24_upsert_sales_lead(
  p_lead_id uuid, p_name text, p_business_name text, p_email text, p_phone text,
  p_source text, p_stage text, p_score integer, p_next_follow_up_at timestamptz, p_reason text
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_id uuid;
BEGIN
  PERFORM public.admin_assert_master();
  IF NULLIF(trim(COALESCE(p_reason,'')), '') IS NULL THEN RAISE EXCEPTION 'reason_required'; END IF;
  IF p_stage NOT IN ('new','qualified','demo','proposal','converted','lost') THEN RAISE EXCEPTION 'invalid_stage'; END IF;
  IF p_lead_id IS NULL THEN
    INSERT INTO public.sales_leads(name,business_name,email,phone,source,stage,score,next_follow_up_at,last_interaction_at)
    VALUES(trim(p_name),NULLIF(trim(COALESCE(p_business_name,'')),''),NULLIF(trim(COALESCE(p_email,'')),''),NULLIF(trim(COALESCE(p_phone,'')),''),COALESCE(NULLIF(trim(p_source),''),'admin'),p_stage,LEAST(GREATEST(COALESCE(p_score,0),0),100),p_next_follow_up_at,now())
    RETURNING id INTO v_id;
  ELSE
    UPDATE public.sales_leads SET name=trim(p_name), business_name=NULLIF(trim(COALESCE(p_business_name,'')),''),
      email=NULLIF(trim(COALESCE(p_email,'')),''), phone=NULLIF(trim(COALESCE(p_phone,'')),''),
      source=COALESCE(NULLIF(trim(p_source),''),source), stage=p_stage, score=LEAST(GREATEST(COALESCE(p_score,0),0),100),
      next_follow_up_at=p_next_follow_up_at, last_interaction_at=now(), updated_at=now()
    WHERE id=p_lead_id RETURNING id INTO v_id;
    IF v_id IS NULL THEN RAISE EXCEPTION 'lead_not_found'; END IF;
  END IF;
  PERFORM public.phase23_log_admin_event('admin.sales_lead.upserted','sales_lead',v_id,jsonb_build_object('stage',p_stage,'reason',trim(p_reason)));
  RETURN jsonb_build_object('ok',true,'lead_id',v_id);
END; $$;

REVOKE ALL ON FUNCTION public.phase24_get_broadcasts(integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.phase24_get_admin_ambassadors() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.phase24_create_ambassador(uuid,text,numeric,text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.phase24_review_ambassador(uuid,text,text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.phase24_confirm_affiliate_payment(uuid,text,text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.phase24_get_sales_leads(text,text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.phase24_upsert_sales_lead(uuid,text,text,text,text,text,text,integer,timestamptz,text) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.phase24_get_broadcasts(integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.phase24_get_admin_ambassadors() TO authenticated;
GRANT EXECUTE ON FUNCTION public.phase24_create_ambassador(uuid,text,numeric,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.phase24_review_ambassador(uuid,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.phase24_confirm_affiliate_payment(uuid,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.phase24_get_sales_leads(text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.phase24_upsert_sales_lead(uuid,text,text,text,text,text,text,integer,timestamptz,text) TO authenticated;
