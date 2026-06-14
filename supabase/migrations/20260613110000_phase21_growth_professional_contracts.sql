-- Phase 21: professional growth role hardening and additive read contracts.

CREATE OR REPLACE FUNCTION public.phase21_assert_gestor()
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_professional_id uuid;
BEGIN
  v_professional_id := public.auth_professional_id();
  IF v_professional_id IS NULL OR public.auth_professional_role() <> 'gestor' THEN
    RAISE EXCEPTION 'gestor_required';
  END IF;
  RETURN v_professional_id;
END;
$$;

REVOKE ALL ON FUNCTION public.phase21_assert_gestor() FROM PUBLIC, anon, authenticated;

DROP POLICY IF EXISTS "rfm_scores_isolation" ON public.rfm_scores;
CREATE POLICY "rfm_scores_isolation" ON public.rfm_scores
  FOR SELECT TO authenticated
  USING (professional_id = public.auth_professional_id() AND public.auth_professional_role() = 'gestor');

DROP POLICY IF EXISTS "client_health_scores_isolation" ON public.client_health_scores;
CREATE POLICY "client_health_scores_isolation" ON public.client_health_scores
  FOR SELECT TO authenticated
  USING (professional_id = public.auth_professional_id() AND public.auth_professional_role() = 'gestor');

DROP POLICY IF EXISTS "campaigns_isolation" ON public.campaigns;
CREATE POLICY "campaigns_isolation" ON public.campaigns
  FOR SELECT TO authenticated
  USING (professional_id = public.auth_professional_id() AND public.auth_professional_role() = 'gestor');

DROP POLICY IF EXISTS "campaign_recipients_isolation" ON public.campaign_recipients;
CREATE POLICY "campaign_recipients_isolation" ON public.campaign_recipients
  FOR SELECT TO authenticated
  USING (professional_id = public.auth_professional_id() AND public.auth_professional_role() = 'gestor');

DROP POLICY IF EXISTS "campaign_dispatches_isolation" ON public.campaign_dispatches;
CREATE POLICY "campaign_dispatches_isolation" ON public.campaign_dispatches
  FOR SELECT TO authenticated
  USING (professional_id = public.auth_professional_id() AND public.auth_professional_role() = 'gestor');

DROP POLICY IF EXISTS "referral_links_isolation" ON public.referral_links;
CREATE POLICY "referral_links_isolation" ON public.referral_links
  FOR SELECT TO authenticated
  USING (professional_id = public.auth_professional_id() AND public.auth_professional_role() = 'gestor');

DROP POLICY IF EXISTS "referral_events_isolation" ON public.referral_events;
CREATE POLICY "referral_events_isolation" ON public.referral_events
  FOR SELECT TO authenticated
  USING (professional_id = public.auth_professional_id() AND public.auth_professional_role() = 'gestor');

DROP POLICY IF EXISTS "campaign_cooldowns_select_isolation" ON public.campaign_cooldowns;
CREATE POLICY "campaign_cooldowns_select_isolation" ON public.campaign_cooldowns
  FOR SELECT TO authenticated
  USING (professional_id = public.auth_professional_id() AND public.auth_professional_role() = 'gestor');

DROP POLICY IF EXISTS "campaign_result_snapshots_select_isolation" ON public.campaign_result_snapshots;
CREATE POLICY "campaign_result_snapshots_select_isolation" ON public.campaign_result_snapshots
  FOR SELECT TO authenticated
  USING (professional_id = public.auth_professional_id() AND public.auth_professional_role() = 'gestor');

DROP POLICY IF EXISTS "loyalty_transactions_select_isolation" ON public.loyalty_transactions;
CREATE POLICY "loyalty_transactions_select_isolation" ON public.loyalty_transactions
  FOR SELECT TO authenticated
  USING (professional_id = public.auth_professional_id() AND public.auth_professional_role() = 'gestor');

DROP POLICY IF EXISTS "loyalty_redemptions_select_isolation" ON public.loyalty_redemptions;
CREATE POLICY "loyalty_redemptions_select_isolation" ON public.loyalty_redemptions
  FOR SELECT TO authenticated
  USING (professional_id = public.auth_professional_id() AND public.auth_professional_role() = 'gestor');

