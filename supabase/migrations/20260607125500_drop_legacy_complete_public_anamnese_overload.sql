-- Removes the Phase 6 overload of complete_public_anamnese.
-- Phase 7B made photos/signature part of the public anamnese contract.
-- Keeping the old 10-argument RPC public would allow callers to complete a
-- ficha while silently discarding advanced assets.

DROP FUNCTION IF EXISTS public.complete_public_anamnese(
  uuid,
  jsonb,
  jsonb,
  jsonb,
  jsonb,
  jsonb,
  jsonb,
  boolean,
  text,
  text
);

-- Hardens private storage reads by resolving the ficha id from the object path
-- and using equality against anamnese_fichas.id instead of pattern matching.
DROP POLICY IF EXISTS "anamnese_assets_authenticated_read" ON storage.objects;
CREATE POLICY "anamnese_assets_authenticated_read"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'anamnese-assets'
  AND EXISTS (
    SELECT 1
    FROM public.anamnese_fichas f
    WHERE f.id = NULLIF(split_part(storage.objects.name, '/', 1), '')::uuid
      AND f.professional_id = public.auth_professional_id()
  )
);
