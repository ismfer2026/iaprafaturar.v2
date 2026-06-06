-- ============================================================
-- Phase 1 correction: do not enforce global phone uniqueness
--
-- Reason:
-- A phone number can legitimately appear in other tenant contexts as a
-- client/patient contact. Also, account creation must not be blocked by
-- an operational routing helper. Admin-channel routing should link a
-- professional only when the match is unambiguous.
-- ============================================================

DROP INDEX IF EXISTS public.idx_professionals_phone_whatsapp_digits;

CREATE INDEX IF NOT EXISTS idx_professionals_phone_whatsapp_digits
ON public.professionals (public.normalize_phone_digits(phone_whatsapp))
WHERE phone_whatsapp IS NOT NULL
  AND deleted_at IS NULL
  AND public.normalize_phone_digits(phone_whatsapp) <> '';

CREATE OR REPLACE FUNCTION public.find_professional_by_whatsapp_phone(p_phone text)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  WITH matches AS (
    SELECT p.id
    FROM public.professionals p
    WHERE p.phone_whatsapp IS NOT NULL
      AND p.deleted_at IS NULL
      AND public.normalize_phone_digits(p.phone_whatsapp) <> ''
      AND public.normalize_phone_digits(p.phone_whatsapp) = public.normalize_phone_digits(p_phone)
  )
  SELECT CASE
    WHEN count(*) = 1 THEN (array_agg(id))[1]
    ELSE NULL::uuid
  END
  FROM matches;
$$;

REVOKE ALL ON FUNCTION public.find_professional_by_whatsapp_phone(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.find_professional_by_whatsapp_phone(text) TO service_role;

COMMENT ON FUNCTION public.find_professional_by_whatsapp_phone(text) IS
  'Admin-channel lookup only. Returns a professional id only for one unambiguous active professionals.phone_whatsapp match. Never searches clients and never blocks account creation.';
