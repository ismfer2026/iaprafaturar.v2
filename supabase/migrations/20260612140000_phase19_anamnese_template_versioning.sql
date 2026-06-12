-- Phase 19 (PR 19.5) - C19-01: versionamento de templates de anamnese.
-- Rollback: DROP FUNCTION create_anamnese_template_version; recriar
-- update_anamnese_template sem o gate de gestor/fichas (versao em
-- 20260607124500_phase7_anamnese_advanced.sql); DROP INDEX
-- idx_anamnese_templates_current_per_lineage; DROP COLUMN root_template_id,
-- is_current, published_at, previous_version_id, version.

-- 1. Colunas de versionamento.
ALTER TABLE public.anamnese_templates
  ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS previous_version_id uuid NULL REFERENCES public.anamnese_templates(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS published_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS is_current boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS root_template_id uuid NULL;

-- Backfill: templates existentes sao raiz da propria linhagem.
UPDATE public.anamnese_templates
SET root_template_id = id
WHERE root_template_id IS NULL;

ALTER TABLE public.anamnese_templates
  ALTER COLUMN root_template_id SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'anamnese_templates_root_template_id_fkey'
  ) THEN
    ALTER TABLE public.anamnese_templates
      ADD CONSTRAINT anamnese_templates_root_template_id_fkey
      FOREIGN KEY (root_template_id) REFERENCES public.anamnese_templates(id) ON DELETE RESTRICT;
  END IF;
END;
$$;

-- 2. Uma unica versao atual por linhagem.
CREATE UNIQUE INDEX IF NOT EXISTS idx_anamnese_templates_current_per_lineage
ON public.anamnese_templates(root_template_id)
WHERE is_current = true AND deleted_at IS NULL;

-- 3. update_anamnese_template: gestor-only; bloqueia edicao de templates
-- com fichas (orienta a usar create_anamnese_template_version). Criacao de
-- template novo (p_template_id IS NULL) inicializa version/root_template_id.
CREATE OR REPLACE FUNCTION public.update_anamnese_template(
  p_template_id uuid,
  p_name text,
  p_fields jsonb,
  p_is_default boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_professional_id uuid;
  v_template public.anamnese_templates%ROWTYPE;
  v_new_id uuid;
BEGIN
  v_professional_id := public.auth_professional_id();
  IF v_professional_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  IF public.auth_professional_role() <> 'gestor' THEN
    RAISE EXCEPTION 'Unauthorized: gestor role required';
  END IF;

  IF p_template_id IS NULL THEN
    v_new_id := gen_random_uuid();

    INSERT INTO public.anamnese_templates (
      id, professional_id, name, fields, is_default,
      root_template_id, version, is_current, published_at
    )
    VALUES (
      v_new_id,
      v_professional_id,
      trim(p_name),
      COALESCE(p_fields, '{}'::jsonb),
      COALESCE(p_is_default, false),
      v_new_id,
      1,
      true,
      now()
    )
    RETURNING * INTO v_template;
  ELSE
    IF EXISTS (
      SELECT 1 FROM public.anamnese_fichas WHERE template_id = p_template_id
    ) THEN
      RAISE EXCEPTION 'anamnese_template_has_fichas: use create_anamnese_template_version';
    END IF;

    UPDATE public.anamnese_templates
    SET name = trim(p_name),
        fields = COALESCE(p_fields, '{}'::jsonb),
        is_default = COALESCE(p_is_default, false)
    WHERE id = p_template_id
      AND professional_id = v_professional_id
      AND deleted_at IS NULL
    RETURNING * INTO v_template;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'anamnese_template_not_found';
    END IF;
  END IF;

  IF COALESCE(p_is_default, false) THEN
    UPDATE public.anamnese_templates
    SET is_default = false
    WHERE professional_id = v_professional_id
      AND id <> v_template.id
      AND deleted_at IS NULL;
  END IF;

  PERFORM public.log_audit_event(
    v_professional_id,
    'professional',
    'anamnese_template.updated',
    'anamnese_template',
    v_template.id,
    jsonb_build_object('template_id', v_template.id, 'is_default', v_template.is_default)
  );

  RETURN jsonb_build_object('template_id', v_template.id, 'template', to_jsonb(v_template));
END;
$$;

-- 4. create_anamnese_template_version: cria nova versao a partir da atual,
-- marca a anterior como nao-atual e preserva fichas apontando para a
-- versao original. Exige gestor.
CREATE OR REPLACE FUNCTION public.create_anamnese_template_version(
  p_template_id uuid,
  p_name text,
  p_fields jsonb,
  p_is_default boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_professional_id uuid;
  v_old public.anamnese_templates%ROWTYPE;
  v_new public.anamnese_templates%ROWTYPE;
  v_is_default boolean;
BEGIN
  v_professional_id := public.auth_professional_id();
  IF v_professional_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  IF public.auth_professional_role() <> 'gestor' THEN
    RAISE EXCEPTION 'Unauthorized: gestor role required';
  END IF;

  IF p_name IS NULL OR length(trim(p_name)) = 0 THEN
    RAISE EXCEPTION 'Template name is required';
  END IF;

  SELECT * INTO v_old
  FROM public.anamnese_templates
  WHERE id = p_template_id
    AND professional_id = v_professional_id
    AND is_current = true
    AND deleted_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'anamnese_template_not_found';
  END IF;

  v_is_default := COALESCE(p_is_default, v_old.is_default);

  INSERT INTO public.anamnese_templates (
    professional_id, name, fields, is_default,
    root_template_id, previous_version_id, version, is_current, published_at
  )
  VALUES (
    v_professional_id,
    trim(p_name),
    COALESCE(p_fields, v_old.fields),
    v_is_default,
    v_old.root_template_id,
    v_old.id,
    v_old.version + 1,
    true,
    now()
  )
  RETURNING * INTO v_new;

  UPDATE public.anamnese_templates
  SET is_current = false,
      is_default = false
  WHERE id = v_old.id;

  IF v_is_default THEN
    UPDATE public.anamnese_templates
    SET is_default = false
    WHERE professional_id = v_professional_id
      AND id <> v_new.id
      AND deleted_at IS NULL;
  END IF;

  PERFORM public.log_audit_event(
    v_professional_id,
    'professional',
    'anamnese_template.version_created',
    'anamnese_template',
    v_new.id,
    jsonb_build_object(
      'previous_version_id', v_old.id,
      'previous_version', v_old.version,
      'new_version', v_new.version,
      'is_default_before', v_old.is_default,
      'is_default_after', v_new.is_default
    )
  );

  RETURN jsonb_build_object('template_id', v_new.id, 'template', to_jsonb(v_new), 'previous_version_id', v_old.id);
END;
$$;

REVOKE ALL ON FUNCTION public.create_anamnese_template_version(uuid, text, jsonb, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_anamnese_template_version(uuid, text, jsonb, boolean) TO authenticated;