CREATE OR REPLACE FUNCTION public.phase21_get_growth_dashboard()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM public.phase21_assert_gestor();
  RETURN public.get_growth_commercial_dashboard();
END;
$$;

CREATE OR REPLACE FUNCTION public.phase21_create_campaign(
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
BEGIN
  PERFORM public.phase21_assert_gestor();
  RETURN public.create_campaign(p_name, p_segment_type, p_message_template, p_scheduled_at);
END;
$$;

CREATE OR REPLACE FUNCTION public.phase21_schedule_campaign(p_campaign_id uuid, p_scheduled_at timestamptz)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM public.phase21_assert_gestor();
  RETURN public.schedule_campaign(p_campaign_id, p_scheduled_at);
END;
$$;

CREATE OR REPLACE FUNCTION public.phase21_cancel_campaign(p_campaign_id uuid, p_reason text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM public.phase21_assert_gestor();
  RETURN public.cancel_campaign(p_campaign_id, p_reason);
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
BEGIN
  PERFORM public.phase21_assert_gestor();
  RETURN public.run_segmented_campaign(p_campaign_id, p_channel, p_dry_run);
END;
$$;

CREATE OR REPLACE FUNCTION public.phase21_refresh_growth_scores()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_professional_id uuid;
  v_rfm jsonb;
  v_health jsonb;
BEGIN
  v_professional_id := public.phase21_assert_gestor();
  v_rfm := public.calculate_rfm_for_professional(v_professional_id, 500, NULL);
  v_health := public.calculate_client_health_for_professional(v_professional_id, 500, NULL);
  RETURN jsonb_build_object('ok', true, 'rfm', v_rfm, 'health', v_health);
END;
$$;

CREATE OR REPLACE FUNCTION public.phase21_redeem_loyalty_reward(
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
BEGIN
  PERFORM public.phase21_assert_gestor();
  RETURN public.redeem_loyalty_reward(p_client_id, p_points, p_reward_type, p_reward_payload);
END;
$$;

CREATE OR REPLACE FUNCTION public.phase21_record_referral_reward(
  p_referral_event_id uuid,
  p_points integer DEFAULT 100,
  p_reward_payload jsonb DEFAULT '{}'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM public.phase21_assert_gestor();
  RETURN public.record_referral_reward_delivered(p_referral_event_id, p_points, p_reward_payload);
END;
$$;

CREATE OR REPLACE FUNCTION public.phase21_reconcile_loyalty()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_professional_id uuid;
BEGIN
  v_professional_id := public.phase21_assert_gestor();
  RETURN COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'client_id', c.id,
      'client_name', c.full_name,
      'stored_points', c.loyalty_points,
      'ledger_points', COALESCE(l.ledger_points, 0),
      'difference', c.loyalty_points - COALESCE(l.ledger_points, 0)
    ) ORDER BY abs(c.loyalty_points - COALESCE(l.ledger_points, 0)) DESC, c.full_name)
    FROM public.clients c
    LEFT JOIN (
      SELECT client_id, sum(points_delta)::integer AS ledger_points
      FROM public.loyalty_transactions
      WHERE professional_id = v_professional_id
      GROUP BY client_id
    ) l ON l.client_id = c.id
    WHERE c.professional_id = v_professional_id
      AND c.deleted_at IS NULL
      AND c.loyalty_points <> COALESCE(l.ledger_points, 0)
  ), '[]'::jsonb);
END;
$$;

CREATE INDEX IF NOT EXISTS idx_clients_professional_birth_date
  ON public.clients(professional_id, birth_date)
  WHERE birth_date IS NOT NULL AND deleted_at IS NULL;

