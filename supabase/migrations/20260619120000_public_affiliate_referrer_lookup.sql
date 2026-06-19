-- Lookup público (anon) de nome do indicador a partir do código de afiliado.
-- Usado pela página de captura de convite (/convite/:codigo) para personalizar
-- a mensagem antes do cadastro. Expõe apenas o primeiro nome — nunca email,
-- telefone ou professional_id.
-- ROLLBACK: DROP FUNCTION IF EXISTS public.get_affiliate_referrer_name(text);

CREATE OR REPLACE FUNCTION public.get_affiliate_referrer_name(p_affiliate_code text)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT jsonb_build_object(
    'name', split_part(trim(coalesce(p.business_name, p.name, '')), ' ', 1),
    'commission_rate', ap.commission_rate
  )
  FROM public.platform_affiliate_partners ap
  JOIN public.professionals p ON p.id = ap.professional_id
  WHERE ap.affiliate_code = upper(trim(coalesce(p_affiliate_code, '')))
    AND ap.status IN ('pending', 'active')
    AND p.deleted_at IS NULL
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.get_affiliate_referrer_name(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_affiliate_referrer_name(text) TO anon, authenticated;

COMMENT ON FUNCTION public.get_affiliate_referrer_name(text)
  IS 'Lookup público por affiliate_code para personalizar a página de captura de convite. Retorna apenas primeiro nome e taxa de comissão.';
