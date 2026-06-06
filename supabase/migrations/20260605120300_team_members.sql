CREATE TABLE public.team_members (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  professional_id  uuid NOT NULL REFERENCES public.professionals(id) ON DELETE RESTRICT,

  name             text NOT NULL,
  apelido          text,
  email            text NOT NULL,
  phone_whatsapp   text,
  cpf              text,
  funcao           text,
  conselho         text,
  nivel_acesso     text NOT NULL DEFAULT 'operacional'
                   CHECK (nivel_acesso IN ('gestor','operacional')),

  comissao         numeric(5,2) NOT NULL DEFAULT 0,
  possui_agenda    boolean NOT NULL DEFAULT false,
  is_active        boolean NOT NULL DEFAULT true,
  business_hours   jsonb NOT NULL DEFAULT '{}',
  notifications    jsonb NOT NULL DEFAULT '{}',
  cod_integracao   text,

  user_id          uuid REFERENCES auth.users(id) ON DELETE SET NULL,

  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER team_members_updated_at
  BEFORE UPDATE ON public.team_members
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX idx_team_members_professional ON public.team_members(professional_id);
CREATE INDEX idx_team_members_email        ON public.team_members(email);
CREATE UNIQUE INDEX idx_team_members_email_active
  ON public.team_members(professional_id, email) WHERE is_active = true;

ALTER TABLE public.team_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "team_members_isolation"
ON public.team_members FOR ALL TO authenticated
USING  (professional_id = public.auth_professional_id())
WITH CHECK (professional_id = public.auth_professional_id());

REVOKE ALL ON public.team_members FROM authenticated;
GRANT SELECT, INSERT, UPDATE ON public.team_members TO authenticated;
