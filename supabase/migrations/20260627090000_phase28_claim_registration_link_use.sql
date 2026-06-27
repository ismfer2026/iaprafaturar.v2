CREATE OR REPLACE FUNCTION public.claim_registration_link_use(
  p_code text,
  p_slug text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_code text;
  v_slug text;
  v_link_id uuid;
BEGIN
  v_code := btrim(COALESCE(p_code, ''));
  v_slug := lower(btrim(COALESCE(p_slug, '')));

  IF v_code = '' OR v_slug = '' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_input');
  END IF;

  UPDATE public.registration_links AS rl
  SET uses_count = rl.uses_count + 1
  FROM public.professionals AS p
  WHERE rl.professional_id = p.id
    AND lower(rl.code) = lower(v_code)
    AND p.slug = v_slug
    AND rl.is_active = true
    AND (rl.expires_at IS NULL OR rl.expires_at > now())
    AND p.deleted_at IS NULL
    AND p.onboarding_completed = true
    AND (rl.max_uses IS NULL OR rl.uses_count < rl.max_uses)
  RETURNING rl.id INTO v_link_id;

  IF v_link_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;

  RETURN jsonb_build_object('ok', true, 'registration_link_id', v_link_id);
END;
$$;

REVOKE ALL ON FUNCTION public.claim_registration_link_use(text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_registration_link_use(text, text) TO service_role;

COMMENT ON FUNCTION public.claim_registration_link_use(text, text)
IS 'Phase 28: atomically consumes one registration link use after successful client onboarding/session creation.';
