-- Phase 24 follow-up - Complete affiliate referral history and Nerissa-ready sales lead contract.
-- ROLLBACK: drop added sales_leads columns/index and restore prior phase24_get_admin_ambassadors().

ALTER TABLE public.sales_leads
  ADD COLUMN professional_id uuid REFERENCES public.professionals(id) ON DELETE RESTRICT,
  ADD COLUMN agent_notes text,
  ADD COLUMN converted_at timestamptz;

CREATE UNIQUE INDEX uq_sales_leads_phone_present ON public.sales_leads(phone) WHERE phone IS NOT NULL;
CREATE INDEX idx_sales_leads_professional ON public.sales_leads(professional_id) WHERE professional_id IS NOT NULL;

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
    'referrals', COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'id', r.id, 'partner_id', r.partner_id, 'affiliate_code', a.affiliate_code,
      'referred_professional_id', r.referred_professional_id, 'status', r.status,
      'attribution_code', r.attribution_code, 'created_at', r.created_at
    ) ORDER BY r.created_at DESC) FROM public.platform_affiliate_referrals r JOIN public.platform_affiliate_partners a ON a.id = r.partner_id LIMIT 100), '[]'::jsonb),
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

REVOKE ALL ON FUNCTION public.phase24_get_admin_ambassadors() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.phase24_get_admin_ambassadors() TO authenticated;
