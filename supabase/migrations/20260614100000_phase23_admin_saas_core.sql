-- Phase 23 - Curated admin SaaS contracts and sanitized platform settings.

CREATE TABLE public.platform_admin_settings (
  setting_key text PRIMARY KEY CHECK (setting_key IN ('evolution', 'stripe', 'ai', 'security')),
  status text NOT NULL DEFAULT 'not_configured' CHECK (status IN ('not_configured', 'configured', 'healthy', 'degraded', 'offline')),
  public_status jsonb NOT NULL DEFAULT '{}',
  secret_configured boolean NOT NULL DEFAULT false,
  last_checked_at timestamptz,
  updated_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.platform_admin_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_user_id uuid NOT NULL,
  event_type text NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid,
  payload jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.platform_admin_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_admin_audit_log ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.platform_admin_settings FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.platform_admin_audit_log FROM PUBLIC, anon, authenticated;

CREATE TRIGGER prevent_platform_admin_audit_log_change
BEFORE UPDATE OR DELETE ON public.platform_admin_audit_log
FOR EACH ROW EXECUTE FUNCTION public.fn_log_immutable();

CREATE TRIGGER set_platform_admin_settings_updated_at
BEFORE UPDATE ON public.platform_admin_settings
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

INSERT INTO public.platform_admin_settings (setting_key)
VALUES ('evolution'), ('stripe'), ('ai'), ('security')
ON CONFLICT (setting_key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.phase23_log_admin_event(p_event_type text, p_entity_type text, p_entity_id uuid, p_payload jsonb DEFAULT '{}')
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_admin_id uuid; v_id uuid;
BEGIN
  v_admin_id := public.admin_assert_master();
  INSERT INTO public.platform_admin_audit_log (admin_user_id, event_type, entity_type, entity_id, payload)
  VALUES (v_admin_id, p_event_type, p_entity_type, p_entity_id, COALESCE(p_payload, '{}'))
  RETURNING id INTO v_id;
  RETURN v_id;
END; $$;

CREATE OR REPLACE FUNCTION public.phase23_get_admin_dashboard()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_base jsonb;
  v_alerts jsonb;
  v_recent jsonb;
BEGIN
  PERFORM public.admin_assert_master();
  v_base := public.get_admin_dashboard_rpc();

  SELECT jsonb_build_object(
    'critical_health', COUNT(*) FILTER (WHERE COALESCE(h.health_level, '') = 'critico'),
    'whatsapp_offline', COUNT(*) FILTER (WHERE p.whatsapp_connected = false),
    'onboarding_pending', COUNT(*) FILTER (WHERE p.onboarding_completed = false),
    'credits_zero', COUNT(*) FILTER (
      WHERE COALESCE((SELECT SUM(w.balance) FROM public.ai_credit_wallets w WHERE w.professional_id = p.id), 0) = 0
    ),
    'suspended', COUNT(*) FILTER (WHERE a.access_status = 'suspended')
  )
  INTO v_alerts
  FROM public.professionals p
  LEFT JOIN public.professional_platform_health_scores h ON h.professional_id = p.id
  LEFT JOIN public.professional_access_states a ON a.professional_id = p.id
  WHERE p.deleted_at IS NULL;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', p.id,
    'name', p.name,
    'business_name', p.business_name,
    'plan_type', p.plan_type,
    'onboarding_completed', p.onboarding_completed,
    'created_at', p.created_at
  ) ORDER BY p.created_at DESC), '[]'::jsonb)
  INTO v_recent
  FROM (
    SELECT id, name, business_name, plan_type, onboarding_completed, created_at
    FROM public.professionals
    WHERE deleted_at IS NULL
    ORDER BY created_at DESC
    LIMIT 8
  ) p;

  RETURN v_base || jsonb_build_object(
    'alerts', COALESCE(v_alerts, '{}'::jsonb),
    'recent_professionals', COALESCE(v_recent, '[]'::jsonb)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.phase23_get_admin_analytics(p_days integer DEFAULT 90)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_days integer := LEAST(GREATEST(COALESCE(p_days, 90), 7), 365);
BEGIN
  PERFORM public.admin_assert_master();
  RETURN jsonb_build_object(
    'period_days', v_days,
    'metrics', COALESCE((
      SELECT jsonb_agg(to_jsonb(m) ORDER BY m.date)
      FROM (
        SELECT date, total_professionals, new_professionals, active_professionals,
          churned_professionals, mrr, total_messages_sent
        FROM public.platform_metrics_daily
        WHERE date >= CURRENT_DATE - v_days
        ORDER BY date
      ) m
    ), '[]'::jsonb),
    'plans', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('plan', plan_type, 'professionals', total) ORDER BY plan_type)
      FROM (
        SELECT plan_type, COUNT(*)::integer AS total
        FROM public.professionals
        WHERE deleted_at IS NULL
        GROUP BY plan_type
      ) p
    ), '[]'::jsonb),
    'health', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('level', health_level, 'professionals', total) ORDER BY health_level)
      FROM (
        SELECT health_level, COUNT(*)::integer AS total
        FROM public.professional_platform_health_scores
        GROUP BY health_level
      ) h
    ), '[]'::jsonb),
    'ai', jsonb_build_object(
      'credits_used', COALESCE((SELECT SUM(credits_used) FROM public.ai_usage_events WHERE created_at >= now() - make_interval(days => v_days)), 0),
      'events', COALESCE((SELECT COUNT(*) FROM public.ai_usage_events WHERE created_at >= now() - make_interval(days => v_days)), 0)
    )
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.phase23_get_admin_professionals(
  p_limit integer DEFAULT 50,
  p_cursor uuid DEFAULT NULL,
  p_search text DEFAULT NULL,
  p_health_level text DEFAULT NULL,
  p_plan_type text DEFAULT NULL,
  p_access_status text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_limit integer := LEAST(GREATEST(COALESCE(p_limit, 50), 1), 100);
BEGIN
  PERFORM public.admin_assert_master();
  RETURN jsonb_build_object(
    'items', COALESCE((
      SELECT jsonb_agg(to_jsonb(r) ORDER BY r.id)
      FROM (
        SELECT p.id, p.name, p.business_name, p.email, p.plan_type, p.whatsapp_connected,
          p.onboarding_completed, p.created_at, h.total_score, h.health_level,
          COALESCE(a.access_status, 'full') AS access_status,
          COALESCE((SELECT SUM(w.balance) FROM public.ai_credit_wallets w WHERE w.professional_id = p.id), 0)::integer AS ai_credit_balance,
          s.status AS subscription_status
        FROM public.professionals p
        LEFT JOIN public.professional_platform_health_scores h ON h.professional_id = p.id
        LEFT JOIN public.professional_access_states a ON a.professional_id = p.id
        LEFT JOIN public.professional_subscriptions s ON s.professional_id = p.id
        WHERE p.deleted_at IS NULL
          AND (p_cursor IS NULL OR p.id > p_cursor)
          AND (NULLIF(trim(COALESCE(p_search, '')), '') IS NULL OR p.name ILIKE '%' || trim(p_search) || '%' OR p.email ILIKE '%' || trim(p_search) || '%' OR p.business_name ILIKE '%' || trim(p_search) || '%')
          AND (NULLIF(trim(COALESCE(p_health_level, '')), '') IS NULL OR h.health_level = p_health_level)
          AND (NULLIF(trim(COALESCE(p_plan_type, '')), '') IS NULL OR p.plan_type = p_plan_type)
          AND (NULLIF(trim(COALESCE(p_access_status, '')), '') IS NULL OR COALESCE(a.access_status, 'full') = p_access_status)
        ORDER BY p.id
        LIMIT v_limit
      ) r
    ), '[]'::jsonb)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.phase23_get_admin_professional_detail(p_professional_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_result jsonb;
BEGIN
  PERFORM public.admin_assert_master();
  SELECT jsonb_build_object(
    'professional', jsonb_build_object(
      'id', p.id, 'name', p.name, 'business_name', p.business_name, 'email', p.email,
      'phone_whatsapp', p.phone_whatsapp, 'slug', p.slug, 'plan_type', p.plan_type,
      'trial_ends_at', p.trial_ends_at, 'whatsapp_connected', p.whatsapp_connected,
      'onboarding_completed', p.onboarding_completed, 'created_at', p.created_at
    ),
    'health', CASE WHEN h.id IS NULL THEN NULL ELSE jsonb_build_object(
      'total_score', h.total_score, 'health_level', h.health_level, 'calculated_at', h.calculated_at
    ) END,
    'access', CASE WHEN a.professional_id IS NULL THEN jsonb_build_object('access_status', 'full', 'reason', 'default') ELSE jsonb_build_object(
      'access_status', a.access_status, 'reason', a.reason, 'updated_at', a.updated_at
    ) END,
    'subscription', CASE WHEN s.id IS NULL THEN NULL ELSE jsonb_build_object(
      'id', s.id, 'status', s.status, 'source', s.source, 'current_period_end', s.current_period_end,
      'cancel_at_period_end', s.cancel_at_period_end, 'plan_slug', pl.slug
    ) END,
    'wallets', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', w.id, 'wallet_type', w.wallet_type, 'balance', w.balance, 'expires_at', w.expires_at) ORDER BY w.created_at) FROM public.ai_credit_wallets w WHERE w.professional_id = p.id), '[]'::jsonb),
    'agents', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', pa.id, 'agent_name', pa.agent_name, 'shadow_mode', pa.shadow_mode, 'auto_respond', pa.auto_respond, 'enabled_agents', pa.enabled_agents)) FROM public.professional_agents pa WHERE pa.professional_id = p.id), '[]'::jsonb)
  )
  INTO v_result
  FROM public.professionals p
  LEFT JOIN public.professional_platform_health_scores h ON h.professional_id = p.id
  LEFT JOIN public.professional_access_states a ON a.professional_id = p.id
  LEFT JOIN public.professional_subscriptions s ON s.professional_id = p.id
  LEFT JOIN public.platform_plans pl ON pl.id = s.plan_id
  WHERE p.id = p_professional_id AND p.deleted_at IS NULL;
  IF v_result IS NULL THEN RAISE EXCEPTION 'professional_not_found'; END IF;
  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.phase23_set_professional_access(p_professional_id uuid, p_access_status text, p_reason text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_admin_id uuid;
BEGIN
  v_admin_id := public.admin_assert_master();
  IF p_access_status NOT IN ('full', 'read_only', 'suspended') THEN RAISE EXCEPTION 'invalid_access_status'; END IF;
  IF NULLIF(trim(COALESCE(p_reason, '')), '') IS NULL THEN RAISE EXCEPTION 'reason_required'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.professionals WHERE id = p_professional_id AND deleted_at IS NULL) THEN RAISE EXCEPTION 'professional_not_found'; END IF;
  INSERT INTO public.professional_access_states (professional_id, access_status, reason, readonly_since, locked_since, metadata)
  VALUES (p_professional_id, p_access_status, trim(p_reason),
    CASE WHEN p_access_status = 'read_only' THEN now() ELSE NULL END,
    CASE WHEN p_access_status = 'suspended' THEN now() ELSE NULL END,
    jsonb_build_object('admin_id', v_admin_id))
  ON CONFLICT (professional_id) DO UPDATE SET
    access_status = EXCLUDED.access_status, reason = EXCLUDED.reason,
    readonly_since = EXCLUDED.readonly_since, locked_since = EXCLUDED.locked_since,
    metadata = EXCLUDED.metadata, updated_at = now();
  PERFORM public.log_audit_event(p_professional_id, 'admin', 'admin.professional.access_changed', 'professional', p_professional_id, jsonb_build_object('admin_id', v_admin_id, 'access_status', p_access_status, 'reason', trim(p_reason)));
  RETURN jsonb_build_object('ok', true, 'professional_id', p_professional_id, 'access_status', p_access_status);
END;
$$;

CREATE OR REPLACE FUNCTION public.phase23_get_admin_plans()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM public.admin_assert_master();
  RETURN jsonb_build_object(
    'governance', 'migration_rpc_controlled',
    'plans', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', p.id, 'slug', p.slug, 'name', p.name, 'description', p.description, 'monthly_price_cents', p.monthly_price_cents, 'annual_price_cents', p.annual_price_cents, 'included_ai_credits', p.included_ai_credits, 'client_limit', p.client_limit, 'team_limit', p.team_limit, 'is_public', p.is_public, 'is_active', p.is_active) ORDER BY p.monthly_price_cents) FROM public.platform_plans p), '[]'::jsonb),
    'subscriptions', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', s.id, 'professional_id', s.professional_id, 'professional_name', p.name, 'plan_slug', pl.slug, 'status', s.status, 'source', s.source, 'current_period_end', s.current_period_end) ORDER BY s.updated_at DESC) FROM public.professional_subscriptions s JOIN public.professionals p ON p.id = s.professional_id JOIN public.platform_plans pl ON pl.id = s.plan_id LIMIT 100), '[]'::jsonb)
  );
END; $$;

CREATE OR REPLACE FUNCTION public.phase23_get_admin_agents()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM public.admin_assert_master();
  RETURN jsonb_build_object('agents', COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'id', a.id, 'agent_slug', a.agent_slug, 'display_name', a.display_name, 'status', a.status, 'owner', a.owner,
      'active_version', (SELECT v.version FROM public.agent_prompt_versions v WHERE v.agent_id = a.id AND v.status = 'active' ORDER BY v.version DESC LIMIT 1),
      'versions', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', v.id, 'version', v.version, 'status', v.status, 'changelog', v.changelog, 'created_at', v.created_at) ORDER BY v.version DESC) FROM public.agent_prompt_versions v WHERE v.agent_id = a.id), '[]'::jsonb),
      'last_pause_until', (SELECT pw.paused_until FROM public.agent_pause_windows pw WHERE pw.agent_id = a.id ORDER BY pw.created_at DESC LIMIT 1),
      'executions_30d', (SELECT COUNT(*) FROM public.agent_executions e WHERE e.agent_slug = a.agent_slug AND e.created_at >= now() - interval '30 days')
    ) ORDER BY a.agent_slug) FROM public.agent_registry a
  ), '[]'::jsonb));
