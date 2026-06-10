-- ============================================================
-- Phase 13 fix - update_commercial_settings audit payload
-- ============================================================
-- jsonb_object_keys() is set-returning and must be aggregated before
-- it is placed inside jsonb_build_object().
-- ============================================================

DROP FUNCTION IF EXISTS public.update_commercial_settings(jsonb);

CREATE OR REPLACE FUNCTION public.update_commercial_settings(p_settings jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_professional_id uuid;
  v_settings jsonb;
  v_updated_keys jsonb;
BEGIN
  v_professional_id := public.auth_professional_id();
  IF v_professional_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  IF p_settings IS NULL OR jsonb_typeof(p_settings) <> 'object' THEN
    RAISE EXCEPTION 'invalid_settings';
  END IF;

  SELECT COALESCE(jsonb_agg(key ORDER BY key), '[]'::jsonb)
  INTO v_updated_keys
  FROM jsonb_object_keys(p_settings) AS key;

  UPDATE public.professionals
  SET settings = COALESCE(settings, '{}'::jsonb) || jsonb_build_object(
      'pix_info', COALESCE(p_settings->'pix_info', settings->'pix_info'),
      'billing_info', COALESCE(p_settings->'billing_info', settings->'billing_info')
    )
  WHERE id = v_professional_id
  RETURNING settings INTO v_settings;

  PERFORM public.log_audit_event(
    v_professional_id,
    'professional',
    'commercial.settings.updated',
    'professional',
    v_professional_id,
    jsonb_build_object('updated_keys', v_updated_keys)
  );

  RETURN jsonb_build_object('ok', true, 'settings', v_settings);
END;
$$;

REVOKE ALL ON FUNCTION public.update_commercial_settings(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.update_commercial_settings(jsonb) TO authenticated;

-- ROLLBACK (manual):
-- Recreate public.update_commercial_settings(jsonb) from
-- 20260609133000_phase13_revenue_packages_documents_base.sql.
