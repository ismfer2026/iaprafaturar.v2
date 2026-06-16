-- Phase 27 — PR 27.6: Campaign Templates (biblioteca global, admin-only write)
-- Padrão: idêntico a funnel_templates — sem professional_id, SELECT para authenticated.
-- Admin escreve via service_role (Edge Function admin). Profissional lê templates.

-- ROLLBACK:
-- DROP TABLE IF EXISTS public.campaign_templates;

-- ============================================================
-- 1. Tabela global de templates de campanha
-- ============================================================
CREATE TABLE IF NOT EXISTS public.campaign_templates (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text        NOT NULL CHECK (length(trim(name)) > 0),
  description text,
  content     text        NOT NULL CHECK (length(trim(content)) > 0),
  channel     text        NOT NULL CHECK (channel IN ('whatsapp', 'email', 'sms')),
  category    text,
  variables   jsonb       NOT NULL DEFAULT '[]'::jsonb,
  is_active   boolean     NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE  public.campaign_templates IS 'Biblioteca global de templates de campanha gerenciada pelo admin. Sem PII. Profissionais lêem; admin escreve via service_role.';
COMMENT ON COLUMN public.campaign_templates.variables IS 'Array de {key, label} — placeholders como {nome_cliente}.';
COMMENT ON COLUMN public.campaign_templates.channel    IS 'Canal do template: whatsapp | email | sms.';

-- ============================================================
-- 2. Trigger de updated_at
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'campaign_templates_updated_at'
      AND tgrelid = 'public.campaign_templates'::regclass
  ) THEN
    CREATE TRIGGER campaign_templates_updated_at
      BEFORE UPDATE ON public.campaign_templates
      FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
  END IF;
END;
$$;

-- ============================================================
-- 3. Índices
-- ============================================================
-- Queries típicas: listar templates ativos por canal
CREATE INDEX IF NOT EXISTS idx_campaign_templates_channel_active
  ON public.campaign_templates (channel)
  WHERE is_active = true;

-- Admin: listar todos por categoria
CREATE INDEX IF NOT EXISTS idx_campaign_templates_category
  ON public.campaign_templates (category)
  WHERE category IS NOT NULL;

-- ============================================================
-- 4. RLS — global table: sem professional_id
-- ============================================================
ALTER TABLE public.campaign_templates ENABLE ROW LEVEL SECURITY;

-- Profissionais autenticados podem LER qualquer template
-- (USING true — sem isolamento de tenant, é uma biblioteca pública do produto)
CREATE POLICY "campaign_templates_read_authenticated"
  ON public.campaign_templates
  FOR SELECT
  TO authenticated
  USING (true);

-- ============================================================
-- 5. Permissões — apenas SELECT para authenticated
--    INSERT/UPDATE/DELETE: somente service_role (admin Edge Function)
-- ============================================================
REVOKE ALL ON public.campaign_templates FROM anon, authenticated;
GRANT  SELECT ON public.campaign_templates TO authenticated;
-- service_role bypassa RLS e tem acesso irrestrito por default no Supabase.

-- ============================================================
-- 6. Seed — templates iniciais de exemplo
-- ============================================================
INSERT INTO public.campaign_templates (name, description, content, channel, category, variables) VALUES
(
  'Confirmação de Agendamento',
  'Enviado automaticamente ao confirmar um agendamento',
  'Olá, {nome_cliente}! Seu agendamento para {data_hora} foi confirmado. Em caso de dúvidas, entre em contato.',
  'whatsapp',
  'agendamentos',
  '[{"key":"nome_cliente","label":"Nome do cliente"},{"key":"data_hora","label":"Data e hora do agendamento"}]'::jsonb
),
(
  'Lembrete de Consulta',
  'Lembrete 24h antes do horário marcado',
  'Olá, {nome_cliente}! Lembrando que você tem consulta amanhã às {hora}. Confirme sua presença respondendo SIM.',
  'whatsapp',
  'lembretes',
  '[{"key":"nome_cliente","label":"Nome do cliente"},{"key":"hora","label":"Horário da consulta"}]'::jsonb
),
(
  'Boas-vindas ao Paciente',
  'Primeiro contato após cadastro do paciente',
  'Bem-vindo(a), {nome_cliente}! Ficamos felizes em tê-lo(a) conosco. Qualquer dúvida, estamos aqui.',
  'whatsapp',
  'relacionamento',
  '[{"key":"nome_cliente","label":"Nome do cliente"}]'::jsonb
),
(
  'Pós-Atendimento',
  'Acompanhamento enviado após a sessão',
  'Olá, {nome_cliente}! Esperamos que você esteja bem após sua consulta. Se tiver alguma dúvida, não hesite em nos contatar.',
  'whatsapp',
  'pos_atendimento',
  '[{"key":"nome_cliente","label":"Nome do cliente"}]'::jsonb
)
ON CONFLICT DO NOTHING;

