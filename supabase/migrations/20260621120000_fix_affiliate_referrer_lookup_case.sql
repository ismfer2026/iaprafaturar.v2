-- Fix: get_affiliate_referrer_name comparava o código de entrada (uppercased)
-- contra affiliate_code armazenado em case mista (6 chars do nome em
-- UPPERCASE + 6 chars de uuid em lowercase, ex: "BARBEA58c71d"). A comparação
-- nunca dava match, então a página de convite sempre cai no fallback genérico
-- em vez de mostrar o nome de quem indicou.
-- ROLLBACK: recriar a função com a comparação anterior (ap.affiliate_code =
-- upper(trim(p_affiliate_code))).

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
  WHERE upper(ap.affiliate_code) = upper(trim(coalesce(p_affiliate_code, '')))
    AND ap.status IN ('pending', 'active')
    AND p.deleted_at IS NULL
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.get_affiliate_referrer_name(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_affiliate_referrer_name(text) TO anon, authenticated;
