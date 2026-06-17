-- chat-media bucket: armazena imagens enviadas pelo profissional no chat WhatsApp.
-- Bucket público para que Evolution Go possa baixar a imagem via URL.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'chat-media',
  'chat-media',
  true,
  10485760,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']::text[]
)
ON CONFLICT (id) DO UPDATE
SET public = true,
    file_size_limit = 10485760,
    allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']::text[];

DROP POLICY IF EXISTS "chat_media_upload" ON storage.objects;
CREATE POLICY "chat_media_upload"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'chat-media');

DROP POLICY IF EXISTS "chat_media_read" ON storage.objects;
CREATE POLICY "chat_media_read"
ON storage.objects
FOR SELECT
TO public
USING (bucket_id = 'chat-media');

DROP POLICY IF EXISTS "chat_media_delete" ON storage.objects;
CREATE POLICY "chat_media_delete"
ON storage.objects
FOR DELETE
TO authenticated
USING (bucket_id = 'chat-media');

-- ROLLBACK:
-- DELETE FROM storage.buckets WHERE id = 'chat-media';
-- DROP POLICY IF EXISTS "chat_media_upload" ON storage.objects;
-- DROP POLICY IF EXISTS "chat_media_read" ON storage.objects;
-- DROP POLICY IF EXISTS "chat_media_delete" ON storage.objects;