-- ============================================================
-- 7. RPCs admin para CRUD (SECURITY DEFINER — chama admin_assert_master)
-- ============================================================

-- Criar ou atualizar template
CREATE OR REPLACE FUNCTION public.admin_upsert_campaign_template(
  p_id          uuid     DEFAULT NULL,
  p_name        text     DEFAULT NULL,
  p_description text     DEFAULT NULL,
  p_content     text     DEFAULT NULL,
  p_channel     text     DEFAULT NULL,
  p_category    text     DEFAULT NULL,
  p_variables   jsonb    DEFAULT '[]'::jsonb,
  p_is_active   boolean  DEFAULT true
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_result public.campaign_templates;
BEGIN
  PERFORM public.admin_assert_master();

  IF p_channel IS NOT NULL AND p_channel NOT IN ('whatsapp','email','sms') THEN
    RAISE EXCEPTION 'invalid_channel';
  END IF;

  IF p_id IS NOT NULL THEN
    -- UPDATE
    UPDATE public.campaign_templates SET
      name        = COALESCE(p_name, name),
      description = p_description,
      content     = COALESCE(p_content, content),
      channel     = COALESCE(p_channel, channel),
      category    = p_category,
      variables   = COALESCE(p_variables, variables),
      is_active   = COALESCE(p_is_active, is_active),
      updated_at  = now()
    WHERE id = p_id
    RETURNING * INTO v_result;

    IF NOT FOUND THEN RAISE EXCEPTION 'not_found'; END IF;
  ELSE
    -- INSERT
    IF NULLIF(trim(COALESCE(p_name,'')),   '') IS NULL THEN RAISE EXCEPTION 'name_required';    END IF;
    IF NULLIF(trim(COALESCE(p_content,'')), '') IS NULL THEN RAISE EXCEPTION 'content_required'; END IF;
    IF p_channel IS NULL THEN RAISE EXCEPTION 'channel_required'; END IF;

    INSERT INTO public.campaign_templates (name, description, content, channel, category, variables, is_active)
    VALUES (p_name, p_description, p_content, p_channel, p_category, COALESCE(p_variables,'[]'::jsonb), COALESCE(p_is_active,true))
    RETURNING * INTO v_result;
  END IF;

  RETURN to_jsonb(v_result);
END;
$$;

REVOKE ALL  ON FUNCTION public.admin_upsert_campaign_template(uuid,text,text,text,text,text,jsonb,boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_upsert_campaign_template(uuid,text,text,text,text,text,jsonb,boolean) TO authenticated;

-- Ativar/desativar template
CREATE OR REPLACE FUNCTION public.admin_toggle_campaign_template(
  p_id        uuid,
  p_is_active boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM public.admin_assert_master();

  UPDATE public.campaign_templates
  SET is_active = p_is_active, updated_at = now()
  WHERE id = p_id;

  IF NOT FOUND THEN RAISE EXCEPTION 'not_found'; END IF;

  RETURN jsonb_build_object('ok', true, 'id', p_id, 'is_active', p_is_active);
END;
$$;

REVOKE ALL  ON FUNCTION public.admin_toggle_campaign_template(uuid,boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_toggle_campaign_template(uuid,boolean) TO authenticated;

-- ROLLBACK RPCs:
-- DROP FUNCTION IF EXISTS public.admin_upsert_campaign_template(uuid,text,text,text,text,text,jsonb,boolean);
-- DROP FUNCTION IF EXISTS public.admin_toggle_campaign_template(uuid,boolean);
