-- ============================================================
-- Tabela principals de tenants.
-- Ordem obrigatória neste arquivo:
--   1. CREATE TABLE professionals
--   2. CREATE FUNCTION auth_professional_id()  ← precisa da tabela
--   3. ALTER TABLE ... ENABLE ROW LEVEL SECURITY + CREATE POLICY
--   4. REVOKE/GRANT
--   5. RPC create_professional_from_signup
-- ============================================================

CREATE TABLE public.professionals (
  id                               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                          uuid UNIQUE REFERENCES auth.users(id) ON DELETE SET NULL,

  name                             text NOT NULL,
  business_name                    text,
  email                            text NOT NULL,
  phone_whatsapp                   text,
  document_cpf_cnpj                text,

  city                             text,
  neighborhood                     text,
  full_address                     text,

  slug                             text UNIQUE NOT NULL,
  logo_url                         text,
  bio                              text,
  instagram_handle                 text,
  profession_type                  text NOT NULL DEFAULT 'outros',

  evolution_instance_id            text UNIQUE,
  evolution_instance_token         text,
  whatsapp_connected               boolean NOT NULL DEFAULT false,
  whatsapp_connected_at            timestamptz,

  plan_type                        text NOT NULL DEFAULT 'trial'
                                   CHECK (plan_type IN ('trial','individual','equipe','team','enterprise')),
  trial_ends_at                    timestamptz DEFAULT (now() + interval '14 days'),
  acesso_vitalicio                 boolean NOT NULL DEFAULT false,
  stripe_customer_id               text UNIQUE,

  onboarding_completed             boolean NOT NULL DEFAULT false,
  onboarding_essentials_completed  boolean NOT NULL DEFAULT false,
  onboarding_step                  int NOT NULL DEFAULT 1,
  onboarding_source                text,
  onboarding_pending               boolean NOT NULL DEFAULT false,
  onboarding_data                  jsonb NOT NULL DEFAULT '{}',

  settings jsonb NOT NULL DEFAULT '{
    "pix_info": null,
    "activity_type": null,
    "business_hours": {},
    "billing_info": {},
    "registration_fields": {
      "collect_cpf": false,
      "collect_email": true,
      "collect_address": false
    },
    "nfe_config": {}
  }',

  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  deleted_at  timestamptz
);

CREATE TRIGGER professionals_updated_at
  BEFORE UPDATE ON public.professionals
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX idx_professionals_user_id ON public.professionals(user_id);
CREATE INDEX idx_professionals_email   ON public.professionals(email);
CREATE INDEX idx_professionals_slug    ON public.professionals(slug);
CREATE INDEX idx_professionals_plan    ON public.professionals(plan_type);

-- auth_professional_id() criada AQUI, após CREATE TABLE, porque
-- LANGUAGE sql valida referências no momento da criação (Regra 4).
CREATE OR REPLACE FUNCTION public.auth_professional_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT id FROM public.professionals WHERE user_id = auth.uid() LIMIT 1;
$$;

-- RLS: tenant acessa apenas o próprio registro (Regra 1).
ALTER TABLE public.professionals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "professionals_self_access"
ON public.professionals FOR ALL TO authenticated
USING  (id = public.auth_professional_id())
WITH CHECK (id = public.auth_professional_id());

-- INSERT bloqueado para authenticated: somente o trigger handle_new_user
-- (migration 20260605120500) e a RPC create_professional_from_signup(text, text)
-- podem inserir via SECURITY DEFINER (Regra 8).
REVOKE ALL ON public.professionals FROM authenticated;
GRANT SELECT, UPDATE ON public.professionals TO authenticated;
REVOKE UPDATE (plan_type, acesso_vitalicio, stripe_customer_id) ON public.professionals FROM authenticated;
