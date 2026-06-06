-- ============================================================
-- Garante que todo auth.users INSERT gera uma linha em professionals.
-- Isso fecha o gap de identidade: Auth user e professionals.id
-- nascem de forma atômica, sem depender de chamada do frontend.
-- ============================================================

-- Função do trigger: acessa NEW.id / NEW.email diretamente,
-- sem auth.uid() (indisponível em contexto de trigger).
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_name text;
  v_slug text;
  v_base text;
BEGIN
  v_name := COALESCE(
    NEW.raw_user_meta_data->>'name',
    split_part(NEW.email, '@', 1)
  );

  v_base := lower(regexp_replace(
    extensions.unaccent(v_name), '[^a-z0-9]+', '-', 'g'
  ));
  v_slug := v_base;

  WHILE EXISTS (SELECT 1 FROM public.professionals WHERE slug = v_slug) LOOP
    v_slug := v_base || '-' || substr(md5(random()::text), 1, 4);
  END LOOP;

  INSERT INTO public.professionals (user_id, name, email, slug)
  VALUES (NEW.id, v_name, NEW.email, v_slug);

  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================================
-- Substitui create_professional_from_signup: remove p_email
-- (client não deve poder injetar email arbitrário).
-- Email é derivado do JWT do usuário autenticado.
-- Serve como recuperação manual caso o trigger falhe.
-- ============================================================
CREATE OR REPLACE FUNCTION public.create_professional_from_signup(
  p_name text,
  p_slug text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_id    uuid;
  v_email text;
  v_slug  text;
  v_base  text;
BEGIN
  -- Email vem do JWT — nunca do payload do cliente
  v_email := auth.jwt() ->> 'email';

  IF v_email IS NULL THEN
    RAISE EXCEPTION 'Email não encontrado no JWT';
  END IF;

  -- Se já existe um professional para este user, retorna o existente
  SELECT id INTO v_id
  FROM public.professionals
  WHERE user_id = auth.uid();

  IF FOUND THEN
    RETURN v_id;
  END IF;

  v_base := lower(regexp_replace(
    extensions.unaccent(p_name), '[^a-z0-9]+', '-', 'g'
  ));
  v_slug := COALESCE(p_slug, v_base);

  WHILE EXISTS (SELECT 1 FROM public.professionals WHERE slug = v_slug) LOOP
    v_slug := v_base || '-' || substr(md5(random()::text), 1, 4);
  END LOOP;

  INSERT INTO public.professionals (user_id, name, email, slug)
  VALUES (auth.uid(), p_name, v_email, v_slug)
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

-- Revoga a assinatura antiga (com p_email) antes de conceder a nova
REVOKE ALL ON FUNCTION public.create_professional_from_signup(text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_professional_from_signup(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_professional_from_signup(text, text) TO authenticated;
