-- Papéis de usuário: apenas service_role pode escrever (Regra 8).
CREATE TABLE public.user_roles (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role        text NOT NULL CHECK (role IN ('admin_master','gestor','operacional')),
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user_roles_read"
ON public.user_roles FOR SELECT TO authenticated
USING (user_id = auth.uid());

REVOKE ALL ON public.user_roles FROM authenticated;
GRANT SELECT ON public.user_roles TO authenticated;

-- Admins master (acesso interno: Nerissa).
CREATE TABLE public.master_admins (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  email       text NOT NULL,
  name        text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.master_admins ENABLE ROW LEVEL SECURITY;

CREATE POLICY "master_admins_self"
ON public.master_admins FOR SELECT TO authenticated
USING (user_id = auth.uid());

REVOKE ALL ON public.master_admins FROM authenticated;
GRANT SELECT ON public.master_admins TO authenticated;
