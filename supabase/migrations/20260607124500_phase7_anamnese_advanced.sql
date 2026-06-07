-- Phase 7B - Advanced anamnese completion.
-- Closes the Phase 6 items explicitly deferred to Phase 7:
-- storage bucket, public asset capture, visual signature/acceptance,
-- professional review notes and reviewed status.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'anamnese-assets',
  'anamnese-assets',
  false,
  5242880,
  ARRAY['image/jpeg', 'image/png', 'image/webp']::text[]
)
ON CONFLICT (id) DO UPDATE
SET public = false,
    file_size_limit = 5242880,
    allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp']::text[];

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
    WHERE f.professional_id = public.auth_professional_id()
      AND name LIKE f.id::text || '/%'
  )
);

CREATE OR REPLACE FUNCTION public.review_anamnese_ficha(
  p_ficha_id uuid,
  p_notas_profissional text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_professional_id uuid;
  v_reviewer_team_member_id uuid;
  v_ficha public.anamnese_fichas%ROWTYPE;
BEGIN
  v_professional_id := public.auth_professional_id();

  IF v_professional_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  SELECT * INTO v_ficha
  FROM public.anamnese_fichas
  WHERE id = p_ficha_id
    AND professional_id = v_professional_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'anamnese_not_found';
  END IF;

  IF v_ficha.status NOT IN ('preenchido', 'revisado') THEN
    RAISE EXCEPTION 'anamnese_not_ready_for_review';
  END IF;

  SELECT tm.id INTO v_reviewer_team_member_id
  FROM public.team_members tm
  WHERE tm.professional_id = v_professional_id
    AND tm.user_id = auth.uid()
    AND tm.is_active = true
  ORDER BY tm.created_at ASC
  LIMIT 1;

  UPDATE public.anamnese_fichas
  SET status = 'revisado',
      notas_profissional = NULLIF(trim(COALESCE(p_notas_profissional, '')), ''),
      revisado_em = now(),
      revisado_por = v_reviewer_team_member_id
  WHERE id = v_ficha.id
  RETURNING * INTO v_ficha;

  PERFORM public.log_audit_event(
    v_professional_id,
    'professional',
    'anamnese.reviewed',
    'anamnese_ficha',
    v_ficha.id,
    jsonb_build_object(
      'ficha_id', v_ficha.id,
      'client_id', v_ficha.client_id,
      'has_notes', v_ficha.notas_profissional IS NOT NULL
    )
  );

  RETURN jsonb_build_object(
    'ok', true,
    'ficha_id', v_ficha.id,
    'status', v_ficha.status,
    'revisado_em', v_ficha.revisado_em
  );
END;
$$;

REVOKE ALL ON FUNCTION public.review_anamnese_ficha(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.review_anamnese_ficha(uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.complete_public_anamnese(
  p_token uuid,
  p_dados_pessoais jsonb DEFAULT '{}',
  p_queixas jsonb DEFAULT '{}',
  p_historico jsonb DEFAULT '{}',
  p_alergias jsonb DEFAULT '{}',
  p_habitos jsonb DEFAULT '{}',
  p_custom_data jsonb DEFAULT '{}',
  p_lgpd_aceito boolean DEFAULT false,
  p_lgpd_ip text DEFAULT NULL,
  p_lang text DEFAULT 'pt-BR',
  p_fotos jsonb DEFAULT '[]',
  p_assinatura_url text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_ficha public.anamnese_fichas%ROWTYPE;
BEGIN
  IF p_lgpd_aceito IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'lgpd_required';
  END IF;

  SELECT * INTO v_ficha
  FROM public.anamnese_fichas
  WHERE public_token = p_token
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'anamnese_not_found';
  END IF;

  IF v_ficha.token_expires_at <= now() THEN
    UPDATE public.anamnese_fichas
    SET status = 'expirado'
    WHERE id = v_ficha.id
    RETURNING * INTO v_ficha;

    RAISE EXCEPTION 'anamnese_expired';
  END IF;

  IF v_ficha.status <> 'aguardando' THEN
    RAISE EXCEPTION 'anamnese_already_completed';
  END IF;

  UPDATE public.anamnese_fichas
  SET status = 'preenchido',
      dados_pessoais = COALESCE(p_dados_pessoais, '{}'),
      queixas = COALESCE(p_queixas, '{}'),
      historico = COALESCE(p_historico, '{}'),
      alergias = COALESCE(p_alergias, '{}'),
      habitos = COALESCE(p_habitos, '{}'),
      custom_data = COALESCE(p_custom_data, '{}'),
      fotos = COALESCE(p_fotos, '[]'),
      assinatura_url = NULLIF(trim(COALESCE(p_assinatura_url, '')), ''),
      assinado_em = CASE
        WHEN NULLIF(trim(COALESCE(p_assinatura_url, '')), '') IS NOT NULL THEN now()
        ELSE NULL
      END,
      lgpd_aceito = true,
      lgpd_aceito_em = now(),
      lgpd_ip = NULLIF(trim(COALESCE(p_lgpd_ip, '')), ''),
      preenchido_em = now()
  WHERE id = v_ficha.id
  RETURNING * INTO v_ficha;

  UPDATE public.clients
  SET has_anamnese = true,
      last_anamnese_at = now()
  WHERE id = v_ficha.client_id
    AND professional_id = v_ficha.professional_id;

  PERFORM public.log_audit_event(
    v_ficha.professional_id,
    'client',
    'anamnese.completed',
    'anamnese_ficha',
    v_ficha.id,
    jsonb_build_object(
      'ficha_id', v_ficha.id,
      'client_id', v_ficha.client_id,
      'appointment_id', v_ficha.appointment_id,
      'lang', p_lang,
      'has_photos', jsonb_array_length(COALESCE(v_ficha.fotos, '[]')) > 0,
      'has_signature', v_ficha.assinatura_url IS NOT NULL
    )
  );

  RETURN jsonb_build_object(
    'ok', true,
    'status', v_ficha.status,
    'preenchido_em', v_ficha.preenchido_em
  );
END;
$$;

REVOKE ALL ON FUNCTION public.complete_public_anamnese(
  uuid, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, boolean, text, text, jsonb, text
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.complete_public_anamnese(
  uuid, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, boolean, text, text, jsonb, text
) TO anon, authenticated, service_role;

-- Rollback:
-- DROP FUNCTION IF EXISTS public.complete_public_anamnese(uuid, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, boolean, text, text, jsonb, text);
-- DROP FUNCTION IF EXISTS public.review_anamnese_ficha(uuid, text);
-- DROP POLICY IF EXISTS "anamnese_assets_authenticated_read" ON storage.objects;
-- DELETE FROM storage.buckets WHERE id = 'anamnese-assets';
