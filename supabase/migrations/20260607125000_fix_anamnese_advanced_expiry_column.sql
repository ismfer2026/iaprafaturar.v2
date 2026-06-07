-- Corrects the Phase 7B extended anamnese RPC to use the canonical
-- public token expiry column created in Phase 6.

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
