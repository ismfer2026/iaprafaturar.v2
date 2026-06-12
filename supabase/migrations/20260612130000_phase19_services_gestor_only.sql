-- Phase 19 (PR 19.4) - Servicos: create/update/deactivate exigem role 'gestor'.
-- Rollback: CREATE OR REPLACE FUNCTION das 3 RPCs removendo o bloco de
-- verificacao de auth_professional_role() (versoes anteriores em
-- 20260605121200_phase3_crm_core.sql).

CREATE OR REPLACE FUNCTION public.create_service(
  p_name text,
  p_duration_minutes integer DEFAULT 60,
  p_price numeric DEFAULT 0,
  p_category_id uuid DEFAULT NULL,
  p_description text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_professional_id uuid;
  v_service public.services%ROWTYPE;
BEGIN
  v_professional_id := public.auth_professional_id();

  IF v_professional_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  IF public.auth_professional_role() <> 'gestor' THEN
    RAISE EXCEPTION 'Unauthorized: gestor role required';
  END IF;

  IF p_name IS NULL OR length(trim(p_name)) = 0 THEN
    RAISE EXCEPTION 'Service name is required';
  END IF;

  IF p_category_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.service_categories
    WHERE id = p_category_id
      AND professional_id = v_professional_id
      AND deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Service category not found';
  END IF;

  INSERT INTO public.services (
    professional_id,
    category_id,
    name,
    description,
    duration_minutes,
    price
  )
  VALUES (
    v_professional_id,
    p_category_id,
    trim(p_name),
    p_description,
    COALESCE(p_duration_minutes, 60),
    COALESCE(p_price, 0)
  )
  RETURNING * INTO v_service;

  RETURN jsonb_build_object('service_id', v_service.id, 'service', to_jsonb(v_service));
END;
$$;

CREATE OR REPLACE FUNCTION public.update_service(
  p_service_id uuid,
  p_name text,
  p_duration_minutes integer,
  p_price numeric,
  p_category_id uuid DEFAULT NULL,
  p_description text DEFAULT NULL,
  p_is_public boolean DEFAULT true
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_professional_id uuid;
  v_service public.services%ROWTYPE;
BEGIN
  v_professional_id := public.auth_professional_id();

  IF v_professional_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  IF public.auth_professional_role() <> 'gestor' THEN
    RAISE EXCEPTION 'Unauthorized: gestor role required';
  END IF;

  IF p_name IS NULL OR length(trim(p_name)) = 0 THEN
    RAISE EXCEPTION 'Service name is required';
  END IF;

  IF p_category_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.service_categories
    WHERE id = p_category_id
      AND professional_id = v_professional_id
      AND deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Service category not found';
  END IF;

  UPDATE public.services
  SET name = trim(p_name),
      duration_minutes = COALESCE(p_duration_minutes, duration_minutes),
      price = COALESCE(p_price, price),
      category_id = p_category_id,
      description = p_description,
      is_public = COALESCE(p_is_public, true)
  WHERE id = p_service_id
    AND professional_id = v_professional_id
    AND deleted_at IS NULL
  RETURNING * INTO v_service;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Service not found';
  END IF;

  RETURN jsonb_build_object('service_id', v_service.id, 'service', to_jsonb(v_service));
END;
$$;

CREATE OR REPLACE FUNCTION public.deactivate_service(p_service_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_professional_id uuid;
  v_service public.services%ROWTYPE;
BEGIN
  v_professional_id := public.auth_professional_id();

  IF v_professional_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  IF public.auth_professional_role() <> 'gestor' THEN
    RAISE EXCEPTION 'Unauthorized: gestor role required';
  END IF;

  UPDATE public.services
  SET is_active = false,
      deleted_at = COALESCE(deleted_at, now())
  WHERE id = p_service_id
    AND professional_id = v_professional_id
    AND deleted_at IS NULL
  RETURNING * INTO v_service;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Service not found';
  END IF;

  RETURN jsonb_build_object('service_id', v_service.id, 'deactivated', true);
END;
$$;
