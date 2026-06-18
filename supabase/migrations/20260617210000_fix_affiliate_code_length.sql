-- Fix: limita código de afiliado a 6 chars do nome + 6 chars de UUID (máximo 12 chars)
-- Rollback: restaurar a função anterior (código abaixo em comentário para referência)
-- ROLLBACK: recriar com SELECT upper(regexp_replace(...)) || substring(..., 1, 4)

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

  -- Gera código: até 6 chars do nome + 6 chars aleatórios = máximo 12 chars
  SELECT
    UPPER(SUBSTRING(regexp_replace(COALESCE(name, 'PRO'), '[^A-Za-z0-9]+', '', 'g'), 1, 6))
    || LOWER(SUBSTRING(replace(gen_random_uuid()::text, '-', ''), 1, 6))
  INTO v_code
  FROM public.professionals
  WHERE id = v_professional_id;

  INSERT INTO public.platform_affiliate_partners (professional_id, affiliate_code, status)
  VALUES (
    v_professional_id,
    COALESCE(NULLIF(v_code, ''), 'PRO' || LOWER(SUBSTRING(replace(gen_random_uuid()::text, '-', ''), 1, 6))),
    'pending'
  )
  ON CONFLICT (professional_id) DO UPDATE SET updated_at = now()
  RETURNING * INTO v_partner;

  PERFORM public.log_audit_event(
    v_professional_id, 'professional', 'ambassador.requested',
    'platform_affiliate_partner', v_partner.id,
    jsonb_build_object('status', v_partner.status)
  );

  RETURN to_jsonb(v_partner);
END;
$$;

REVOKE ALL ON FUNCTION public.request_ambassador_program() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.request_ambassador_program() TO authenticated;
