-- Phase 21 follow-up: align wrapper volatility with underlying queue query behavior.

CREATE OR REPLACE FUNCTION public.phase21_get_reactivation_queue(p_limit integer DEFAULT 50)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM public.phase21_assert_gestor();
  RETURN COALESCE(public.get_reactivation_queue(p_limit), '[]'::jsonb);
END;
$$;

REVOKE ALL ON FUNCTION public.phase21_get_reactivation_queue(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.phase21_get_reactivation_queue(integer) TO authenticated;
