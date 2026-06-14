-- Phase 21 follow-up: functional closures for campaign windows, partner payload and growth UI contracts.

CREATE OR REPLACE FUNCTION public.phase21_business_hours_allows_timestamp(
  p_business_hours jsonb,
  p_ts timestamptz
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_hours jsonb := COALESCE(p_business_hours, '{}'::jsonb);
  v_timezone text;
  v_local_ts timestamp;
  v_weekday text;
  v_weekly jsonb;
  v_exceptions jsonb;
  v_entry jsonb;
  v_intervals jsonb;
  v_idx integer;
  v_interval jsonb;
  v_time time;
BEGIN
  IF v_hours = '{}'::jsonb THEN
    RETURN true;
  END IF;

  v_timezone := COALESCE(NULLIF(v_hours->>'timezone', ''), 'America/Sao_Paulo');
  v_local_ts := p_ts AT TIME ZONE v_timezone;
  v_weekday := lower(to_char(v_local_ts, 'FMDay'));
  v_weekly := COALESCE(v_hours->'weekly', '{}'::jsonb);
  v_exceptions := COALESCE(v_hours->'exceptions', '[]'::jsonb);
  v_time := v_local_ts::time;

  FOR v_idx IN 0 .. jsonb_array_length(v_exceptions) - 1 LOOP
    v_entry := v_exceptions -> v_idx;
    IF (v_entry->>'date') = to_char(v_local_ts, 'YYYY-MM-DD') THEN
      IF COALESCE((v_entry->>'closed')::boolean, false) THEN
        RETURN false;
      END IF;

      IF v_entry ? 'intervals' THEN
        v_intervals := COALESCE(v_entry->'intervals', '[]'::jsonb);
        FOR v_idx IN 0 .. jsonb_array_length(v_intervals) - 1 LOOP
          v_interval := v_intervals -> v_idx;
          IF v_time >= (v_interval->>'start')::time AND v_time <= (v_interval->>'end')::time THEN
            RETURN true;
          END IF;
        END LOOP;
        RETURN false;
      END IF;

      RETURN true;
    END IF;
  END LOOP;

  v_intervals := COALESCE(v_weekly -> v_weekday, '[]'::jsonb);
  IF jsonb_array_length(v_intervals) = 0 THEN
    RETURN false;
  END IF;

  FOR v_idx IN 0 .. jsonb_array_length(v_intervals) - 1 LOOP
    v_interval := v_intervals -> v_idx;
    IF v_time >= (v_interval->>'start')::time AND v_time <= (v_interval->>'end')::time THEN
      RETURN true;
    END IF;
  END LOOP;

  RETURN false;
END;
$$;

CREATE OR REPLACE FUNCTION public.phase21_schedule_campaign(p_campaign_id uuid, p_scheduled_at timestamptz)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_settings jsonb;
BEGIN
  PERFORM public.phase21_assert_gestor();
  IF p_scheduled_at IS NULL OR p_scheduled_at <= now() THEN
    RAISE EXCEPTION 'scheduled_at_must_be_future';
  END IF;

  SELECT COALESCE(settings->'business_hours', '{}'::jsonb)
  INTO v_settings
  FROM public.professionals
  WHERE id = public.auth_professional_id();
  IF NOT public.phase21_business_hours_allows_timestamp(v_settings, p_scheduled_at) THEN
    RAISE EXCEPTION 'outside_business_hours';
  END IF;

  RETURN public.schedule_campaign(p_campaign_id, p_scheduled_at);
END;
$$;

CREATE OR REPLACE FUNCTION public.phase21_run_segmented_campaign(
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
  v_settings jsonb;
BEGIN
  PERFORM public.phase21_assert_gestor();
  SELECT COALESCE(settings->'business_hours', '{}'::jsonb)
  INTO v_settings
  FROM public.professionals
  WHERE id = public.auth_professional_id();
  IF NOT public.phase21_business_hours_allows_timestamp(v_settings, now()) THEN
    RAISE EXCEPTION 'outside_business_hours';
  END IF;

  RETURN public.run_segmented_campaign(p_campaign_id, p_channel, p_dry_run);
END;
$$;

CREATE OR REPLACE FUNCTION public.phase21_get_ambassador_dashboard()
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT COALESCE((
    SELECT jsonb_build_object(
      'partner_id', p.id,
      'affiliate_code', p.affiliate_code,
      'status', p.status,
      'commission_rate', p.commission_rate,
      'pending_balance_cents', p.pending_balance_cents,
      'referrals', COALESCE((SELECT jsonb_agg(jsonb_build_object(
        'id', r.id,
        'status', r.status,
        'attribution_code', r.attribution_code,
        'created_at', r.created_at
      ) ORDER BY r.created_at DESC) FROM public.platform_affiliate_referrals r WHERE r.partner_id = p.id), '[]'::jsonb),
      'commissions', COALESCE((SELECT jsonb_agg(jsonb_build_object(
        'id', c.id,
        'status', c.status,
        'amount_cents', c.amount_cents,
        'reference_month', c.reference_month,
        'created_at', c.created_at
      ) ORDER BY c.created_at DESC) FROM public.platform_affiliate_commissions c WHERE c.partner_id = p.id), '[]'::jsonb),
      'payments', COALESCE((SELECT jsonb_agg(jsonb_build_object(
        'id', pay.id,
        'status', pay.status,
        'amount_cents', pay.amount_cents,
        'reference_month', pay.reference_month,
        'created_at', pay.created_at
      ) ORDER BY pay.created_at DESC) FROM public.platform_affiliate_payments pay WHERE pay.partner_id = p.id), '[]'::jsonb)
    )
    FROM public.platform_affiliate_partners p
    WHERE p.professional_id = public.auth_professional_id()
  ), '{}'::jsonb);
$$;

ALTER FUNCTION public.phase21_schedule_campaign(uuid, timestamptz) VOLATILE;
ALTER FUNCTION public.phase21_run_segmented_campaign(uuid, text, boolean) VOLATILE;
