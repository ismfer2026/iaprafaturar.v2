-- Phase 19 (PR 19.1) - C19-02: roles canonicas e gestao segura de equipe.
-- Rollback: REVOKE EXECUTE das 4 RPCs novas, DROP das 4 RPCs, DROP de
-- auth_professional_role(), e GRANT INSERT/UPDATE ON team_members TO authenticated.

-- 1. auth_professional_role(): 'gestor' para o dono da clinica (professionals.user_id),
-- senao o nivel_acesso do team_member ativo vinculado ao usuario autenticado.
CREATE OR REPLACE FUNCTION public.auth_professional_role()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT CASE
    WHEN EXISTS (SELECT 1 FROM public.professionals WHERE user_id = auth.uid())
      THEN 'gestor'
    ELSE (
      SELECT nivel_acesso
      FROM public.team_members
      WHERE user_id = auth.uid() AND is_active = true
      LIMIT 1
    )
  END;
$$;

REVOKE ALL ON FUNCTION public.auth_professional_role() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.auth_professional_role() TO authenticated;

-- 2. Endurecer team_members (Regra 8): escrita somente via RPCs SECURITY DEFINER.
REVOKE INSERT, UPDATE ON public.team_members FROM authenticated;

-- 3. create_team_member: cria membro da equipe; exige gestor.
CREATE OR REPLACE FUNCTION public.create_team_member(
  p_name text,
  p_email text,
  p_phone_whatsapp text DEFAULT NULL,
  p_funcao text DEFAULT NULL,
  p_nivel_acesso text DEFAULT 'operacional',
  p_possui_agenda boolean DEFAULT false,
  p_comissao numeric DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_professional_id uuid;
  v_member public.team_members%ROWTYPE;
BEGIN
  v_professional_id := public.auth_professional_id();
  IF v_professional_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  IF public.auth_professional_role() <> 'gestor' THEN
    RAISE EXCEPTION 'Unauthorized: gestor role required';
  END IF;

  IF p_name IS NULL OR length(trim(p_name)) = 0 THEN
    RAISE EXCEPTION 'name is required';
  END IF;

  IF p_email IS NULL OR length(trim(p_email)) = 0 THEN
    RAISE EXCEPTION 'email is required';
  END IF;

  IF COALESCE(p_nivel_acesso, 'operacional') NOT IN ('gestor', 'operacional') THEN
    RAISE EXCEPTION 'invalid nivel_acesso';
  END IF;

  INSERT INTO public.team_members (
    professional_id, name, email, phone_whatsapp, funcao,
    nivel_acesso, possui_agenda, comissao
  )
  VALUES (
    v_professional_id,
    trim(p_name),
    trim(lower(p_email)),
    NULLIF(regexp_replace(COALESCE(p_phone_whatsapp, ''), '\D', '', 'g'), ''),
    NULLIF(trim(COALESCE(p_funcao, '')), ''),
    COALESCE(p_nivel_acesso, 'operacional'),
    COALESCE(p_possui_agenda, false),
    COALESCE(p_comissao, 0)
  )
  RETURNING * INTO v_member;

  PERFORM public.log_audit_event(
    v_professional_id,
    'professional',
    'team_member.created',
    'team_member',
    v_member.id,
    jsonb_build_object('team_member_id', v_member.id, 'nivel_acesso', v_member.nivel_acesso)
  );

  RETURN jsonb_build_object('team_member_id', v_member.id, 'team_member', to_jsonb(v_member));
END;
$$;

-- 4. update_team_member: atualiza dados cadastrais; exige gestor + IDOR.
CREATE OR REPLACE FUNCTION public.update_team_member(
  p_team_member_id uuid,
  p_name text,
  p_email text,
  p_phone_whatsapp text DEFAULT NULL,
  p_funcao text DEFAULT NULL,
  p_comissao numeric DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_professional_id uuid;
  v_member public.team_members%ROWTYPE;
BEGIN
  v_professional_id := public.auth_professional_id();
  IF v_professional_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  IF public.auth_professional_role() <> 'gestor' THEN
    RAISE EXCEPTION 'Unauthorized: gestor role required';
  END IF;

  IF p_name IS NULL OR length(trim(p_name)) = 0 THEN
    RAISE EXCEPTION 'name is required';
  END IF;

  IF p_email IS NULL OR length(trim(p_email)) = 0 THEN
    RAISE EXCEPTION 'email is required';
  END IF;

  UPDATE public.team_members
  SET name = trim(p_name),
      email = trim(lower(p_email)),
      phone_whatsapp = NULLIF(regexp_replace(COALESCE(p_phone_whatsapp, ''), '\D', '', 'g'), ''),
      funcao = NULLIF(trim(COALESCE(p_funcao, '')), ''),
      comissao = COALESCE(p_comissao, comissao)
  WHERE id = p_team_member_id
    AND professional_id = v_professional_id
  RETURNING * INTO v_member;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'team_member_not_found';
  END IF;

  PERFORM public.log_audit_event(
    v_professional_id,
    'professional',
    'team_member.updated',
    'team_member',
    v_member.id,
    jsonb_build_object('team_member_id', v_member.id)
  );

  RETURN jsonb_build_object('team_member_id', v_member.id, 'team_member', to_jsonb(v_member));
END;
$$;

-- 5. deactivate_team_member: soft-disable; exige gestor + protege o ultimo gestor ativo.
CREATE OR REPLACE FUNCTION public.deactivate_team_member(p_team_member_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_professional_id uuid;
  v_member public.team_members%ROWTYPE;
  v_other_active_gestores integer;
BEGIN
  v_professional_id := public.auth_professional_id();
  IF v_professional_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  IF public.auth_professional_role() <> 'gestor' THEN
    RAISE EXCEPTION 'Unauthorized: gestor role required';
  END IF;

  SELECT * INTO v_member
  FROM public.team_members
  WHERE id = p_team_member_id
    AND professional_id = v_professional_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'team_member_not_found';
  END IF;

  IF v_member.nivel_acesso = 'gestor' AND v_member.is_active THEN
    SELECT count(*) INTO v_other_active_gestores
    FROM public.team_members
    WHERE professional_id = v_professional_id
      AND nivel_acesso = 'gestor'
      AND is_active = true
      AND id <> v_member.id;

    IF v_other_active_gestores = 0 THEN
      RAISE EXCEPTION 'cannot_deactivate_last_gestor';
    END IF;
  END IF;

  UPDATE public.team_members
  SET is_active = false
  WHERE id = v_member.id
  RETURNING * INTO v_member;

  PERFORM public.log_audit_event(
    v_professional_id,
    'professional',
    'team_member.deactivated',
    'team_member',
    v_member.id,
    jsonb_build_object('team_member_id', v_member.id)
  );

  RETURN jsonb_build_object('team_member_id', v_member.id, 'team_member', to_jsonb(v_member));
END;
$$;

-- 6. update_team_member_permissions: altera nivel_acesso/possui_agenda; exige gestor
-- e protege o ultimo gestor ativo de ser rebaixado.
CREATE OR REPLACE FUNCTION public.update_team_member_permissions(
  p_team_member_id uuid,
  p_nivel_acesso text,
  p_possui_agenda boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_professional_id uuid;
  v_member public.team_members%ROWTYPE;
  v_other_active_gestores integer;
BEGIN
  v_professional_id := public.auth_professional_id();
  IF v_professional_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  IF public.auth_professional_role() <> 'gestor' THEN
    RAISE EXCEPTION 'Unauthorized: gestor role required';
  END IF;

  IF COALESCE(p_nivel_acesso, '') NOT IN ('gestor', 'operacional') THEN
    RAISE EXCEPTION 'invalid nivel_acesso';
  END IF;

  SELECT * INTO v_member
  FROM public.team_members
  WHERE id = p_team_member_id
    AND professional_id = v_professional_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'team_member_not_found';
  END IF;

  IF v_member.nivel_acesso = 'gestor'
     AND v_member.is_active
     AND p_nivel_acesso <> 'gestor' THEN
    SELECT count(*) INTO v_other_active_gestores
    FROM public.team_members
    WHERE professional_id = v_professional_id
      AND nivel_acesso = 'gestor'
      AND is_active = true
      AND id <> v_member.id;

    IF v_other_active_gestores = 0 THEN
      RAISE EXCEPTION 'cannot_demote_last_gestor';
    END IF;
  END IF;

  UPDATE public.team_members
  SET nivel_acesso = p_nivel_acesso,
      possui_agenda = COALESCE(p_possui_agenda, possui_agenda)
  WHERE id = v_member.id
  RETURNING * INTO v_member;

  PERFORM public.log_audit_event(
    v_professional_id,
    'professional',
    'team_member.permissions_updated',
    'team_member',
    v_member.id,
    jsonb_build_object(
      'team_member_id', v_member.id,
      'nivel_acesso', v_member.nivel_acesso,
      'possui_agenda', v_member.possui_agenda
    )
  );

  RETURN jsonb_build_object('team_member_id', v_member.id, 'team_member', to_jsonb(v_member));
END;
$$;

REVOKE ALL ON FUNCTION public.create_team_member(text, text, text, text, text, boolean, numeric) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.update_team_member(uuid, text, text, text, text, numeric) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.deactivate_team_member(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.update_team_member_permissions(uuid, text, boolean) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.create_team_member(text, text, text, text, text, boolean, numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_team_member(uuid, text, text, text, text, numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION public.deactivate_team_member(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_team_member_permissions(uuid, text, boolean) TO authenticated;