END; $$;

CREATE OR REPLACE FUNCTION public.phase23_get_admin_improvements()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM public.admin_assert_master();
  RETURN jsonb_build_object('items', COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'id', f.id, 'title', f.title, 'description', f.description, 'category', f.category,
      'priority', f.priority, 'status', f.status, 'status_reason', f.status_reason,
      'professional_name', p.name, 'votes', (SELECT COUNT(*) FROM public.feature_request_votes v WHERE v.feature_request_id = f.id),
      'comments', (SELECT COUNT(*) FROM public.feature_request_comments c WHERE c.feature_request_id = f.id),
      'created_at', f.created_at, 'updated_at', f.updated_at
    ) ORDER BY f.updated_at DESC) FROM public.feature_requests f JOIN public.professionals p ON p.id = f.professional_id
  ), '[]'::jsonb));
END; $$;

CREATE OR REPLACE FUNCTION public.phase23_get_admin_settings()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM public.admin_assert_master();
  RETURN jsonb_build_object('items', COALESCE((
    SELECT jsonb_agg(jsonb_build_object('setting_key', setting_key, 'status', status, 'public_status', public_status, 'secret_configured', secret_configured, 'last_checked_at', last_checked_at, 'updated_at', updated_at) ORDER BY setting_key)
    FROM public.platform_admin_settings
  ), '[]'::jsonb));
