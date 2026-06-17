-- Migration: RPC update_campaign (edição de campanha em status draft)
-- ROLLBACK:
--   DROP FUNCTION IF EXISTS update_campaign(uuid, text, text, text, timestamptz);

CREATE OR REPLACE FUNCTION update_campaign(
  p_campaign_id   uuid,
  p_name          text,
  p_message       text,
  p_segment_type  text,
  p_scheduled_for timestamptz DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_status text;
BEGIN
  -- IDOR check + status check em uma query
  SELECT status INTO v_status
  FROM public.campaigns
  WHERE id = p_campaign_id
    AND professional_id = public.auth_professional_id();

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Unauthorized or campaign not found';
  END IF;

  IF v_status <> 'draft' THEN
    RAISE EXCEPTION 'Only draft campaigns can be edited (current status: %)', v_status;
  END IF;

  IF p_name IS NULL OR trim(p_name) = '' THEN
    RAISE EXCEPTION 'Campaign name cannot be empty';
  END IF;

  IF p_message IS NULL OR trim(p_message) = '' THEN
    RAISE EXCEPTION 'Campaign message cannot be empty';
  END IF;

  UPDATE public.campaigns
  SET name           = trim(p_name),
      message        = trim(p_message),
      segment_type   = COALESCE(p_segment_type, segment_type),
      scheduled_for  = p_scheduled_for,
      updated_at     = now()
  WHERE id = p_campaign_id;

  RETURN jsonb_build_object(
    'ok',          true,
    'campaign_id', p_campaign_id
  );
END;
$$;

REVOKE ALL ON FUNCTION update_campaign(uuid, text, text, text, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION update_campaign(uuid, text, text, text, timestamptz) TO authenticated;
