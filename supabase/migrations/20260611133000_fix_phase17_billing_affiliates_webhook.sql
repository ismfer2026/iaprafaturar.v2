-- Fix Phase 17 - ambassador entrypoint, affiliate RLS, and commission calculation.

CREATE OR REPLACE FUNCTION public.auth_affiliate_partner_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT id
  FROM public.platform_affiliate_partners
  WHERE professional_id = public.auth_professional_id()
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.auth_affiliate_partner_id() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.auth_affiliate_partner_id() TO authenticated;

DROP POLICY IF EXISTS "affiliate_referrals_own_or_admin" ON public.platform_affiliate_referrals;
DROP POLICY IF EXISTS "affiliate_commissions_own_or_admin" ON public.platform_affiliate_commissions;
DROP POLICY IF EXISTS "affiliate_payments_own_or_admin" ON public.platform_affiliate_payments;

CREATE POLICY "affiliate_referrals_own_or_admin" ON public.platform_affiliate_referrals
  FOR SELECT TO authenticated USING (public.admin_is_master() OR partner_id = public.auth_affiliate_partner_id());
CREATE POLICY "affiliate_commissions_own_or_admin" ON public.platform_affiliate_commissions
  FOR SELECT TO authenticated USING (public.admin_is_master() OR partner_id = public.auth_affiliate_partner_id());
CREATE POLICY "affiliate_payments_own_or_admin" ON public.platform_affiliate_payments
  FOR SELECT TO authenticated USING (public.admin_is_master() OR partner_id = public.auth_affiliate_partner_id());

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_indexes
    WHERE schemaname = 'public'
      AND tablename = 'platform_affiliate_payments'
      AND indexname = 'platform_affiliate_payments_partner_month_uidx'
  ) THEN
    CREATE UNIQUE INDEX platform_affiliate_payments_partner_month_uidx
      ON public.platform_affiliate_payments(partner_id, reference_month);
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.request_ambassador_program()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_professional_id uuid;
  v_code text;
  v_partner public.platform_affiliate_partners%ROWTYPE;
BEGIN
  v_professional_id := public.auth_professional_id();
  IF v_professional_id IS NULL THEN RAISE EXCEPTION 'Unauthorized'; END IF;

  SELECT upper(regexp_replace(COALESCE(name, 'PRO'), '[^A-Za-z0-9]+', '', 'g')) || substring(replace(gen_random_uuid()::text, '-', '') from 1 for 4)
  INTO v_code
  FROM public.professionals
  WHERE id = v_professional_id;

  INSERT INTO public.platform_affiliate_partners (professional_id, affiliate_code, status)
  VALUES (v_professional_id, COALESCE(NULLIF(v_code, ''), 'PRO' || substring(replace(gen_random_uuid()::text, '-', '') from 1 for 8)), 'pending')
  ON CONFLICT (professional_id) DO UPDATE SET updated_at = now()
  RETURNING * INTO v_partner;

  PERFORM public.log_audit_event(v_professional_id, 'professional', 'ambassador.requested', 'platform_affiliate_partner', v_partner.id, jsonb_build_object('status', v_partner.status));
  RETURN to_jsonb(v_partner);
END;
$$;

REVOKE ALL ON FUNCTION public.request_ambassador_program() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.request_ambassador_program() TO authenticated;

CREATE OR REPLACE FUNCTION public.calculate_affiliate_commissions(
  p_reference_month date DEFAULT date_trunc('month', now())::date,
  p_limit integer DEFAULT 500
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_reference_month date := date_trunc('month', COALESCE(p_reference_month, now()::date))::date;
  v_limit integer := LEAST(GREATEST(COALESCE(p_limit, 500), 1), 5000);
  v_inserted_count integer := 0;
  v_inserted_amount integer := 0;
  v_payment_count integer := 0;
BEGIN
  WITH eligible AS (
    SELECT
      partner.id AS partner_id,
      referral.id AS referral_id,
      subscription.professional_id,
      GREATEST(round(plan.monthly_price_cents * partner.commission_rate / 100.0)::integer, 0) AS amount_cents
    FROM public.platform_affiliate_partners partner
    JOIN public.platform_affiliate_referrals referral ON referral.partner_id = partner.id
    JOIN public.professional_subscriptions subscription ON subscription.professional_id = referral.referred_professional_id
    JOIN public.platform_plans plan ON plan.id = subscription.plan_id
    WHERE partner.status = 'active'
      AND referral.status = 'paid'
      AND subscription.status IN ('active','trialing')
      AND plan.monthly_price_cents > 0
      AND date_trunc('month', COALESCE(subscription.current_period_start, subscription.created_at))::date <= v_reference_month
    ORDER BY referral.created_at
    LIMIT v_limit
  ),
  inserted AS (
    INSERT INTO public.platform_affiliate_commissions (
      partner_id,
      referral_id,
      professional_id,
      amount_cents,
      status,
      reference_month,
      metadata
    )
    SELECT
      partner_id,
      referral_id,
      professional_id,
      amount_cents,
      'approved',
      v_reference_month,
      jsonb_build_object('source', 'affiliate-commission-cron')
    FROM eligible
    WHERE amount_cents > 0
    ON CONFLICT (partner_id, professional_id, reference_month) DO NOTHING
    RETURNING partner_id, amount_cents
  ),
  partner_totals AS (
    SELECT partner_id, sum(amount_cents)::integer AS amount_cents
    FROM inserted
    GROUP BY partner_id
  ),
  updated_partners AS (
    UPDATE public.platform_affiliate_partners partner
    SET pending_balance_cents = pending_balance_cents + partner_totals.amount_cents,
        updated_at = now()
    FROM partner_totals
    WHERE partner.id = partner_totals.partner_id
    RETURNING partner.id
  ),
  payment_totals AS (
    SELECT partner_id, sum(amount_cents)::integer AS amount_cents
    FROM public.platform_affiliate_commissions
    WHERE reference_month = v_reference_month
      AND status IN ('approved','pending')
    GROUP BY partner_id
  ),
  upserted_payments AS (
    INSERT INTO public.platform_affiliate_payments (partner_id, amount_cents, status, reference_month, metadata)
    SELECT partner_id, amount_cents, 'pending', v_reference_month, jsonb_build_object('source', 'affiliate-commission-cron')
    FROM payment_totals
    WHERE amount_cents > 0
    ON CONFLICT (partner_id, reference_month) DO UPDATE
      SET amount_cents = EXCLUDED.amount_cents,
          metadata = public.platform_affiliate_payments.metadata || EXCLUDED.metadata
      WHERE public.platform_affiliate_payments.status IN ('pending','processing')
    RETURNING id
  )
  SELECT
    COALESCE((SELECT count(*) FROM inserted), 0)::integer,
    COALESCE((SELECT sum(amount_cents) FROM inserted), 0)::integer,
    COALESCE((SELECT count(*) FROM upserted_payments), 0)::integer
  INTO v_inserted_count, v_inserted_amount, v_payment_count;

  RETURN jsonb_build_object(
    'ok', true,
    'reference_month', v_reference_month,
    'inserted_commissions', v_inserted_count,
    'inserted_amount_cents', v_inserted_amount,
    'payments_upserted', v_payment_count
  );
END;
$$;

REVOKE ALL ON FUNCTION public.calculate_affiliate_commissions(date, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.calculate_affiliate_commissions(date, integer) TO service_role;