END; $$;

CREATE OR REPLACE FUNCTION public.phase23_register_agent_prompt_version(p_agent_slug text, p_display_name text, p_prompt_body text, p_changelog text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_result jsonb;
BEGIN
  PERFORM public.admin_assert_master();
  IF NULLIF(trim(COALESCE(p_changelog, '')), '') IS NULL THEN RAISE EXCEPTION 'reason_required'; END IF;
  v_result := public.admin_register_agent_prompt_version(p_agent_slug, p_display_name, p_prompt_body, p_changelog);
  PERFORM public.phase23_log_admin_event('admin.agent.prompt_staged', 'agent_registry', (v_result->>'agent_id')::uuid, jsonb_build_object('agent_slug', p_agent_slug, 'version_id', v_result->>'version_id', 'reason', p_changelog));
  RETURN v_result;
END; $$;

CREATE OR REPLACE FUNCTION public.phase23_promote_agent_prompt_version(p_version_id uuid, p_reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_result jsonb;
BEGIN
  PERFORM public.admin_assert_master();
  IF NULLIF(trim(COALESCE(p_reason, '')), '') IS NULL THEN RAISE EXCEPTION 'reason_required'; END IF;
  v_result := public.admin_promote_agent_prompt_version(p_version_id);
  PERFORM public.phase23_log_admin_event('admin.agent.prompt_promoted', 'agent_prompt_version', p_version_id, jsonb_build_object('reason', p_reason));
  RETURN v_result;
END; $$;

CREATE OR REPLACE FUNCTION public.phase23_pause_agent(p_agent_slug text, p_until timestamptz, p_reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_result jsonb;
BEGIN
  PERFORM public.admin_assert_master();
  IF NULLIF(trim(COALESCE(p_reason, '')), '') IS NULL THEN RAISE EXCEPTION 'reason_required'; END IF;
  v_result := public.admin_pause_agent(p_agent_slug, p_until, p_reason);
  PERFORM public.phase23_log_admin_event('admin.agent.paused', 'agent_registry', (v_result->>'agent_id')::uuid, jsonb_build_object('agent_slug', p_agent_slug, 'paused_until', p_until, 'reason', p_reason));
  RETURN v_result;
END; $$;

CREATE OR REPLACE FUNCTION public.phase23_upsert_admin_setting_status(p_setting_key text, p_status text, p_public_status jsonb, p_secret_configured boolean, p_reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_admin_id uuid;
BEGIN
  v_admin_id := public.admin_assert_master();
  IF p_setting_key NOT IN ('evolution', 'stripe', 'ai', 'security') THEN RAISE EXCEPTION 'invalid_setting_key'; END IF;
  IF p_status NOT IN ('not_configured', 'configured', 'healthy', 'degraded', 'offline') THEN RAISE EXCEPTION 'invalid_status'; END IF;
  IF NULLIF(trim(COALESCE(p_reason, '')), '') IS NULL THEN RAISE EXCEPTION 'reason_required'; END IF;
  INSERT INTO public.platform_admin_settings (setting_key, status, public_status, secret_configured, last_checked_at, updated_by)
  VALUES (p_setting_key, p_status, COALESCE(p_public_status, '{}'), COALESCE(p_secret_configured, false), now(), v_admin_id)
  ON CONFLICT (setting_key) DO UPDATE SET status = EXCLUDED.status, public_status = EXCLUDED.public_status, secret_configured = EXCLUDED.secret_configured, last_checked_at = now(), updated_by = v_admin_id, updated_at = now();
  PERFORM public.phase23_log_admin_event('admin.platform_setting.status_updated', 'platform_setting', NULL, jsonb_build_object('admin_id', v_admin_id, 'setting_key', p_setting_key, 'status', p_status, 'reason', trim(p_reason)));
  RETURN jsonb_build_object('ok', true, 'setting_key', p_setting_key, 'status', p_status);
END; $$;

REVOKE ALL ON FUNCTION public.phase23_get_admin_dashboard() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.phase23_get_admin_analytics(integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.phase23_get_admin_professionals(integer, uuid, text, text, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.phase23_get_admin_professional_detail(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.phase23_set_professional_access(uuid, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.phase23_get_admin_plans() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.phase23_get_admin_agents() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.phase23_get_admin_improvements() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.phase23_get_admin_settings() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.phase23_log_admin_event(text, text, uuid, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.phase23_register_agent_prompt_version(text, text, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.phase23_promote_agent_prompt_version(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.phase23_pause_agent(text, timestamptz, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.phase23_upsert_admin_setting_status(text, text, jsonb, boolean, text) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.phase23_get_admin_dashboard() TO authenticated;
GRANT EXECUTE ON FUNCTION public.phase23_get_admin_analytics(integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.phase23_get_admin_professionals(integer, uuid, text, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.phase23_get_admin_professional_detail(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.phase23_set_professional_access(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.phase23_get_admin_plans() TO authenticated;
GRANT EXECUTE ON FUNCTION public.phase23_get_admin_agents() TO authenticated;
GRANT EXECUTE ON FUNCTION public.phase23_get_admin_improvements() TO authenticated;
GRANT EXECUTE ON FUNCTION public.phase23_get_admin_settings() TO authenticated;
GRANT EXECUTE ON FUNCTION public.phase23_register_agent_prompt_version(text, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.phase23_promote_agent_prompt_version(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.phase23_pause_agent(text, timestamptz, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.phase23_upsert_admin_setting_status(text, text, jsonb, boolean, text) TO authenticated;
