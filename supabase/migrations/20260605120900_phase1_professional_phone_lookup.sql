-- ============================================================
-- Phase 1 correction: normalized professional phone lookup
--
-- Reason:
-- webhook-admin must link inbound admin-channel message_events to a
-- professional when the inbound phone belongs to a platform professional.
-- This lookup must never search clients and must be indexed/normalized.
-- ============================================================

CREATE OR REPLACE FUNCTION public.normalize_phone_digits(p_phone text)
RETURNS text
LANGUAGE sql
IMMUTABLE
STRICT
SET search_path = ''
AS $$
  SELECT regexp_replace(p_phone, '\D', '', 'g');
$$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_professionals_phone_whatsapp_digits
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
  SELECT p.id
  FROM public.professionals p
  WHERE p.phone_whatsapp IS NOT NULL
    AND p.deleted_at IS NULL
    AND public.normalize_phone_digits(p.phone_whatsapp) <> ''
    AND public.normalize_phone_digits(p.phone_whatsapp) = public.normalize_phone_digits(p_phone)
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.find_professional_by_whatsapp_phone(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.find_professional_by_whatsapp_phone(text) TO service_role;

COMMENT ON FUNCTION public.find_professional_by_whatsapp_phone(text) IS
  'Admin-channel lookup only. Resolves active professionals.phone_whatsapp by globally unique normalized digits. Never searches clients.';

-- Rollback note for development-only reset:
-- DROP FUNCTION IF EXISTS public.find_professional_by_whatsapp_phone(text);
-- DROP INDEX IF EXISTS public.idx_professionals_phone_whatsapp_digits;
-- DROP FUNCTION IF EXISTS public.normalize_phone_digits(text);