CREATE OR REPLACE FUNCTION public.phase21_get_birthdays(
  p_month integer DEFAULT NULL,
  p_search text DEFAULT NULL,
  p_limit integer DEFAULT 100,
  p_offset integer DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_professional_id uuid;
BEGIN
  v_professional_id := public.auth_professional_id();
  IF v_professional_id IS NULL OR public.auth_professional_role() NOT IN ('gestor', 'operacional') THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;
  IF p_month IS NOT NULL AND p_month NOT BETWEEN 1 AND 12 THEN
    RAISE EXCEPTION 'invalid_month';
  END IF;

  RETURN jsonb_build_object(
    'items', COALESCE((
      SELECT jsonb_agg(to_jsonb(x) ORDER BY x.birth_month, x.birth_day, x.full_name)
      FROM (
        SELECT
          c.id,
          c.full_name,
          c.birth_date,
          extract(month FROM c.birth_date)::integer AS birth_month,
          extract(day FROM c.birth_date)::integer AS birth_day,
          c.phone_whatsapp,
          c.email,
          c.whatsapp_opt_out,
          c.email_opt_out
        FROM public.clients c
        WHERE c.professional_id = v_professional_id
          AND c.deleted_at IS NULL
          AND c.is_active = true
          AND c.birth_date IS NOT NULL
          AND (p_month IS NULL OR extract(month FROM c.birth_date)::integer = p_month)
          AND (
            NULLIF(trim(COALESCE(p_search, '')), '') IS NULL
            OR c.full_name ILIKE '%' || trim(p_search) || '%'
          )
        ORDER BY extract(month FROM c.birth_date), extract(day FROM c.birth_date), c.full_name
        LIMIT LEAST(GREATEST(COALESCE(p_limit, 100), 1), 250)
        OFFSET GREATEST(COALESCE(p_offset, 0), 0)
      ) x
    ), '[]'::jsonb),
    'limit', LEAST(GREATEST(COALESCE(p_limit, 100), 1), 250),
    'offset', GREATEST(COALESCE(p_offset, 0), 0)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.phase21_request_ambassador_program()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM public.phase21_assert_gestor();
  RETURN public.request_ambassador_program();
END;
$$;

CREATE OR REPLACE FUNCTION public.phase21_get_ambassador_dashboard()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM public.phase21_assert_gestor();
  RETURN public.get_my_ambassador_dashboard();
END;
$$;

REVOKE ALL ON FUNCTION public.phase21_get_growth_dashboard() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.phase21_create_campaign(text, text, text, timestamptz) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.phase21_schedule_campaign(uuid, timestamptz) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.phase21_cancel_campaign(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.phase21_run_segmented_campaign(uuid, text, boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.phase21_refresh_growth_scores() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.phase21_redeem_loyalty_reward(uuid, integer, text, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.phase21_record_referral_reward(uuid, integer, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.phase21_reconcile_loyalty() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.phase21_get_birthdays(integer, text, integer, integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.phase21_request_ambassador_program() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.phase21_get_ambassador_dashboard() FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.phase21_get_growth_dashboard() TO authenticated;
GRANT EXECUTE ON FUNCTION public.phase21_create_campaign(text, text, text, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.phase21_schedule_campaign(uuid, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.phase21_cancel_campaign(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.phase21_run_segmented_campaign(uuid, text, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.phase21_refresh_growth_scores() TO authenticated;
GRANT EXECUTE ON FUNCTION public.phase21_redeem_loyalty_reward(uuid, integer, text, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.phase21_record_referral_reward(uuid, integer, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.phase21_reconcile_loyalty() TO authenticated;
GRANT EXECUTE ON FUNCTION public.phase21_get_birthdays(integer, text, integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.phase21_request_ambassador_program() TO authenticated;
GRANT EXECUTE ON FUNCTION public.phase21_get_ambassador_dashboard() TO authenticated;

REVOKE EXECUTE ON FUNCTION public.create_campaign(text, text, text, timestamptz) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.schedule_campaign(uuid, timestamptz) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.cancel_campaign(uuid, text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.run_segmented_campaign(uuid, text, boolean) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.get_growth_commercial_dashboard() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.get_campaign_results(uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.get_reactivation_queue(integer) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.calculate_rfm_for_professional(uuid, integer, uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.calculate_client_health_for_professional(uuid, integer, uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.record_referral_reward_delivered(uuid, integer, jsonb) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.redeem_loyalty_reward(uuid, integer, text, jsonb) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.request_ambassador_program() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.get_my_ambassador_dashboard() FROM authenticated;
