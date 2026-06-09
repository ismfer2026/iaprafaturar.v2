# PRD — Schema Completo do Banco de Dados v2

_Todas as tabelas com DDL completo, constraints, índices e RLS._

---

## Convenções

- IDs: `uuid` gerado com `gen_random_uuid()`
- Timestamps: `timestamptz` com `DEFAULT now()`
- `updated_at`: gerenciado por trigger `set_updated_at()` em todas as tabelas
- Todas as FKs para `professionals` usam `ON DELETE RESTRICT` (nunca CASCADE)
- Soft delete via `deleted_at timestamptz` (nunca DELETE físico em dados operacionais)
- RLS habilitada em todas as tabelas — sem exceção

---

## Trigger de updated_at (global)

```sql
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;
```

---

## 1. Auth & Tenancy

### professionals

```sql
CREATE TABLE professionals (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                     uuid UNIQUE REFERENCES auth.users(id) ON DELETE SET NULL,
  -- Invariante obrigatória para profissional autenticado:
  -- professionals.id = professionals.user_id = auth.users.id.
  -- Fluxo público /criar-conta deve criar Auth por backend/RPC com id escolhido.
  -- Frontend público não pode usar supabase.auth.signUp para converter pré-conta.
  
  -- Identidade
  name                        text NOT NULL,
  business_name               text,
  email                       text NOT NULL,
  phone_whatsapp              text,            -- E.164 sem + (5511999999999)
  document_cpf_cnpj           text,
  
  -- Localização
  city                        text,
  neighborhood                text,
  full_address                text,
  
  -- Perfil público
  slug                        text UNIQUE NOT NULL, -- URL pública: {slug}.iaprafaturar.com
  logo_url                    text,
  bio                         text,
  instagram_handle            text,
  profession_type             text DEFAULT 'outros', -- fisioterapeuta, dentista, etc.
  
  -- WhatsApp (instância da clínica para clientes)
  evolution_instance_id       text UNIQUE,
  evolution_instance_token    text,            -- Vault ou texto (migrar para Vault)
  whatsapp_connected          boolean DEFAULT false,
  whatsapp_connected_at       timestamptz,
  
  -- Plano e billing
  plan_type                   text NOT NULL DEFAULT 'trial'
                              CHECK (plan_type IN ('trial','individual','equipe','team','enterprise')),
  trial_ends_at               timestamptz DEFAULT (now() + interval '14 days'),
  acesso_vitalicio            boolean DEFAULT false,
  stripe_customer_id          text UNIQUE,
  
  -- Onboarding
  onboarding_completed        boolean DEFAULT false,
  onboarding_essentials_completed boolean DEFAULT false,
  onboarding_step             int DEFAULT 1,
  onboarding_source           text,           -- 'whatsapp_direct', 'web', 'admin'
  onboarding_pending          boolean DEFAULT false,
  onboarding_data             jsonb DEFAULT '{}',
  
  -- Configurações (JSON estruturado)
  settings                    jsonb DEFAULT '{
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
  
  -- Timestamps
  created_at                  timestamptz DEFAULT now(),
  updated_at                  timestamptz DEFAULT now(),
  deleted_at                  timestamptz
);

CREATE TRIGGER professionals_updated_at
  BEFORE UPDATE ON professionals
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE INDEX idx_professionals_user_id ON professionals(user_id);
CREATE INDEX idx_professionals_email ON professionals(email);
CREATE INDEX idx_professionals_slug ON professionals(slug);
CREATE INDEX idx_professionals_plan ON professionals(plan_type);

ALTER TABLE professionals ENABLE ROW LEVEL SECURITY;

-- Profissional lê e edita apenas o próprio registro
CREATE POLICY "professionals_self_access"
ON professionals FOR ALL TO authenticated
USING (id = auth_professional_id())
WITH CHECK (id = auth_professional_id());

-- Restrição de segurança: authenticated não pode alterar plan_type
REVOKE UPDATE (plan_type, acesso_vitalicio, stripe_customer_id) ON professionals FROM authenticated;
```

### team_members

```sql
CREATE TABLE team_members (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  professional_id   uuid NOT NULL REFERENCES professionals(id) ON DELETE RESTRICT,
  
  name              text NOT NULL,
  apelido           text,
  email             text NOT NULL,
  phone_whatsapp    text,
  cpf               text,
  funcao            text,                    -- 'secretaria', 'terapeuta', etc.
  conselho          text,                    -- CRM, CRO, CREFITO...
  nivel_acesso      text DEFAULT 'operacional'
                    CHECK (nivel_acesso IN ('gestor', 'operacional')),
  
  comissao          numeric(5,2) DEFAULT 0,  -- percentual
  possui_agenda     boolean DEFAULT false,
  is_active         boolean DEFAULT true,
  business_hours    jsonb DEFAULT '{}',
  notifications     jsonb DEFAULT '{}',
  cod_integracao    text,                    -- código externo se integrado
  
  -- Vínculo com auth (preenchido quando o membro fizer login pela primeira vez)
  user_id           uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  
  created_at        timestamptz DEFAULT now(),
  updated_at        timestamptz DEFAULT now()
);

CREATE TRIGGER team_members_updated_at
  BEFORE UPDATE ON team_members
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE INDEX idx_team_members_professional ON team_members(professional_id);
CREATE INDEX idx_team_members_email ON team_members(email);
CREATE UNIQUE INDEX idx_team_members_email_active ON team_members(professional_id, email) WHERE is_active = true;

ALTER TABLE team_members ENABLE ROW LEVEL SECURITY;
CREATE POLICY "team_members_isolation" ON team_members FOR ALL TO authenticated
USING (professional_id = auth_professional_id())
WITH CHECK (professional_id = auth_professional_id());
```

### user_roles

```sql
CREATE TABLE user_roles (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role        text NOT NULL CHECK (role IN ('admin_master', 'gestor', 'operacional')),
  created_at  timestamptz DEFAULT now(),
  UNIQUE(user_id, role)
);

ALTER TABLE user_roles ENABLE ROW LEVEL SECURITY;
-- Apenas service_role pode escrever
CREATE POLICY "user_roles_read" ON user_roles FOR SELECT TO authenticated
USING (user_id = auth.uid());
REVOKE INSERT, UPDATE, DELETE ON user_roles FROM authenticated;
```

### master_admins

```sql
CREATE TABLE master_admins (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  email       text NOT NULL,
  name        text,
  created_at  timestamptz DEFAULT now()
);

ALTER TABLE master_admins ENABLE ROW LEVEL SECURITY;
CREATE POLICY "master_admins_self" ON master_admins FOR SELECT TO authenticated
USING (user_id = auth.uid());
REVOKE INSERT, UPDATE, DELETE ON master_admins FROM authenticated;
```

---

## 2. Clientes & CRM

### clients

```sql
CREATE TYPE journey_stage_enum AS ENUM (
  'lead', 'agendado', 'em_tratamento', 'pos_tratamento', 'cliente_fiel', 'inativo'
);

CREATE TABLE clients (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  professional_id         uuid NOT NULL REFERENCES professionals(id) ON DELETE RESTRICT,
  
  -- Identidade
  full_name               text NOT NULL,                -- NUNCA nulo
  phone_whatsapp          text,
  email                   text,
  cpf                     text,
  birth_date              date,
  gender                  text CHECK (gender IN ('masculino','feminino','outro','nao_informado')),
  
  -- Endereço
  address                 text,
  city                    text,
  neighborhood            text,
  
  -- CRM
  journey_stage           journey_stage_enum DEFAULT 'lead',
  source                  text,                         -- 'whatsapp', 'indicacao', 'web_chat', 'instagram', 'manual'
  referral_client_id      uuid REFERENCES clients(id),  -- quem indicou
  
  -- LGPD
  lgpd_consent_at         timestamptz,
  lgpd_consent_channel    text,                         -- 'pwa', 'anamnese', 'whatsapp'
  
  -- PWA
  pwa_onboarded_at        timestamptz,
  push_notifications_enabled boolean DEFAULT false,
  pwa_token               text,                         -- magic link token ativo
  pwa_token_expires_at    timestamptz,
  
  -- Fidelidade
  loyalty_points          integer DEFAULT 0,
  
  -- Flags
  is_active               boolean DEFAULT true,
  is_blocked              boolean DEFAULT false,         -- inadimplência grave
  
  -- Notas
  internal_notes          text,
  
  created_at              timestamptz DEFAULT now(),
  updated_at              timestamptz DEFAULT now(),
  deleted_at              timestamptz
);

CREATE TRIGGER clients_updated_at
  BEFORE UPDATE ON clients FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE INDEX idx_clients_professional ON clients(professional_id);
CREATE INDEX idx_clients_phone ON clients(professional_id, phone_whatsapp);
CREATE INDEX idx_clients_journey ON clients(professional_id, journey_stage);
CREATE INDEX idx_clients_birth_date ON clients(professional_id, birth_date);
CREATE INDEX idx_clients_active ON clients(professional_id) WHERE is_active = true AND deleted_at IS NULL;

ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
CREATE POLICY "clients_isolation" ON clients FOR ALL TO authenticated
USING (professional_id = auth_professional_id())
WITH CHECK (professional_id = auth_professional_id());
```

### registration_links

```sql
CREATE TABLE registration_links (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  professional_id uuid NOT NULL REFERENCES professionals(id) ON DELETE RESTRICT,
  code            text NOT NULL UNIQUE DEFAULT substr(md5(random()::text), 1, 8),
  is_active       boolean DEFAULT true,
  expires_at      timestamptz,
  uses_count      integer DEFAULT 0,
  max_uses        integer,
  created_at      timestamptz DEFAULT now()
);

ALTER TABLE registration_links ENABLE ROW LEVEL SECURITY;
CREATE POLICY "registration_links_isolation" ON registration_links FOR ALL TO authenticated
USING (professional_id = auth_professional_id())
WITH CHECK (professional_id = auth_professional_id());
-- Anon pode ler para validar o código
CREATE POLICY "registration_links_public_read" ON registration_links FOR SELECT TO anon
USING (is_active = true AND (expires_at IS NULL OR expires_at > now()));
```

### registration_sessions

```sql
CREATE TABLE registration_sessions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  link_id         uuid NOT NULL REFERENCES registration_links(id),
  professional_id uuid NOT NULL REFERENCES professionals(id) ON DELETE RESTRICT,
  session_token   text NOT NULL UNIQUE DEFAULT gen_random_uuid()::text,
  data            jsonb DEFAULT '{}',     -- dados parciais preenchidos
  completed_at    timestamptz,
  client_id       uuid REFERENCES clients(id),
  created_at      timestamptz DEFAULT now()
);

ALTER TABLE registration_sessions ENABLE ROW LEVEL SECURITY;
-- Anon pode criar e atualizar (fluxo público)
CREATE POLICY "reg_sessions_anon_insert" ON registration_sessions FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "reg_sessions_anon_update" ON registration_sessions FOR UPDATE TO anon
USING (completed_at IS NULL)
WITH CHECK (completed_at IS NULL);
CREATE POLICY "reg_sessions_auth" ON registration_sessions FOR ALL TO authenticated
USING (professional_id = auth_professional_id());
```

---

## 3. Agenda & Sessões

### service_categories

```sql
CREATE TABLE service_categories (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  professional_id uuid NOT NULL REFERENCES professionals(id) ON DELETE RESTRICT,
  name            text NOT NULL,
  color           text DEFAULT '#7C3AED',
  icon            text,
  position        integer DEFAULT 0,
  created_at      timestamptz DEFAULT now()
);

ALTER TABLE service_categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_categories_isolation" ON service_categories FOR ALL TO authenticated
USING (professional_id = auth_professional_id())
WITH CHECK (professional_id = auth_professional_id());
```

### services

```sql
CREATE TABLE services (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  professional_id uuid NOT NULL REFERENCES professionals(id) ON DELETE RESTRICT,
  category_id     uuid REFERENCES service_categories(id),
  
  name            text NOT NULL,
  description     text,
  price           numeric(10,2) NOT NULL DEFAULT 0,
  duration_minutes integer NOT NULL DEFAULT 60,
  
  -- Sessões do pacote (se for serviço parcelado)
  sessions_count  integer DEFAULT 1,
  
  image_url       text,
  is_active       boolean DEFAULT true,
  is_public       boolean DEFAULT true,   -- aparece na agenda pública
  position        integer DEFAULT 0,
  
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now()
);

CREATE TRIGGER services_updated_at
  BEFORE UPDATE ON services FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE services ENABLE ROW LEVEL SECURITY;
CREATE POLICY "services_isolation" ON services FOR ALL TO authenticated
USING (professional_id = auth_professional_id())
WITH CHECK (professional_id = auth_professional_id());
-- Anon pode ler serviços públicos para agendamento
CREATE POLICY "services_public_read" ON services FOR SELECT TO anon
USING (is_active = true AND is_public = true);
```

### appointment_series

```sql
-- Grupos de agendamentos recorrentes (J56)
CREATE TABLE appointment_series (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  professional_id uuid NOT NULL REFERENCES professionals(id) ON DELETE RESTRICT,
  client_id       uuid NOT NULL REFERENCES clients(id),
  service_id      uuid REFERENCES services(id),
  
  recurrence      text NOT NULL CHECK (recurrence IN ('weekly','biweekly','monthly')),
  day_of_week     integer,    -- 0=dom..6=sab (para weekly/biweekly)
  day_of_month    integer,    -- 1-31 (para monthly)
  start_time      time NOT NULL,
  duration_minutes integer NOT NULL DEFAULT 60,
  
  series_start    date NOT NULL,
  series_end      date,       -- NULL = aberta, max 3 meses à frente
  
  total_planned   integer,
  total_created   integer DEFAULT 0,
  
  is_active       boolean DEFAULT true,
  created_at      timestamptz DEFAULT now()
);

ALTER TABLE appointment_series ENABLE ROW LEVEL SECURITY;
CREATE POLICY "appointment_series_isolation" ON appointment_series FOR ALL TO authenticated
USING (professional_id = auth_professional_id())
WITH CHECK (professional_id = auth_professional_id());
```

### appointments

```sql
CREATE TYPE appointment_status_enum AS ENUM (
  'agendado', 'confirmado', 'concluido', 'cancelado', 'falta'
);

CREATE TABLE appointments (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  professional_id     uuid NOT NULL REFERENCES professionals(id) ON DELETE RESTRICT,
  client_id           uuid REFERENCES clients(id),
  service_id          uuid REFERENCES services(id),
  team_member_id      uuid REFERENCES team_members(id),
  series_id           uuid REFERENCES appointment_series(id),
  
  -- Temporização
  scheduled_at        timestamptz NOT NULL,
  duration_minutes    integer NOT NULL DEFAULT 60,
  
  -- Status
  status              appointment_status_enum DEFAULT 'agendado',
  confirmation_status text CHECK (confirmation_status IN ('pendente','confirmado','cancelado')),
  reminder_sent       boolean DEFAULT false,
  reminder_confirmed  boolean,
  confirmed_at        timestamptz,
  cancellation_reason text,
  
  -- Sessão vinculada (preenchida após atendimento)
  session_id          uuid, -- FK adicionada após criar sessions
  
  -- Pacote
  client_package_id   uuid, -- FK adicionada após criar client_packages
  
  -- Metadados
  notes               text,
  is_recurring        boolean DEFAULT false,
  series_position     integer,  -- posição na série (1, 2, 3...)
  
  -- Agendamento pelo cliente via PWA
  booked_by_client    boolean DEFAULT false,
  booked_at           timestamptz,
  
  created_at          timestamptz DEFAULT now(),
  updated_at          timestamptz DEFAULT now()
);

CREATE TRIGGER appointments_updated_at
  BEFORE UPDATE ON appointments FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE INDEX idx_appointments_professional ON appointments(professional_id);
CREATE INDEX idx_appointments_scheduled ON appointments(professional_id, scheduled_at);
CREATE INDEX idx_appointments_client ON appointments(client_id);
CREATE INDEX idx_appointments_status ON appointments(professional_id, status);
CREATE INDEX idx_appointments_series ON appointments(series_id);

ALTER TABLE appointments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "appointments_isolation" ON appointments FOR ALL TO authenticated
USING (professional_id = auth_professional_id())
WITH CHECK (professional_id = auth_professional_id());
```

### sessions

```sql
CREATE TABLE sessions (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  professional_id     uuid NOT NULL REFERENCES professionals(id) ON DELETE RESTRICT,
  client_id           uuid NOT NULL REFERENCES clients(id),
  appointment_id      uuid REFERENCES appointments(id),
  service_id          uuid REFERENCES services(id),
  team_member_id      uuid REFERENCES team_members(id),
  
  -- Dados da sessão
  session_date        date NOT NULL DEFAULT CURRENT_DATE,
  duration_minutes    integer,
  session_number      integer,    -- ex: sessão 3 de 10
  
  -- Clínico
  evolution           text,       -- nota de evolução
  prescriptions       text,
  observations        text,
  
  -- Financeiro
  amount              numeric(10,2) DEFAULT 0,
  payment_status      text DEFAULT 'pendente'
                      CHECK (payment_status IN ('pendente','pago','parcial','isento')),
  payment_method      text,
  
  -- NPS pós-sessão
  nps_score           integer CHECK (nps_score BETWEEN 1 AND 5),
  nps_comment         text,
  nps_requested_at    timestamptz,
  nps_answered_at     timestamptz,
  
  created_at          timestamptz DEFAULT now(),
  updated_at          timestamptz DEFAULT now()
);

CREATE TRIGGER sessions_updated_at
  BEFORE UPDATE ON sessions FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE INDEX idx_sessions_professional ON sessions(professional_id);
CREATE INDEX idx_sessions_client ON sessions(client_id);
CREATE INDEX idx_sessions_date ON sessions(professional_id, session_date);

ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sessions_isolation" ON sessions FOR ALL TO authenticated
USING (professional_id = auth_professional_id())
WITH CHECK (professional_id = auth_professional_id());
```

---

## 4. Documentos Clínicos

### anamnese_templates

```sql
CREATE TABLE anamnese_templates (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  professional_id uuid NOT NULL REFERENCES professionals(id) ON DELETE RESTRICT,
  name            text NOT NULL DEFAULT 'Ficha Padrão',
  fields          jsonb NOT NULL DEFAULT '[]',
  -- fields: [{id, type, label, required, options: []}]
  -- types: text, textarea, select, multiselect, date, boolean, scale
  is_default      boolean DEFAULT false,
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now()
);

ALTER TABLE anamnese_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anamnese_templates_isolation" ON anamnese_templates FOR ALL TO authenticated
USING (professional_id = auth_professional_id())
WITH CHECK (professional_id = auth_professional_id());
```

### anamnese_fichas

```sql
CREATE TABLE anamnese_fichas (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  professional_id uuid NOT NULL REFERENCES professionals(id) ON DELETE RESTRICT,
  client_id       uuid NOT NULL REFERENCES clients(id),
  template_id     uuid NOT NULL REFERENCES anamnese_templates(id),
  appointment_id  uuid REFERENCES appointments(id),
  
  token           text UNIQUE DEFAULT gen_random_uuid()::text,
  token_expires_at timestamptz DEFAULT (now() + interval '7 days'),
  
  answers         jsonb DEFAULT '{}',  -- {field_id: value}
  completed_at    timestamptz,
  
  created_at      timestamptz DEFAULT now()
);

CREATE INDEX idx_anamnese_fichas_token ON anamnese_fichas(token);

ALTER TABLE anamnese_fichas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anamnese_fichas_isolation" ON anamnese_fichas FOR ALL TO authenticated
USING (professional_id = auth_professional_id())
WITH CHECK (professional_id = auth_professional_id());
-- Anon pode preencher via token
CREATE POLICY "anamnese_fichas_anon_update" ON anamnese_fichas FOR UPDATE TO anon
USING (token IS NOT NULL AND token_expires_at > now() AND completed_at IS NULL)
WITH CHECK (completed_at IS NULL);
```

### modelos

```sql
CREATE TABLE modelos (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  professional_id uuid NOT NULL REFERENCES professionals(id) ON DELETE RESTRICT,
  name            text NOT NULL,
  type            text NOT NULL CHECK (type IN ('contrato','orcamento','anamnese','outro')),
  storage_path    text NOT NULL,   -- path no bucket modelos-contratos
  variables       jsonb DEFAULT '[]', -- lista de variáveis disponíveis no template
  is_active       boolean DEFAULT true,
  created_at      timestamptz DEFAULT now()
);

ALTER TABLE modelos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "modelos_isolation" ON modelos FOR ALL TO authenticated
USING (professional_id = auth_professional_id())
WITH CHECK (professional_id = auth_professional_id());
```

### quotes

```sql
CREATE TYPE quote_status_enum AS ENUM (
  'rascunho', 'enviado', 'aprovado', 'rejeitado', 'expirado', 'convertido'
);

CREATE TABLE quotes (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  professional_id     uuid NOT NULL REFERENCES professionals(id) ON DELETE RESTRICT,
  client_id           uuid NOT NULL REFERENCES clients(id),
  modelo_id           uuid REFERENCES modelos(id),
  
  number              text NOT NULL,       -- ex: ORC-2026-001
  title               text,
  items               jsonb NOT NULL DEFAULT '[]',
  -- items: [{service_id?, description, quantity, unit_price, discount}]
  
  subtotal            numeric(10,2) NOT NULL DEFAULT 0,
  discount_amount     numeric(10,2) DEFAULT 0,
  total_amount        numeric(10,2) NOT NULL DEFAULT 0,
  
  status              quote_status_enum DEFAULT 'rascunho',
  valid_until         date,
  
  notes               text,
  terms               text,
  
  -- Envio
  sent_at             timestamptz,
  sent_via            text,    -- 'whatsapp', 'email'
  pdf_url             text,
  
  -- Aprovação
  approved_at         timestamptz,
  approved_by         text,    -- 'digital_signature', 'manual'
  signature_provider  text,    -- 'clicksign', 'docusign'
  signature_request_id text,
  
  -- Follow-up
  followup_sent_at    timestamptz,
  
  -- Conversão
  contract_id         uuid,    -- FK adicionada após criar contracts
  
  created_at          timestamptz DEFAULT now(),
  updated_at          timestamptz DEFAULT now()
);

CREATE TRIGGER quotes_updated_at
  BEFORE UPDATE ON quotes FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE quotes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "quotes_isolation" ON quotes FOR ALL TO authenticated
USING (professional_id = auth_professional_id())
WITH CHECK (professional_id = auth_professional_id());
```

### contracts

```sql
CREATE TYPE contract_status_enum AS ENUM (
  'rascunho', 'enviado', 'assinado', 'cancelado'
);

CREATE TABLE contracts (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  professional_id     uuid NOT NULL REFERENCES professionals(id) ON DELETE RESTRICT,
  client_id           uuid NOT NULL REFERENCES clients(id),
  quote_id            uuid REFERENCES quotes(id),
  modelo_id           uuid REFERENCES modelos(id),
  
  number              text NOT NULL,
  title               text,
  content             text,                -- HTML ou DOCX path
  
  status              contract_status_enum DEFAULT 'rascunho',
  
  sent_at             timestamptz,
  sent_via            text,
  pdf_url             text,
  
  signed_at           timestamptz,
  signature_provider  text,
  signature_request_id text,
  
  created_at          timestamptz DEFAULT now(),
  updated_at          timestamptz DEFAULT now()
);

ALTER TABLE contracts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "contracts_isolation" ON contracts FOR ALL TO authenticated
USING (professional_id = auth_professional_id())
WITH CHECK (professional_id = auth_professional_id());
```

---

## 5. Financeiro Operacional

### financial_transactions

```sql
CREATE TYPE transaction_type_enum AS ENUM ('receita', 'despesa', 'transferencia');
CREATE TYPE transaction_status_enum AS ENUM ('pendente', 'pago', 'cancelado', 'estornado');

CREATE TABLE financial_transactions (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  professional_id     uuid NOT NULL REFERENCES professionals(id) ON DELETE RESTRICT,
  client_id           uuid REFERENCES clients(id),
  session_id          uuid REFERENCES sessions(id),
  appointment_id      uuid REFERENCES appointments(id),
  client_package_id   uuid, -- FK após criar client_packages
  
  -- Classificação
  type                transaction_type_enum NOT NULL,
  category_id         uuid, -- FK após criar financeiro_categorias
  cost_center_id      uuid, -- FK após criar financeiro_centros_custo
  bank_account_id     uuid, -- FK após criar financeiro_bancos
  
  -- Valor
  amount              numeric(10,2) NOT NULL,
  discount_amount     numeric(10,2) DEFAULT 0,
  net_amount          numeric(10,2) GENERATED ALWAYS AS (amount - discount_amount) STORED,
  
  -- Pagamento
  status              transaction_status_enum DEFAULT 'pendente',
  payment_method      text,  -- 'pix', 'cartao_credito', 'cartao_debito', 'dinheiro', 'boleto', 'outros'
  payment_gateway     text,  -- 'asaas', 'mercadopago', 'efibank', 'stripe', 'manual'
  gateway_transaction_id text,
  installments        integer DEFAULT 1,
  installment_number  integer DEFAULT 1,
  parent_transaction_id uuid REFERENCES financial_transactions(id),
  
  -- Datas
  due_date            date,
  paid_at             timestamptz,
  
  -- Metadados
  description         text NOT NULL,
  source              text DEFAULT 'manual',  -- 'manual', 'pdv', 'pacote', 'assinatura', 'gateway'
  notes               text,
  
  -- Conciliação
  conciliacao_item_id uuid, -- FK após criar financeiro_conciliacao_items
  
  created_at          timestamptz DEFAULT now(),
  updated_at          timestamptz DEFAULT now()
  -- NUNCA deleted_at — dados financeiros são imutáveis
);

CREATE TRIGGER financial_transactions_updated_at
  BEFORE UPDATE ON financial_transactions FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE INDEX idx_ft_professional ON financial_transactions(professional_id);
CREATE INDEX idx_ft_status ON financial_transactions(professional_id, status);
CREATE INDEX idx_ft_due_date ON financial_transactions(professional_id, due_date);
CREATE INDEX idx_ft_client ON financial_transactions(client_id);
CREATE INDEX idx_ft_source ON financial_transactions(professional_id, source);

ALTER TABLE financial_transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ft_isolation" ON financial_transactions FOR ALL TO authenticated
USING (professional_id = auth_professional_id())
WITH CHECK (professional_id = auth_professional_id());
```

### financeiro_bancos

```sql
CREATE TABLE financeiro_bancos (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  professional_id uuid NOT NULL REFERENCES professionals(id) ON DELETE RESTRICT,
  nome            text NOT NULL,
  banco_codigo    text,
  agencia         text,
  conta           text,
  saldo_inicial   numeric(10,2) DEFAULT 0,
  is_default      boolean DEFAULT false,
  is_active       boolean DEFAULT true,
  created_at      timestamptz DEFAULT now()
);

ALTER TABLE financeiro_bancos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "bancos_isolation" ON financeiro_bancos FOR ALL TO authenticated
USING (professional_id = auth_professional_id())
WITH CHECK (professional_id = auth_professional_id());
```

### financeiro_categorias

```sql
CREATE TABLE financeiro_categorias (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  professional_id uuid NOT NULL REFERENCES professionals(id) ON DELETE RESTRICT,
  nome            text NOT NULL,
  tipo            text NOT NULL CHECK (tipo IN ('receita','despesa','ambos')),
  cor             text DEFAULT '#7C3AED',
  is_default      boolean DEFAULT false,   -- categorias padrão criadas no onboarding
  is_active       boolean DEFAULT true,
  created_at      timestamptz DEFAULT now()
);

-- Categorias padrão criadas via trigger no INSERT de professionals
ALTER TABLE financeiro_categorias ENABLE ROW LEVEL SECURITY;
CREATE POLICY "categorias_isolation" ON financeiro_categorias FOR ALL TO authenticated
USING (professional_id = auth_professional_id())
WITH CHECK (professional_id = auth_professional_id());
```

### financeiro_centros_custo

```sql
CREATE TABLE financeiro_centros_custo (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  professional_id uuid NOT NULL REFERENCES professionals(id) ON DELETE RESTRICT,
  nome            text NOT NULL,
  codigo          text,
  descricao       text,
  is_active       boolean DEFAULT true,
  created_at      timestamptz DEFAULT now()
);

ALTER TABLE financeiro_centros_custo ENABLE ROW LEVEL SECURITY;
CREATE POLICY "centros_custo_isolation" ON financeiro_centros_custo FOR ALL TO authenticated
USING (professional_id = auth_professional_id())
WITH CHECK (professional_id = auth_professional_id());
```

### payment_gateway_credentials

```sql
-- Credenciais armazenadas via Supabase Vault
-- Frontend lê apenas via view payment_gateway_credentials_safe
CREATE TABLE payment_gateway_credentials (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  professional_id uuid NOT NULL REFERENCES professionals(id) ON DELETE RESTRICT,
  provider        text NOT NULL CHECK (provider IN ('asaas','mercadopago','efibank','stripe')),
  environment     text NOT NULL CHECK (environment IN ('sandbox','production')),
  credentials     jsonb NOT NULL,   -- {api_key, client_id, client_secret, ...} — via Vault
  webhook_secret  text,
  is_active       boolean DEFAULT true,
  tested_at       timestamptz,
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now(),
  UNIQUE(professional_id, provider)
);

-- View segura (nunca expõe secrets completos)
CREATE VIEW payment_gateway_credentials_safe
WITH (security_invoker = on) AS
SELECT
  id, professional_id, provider, environment, is_active, tested_at, created_at,
  '****' || right(credentials->>'api_key', 4) AS key_masked
FROM payment_gateway_credentials
WHERE professional_id = auth_professional_id();

ALTER TABLE payment_gateway_credentials ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pgc_isolation" ON payment_gateway_credentials FOR ALL TO authenticated
USING (professional_id = auth_professional_id())
WITH CHECK (professional_id = auth_professional_id());
-- NUNCA retornar credentials completas ao authenticated
REVOKE SELECT (credentials) ON payment_gateway_credentials FROM authenticated;
```

### financeiro_conciliacoes + financeiro_conciliacao_items

```sql
CREATE TABLE financeiro_conciliacoes (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  professional_id uuid NOT NULL REFERENCES professionals(id) ON DELETE RESTRICT,
  bank_account_id uuid NOT NULL REFERENCES financeiro_bancos(id),
  period_start    date NOT NULL,
  period_end      date NOT NULL,
  status          text DEFAULT 'aberta' CHECK (status IN ('aberta','fechada')),
  balance_start   numeric(10,2) NOT NULL DEFAULT 0,
  balance_end     numeric(10,2),
  difference      numeric(10,2),
  total_matched   integer DEFAULT 0,
  total_pending   integer DEFAULT 0,
  closed_at       timestamptz,
  created_at      timestamptz DEFAULT now()
);

-- Conciliações fechadas são imutáveis
CREATE OR REPLACE FUNCTION fn_conciliacao_immutable()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status = 'fechada' THEN
    RAISE EXCEPTION 'Conciliações fechadas são imutáveis';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER prevent_conciliacao_update
  BEFORE UPDATE ON financeiro_conciliacoes
  FOR EACH ROW EXECUTE FUNCTION fn_conciliacao_immutable();

CREATE TABLE financeiro_conciliacao_items (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conciliacao_id        uuid NOT NULL REFERENCES financeiro_conciliacoes(id),
  professional_id       uuid NOT NULL REFERENCES professionals(id) ON DELETE RESTRICT,
  transaction_id        uuid REFERENCES financial_transactions(id),
  
  -- Dado do extrato
  extrato_date          date NOT NULL,
  extrato_amount        numeric(10,2) NOT NULL,
  extrato_description   text,
  extrato_reference     text,
  
  -- Status do match
  match_status          text NOT NULL DEFAULT 'pendente'
                        CHECK (match_status IN ('matched','auto_matched','ignored','created')),
  created_at            timestamptz DEFAULT now()
);

ALTER TABLE financeiro_conciliacoes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "conciliacoes_isolation" ON financeiro_conciliacoes FOR ALL TO authenticated
USING (professional_id = auth_professional_id())
WITH CHECK (professional_id = auth_professional_id());

ALTER TABLE financeiro_conciliacao_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "conciliacao_items_isolation" ON financeiro_conciliacao_items FOR ALL TO authenticated
USING (professional_id = auth_professional_id())
WITH CHECK (professional_id = auth_professional_id());
```

---

## 6. SaaS Billing & Créditos

### plans

```sql
CREATE TABLE plans (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name            text NOT NULL UNIQUE,    -- 'trial', 'individual', 'equipe', 'team', 'enterprise'
  display_name    text NOT NULL,
  price_monthly   numeric(10,2),
  stripe_price_id text,
  
  -- Limites
  max_clients     integer,                 -- NULL = ilimitado
  max_team_members integer DEFAULT 1,
  max_funnels     integer DEFAULT 1,
  ai_credits_monthly integer DEFAULT 500,  -- créditos incluídos por mês
  
  -- Features (capabilities)
  capabilities    jsonb NOT NULL DEFAULT '{}',
  -- {
  --   MULTI_PROFESSIONAL: bool,
  --   SALES_FUNNEL: bool,
  --   CAMPAIGNS: bool,
  --   FUNNEL_AUTOMATIONS: bool,
  --   EMAIL_CHANNEL: bool,
  --   BANK_RECONCILIATION: bool,
  --   COST_CENTERS: bool
  -- }
  
  is_active       boolean DEFAULT true,
  created_at      timestamptz DEFAULT now()
);

INSERT INTO plans (name, display_name, price_monthly, max_clients, max_team_members, ai_credits_monthly) VALUES
  ('trial',      'Trial',          0,    50,    1,    200),
  ('individual', 'Individual',     97,   300,   1,    500),
  ('equipe',     'Equipe',        197,  2000,   3,   2000),
  ('team',       'Team',          397, 10000,  10,   5000),
  ('enterprise', 'Enterprise',   NULL,  NULL, NULL,  NULL);
```

### professional_subscriptions

```sql
CREATE TABLE professional_subscriptions (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  professional_id         uuid NOT NULL UNIQUE REFERENCES professionals(id) ON DELETE RESTRICT,
  plan_id                 uuid NOT NULL REFERENCES plans(id),
  
  stripe_subscription_id  text UNIQUE,
  stripe_customer_id      text,
  
  status                  text NOT NULL DEFAULT 'active'
                          CHECK (status IN ('active','past_due','canceled','trialing','paused')),
  
  current_period_start    timestamptz,
  current_period_end      timestamptz,
  cancel_at_period_end    boolean DEFAULT false,
  canceled_at             timestamptz,
  
  created_at              timestamptz DEFAULT now(),
  updated_at              timestamptz DEFAULT now()
);

ALTER TABLE professional_subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "subscriptions_self" ON professional_subscriptions FOR SELECT TO authenticated
USING (professional_id = auth_professional_id());
REVOKE INSERT, UPDATE, DELETE ON professional_subscriptions FROM authenticated;
```

### credit_wallets

```sql
CREATE TABLE credit_wallets (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  professional_id     uuid NOT NULL UNIQUE REFERENCES professionals(id) ON DELETE RESTRICT,
  balance             integer NOT NULL DEFAULT 0 CHECK (balance >= 0),
  reserved            integer NOT NULL DEFAULT 0 CHECK (reserved >= 0),
  -- available = balance - reserved
  total_purchased     integer DEFAULT 0,
  total_consumed      integer DEFAULT 0,
  updated_at          timestamptz DEFAULT now()
);

-- Não permite saldo negativo
CREATE OR REPLACE FUNCTION fn_wallet_no_negative()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.balance < 0 OR NEW.reserved < 0 OR NEW.balance < NEW.reserved THEN
    RAISE EXCEPTION 'Saldo insuficiente de créditos';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER wallet_check BEFORE UPDATE ON credit_wallets
  FOR EACH ROW EXECUTE FUNCTION fn_wallet_no_negative();

ALTER TABLE credit_wallets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "wallets_self" ON credit_wallets FOR SELECT TO authenticated
USING (professional_id = auth_professional_id());
REVOKE INSERT, UPDATE, DELETE ON credit_wallets FROM authenticated;
```

### credit_transactions

```sql
CREATE TABLE credit_transactions (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  professional_id     uuid NOT NULL REFERENCES professionals(id) ON DELETE RESTRICT,
  amount              integer NOT NULL,   -- positivo = crédito, negativo = débito
  type                text NOT NULL
                      CHECK (type IN ('purchase','monthly_grant','consumption','refund','admin_adjust','reservation','release')),
  agent_slug          text,
  tokens_used         integer,
  model_used          text,
  reference_id        text,              -- stripe_payment_intent_id, etc.
  notes               text,
  created_at          timestamptz DEFAULT now()
);

CREATE INDEX idx_credit_tx_professional ON credit_transactions(professional_id);
CREATE INDEX idx_credit_tx_type ON credit_transactions(professional_id, type);

ALTER TABLE credit_transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "credit_tx_self" ON credit_transactions FOR SELECT TO authenticated
USING (professional_id = auth_professional_id());
REVOKE INSERT, UPDATE, DELETE ON credit_transactions FROM authenticated;
```

### affiliate_partners

```sql
CREATE TABLE affiliate_partners (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  professional_id uuid NOT NULL UNIQUE REFERENCES professionals(id) ON DELETE RESTRICT,
  referral_code   text NOT NULL UNIQUE,
  commission_rate numeric(5,2) DEFAULT 15.00,  -- 15%
  status          text DEFAULT 'pending'
                  CHECK (status IN ('pending','approved','rejected','suspended')),
  approved_at     timestamptz,
  approved_by     uuid REFERENCES master_admins(id),
  total_referrals integer DEFAULT 0,
  total_earned    numeric(10,2) DEFAULT 0,
  created_at      timestamptz DEFAULT now()
);

ALTER TABLE affiliate_partners ENABLE ROW LEVEL SECURITY;
CREATE POLICY "affiliate_self" ON affiliate_partners FOR SELECT TO authenticated
USING (professional_id = auth_professional_id());
```

### affiliate_commissions

```sql
CREATE TABLE affiliate_commissions (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  affiliate_partner_id    uuid NOT NULL REFERENCES affiliate_partners(id),
  referred_professional_id uuid NOT NULL REFERENCES professionals(id) ON DELETE RESTRICT,
  subscription_id         uuid REFERENCES professional_subscriptions(id),
  
  month                   date NOT NULL,   -- primeiro dia do mês
  gross_amount            numeric(10,2) NOT NULL,
  commission_rate         numeric(5,2) NOT NULL,
  commission_amount       numeric(10,2) NOT NULL,
  
  status                  text DEFAULT 'calculated'
                          CHECK (status IN ('calculated','approved','paid','cancelled')),
  paid_at                 timestamptz,
  payment_method          text,
  
  created_at              timestamptz DEFAULT now()
);

ALTER TABLE affiliate_commissions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "commissions_self" ON affiliate_commissions FOR SELECT TO authenticated
USING (
  affiliate_partner_id IN (
    SELECT id FROM affiliate_partners WHERE professional_id = auth_professional_id()
  )
);
```

---

## 7. Estoque & Pacotes

### stock_items

```sql
CREATE TABLE stock_items (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  professional_id uuid NOT NULL REFERENCES professionals(id) ON DELETE RESTRICT,
  name            text NOT NULL,
  description     text,
  category        text,
  unit            text DEFAULT 'unidade',   -- unidade, ml, g, caixa
  tipo            text DEFAULT 'insumo' CHECK (tipo IN ('insumo','produto','equipamento')),
  
  -- Estoque
  quantity        numeric(10,3) DEFAULT 0,
  minimum_quantity numeric(10,3) DEFAULT 0,
  cost_price      numeric(10,2) DEFAULT 0,
  sale_price      numeric(10,2) DEFAULT 0,
  
  -- Para produtos à venda
  is_for_sale     boolean DEFAULT false,
  is_public       boolean DEFAULT false,    -- aparece no PDV
  
  sku             text,
  barcode         text,
  image_url       text,
  is_active       boolean DEFAULT true,
  
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now()
);

ALTER TABLE stock_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "stock_items_isolation" ON stock_items FOR ALL TO authenticated
USING (professional_id = auth_professional_id())
WITH CHECK (professional_id = auth_professional_id());
```

### stock_history

```sql
CREATE TABLE stock_history (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  professional_id uuid NOT NULL REFERENCES professionals(id) ON DELETE RESTRICT,
  stock_item_id   uuid NOT NULL REFERENCES stock_items(id),
  quantity_change numeric(10,3) NOT NULL,   -- positivo = entrada, negativo = saída
  quantity_before numeric(10,3) NOT NULL,
  quantity_after  numeric(10,3) NOT NULL,
  movement_type   text NOT NULL
                  CHECK (movement_type IN ('entrada','saida','ajuste','uso_sessao','venda_pdv','perda')),
  session_id      uuid REFERENCES sessions(id),
  transaction_id  uuid REFERENCES financial_transactions(id),
  notes           text,
  created_at      timestamptz DEFAULT now()
);

ALTER TABLE stock_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "stock_history_isolation" ON stock_history FOR ALL TO authenticated
USING (professional_id = auth_professional_id())
WITH CHECK (professional_id = auth_professional_id());
```

### service_stock_items

```sql
CREATE TABLE service_stock_items (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service_id      uuid NOT NULL REFERENCES services(id),
  stock_item_id   uuid NOT NULL REFERENCES stock_items(id),
  quantity_per_session numeric(10,3) NOT NULL DEFAULT 1,
  UNIQUE(service_id, stock_item_id)
);
```

### packages

```sql
CREATE TABLE packages (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  professional_id uuid NOT NULL REFERENCES professionals(id) ON DELETE RESTRICT,
  name            text NOT NULL,
  description     text,
  service_id      uuid REFERENCES services(id),
  sessions_count  integer NOT NULL DEFAULT 1,
  price           numeric(10,2) NOT NULL,
  validity_days   integer DEFAULT 180,
  is_active       boolean DEFAULT true,
  is_public       boolean DEFAULT true,
  slug            text UNIQUE,             -- para /pacote/:slug
  image_url       text,
  created_at      timestamptz DEFAULT now()
);

ALTER TABLE packages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "packages_isolation" ON packages FOR ALL TO authenticated
USING (professional_id = auth_professional_id())
WITH CHECK (professional_id = auth_professional_id());
CREATE POLICY "packages_public_read" ON packages FOR SELECT TO anon
USING (is_active = true AND is_public = true);
```

### client_packages

```sql
CREATE TABLE client_packages (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  professional_id     uuid NOT NULL REFERENCES professionals(id) ON DELETE RESTRICT,
  client_id           uuid NOT NULL REFERENCES clients(id),
  package_id          uuid NOT NULL REFERENCES packages(id),
  transaction_id      uuid REFERENCES financial_transactions(id),
  
  sessions_total      integer NOT NULL,
  sessions_used       integer DEFAULT 0,
  sessions_remaining  integer GENERATED ALWAYS AS (sessions_total - sessions_used) STORED,
  
  purchased_at        timestamptz DEFAULT now(),
  expires_at          timestamptz,
  status              text DEFAULT 'ativo'
                      CHECK (status IN ('ativo','esgotado','expirado','cancelado')),
  
  created_at          timestamptz DEFAULT now()
);

ALTER TABLE client_packages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "client_packages_isolation" ON client_packages FOR ALL TO authenticated
USING (professional_id = auth_professional_id())
WITH CHECK (professional_id = auth_professional_id());
```

### package_session_usage

```sql
CREATE TABLE package_session_usage (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_package_id   uuid NOT NULL REFERENCES client_packages(id),
  session_id          uuid NOT NULL REFERENCES sessions(id),
  appointment_id      uuid REFERENCES appointments(id),
  used_at             timestamptz DEFAULT now()
);
```

---

## 8. WhatsApp & IA

### conversations

```sql
CREATE TABLE conversations (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  professional_id     uuid NOT NULL REFERENCES professionals(id) ON DELETE RESTRICT,
  client_id           uuid REFERENCES clients(id),
  
  channel             text NOT NULL DEFAULT 'whatsapp'
                      CHECK (channel IN ('whatsapp','email','web_chat','instagram','messenger')),
  phone               text,                -- para whatsapp
  email_address       text,               -- para email
  session_id_anon     text,               -- para web_chat anônimo
  
  -- Rosane control
  rosane_status       text DEFAULT 'active'
                      CHECK (rosane_status IN ('active','shadow','paused','human_takeover')),
  human_takeover_at   timestamptz,
  human_takeover_by   uuid REFERENCES team_members(id),
  
  -- Metadata
  last_message_at     timestamptz,
  last_message_preview text,
  unread_count        integer DEFAULT 0,
  
  created_at          timestamptz DEFAULT now(),
  updated_at          timestamptz DEFAULT now()
);

CREATE INDEX idx_conversations_professional ON conversations(professional_id);
CREATE INDEX idx_conversations_client ON conversations(client_id);
CREATE INDEX idx_conversations_last_message ON conversations(professional_id, last_message_at DESC);

ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "conversations_isolation" ON conversations FOR ALL TO authenticated
USING (professional_id = auth_professional_id())
WITH CHECK (professional_id = auth_professional_id());
```

### conversation_contexts

```sql
CREATE TABLE conversation_contexts (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  professional_id     uuid NOT NULL REFERENCES professionals(id) ON DELETE RESTRICT,
  conversation_id     uuid NOT NULL REFERENCES conversations(id),
  client_id           uuid REFERENCES clients(id),
  
  context_type        text NOT NULL,
  -- 'appointment_confirmation','reminder','post_care','referral','relationship',
  -- 'lead_followup','sales','reactivation','private','upsell','onboarding'
  
  metadata            jsonb DEFAULT '{}',
  -- {appointment_id, agent_slug, trigger_id, ...}
  
  expires_at          timestamptz,
  closed_at           timestamptz,
  created_at          timestamptz DEFAULT now()
);

CREATE INDEX idx_conv_contexts_conversation ON conversation_contexts(conversation_id);
CREATE INDEX idx_conv_contexts_professional ON conversation_contexts(professional_id);

ALTER TABLE conversation_contexts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "conv_contexts_isolation" ON conversation_contexts FOR ALL TO authenticated
USING (professional_id = auth_professional_id())
WITH CHECK (professional_id = auth_professional_id());
```

### message_events

> Substitui: `whatsapp_inbound_events`, `whatsapp_outbound_events`, `whatsapp_message_logs`, `confirmation_messages`.
> Todo tráfego de mensagem (inbound + outbound, qualquer canal) passa por esta tabela.

> **Regra de governança — obrigatória:**
> Esta tabela guarda somente campos de roteamento, idempotência, busca, auditoria e exibição básica.
> **Nova coluna exige justificativa explícita:** índice, filtro frequente, join, auditoria ou roteamento.
> Detalhes de provider, agente ou debug ficam em `metadata` ou `provider_payload`.
> Campos usados por apenas um agente ficam em `metadata`. Campos usados por vários fluxos viram coluna.
> **Proibido:** `audio_duration`, `llm_model`, `button_id`, `transcription_text`, `evolution_raw_status`,
> `agent_reasoning`, `device_id`, `classification_confidence` — esses ficam em `metadata`/`provider_payload`.

```sql
CREATE TABLE message_events (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  professional_id     uuid NOT NULL REFERENCES professionals(id) ON DELETE RESTRICT,
  conversation_id     uuid REFERENCES conversations(id),
  client_id           uuid REFERENCES clients(id),

  direction           text NOT NULL CHECK (direction IN ('inbound','outbound')),
  channel             text NOT NULL DEFAULT 'whatsapp'
                      CHECK (channel IN ('whatsapp','instagram','messenger','email','push')),
  message_type        text DEFAULT 'text'
                      CHECK (message_type IN ('text','audio','image','document','template','button')),

  -- Roteamento de webhook (colunas reais — filtráveis, indexáveis, parte da chave de idempotência)
  source_webhook      text CHECK (source_webhook IN ('admin', 'professional')),
  -- 'admin' = webhook da instância Nerissa; 'professional' = instância Rosane
  instance_name       text,            -- nome exato da instância no Evolution Go

  -- Conteúdo
  content             text,
  media_url           text,
  media_size_bytes    int,

  -- Contexto do envio
  sent_by             text CHECK (sent_by IN ('ai','human','cron','campaign')),
  -- nullable em inbound; obrigatório em outbound
  agent_slug          text,
  -- nullable; preenchido apenas quando sent_by='ai' ou processamento de agente existir
  -- inbound puro de cliente normalmente fica null
  context_type        text CHECK (
                        context_type IS NULL OR context_type IN (
                          'conversation','confirmation','reminder','campaign',
                          'follow_up','post_care','reactivation','onboarding','support'
                        )
                      ),
  campaign_id         uuid REFERENCES campaigns(id),

  -- Status de processamento/entrega
  external_message_id text,            -- ID do Evolution Go / Meta
  status              text DEFAULT 'queued'
                      CHECK (status IN (
                        'queued','processing','processed',
                        'sent','delivered','read',
                        'failed','dead_lettered','dry_run','skipped'
                      )),
  error_code          text,

  -- Dados não estruturados: contexto variável, específico de provider ou debug
  -- NUNCA usar metadata para campos de roteamento, filtro ou idempotência
  metadata            jsonb DEFAULT '{}',
  provider_payload    jsonb DEFAULT '{}',  -- payload bruto do provider (Evolution Go, Meta, etc.)

  -- Timestamps
  created_at          timestamptz DEFAULT now(),  -- quando o evento foi registrado no banco
  sent_at             timestamptz,                -- apenas outbound: quando enviado ao provider
  delivered_at        timestamptz,
  read_at             timestamptz
);

CREATE INDEX idx_message_events_professional ON message_events(professional_id, created_at DESC);
CREATE INDEX idx_message_events_conversation ON message_events(conversation_id, created_at DESC);
CREATE INDEX idx_message_events_external_id ON message_events(external_message_id)
  WHERE external_message_id IS NOT NULL;
CREATE INDEX idx_message_events_campaign ON message_events(campaign_id)
  WHERE campaign_id IS NOT NULL;
-- Índice composto para lookup de idempotência: source_webhook:instance_name:external_message_id
CREATE INDEX idx_message_events_idempotency ON message_events(instance_name, external_message_id)
  WHERE external_message_id IS NOT NULL;

ALTER TABLE message_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "message_events_isolation" ON message_events FOR SELECT TO authenticated
USING (professional_id = auth_professional_id());
REVOKE INSERT, UPDATE, DELETE ON message_events FROM authenticated;
```

### agent_executions

> Substitui: `agent_logs`. Separado de `message_events` — agente pode executar sem enviar mensagem.

```sql
CREATE TABLE agent_executions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  professional_id uuid NOT NULL REFERENCES professionals(id) ON DELETE RESTRICT,
  agent_slug      text NOT NULL,       -- 'rosane', 'nerissa', 'lembrete', etc.
  trigger_type    text,                -- 'webhook', 'cron', 'manual', 'rpc'
  trigger_payload jsonb DEFAULT '{}',
  
  -- Resultado
  status          text DEFAULT 'running'
                  CHECK (status IN ('running','success','failed','skipped')),
  tokens_input    int DEFAULT 0,
  tokens_output   int DEFAULT 0,
  cost_usd        numeric(10,6) DEFAULT 0,
  duration_ms     int,
  
  -- Referências
  conversation_id uuid REFERENCES conversations(id),
  client_id       uuid REFERENCES clients(id),
  error_message   text,
  
  started_at      timestamptz DEFAULT now(),
  completed_at    timestamptz
);

CREATE INDEX idx_agent_executions_professional ON agent_executions(professional_id, started_at DESC);
CREATE INDEX idx_agent_executions_agent ON agent_executions(agent_slug, status, started_at);

ALTER TABLE agent_executions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "agent_executions_isolation" ON agent_executions FOR SELECT TO authenticated
USING (professional_id = auth_professional_id());
REVOKE INSERT, UPDATE, DELETE ON agent_executions FROM authenticated;
```

### shadow_suggestions

```sql
CREATE TABLE shadow_suggestions (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  professional_id     uuid NOT NULL REFERENCES professionals(id) ON DELETE RESTRICT,
  conversation_id     uuid REFERENCES conversations(id),
  
  suggested_text      text NOT NULL,
  actual_text         text,     -- o que o profissional realmente enviou
  
  status              text DEFAULT 'pending'
                      CHECK (status IN ('pending','approved','edited','rejected','ignored')),
  
  approved_at         timestamptz,
  edited_at           timestamptz,
  rejected_at         timestamptz,
  
  -- RLHF
  rlhf_processed      boolean DEFAULT false,
  
  created_at          timestamptz DEFAULT now()
);

ALTER TABLE shadow_suggestions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "shadow_suggestions_isolation" ON shadow_suggestions FOR ALL TO authenticated
USING (professional_id = auth_professional_id())
WITH CHECK (professional_id = auth_professional_id());
```

### professional_agents

```sql
CREATE TABLE professional_agents (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  professional_id     uuid NOT NULL REFERENCES professionals(id) ON DELETE RESTRICT,
  
  -- Configuração global Rosane
  agent_name          text DEFAULT 'Rosane',
  shadow_mode         boolean DEFAULT true,
  auto_respond        boolean DEFAULT true,
  working_hours       jsonb DEFAULT '{}',
  -- {mon: {start: '08:00', end: '18:00'}, ...}
  respond_outside_hours boolean DEFAULT false,
  
  -- Agentes habilitados (9 slugs)
  -- duvidas, agendamento, lembrete, pos_atendimento, indicacao
  -- reativacao, relacionamento, objecoes, cadastro
  enabled_agents      text[] DEFAULT ARRAY['duvidas','agendamento','lembrete'],
  
  -- Configurações por agente (JSON por slug)
  agent_configs       jsonb DEFAULT '{}',
  -- {
  --   "indicacao": {"min_sessions": 3, "cooldown_days": 30, "min_nps": 4},
  --   "reativacao": {"inactive_days": 30, "max_attempts": 3},
  --   "upsell": {rules: [{trigger: "sessions_count", value: 8, offer: "package_id"}]},
  --   ...
  -- }
  
  -- Persona base configurada pelo Nerissa setup
  persona_base        text,    -- instrução de tom/estilo
  clinic_context      text,    -- informações da clínica para contexto da IA
  
  created_at          timestamptz DEFAULT now(),
  updated_at          timestamptz DEFAULT now()
);

ALTER TABLE professional_agents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pro_agents_isolation" ON professional_agents FOR ALL TO authenticated
USING (professional_id = auth_professional_id())
WITH CHECK (professional_id = auth_professional_id());
```

### personas

```sql
CREATE TABLE personas (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  professional_id     uuid NOT NULL UNIQUE REFERENCES professionals(id) ON DELETE RESTRICT,
  version             integer DEFAULT 1,
  
  -- Sintetizado pelo persona-synthesis a partir de rlhf_rules
  system_prompt       text NOT NULL,
  tone_descriptors    text[],     -- ['direta','calorosa','profissional']
  vocabulary          jsonb,      -- palavras/expressões preferidas
  anti_patterns       text[],     -- o que NÃO dizer
  
  confidence_score    numeric(3,2), -- 0.0 a 1.0
  rules_count         integer DEFAULT 0,
  
  created_at          timestamptz DEFAULT now()
);

ALTER TABLE personas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "personas_isolation" ON personas FOR ALL TO authenticated
USING (professional_id = auth_professional_id());
REVOKE INSERT, UPDATE, DELETE ON personas FROM authenticated;
```

### rlhf_rules + rlhf_diffs

```sql
CREATE TABLE rlhf_diffs (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  professional_id     uuid NOT NULL REFERENCES professionals(id) ON DELETE RESTRICT,
  shadow_suggestion_id uuid REFERENCES shadow_suggestions(id),
  
  suggested_text      text NOT NULL,
  actual_text         text NOT NULL,
  diff_analysis       text,       -- o que mudou e por quê
  pattern_detected    text,       -- padrão extraído
  
  processed           boolean DEFAULT false,
  created_at          timestamptz DEFAULT now()
);

CREATE TABLE rlhf_rules (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  professional_id     uuid NOT NULL REFERENCES professionals(id) ON DELETE RESTRICT,
  rule_text           text NOT NULL,
  rule_type           text,       -- 'tone','vocabulary','anti_pattern','process'
  confidence          numeric(3,2) DEFAULT 0.5,
  applied_count       integer DEFAULT 0,
  is_active           boolean DEFAULT true,
  created_at          timestamptz DEFAULT now()
);

ALTER TABLE rlhf_diffs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "rlhf_diffs_isolation" ON rlhf_diffs FOR SELECT TO authenticated
USING (professional_id = auth_professional_id());

ALTER TABLE rlhf_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "rlhf_rules_isolation" ON rlhf_rules FOR SELECT TO authenticated
USING (professional_id = auth_professional_id());
```

### ai_usage_log

```sql
CREATE TABLE ai_usage_log (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  professional_id     uuid NOT NULL REFERENCES professionals(id) ON DELETE RESTRICT,
  agent_slug          text NOT NULL,
  model               text NOT NULL,
  tokens_input        integer NOT NULL DEFAULT 0,
  tokens_output       integer NOT NULL DEFAULT 0,
  tokens_total        integer GENERATED ALWAYS AS (tokens_input + tokens_output) STORED,
  credits_used        integer NOT NULL DEFAULT 0,
  cost_usd            numeric(10,6),
  conversation_id     uuid REFERENCES conversations(id),
  created_at          timestamptz DEFAULT now()
);

CREATE INDEX idx_ai_usage_professional ON ai_usage_log(professional_id);
CREATE INDEX idx_ai_usage_created ON ai_usage_log(created_at DESC);

ALTER TABLE ai_usage_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ai_usage_isolation" ON ai_usage_log FOR SELECT TO authenticated
USING (professional_id = auth_professional_id());
REVOKE INSERT, UPDATE, DELETE ON ai_usage_log FROM authenticated;
```

### proactive_triggers + proactive_trigger_logs

```sql
CREATE TABLE proactive_triggers (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  professional_id     uuid NOT NULL REFERENCES professionals(id) ON DELETE RESTRICT,
  client_id           uuid NOT NULL REFERENCES clients(id),
  
  trigger_type        text NOT NULL,
  -- 'falta_sessao','inatividade','aniversario','rfm_churn','pos_atendimento',
  -- 'relacionamento_casual','follow_up_pessoal','follow_up_indicacao',
  -- 'lead_followup','upsell'
  
  agent_slug          text,
  scheduled_for       timestamptz NOT NULL,
  status              text DEFAULT 'pending'
                      CHECK (status IN ('pending','processing','sent','failed','cancelled','cooldown')),
  metadata            jsonb DEFAULT '{}',
  
  created_at          timestamptz DEFAULT now()
);

CREATE TABLE proactive_trigger_logs (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trigger_id      uuid NOT NULL REFERENCES proactive_triggers(id),
  professional_id uuid NOT NULL REFERENCES professionals(id) ON DELETE RESTRICT,
  client_id       uuid NOT NULL REFERENCES clients(id),
  
  triggered_at    timestamptz DEFAULT now(),
  status          text NOT NULL,
  converted_at    timestamptz,    -- para upsell: quando o cliente aceitou
  error_message   text
);

ALTER TABLE proactive_triggers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "proactive_triggers_isolation" ON proactive_triggers FOR ALL TO authenticated
USING (professional_id = auth_professional_id())
WITH CHECK (professional_id = auth_professional_id());

ALTER TABLE proactive_trigger_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "proactive_logs_isolation" ON proactive_trigger_logs FOR SELECT TO authenticated
USING (professional_id = auth_professional_id());
```

---

## 9. Comunicação & Campanhas

### campaigns + campaign_recipients

```sql
CREATE TABLE campaigns (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  professional_id uuid NOT NULL REFERENCES professionals(id) ON DELETE RESTRICT,
  name            text NOT NULL,
  message         text NOT NULL,
  
  -- Segmentação
  segment_type    text NOT NULL,
  -- 'all','journey_stage','rfm_segment','custom_list','birthday_month'
  segment_config  jsonb DEFAULT '{}',
  
  -- Agendamento
  scheduled_for   timestamptz,
  sent_at         timestamptz,
  status          text DEFAULT 'draft'
                  CHECK (status IN ('draft','scheduled','running','completed','cancelled')),
  
  -- Stats
  total_recipients integer DEFAULT 0,
  total_sent      integer DEFAULT 0,
  total_delivered integer DEFAULT 0,
  total_read      integer DEFAULT 0,
  total_replied   integer DEFAULT 0,
  
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now()
);

CREATE TABLE campaign_recipients (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id     uuid NOT NULL REFERENCES campaigns(id),
  professional_id uuid NOT NULL REFERENCES professionals(id) ON DELETE RESTRICT,
  client_id       uuid NOT NULL REFERENCES clients(id),
  
  status          text DEFAULT 'pending'
                  CHECK (status IN ('pending','sent','delivered','read','replied','failed','opted_out')),
  sent_at         timestamptz,
  delivered_at    timestamptz,
  read_at         timestamptz,
  replied_at      timestamptz,
  error_message   text,
  UNIQUE(campaign_id, client_id)
);

ALTER TABLE campaigns ENABLE ROW LEVEL SECURITY;
CREATE POLICY "campaigns_isolation" ON campaigns FOR ALL TO authenticated
USING (professional_id = auth_professional_id())
WITH CHECK (professional_id = auth_professional_id());

ALTER TABLE campaign_recipients ENABLE ROW LEVEL SECURITY;
CREATE POLICY "campaign_recipients_isolation" ON campaign_recipients FOR ALL TO authenticated
USING (professional_id = auth_professional_id())
WITH CHECK (professional_id = auth_professional_id());
```

### referral_links + referral_events

```sql
CREATE TABLE referral_links (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  professional_id uuid NOT NULL REFERENCES professionals(id) ON DELETE RESTRICT,
  referrer_client_id uuid NOT NULL REFERENCES clients(id),
  code            text NOT NULL UNIQUE,
  reward_type     text DEFAULT 'discount',  -- 'discount','points','bonus_session','text'
  reward_value    text,
  reward_description text,
  expires_at      timestamptz,
  uses_count      integer DEFAULT 0,
  max_uses        integer DEFAULT 10,
  is_active       boolean DEFAULT true,
  created_at      timestamptz DEFAULT now()
);

CREATE TABLE referral_events (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  referral_link_id    uuid NOT NULL REFERENCES referral_links(id),
  professional_id     uuid NOT NULL REFERENCES professionals(id) ON DELETE RESTRICT,
  referred_client_id  uuid REFERENCES clients(id),
  
  event_type          text NOT NULL,
  -- 'link_clicked','phone_captured','client_registered','first_appointment','converted'
  
  metadata            jsonb DEFAULT '{}',
  created_at          timestamptz DEFAULT now()
);

ALTER TABLE referral_links ENABLE ROW LEVEL SECURITY;
CREATE POLICY "referral_links_isolation" ON referral_links FOR ALL TO authenticated
USING (professional_id = auth_professional_id())
WITH CHECK (professional_id = auth_professional_id());

ALTER TABLE referral_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "referral_events_isolation" ON referral_events FOR SELECT TO authenticated
USING (professional_id = auth_professional_id());
```

### client_loyalty + loyalty_transactions

```sql
CREATE TABLE client_loyalty (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  professional_id uuid NOT NULL REFERENCES professionals(id) ON DELETE RESTRICT,
  client_id       uuid NOT NULL UNIQUE REFERENCES clients(id),
  points          integer DEFAULT 0 CHECK (points >= 0),
  tier            text DEFAULT 'bronze',  -- 'bronze','prata','ouro','vip'
  updated_at      timestamptz DEFAULT now()
);

CREATE TABLE loyalty_transactions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  professional_id uuid NOT NULL REFERENCES professionals(id) ON DELETE RESTRICT,
  client_id       uuid NOT NULL REFERENCES clients(id),
  points          integer NOT NULL,  -- positivo = ganho, negativo = resgate
  reason          text NOT NULL,
  reference_id    uuid,              -- session_id, appointment_id, etc.
  created_at      timestamptz DEFAULT now()
);

ALTER TABLE client_loyalty ENABLE ROW LEVEL SECURITY;
CREATE POLICY "loyalty_isolation" ON client_loyalty FOR ALL TO authenticated
USING (professional_id = auth_professional_id())
WITH CHECK (professional_id = auth_professional_id());
```

---

## 10. Funil de Vendas

### sales_funnels + funnel_stages + funnel_opportunities

```sql
CREATE TABLE sales_funnels (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  professional_id uuid NOT NULL REFERENCES professionals(id) ON DELETE RESTRICT,
  name            text NOT NULL DEFAULT 'Funil Principal',
  type            text DEFAULT 'captacao' CHECK (type IN ('captacao','monetizacao')),
  is_active       boolean DEFAULT true,
  created_at      timestamptz DEFAULT now()
);

CREATE TABLE funnel_stages (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  funnel_id       uuid NOT NULL REFERENCES sales_funnels(id),
  name            text NOT NULL,
  position        integer NOT NULL,
  color           text DEFAULT '#7C3AED',
  auto_actions    jsonb DEFAULT '[]'   -- ações automáticas ao entrar nesta etapa
);

CREATE TABLE funnel_opportunities (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  professional_id     uuid NOT NULL REFERENCES professionals(id) ON DELETE RESTRICT,
  funnel_id           uuid NOT NULL REFERENCES sales_funnels(id),
  stage_id            uuid NOT NULL REFERENCES funnel_stages(id),
  client_id           uuid REFERENCES clients(id),
  conversation_id     uuid REFERENCES conversations(id),
  
  title               text,
  source              text,     -- 'whatsapp','instagram','manual','indicacao'
  estimated_value     numeric(10,2),
  
  status              text DEFAULT 'ativo' CHECK (status IN ('ativo','convertido','perdido')),
  lost_reason         text,
  lost_at             timestamptz,
  converted_at        timestamptz,
  
  entered_stage_at    timestamptz DEFAULT now(),
  
  created_at          timestamptz DEFAULT now(),
  updated_at          timestamptz DEFAULT now()
);

ALTER TABLE sales_funnels ENABLE ROW LEVEL SECURITY;
CREATE POLICY "funnels_isolation" ON sales_funnels FOR ALL TO authenticated
USING (professional_id = auth_professional_id())
WITH CHECK (professional_id = auth_professional_id());

ALTER TABLE funnel_opportunities ENABLE ROW LEVEL SECURITY;
CREATE POLICY "opportunities_isolation" ON funnel_opportunities FOR ALL TO authenticated
USING (professional_id = auth_professional_id())
WITH CHECK (professional_id = auth_professional_id());
```

### funnel_automations + funnel_automation_logs

```sql
CREATE TABLE funnel_automations (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  professional_id uuid NOT NULL REFERENCES professionals(id) ON DELETE RESTRICT,
  funnel_id       uuid NOT NULL REFERENCES sales_funnels(id),
  name            text NOT NULL,
  
  trigger_type    text NOT NULL,
  -- 'enters_stage','stays_in_stage','moves_from_to'
  trigger_config  jsonb NOT NULL DEFAULT '{}',
  -- {stage_id, days_threshold, from_stage_id, to_stage_id}
  
  action_type     text NOT NULL,
  -- 'rosane_message','notify_professional','add_tag','move_to_stage'
  action_config   jsonb NOT NULL DEFAULT '{}',
  -- {message_template, stage_id, notification_text}
  
  is_active       boolean DEFAULT true,
  created_at      timestamptz DEFAULT now()
);

CREATE TABLE funnel_automation_logs (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  automation_id   uuid NOT NULL REFERENCES funnel_automations(id),
  opportunity_id  uuid NOT NULL REFERENCES funnel_opportunities(id),
  professional_id uuid NOT NULL REFERENCES professionals(id) ON DELETE RESTRICT,
  status          text NOT NULL CHECK (status IN ('executed','failed','skipped')),
  error_message   text,
  created_at      timestamptz DEFAULT now()
);

ALTER TABLE funnel_automations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "funnel_automations_isolation" ON funnel_automations FOR ALL TO authenticated
USING (professional_id = auth_professional_id())
WITH CHECK (professional_id = auth_professional_id());
```

---

## 11. Relatórios & Métricas

### rfm_scores

```sql
CREATE TABLE rfm_scores (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  professional_id     uuid NOT NULL REFERENCES professionals(id) ON DELETE RESTRICT,
  client_id           uuid NOT NULL REFERENCES clients(id),
  
  recency_score       integer NOT NULL CHECK (recency_score BETWEEN 1 AND 5),
  frequency_score     integer NOT NULL CHECK (frequency_score BETWEEN 1 AND 5),
  monetary_score      integer NOT NULL CHECK (monetary_score BETWEEN 1 AND 5),
  rfm_total           integer GENERATED ALWAYS AS (recency_score + frequency_score + monetary_score) STORED,
  
  segment             text NOT NULL,
  -- 'champions','loyal','potential_loyal','new','promising',
  -- 'need_attention','at_risk','hibernating','lost'
  
  last_session_date   date,
  session_count       integer,
  total_revenue       numeric(10,2),
  
  calculated_at       timestamptz DEFAULT now(),
  UNIQUE(professional_id, client_id)
);

ALTER TABLE rfm_scores ENABLE ROW LEVEL SECURITY;
CREATE POLICY "rfm_scores_isolation" ON rfm_scores FOR SELECT TO authenticated
USING (professional_id = auth_professional_id());
REVOKE INSERT, UPDATE, DELETE ON rfm_scores FROM authenticated;
```

### client_health_scores

```sql
CREATE TABLE client_health_scores (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  professional_id     uuid NOT NULL REFERENCES professionals(id) ON DELETE RESTRICT,
  client_id           uuid NOT NULL REFERENCES clients(id),
  
  recency_score       integer DEFAULT 0,    -- 0-35
  frequency_score     integer DEFAULT 0,    -- 0-25
  nps_score           integer DEFAULT 0,    -- 0-25
  financial_score     integer DEFAULT 0,    -- 0-15
  package_bonus       integer DEFAULT 0,   -- +10 se tem pacote ativo
  total_score         integer GENERATED ALWAYS AS
                      (recency_score + frequency_score + nps_score + financial_score + package_bonus) STORED,
  
  risk_level          text,    -- 'saudavel','atencao','risco','critico'
  calculated_at       timestamptz DEFAULT now(),
  UNIQUE(professional_id, client_id)
);

ALTER TABLE client_health_scores ENABLE ROW LEVEL SECURITY;
CREATE POLICY "client_health_isolation" ON client_health_scores FOR SELECT TO authenticated
USING (professional_id = auth_professional_id());
REVOKE INSERT, UPDATE, DELETE ON client_health_scores FROM authenticated;
```

### professional_platform_health_scores

```sql
CREATE TABLE professional_platform_health_scores (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  professional_id         uuid NOT NULL UNIQUE REFERENCES professionals(id) ON DELETE RESTRICT,
  
  -- 6 fatores (100 pts total)
  whatsapp_connected      integer DEFAULT 0,   -- 0 ou 20
  clients_active          integer DEFAULT 0,   -- 0-20 proporcional
  appointments_monthly    integer DEFAULT 0,   -- 0-20
  rosane_active           integer DEFAULT 0,   -- 0-20
  financial_registered    integer DEFAULT 0,   -- 0-10
  nps_collected           integer DEFAULT 0,   -- 0-10
  
  total_score             integer GENERATED ALWAYS AS
                          (whatsapp_connected + clients_active + appointments_monthly +
                           rosane_active + financial_registered + nps_collected) STORED,
  
  health_level            text,   -- 'critico','baixo','medio','alto','excelente'
  calculated_at           timestamptz DEFAULT now()
);

ALTER TABLE professional_platform_health_scores ENABLE ROW LEVEL SECURITY;
CREATE POLICY "platform_health_isolation" ON professional_platform_health_scores FOR SELECT TO authenticated
USING (professional_id = auth_professional_id());
REVOKE INSERT, UPDATE, DELETE ON professional_platform_health_scores FROM authenticated;
```

### lead_scores

```sql
CREATE TABLE lead_scores (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  professional_id     uuid NOT NULL REFERENCES professionals(id) ON DELETE RESTRICT,
  client_id           uuid NOT NULL REFERENCES clients(id),
  score               integer NOT NULL DEFAULT 0 CHECK (score BETWEEN 0 AND 100),
  factors             jsonb DEFAULT '{}',  -- {message_frequency, price_inquiry, recency, ...}
  calculated_at       timestamptz DEFAULT now(),
  UNIQUE(professional_id, client_id)
);

ALTER TABLE lead_scores ENABLE ROW LEVEL SECURITY;
CREATE POLICY "lead_scores_isolation" ON lead_scores FOR SELECT TO authenticated
USING (professional_id = auth_professional_id());
REVOKE INSERT, UPDATE, DELETE ON lead_scores FROM authenticated;
```

### professional_insights

```sql
CREATE TABLE professional_insights (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  professional_id     uuid NOT NULL REFERENCES professionals(id) ON DELETE RESTRICT,
  insight_type        text NOT NULL,   -- 'revenue','agenda','retention','packages'
  title               text NOT NULL,
  body                text NOT NULL,
  action_type         text,            -- 'rosane_contact','view_report','view_client'
  action_metadata     jsonb DEFAULT '{}',
  read_at             timestamptz,
  actioned_at         timestamptz,
  generated_at        timestamptz DEFAULT now()
);

CREATE INDEX idx_insights_professional ON professional_insights(professional_id, generated_at DESC);

ALTER TABLE professional_insights ENABLE ROW LEVEL SECURITY;
CREATE POLICY "insights_isolation" ON professional_insights FOR ALL TO authenticated
USING (professional_id = auth_professional_id())
WITH CHECK (professional_id = auth_professional_id());
```

---

## 12. Notificações

### professional_notifications

```sql
CREATE TABLE professional_notifications (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  professional_id uuid NOT NULL REFERENCES professionals(id) ON DELETE RESTRICT,
  
  type            text NOT NULL,
  -- 'new_appointment','appointment_cancelled','payment_received','credits_low',
  -- 'client_birthday','stock_low','whatsapp_offline','agent_message',
  -- 'campaign_admin','lead_hot','weekly_report','daily_briefing'
  
  category        text NOT NULL,
  -- 'agenda','financeiro','clientes','alertas','ia_insights','sistema'
  
  title           text NOT NULL,
  body            text,
  data            jsonb DEFAULT '{}',
  
  priority        text DEFAULT 'normal' CHECK (priority IN ('low','normal','high','critical')),
  read_at         timestamptz,
  
  created_at      timestamptz DEFAULT now()
);

CREATE INDEX idx_notif_professional ON professional_notifications(professional_id, created_at DESC);
CREATE INDEX idx_notif_unread ON professional_notifications(professional_id) WHERE read_at IS NULL;

ALTER TABLE professional_notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "notifications_isolation" ON professional_notifications FOR ALL TO authenticated
USING (professional_id = auth_professional_id())
WITH CHECK (professional_id = auth_professional_id());
```

### notification_preferences

```sql
CREATE TABLE notification_preferences (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  professional_id     uuid NOT NULL REFERENCES professionals(id) ON DELETE RESTRICT,
  category            text NOT NULL,
  enabled             boolean DEFAULT true,
  push_enabled        boolean DEFAULT true,
  whatsapp_enabled    boolean DEFAULT false,
  sound_enabled       boolean DEFAULT true,
  sound_file          text DEFAULT 'notification.mp3',
  quiet_hours_start   time,
  quiet_hours_end     time,
  UNIQUE(professional_id, category)
);

ALTER TABLE notification_preferences ENABLE ROW LEVEL SECURITY;
CREATE POLICY "notif_prefs_isolation" ON notification_preferences FOR ALL TO authenticated
USING (professional_id = auth_professional_id())
WITH CHECK (professional_id = auth_professional_id());
```

### professional_push_tokens

```sql
CREATE TABLE professional_push_tokens (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  professional_id uuid NOT NULL REFERENCES professionals(id) ON DELETE RESTRICT,
  token           text NOT NULL,
  platform        text DEFAULT 'web',  -- 'web','ios','android'
  onesignal_player_id text,
  is_active       boolean DEFAULT true,
  created_at      timestamptz DEFAULT now(),
  UNIQUE(professional_id, token)
);

ALTER TABLE professional_push_tokens ENABLE ROW LEVEL SECURITY;
CREATE POLICY "push_tokens_isolation" ON professional_push_tokens FOR ALL TO authenticated
USING (professional_id = auth_professional_id())
WITH CHECK (professional_id = auth_professional_id());
```

---

## 13. Admin / Nerissa

### sales_leads

```sql
CREATE TABLE sales_leads (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone               text NOT NULL UNIQUE,
  name                text,
  email               text,
  
  source              text DEFAULT 'whatsapp',
  -- 'whatsapp','instagram','indicacao','evento','anuncio'
  
  stage               text DEFAULT 'novo',
  -- 'novo','qualificado','demo','proposta','convertido','perdido'
  
  professional_id     uuid REFERENCES professionals(id),   -- preenchido quando converte
  agent_notes         text,    -- notas da Nerissa durante a conversa
  
  last_contact_at     timestamptz,
  converted_at        timestamptz,
  lost_reason         text,
  
  created_at          timestamptz DEFAULT now(),
  updated_at          timestamptz DEFAULT now()
);

-- Apenas admin/service_role acessa
ALTER TABLE sales_leads ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sales_leads_admin" ON sales_leads FOR ALL TO authenticated
USING (
  EXISTS (SELECT 1 FROM master_admins WHERE user_id = auth.uid())
);
```

### nerissa_setup_sessions + items + events

```sql
CREATE TABLE nerissa_setup_sessions (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  professional_id     uuid NOT NULL UNIQUE REFERENCES professionals(id) ON DELETE RESTRICT,
  status              text DEFAULT 'pending',
  -- 'pending','in_progress','paused','completed'
  current_step        text,
  completed_steps     text[] DEFAULT '{}',
  started_at          timestamptz,
  completed_at        timestamptz,
  created_at          timestamptz DEFAULT now()
);

CREATE TABLE nerissa_setup_items (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id      uuid NOT NULL REFERENCES nerissa_setup_sessions(id),
  category        text NOT NULL,
  -- 'whatsapp','servicos','agenda','agentes','financeiro','plano'
  item_key        text NOT NULL,
  status          text DEFAULT 'pending',
  -- 'pending','in_progress','completed','skipped'
  data            jsonb DEFAULT '{}',
  completed_at    timestamptz
);

CREATE TABLE nerissa_setup_events (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id      uuid NOT NULL REFERENCES nerissa_setup_sessions(id),
  professional_id uuid NOT NULL REFERENCES professionals(id) ON DELETE RESTRICT,
  event_type      text NOT NULL,
  data            jsonb DEFAULT '{}',
  created_at      timestamptz DEFAULT now()
);

-- Apenas admin e o próprio profissional podem ler
ALTER TABLE nerissa_setup_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "setup_sessions_self" ON nerissa_setup_sessions FOR ALL TO authenticated
USING (professional_id = auth_professional_id());
```

---

## 14. Configurações

### settings_entries

```sql
CREATE TABLE settings_entries (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  professional_id uuid REFERENCES professionals(id) ON DELETE CASCADE,
  -- NULL = configuração global da plataforma
  chave           text NOT NULL,
  valor           jsonb NOT NULL DEFAULT '{}',
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now(),
  UNIQUE(professional_id, chave)
);

ALTER TABLE settings_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "settings_isolation" ON settings_entries FOR ALL TO authenticated
USING (professional_id = auth_professional_id() OR professional_id IS NULL)
WITH CHECK (professional_id = auth_professional_id());
```

### platform_settings

```sql
CREATE TABLE platform_settings (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  master_instance_name    text,      -- nome da instância Nerissa/admin
  master_whatsapp_phone   text,      -- número reservado da Nerissa (protegido)
  maintenance_mode        boolean DEFAULT false,
  updated_at              timestamptz DEFAULT now()
);

-- Apenas service_role escreve
ALTER TABLE platform_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "platform_settings_read" ON platform_settings FOR SELECT TO authenticated USING (true);
REVOKE INSERT, UPDATE, DELETE ON platform_settings FROM authenticated;
```

---

## 15. Funções SQL Críticas

### auth_professional_id()

```sql
CREATE OR REPLACE FUNCTION auth_professional_id()
RETURNS uuid
LANGUAGE sql
STABLE SECURITY DEFINER
AS $$
  SELECT COALESCE(
    (auth.jwt() -> 'user_metadata' ->> 'professional_id')::uuid,
    (SELECT id FROM public.professionals WHERE user_id = auth.uid() LIMIT 1)
  )
$$;
GRANT EXECUTE ON FUNCTION auth_professional_id() TO authenticated;
```

### handle_new_user (trigger)

```sql
-- Trigger canonico da v2.
-- Substitui a versão inicial das migrations 20260605120500/20260605121100,
-- que inseria professionals sem id e deixava id DEFAULT gen_random_uuid().
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_professional_id uuid;
  v_name text;
  v_slug text;
  v_base text;
  v_phone text;
BEGIN
  IF COALESCE(NEW.raw_app_meta_data->>'admin_bootstrap', 'false') = 'true' THEN
    RETURN NEW;
  END IF;

  -- Verificar se ha professional_id no metadata.
  -- Este caminho so e permitido se o Auth user foi criado com o mesmo UUID.
  v_professional_id := NULLIF(NEW.raw_user_meta_data->>'professional_id', '')::uuid;

  IF v_professional_id IS NOT NULL AND v_professional_id IS DISTINCT FROM NEW.id THEN
    RAISE EXCEPTION 'professional_auth_id_mismatch'
      USING HINT = 'Use public_create_account_for_professional / public-create-account; do not use frontend signUp for public handoff.';
  END IF;

  IF v_professional_id IS NOT NULL THEN
    -- Vincular professional existente (fluxo /criar-conta protegido)
    UPDATE public.professionals
    SET user_id = NEW.id
    WHERE id = NEW.id
      AND user_id IS NULL;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'professional_invite_not_found_or_already_linked';
    END IF;
  ELSE
    -- Verificar se existe pré-conta com mesmo email sem user_id.
    -- Não vincular Auth aleatório a essa linha; o usuário deve usar /criar-conta?pid=...
    SELECT id INTO v_professional_id
    FROM public.professionals
    WHERE lower(email) = lower(NEW.email) AND user_id IS NULL LIMIT 1;
    
    IF v_professional_id IS NULL THEN
      -- Cadastro autenticado comum: o professional nasce com o mesmo UUID do Auth.
      v_professional_id := NEW.id;  -- invariante: id = user_id

      v_name := COALESCE(
        NULLIF(NEW.raw_user_meta_data->>'name', ''),
        split_part(NEW.email, '@', 1)
      );

      v_phone := NULLIF(public.normalize_phone_digits(COALESCE(NEW.raw_user_meta_data->>'phone_whatsapp', '')), '');

      v_base := lower(regexp_replace(
        extensions.unaccent(v_name), '[^a-z0-9]+', '-', 'g'
      ));
      v_slug := v_base;

      WHILE EXISTS (SELECT 1 FROM public.professionals WHERE slug = v_slug) LOOP
        v_slug := v_base || '-' || substr(md5(random()::text), 1, 4);
      END LOOP;

      INSERT INTO public.professionals (id, user_id, name, email, slug, phone_whatsapp)
      VALUES (
        NEW.id, NEW.id,
        v_name,
        NEW.email,
        v_slug,
        v_phone
      );
    ELSE
      -- Existe pré-conta por email. Não vincular Auth com UUID diferente.
      -- O usuário deve usar /criar-conta?pid=... para preservar a invariante.
      RAISE EXCEPTION 'pre_account_requires_public_create_account'
        USING HINT = 'Use /criar-conta with pid + email so auth.users.id = professionals.id.';
    END IF;
  END IF;

  -- Auth trigger intentionally does not process referral, affiliate,
  -- billing, credits, growth, admin bootstrap, wallets or setup objects.
  -- Those modules cannot break account creation.
  
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();
```

### create_default_categories (setup operacional, não chamada pelo trigger Auth)

> Esta função não deve ser chamada por `handle_new_user`. Criação Auth e onboarding comercial não podem depender de billing/créditos nem criar estruturas financeiras automaticamente. Categorias padrão entram apenas quando o módulo financeiro/setup operacional exigir.

```sql
CREATE OR REPLACE FUNCTION create_default_categories(p_professional_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO financeiro_categorias (professional_id, nome, tipo, cor, is_default) VALUES
    (p_professional_id, 'Sessão',              'receita', '#10B981', true),
    (p_professional_id, 'Pacote',              'receita', '#3B82F6', true),
    (p_professional_id, 'Produto',             'receita', '#8B5CF6', true),
    (p_professional_id, 'Taxa de Cancelamento','receita', '#F59E0B', true),
    (p_professional_id, 'Outros (receita)',    'receita', '#6B7280', true),
    (p_professional_id, 'Aluguel',             'despesa', '#EF4444', true),
    (p_professional_id, 'Fornecedor',          'despesa', '#F97316', true),
    (p_professional_id, 'Marketing',           'despesa', '#EC4899', true),
    (p_professional_id, 'Outros (despesa)',    'despesa', '#6B7280', true);
END;
$$;
```

### protect_platform_master_phone (trigger)

```sql
CREATE OR REPLACE FUNCTION prevent_platform_master_phone()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_master_phone text;
  v_normalized text;
BEGIN
  SELECT master_whatsapp_phone INTO v_master_phone FROM platform_settings LIMIT 1;
  IF v_master_phone IS NULL THEN RETURN NEW; END IF;
  
  -- Normalizar número
  v_normalized := regexp_replace(NEW.phone_whatsapp, '[^0-9]', '', 'g');
  IF length(v_normalized) IN (10, 11) THEN
    v_normalized := '55' || v_normalized;
  END IF;
  
  IF v_normalized = v_master_phone THEN
    RAISE EXCEPTION 'platform_master_phone_reserved';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER protect_platform_phone
  BEFORE INSERT OR UPDATE ON professionals
  FOR EACH ROW EXECUTE FUNCTION prevent_platform_master_phone();
```

### reserve_credits / commit_credits / release_credits (RPC)

```sql
-- Reservar créditos antes de chamar IA
CREATE OR REPLACE FUNCTION reserve_credits(
  p_professional_id uuid,
  p_amount integer
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE credit_wallets
  SET reserved = reserved + p_amount
  WHERE professional_id = p_professional_id
    AND (balance - reserved) >= p_amount;
  RETURN FOUND;
END;
$$;

-- Confirmar uso após resposta da IA
CREATE OR REPLACE FUNCTION commit_credits(
  p_professional_id uuid,
  p_reserved integer,
  p_actual integer,
  p_agent_slug text,
  p_model text,
  p_tokens integer
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE credit_wallets
  SET balance = balance - p_actual,
      reserved = reserved - p_reserved,
      total_consumed = total_consumed + p_actual
  WHERE professional_id = p_professional_id;
  
  INSERT INTO credit_transactions (professional_id, amount, type, agent_slug, model_used, tokens_used)
  VALUES (p_professional_id, -p_actual, 'consumption', p_agent_slug, p_model, p_tokens);
END;
$$;

-- Liberar reserva em caso de erro
CREATE OR REPLACE FUNCTION release_credits(
  p_professional_id uuid,
  p_amount integer
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE credit_wallets
  SET reserved = GREATEST(0, reserved - p_amount)
  WHERE professional_id = p_professional_id;
END;
$$;
```

### Imutabilidade de audit logs

```sql
-- Aplicar em qualquer tabela de log que deva ser imutável
CREATE OR REPLACE FUNCTION fn_log_immutable()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Logs são imutáveis'; END;
$$;

CREATE TRIGGER prevent_message_events_change BEFORE UPDATE OR DELETE ON message_events
  FOR EACH ROW EXECUTE FUNCTION fn_log_immutable();

CREATE TRIGGER prevent_agent_executions_change BEFORE UPDATE OR DELETE ON agent_executions
  FOR EACH ROW EXECUTE FUNCTION fn_log_immutable();

CREATE TRIGGER prevent_ai_usage_update BEFORE UPDATE OR DELETE ON ai_usage_log
  FOR EACH ROW EXECUTE FUNCTION fn_log_immutable();
```

---

<!-- MIGRATION NOTE: Toda esta seção (§16+) é derivada do schema de produção v1 (2026-06-04).
     Antes de implementar qualquer tabela aqui, verificar se o nome/schema ainda corresponde
     ao que será criado em v2. Algumas colunas podem ter sido renomeadas no PRD-SCHEMA acima.
     Use este inventário como referência de funcionalidades, não como DDL de deploy direto. -->

## 16. Gap Analysis — Tabelas Adicionadas do Inventário v1

_Adicionadas após comparação com o schema de produção v1 (2026-06-04)._

### 16.1 Extensibilidade para Clínicas Veterinárias

#### Adição em professionals

```sql
-- Adicionar coluna clinic_type em professionals
ALTER TABLE professionals
  ADD COLUMN clinic_type TEXT NOT NULL DEFAULT 'human'
  CHECK (clinic_type IN ('human', 'veterinary', 'odontology', 'other'));
```

#### client_pets

```sql
CREATE TABLE client_pets (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  professional_id uuid NOT NULL REFERENCES professionals(id) ON DELETE RESTRICT,
  client_id       uuid NOT NULL REFERENCES clients(id),  -- tutor/responsável

  name            text NOT NULL,
  species         text NOT NULL,   -- 'dog', 'cat', 'bird', 'rabbit', 'other'
  breed           text,
  gender          text CHECK (gender IN ('macho','femea','nao_informado')),
  date_of_birth   date,
  weight_kg       numeric(5,2),
  microchip       text,
  coat_color      text,
  is_neutered     boolean,
  notes           text,
  photo_url       text,

  is_active       boolean DEFAULT true,
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now()
);

CREATE TRIGGER client_pets_updated_at
  BEFORE UPDATE ON client_pets FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE INDEX idx_client_pets_professional ON client_pets(professional_id);
CREATE INDEX idx_client_pets_client ON client_pets(client_id);

ALTER TABLE client_pets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "client_pets_isolation" ON client_pets FOR ALL TO authenticated
USING (professional_id = auth_professional_id())
WITH CHECK (professional_id = auth_professional_id());
```

#### Adição de pet_id em sessions e appointments

```sql
-- Sessão pode ser do pet (clínicas veterinárias) — nullable
ALTER TABLE sessions
  ADD COLUMN pet_id uuid REFERENCES client_pets(id);

-- Agendamento pode ser para o pet — nullable
ALTER TABLE appointments
  ADD COLUMN pet_id uuid REFERENCES client_pets(id);
```

---

### 16.2 Dados Clínicos Avançados

#### client_clinical_profiles

```sql
-- Dados clínicos separados do cadastro base (sensíveis, acesso restrito)
CREATE TABLE client_clinical_profiles (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  professional_id     uuid NOT NULL REFERENCES professionals(id) ON DELETE RESTRICT,
  client_id           uuid NOT NULL UNIQUE REFERENCES clients(id),

  -- Histórico médico
  main_complaint      text,
  medical_history     text,
  medications         text,
  allergies           text,
  previous_treatments text,

  -- Sinais vitais / dados clínicos
  blood_type          text,
  weight_kg           numeric(5,2),
  height_cm           numeric(5,1),

  -- Dados adicionais em JSON (personalizável por profissão)
  extra_fields        jsonb DEFAULT '{}',

  created_at          timestamptz DEFAULT now(),
  updated_at          timestamptz DEFAULT now()
);

CREATE TRIGGER client_clinical_updated_at
  BEFORE UPDATE ON client_clinical_profiles FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE client_clinical_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "clinical_isolation" ON client_clinical_profiles FOR ALL TO authenticated
USING (professional_id = auth_professional_id())
WITH CHECK (professional_id = auth_professional_id());
```

#### client_photos

```sql
-- Fotos de progresso/antes-depois vinculadas a sessões
CREATE TABLE client_photos (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  professional_id uuid NOT NULL REFERENCES professionals(id) ON DELETE RESTRICT,
  client_id       uuid NOT NULL REFERENCES clients(id),
  session_id      uuid REFERENCES sessions(id),
  pet_id          uuid REFERENCES client_pets(id),

  storage_path    text NOT NULL,   -- bucket: client-photos/{professional_id}/{client_id}/
  caption         text,
  photo_type      text DEFAULT 'progress'
                  CHECK (photo_type IN ('before','after','progress','document','other')),
  taken_at        date DEFAULT CURRENT_DATE,
  is_visible_to_client boolean DEFAULT false,  -- aparece no PWA do cliente

  created_at      timestamptz DEFAULT now()
);

CREATE INDEX idx_client_photos_client ON client_photos(professional_id, client_id);

ALTER TABLE client_photos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "client_photos_isolation" ON client_photos FOR ALL TO authenticated
USING (professional_id = auth_professional_id())
WITH CHECK (professional_id = auth_professional_id());
```

---

### 16.3 Questionários Avançados

_Sistema separado de anamnese para formulários dinâmicos (NPS, pesquisas, pré-consulta personalizada)._

#### questionnaires

```sql
CREATE TABLE questionnaires (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  professional_id uuid NOT NULL REFERENCES professionals(id) ON DELETE RESTRICT,
  name            text NOT NULL,
  description     text,
  type            text NOT NULL DEFAULT 'custom'
                  CHECK (type IN ('nps','pre_session','satisfaction','intake','custom')),
  is_active       boolean DEFAULT true,
  created_at      timestamptz DEFAULT now()
);

ALTER TABLE questionnaires ENABLE ROW LEVEL SECURITY;
CREATE POLICY "questionnaires_isolation" ON questionnaires FOR ALL TO authenticated
USING (professional_id = auth_professional_id())
WITH CHECK (professional_id = auth_professional_id());
```

#### questionnaire_questions

```sql
CREATE TABLE questionnaire_questions (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  questionnaire_id  uuid NOT NULL REFERENCES questionnaires(id) ON DELETE CASCADE,
  professional_id   uuid NOT NULL REFERENCES professionals(id) ON DELETE RESTRICT,
  question_text     text NOT NULL,
  question_type     text NOT NULL
                    CHECK (question_type IN ('text','textarea','select','multiselect','scale','boolean','date')),
  options           jsonb DEFAULT '[]',   -- para select/multiselect
  is_required       boolean DEFAULT false,
  position          integer DEFAULT 0,
  created_at        timestamptz DEFAULT now()
);

ALTER TABLE questionnaire_questions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "q_questions_isolation" ON questionnaire_questions FOR ALL TO authenticated
USING (professional_id = auth_professional_id())
WITH CHECK (professional_id = auth_professional_id());
```

#### questionnaire_responses

```sql
CREATE TABLE questionnaire_responses (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  questionnaire_id  uuid NOT NULL REFERENCES questionnaires(id),
  professional_id   uuid NOT NULL REFERENCES professionals(id) ON DELETE RESTRICT,
  client_id         uuid REFERENCES clients(id),
  session_id        uuid REFERENCES sessions(id),
  appointment_id    uuid REFERENCES appointments(id),

  token             text UNIQUE DEFAULT gen_random_uuid()::text,
  token_expires_at  timestamptz DEFAULT (now() + interval '7 days'),
  answers           jsonb DEFAULT '{}',   -- {question_id: value}
  completed_at      timestamptz,

  created_at        timestamptz DEFAULT now()
);

CREATE INDEX idx_q_responses_professional ON questionnaire_responses(professional_id);
CREATE INDEX idx_q_responses_client ON questionnaire_responses(client_id);
CREATE INDEX idx_q_responses_token ON questionnaire_responses(token);

ALTER TABLE questionnaire_responses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "q_responses_isolation" ON questionnaire_responses FOR ALL TO authenticated
USING (professional_id = auth_professional_id())
WITH CHECK (professional_id = auth_professional_id());
-- Anon pode responder via token
CREATE POLICY "q_responses_anon_update" ON questionnaire_responses FOR UPDATE TO anon
USING (token IS NOT NULL AND token_expires_at > now() AND completed_at IS NULL)
WITH CHECK (completed_at IS NULL);
```

---

### 16.4 Fidelidade — Resgates e Catálogo

#### loyalty_rewards

```sql
-- Catálogo de recompensas resgatáveis com pontos
CREATE TABLE loyalty_rewards (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  professional_id uuid NOT NULL REFERENCES professionals(id) ON DELETE RESTRICT,
  name            text NOT NULL,
  description     text,
  points_required integer NOT NULL,
  reward_type     text NOT NULL
                  CHECK (reward_type IN ('desconto_percentual','desconto_fixo','sessao_gratis','produto','custom')),
  reward_value    numeric(10,2),   -- percentual ou valor fixo
  stock_limit     integer,         -- NULL = ilimitado
  is_active       boolean DEFAULT true,
  expires_at      date,
  created_at      timestamptz DEFAULT now()
);

ALTER TABLE loyalty_rewards ENABLE ROW LEVEL SECURITY;
CREATE POLICY "loyalty_rewards_isolation" ON loyalty_rewards FOR ALL TO authenticated
USING (professional_id = auth_professional_id())
WITH CHECK (professional_id = auth_professional_id());
```

#### loyalty_redemptions

```sql
CREATE TABLE loyalty_redemptions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  professional_id uuid NOT NULL REFERENCES professionals(id) ON DELETE RESTRICT,
  client_id       uuid NOT NULL REFERENCES clients(id),
  reward_id       uuid NOT NULL REFERENCES loyalty_rewards(id),
  transaction_id  uuid REFERENCES financial_transactions(id),

  points_spent    integer NOT NULL,
  status          text DEFAULT 'pending'
                  CHECK (status IN ('pending','approved','used','cancelled')),
  redeemed_at     timestamptz DEFAULT now(),
  used_at         timestamptz,
  expires_at      date,
  notes           text,

  created_at      timestamptz DEFAULT now()
);

CREATE INDEX idx_loyalty_redemptions_client ON loyalty_redemptions(professional_id, client_id);

ALTER TABLE loyalty_redemptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "loyalty_redemptions_isolation" ON loyalty_redemptions FOR ALL TO authenticated
USING (professional_id = auth_professional_id())
WITH CHECK (professional_id = auth_professional_id());
```

---

### 16.5 Programa de Indicação — Configuração

#### referral_program_configs

```sql
CREATE TABLE referral_program_configs (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  professional_id         uuid NOT NULL UNIQUE REFERENCES professionals(id) ON DELETE RESTRICT,

  -- Recompensa para quem indica
  referrer_reward_type    text DEFAULT 'credits'
                          CHECK (referrer_reward_type IN ('credits','discount','session','points','none')),
  referrer_reward_value   numeric(10,2) DEFAULT 0,

  -- Recompensa para quem foi indicado
  referred_reward_type    text DEFAULT 'discount'
                          CHECK (referred_reward_type IN ('credits','discount','session','points','none')),
  referred_reward_value   numeric(10,2) DEFAULT 0,

  -- Regras
  min_sessions_to_trigger integer DEFAULT 1,   -- quantas sessões o indicado precisa fazer para ativar
  cooldown_days           integer DEFAULT 30,  -- dias entre pedidos de indicação
  is_active               boolean DEFAULT true,

  created_at              timestamptz DEFAULT now(),
  updated_at              timestamptz DEFAULT now()
);

ALTER TABLE referral_program_configs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "referral_config_isolation" ON referral_program_configs FOR ALL TO authenticated
USING (professional_id = auth_professional_id())
WITH CHECK (professional_id = auth_professional_id());
```

#### referral_templates

```sql
-- Templates de mensagem para o pedido de indicação
CREATE TABLE referral_templates (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  professional_id uuid NOT NULL REFERENCES professionals(id) ON DELETE RESTRICT,
  channel         text NOT NULL CHECK (channel IN ('whatsapp','email','push')),
  message_text    text NOT NULL,  -- suporta variáveis: {{client_name}}, {{referral_link}}, {{reward}}
  is_active       boolean DEFAULT true,
  created_at      timestamptz DEFAULT now()
);

ALTER TABLE referral_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "referral_templates_isolation" ON referral_templates FOR ALL TO authenticated
USING (professional_id = auth_professional_id())
WITH CHECK (professional_id = auth_professional_id());
```

---

### 16.6 Agenda — Lista de Espera e Confirmações

#### appointment_waitlist

```sql
CREATE TABLE appointment_waitlist (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  professional_id uuid NOT NULL REFERENCES professionals(id) ON DELETE RESTRICT,
  client_id       uuid NOT NULL REFERENCES clients(id),
  service_id      uuid REFERENCES services(id),
  team_member_id  uuid REFERENCES team_members(id),

  -- Preferência de horário
  preferred_days  jsonb DEFAULT '[]',   -- [0,1,2,3,4,5,6] (dom-sab)
  preferred_times jsonb DEFAULT '[]',   -- ['manha','tarde','noite']
  earliest_date   date,
  latest_date     date,

  status          text DEFAULT 'waiting'
                  CHECK (status IN ('waiting','notified','scheduled','cancelled','expired')),
  notified_at     timestamptz,
  appointment_id  uuid REFERENCES appointments(id),  -- preenchido quando agendado
  notes           text,

  created_at      timestamptz DEFAULT now(),
  expires_at      timestamptz DEFAULT (now() + interval '30 days')
);

CREATE INDEX idx_waitlist_professional ON appointment_waitlist(professional_id, status);

ALTER TABLE appointment_waitlist ENABLE ROW LEVEL SECURITY;
CREATE POLICY "waitlist_isolation" ON appointment_waitlist FOR ALL TO authenticated
USING (professional_id = auth_professional_id())
WITH CHECK (professional_id = auth_professional_id());
```

#### confirmation_messages

```sql
-- Templates de mensagem de confirmação de agendamento (configuráveis)
CREATE TABLE confirmation_messages (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  professional_id uuid NOT NULL REFERENCES professionals(id) ON DELETE RESTRICT,
  trigger_type    text NOT NULL
                  CHECK (trigger_type IN ('booking_created','reminder_24h','reminder_2h','cancellation','waitlist_slot')),
  channel         text NOT NULL CHECK (channel IN ('whatsapp','email','push')),
  message_text    text NOT NULL,  -- variáveis: {{client_name}}, {{date}}, {{time}}, {{service}}, {{professional_name}}
  is_active       boolean DEFAULT true,
  send_delay_minutes integer DEFAULT 0,  -- delay após o trigger
  created_at      timestamptz DEFAULT now()
);

ALTER TABLE confirmation_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "confirm_msg_isolation" ON confirmation_messages FOR ALL TO authenticated
USING (professional_id = auth_professional_id())
WITH CHECK (professional_id = auth_professional_id());
```

---

### 16.7 Google Calendar

#### calendars

```sql
CREATE TABLE calendars (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  professional_id     uuid NOT NULL REFERENCES professionals(id) ON DELETE RESTRICT,
  team_member_id      uuid REFERENCES team_members(id),  -- NULL = agenda do profissional principal

  provider            text NOT NULL DEFAULT 'google'
                      CHECK (provider IN ('google','outlook')),
  external_calendar_id text NOT NULL,   -- ID do calendário no Google
  name                text NOT NULL,

  -- OAuth tokens (via Vault)
  access_token_vault_key  text,
  refresh_token_vault_key text,
  token_expires_at    timestamptz,

  sync_enabled        boolean DEFAULT true,
  sync_direction      text DEFAULT 'bidirectional'
                      CHECK (sync_direction IN ('to_google','from_google','bidirectional')),
  last_synced_at      timestamptz,

  created_at          timestamptz DEFAULT now(),
  updated_at          timestamptz DEFAULT now()
);

ALTER TABLE calendars ENABLE ROW LEVEL SECURITY;
CREATE POLICY "calendars_isolation" ON calendars FOR ALL TO authenticated
USING (professional_id = auth_professional_id())
WITH CHECK (professional_id = auth_professional_id());
```

#### calendar_permissions

```sql
-- Permissões de quem pode ver/editar cada calendário
CREATE TABLE calendar_permissions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  calendar_id     uuid NOT NULL REFERENCES calendars(id) ON DELETE CASCADE,
  professional_id uuid NOT NULL REFERENCES professionals(id) ON DELETE RESTRICT,
  team_member_id  uuid NOT NULL REFERENCES team_members(id),
  permission      text DEFAULT 'read' CHECK (permission IN ('read','write')),
  created_at      timestamptz DEFAULT now(),
  UNIQUE(calendar_id, team_member_id)
);

ALTER TABLE calendar_permissions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "calendar_perms_isolation" ON calendar_permissions FOR ALL TO authenticated
USING (professional_id = auth_professional_id())
WITH CHECK (professional_id = auth_professional_id());
```

---

### 16.8 Campanhas — Drip e Fila

#### campaign_calendars

```sql
-- Campanhas por sequência de tempo (drip campaigns)
CREATE TABLE campaign_calendars (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  professional_id uuid NOT NULL REFERENCES professionals(id) ON DELETE RESTRICT,
  name            text NOT NULL,
  trigger_event   text NOT NULL
                  CHECK (trigger_event IN ('first_session','package_purchase','birthday','inactivity','manual')),
  is_active       boolean DEFAULT true,
  created_at      timestamptz DEFAULT now()
);

CREATE TABLE campaign_calendar_messages (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_calendar_id uuid NOT NULL REFERENCES campaign_calendars(id) ON DELETE CASCADE,
  professional_id     uuid NOT NULL REFERENCES professionals(id) ON DELETE RESTRICT,
  delay_days          integer NOT NULL DEFAULT 0,  -- D+N após o trigger
  channel             text NOT NULL CHECK (channel IN ('whatsapp','email','push')),
  message_text        text NOT NULL,
  position            integer DEFAULT 0,
  is_active           boolean DEFAULT true,
  created_at          timestamptz DEFAULT now()
);

CREATE TABLE campaign_calendar_enrollments (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_calendar_id  uuid NOT NULL REFERENCES campaign_calendars(id),
  professional_id       uuid NOT NULL REFERENCES professionals(id) ON DELETE RESTRICT,
  client_id             uuid NOT NULL REFERENCES clients(id),
  enrolled_at           timestamptz DEFAULT now(),
  current_step          integer DEFAULT 0,
  completed_at          timestamptz,
  cancelled_at          timestamptz,
  status                text DEFAULT 'active'
                        CHECK (status IN ('active','completed','cancelled','paused')),
  UNIQUE(campaign_calendar_id, client_id)
);

ALTER TABLE campaign_calendars ENABLE ROW LEVEL SECURITY;
CREATE POLICY "camp_cal_isolation" ON campaign_calendars FOR ALL TO authenticated
USING (professional_id = auth_professional_id())
WITH CHECK (professional_id = auth_professional_id());

ALTER TABLE campaign_calendar_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "camp_cal_msg_isolation" ON campaign_calendar_messages FOR ALL TO authenticated
USING (professional_id = auth_professional_id())
WITH CHECK (professional_id = auth_professional_id());

ALTER TABLE campaign_calendar_enrollments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "camp_cal_enroll_isolation" ON campaign_calendar_enrollments FOR ALL TO authenticated
USING (professional_id = auth_professional_id())
WITH CHECK (professional_id = auth_professional_id());
```

#### campaign_dispatches

```sql
-- Rastreamento de cada envio individual de campanha
CREATE TABLE campaign_dispatches (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  professional_id uuid NOT NULL REFERENCES professionals(id) ON DELETE RESTRICT,
  campaign_id     uuid REFERENCES campaigns(id),
  enrollment_id   uuid REFERENCES campaign_calendar_enrollments(id),
  client_id       uuid NOT NULL REFERENCES clients(id),

  channel         text NOT NULL,
  message_text    text NOT NULL,
  scheduled_for   timestamptz NOT NULL,

  status          text DEFAULT 'queued'
                  CHECK (status IN ('queued','sent','failed','cancelled')),
  sent_at         timestamptz,
  error_message   text,
  whatsapp_msg_id text,  -- ID retornado pelo Evolution Go

  created_at      timestamptz DEFAULT now()
);

CREATE INDEX idx_campaign_dispatches_scheduled ON campaign_dispatches(professional_id, scheduled_for, status);

ALTER TABLE campaign_dispatches ENABLE ROW LEVEL SECURITY;
CREATE POLICY "dispatches_isolation" ON campaign_dispatches FOR ALL TO authenticated
USING (professional_id = auth_professional_id())
WITH CHECK (professional_id = auth_professional_id());
```

---

### 16.9 Perfil Público do Profissional

#### professional_public_profiles

```sql
CREATE TABLE professional_public_profiles (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  professional_id     uuid NOT NULL UNIQUE REFERENCES professionals(id) ON DELETE RESTRICT,

  -- Conteúdo público
  headline            text,            -- "Fisioterapeuta especialista em dor crônica"
  about               text,
  specialties         jsonb DEFAULT '[]',  -- ['Pilates', 'RPG', 'Dry Needling']
  languages           jsonb DEFAULT '["pt-BR"]',
  video_url           text,            -- vídeo de apresentação
  gallery_urls        jsonb DEFAULT '[]',

  -- SEO
  meta_title          text,
  meta_description    text,

  -- Redes sociais
  instagram_url       text,
  facebook_url        text,
  linkedin_url        text,
  website_url         text,

  -- Configurações
  show_prices         boolean DEFAULT true,
  show_reviews        boolean DEFAULT true,
  accept_online_booking boolean DEFAULT true,

  -- Métricas públicas
  total_clients       integer DEFAULT 0,
  average_rating      numeric(3,2),
  total_reviews       integer DEFAULT 0,

  created_at          timestamptz DEFAULT now(),
  updated_at          timestamptz DEFAULT now()
);

-- Legível por anon (página pública)
ALTER TABLE professional_public_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public_profile_read" ON professional_public_profiles FOR SELECT TO anon
USING (true);
CREATE POLICY "public_profile_auth" ON professional_public_profiles FOR ALL TO authenticated
USING (professional_id = auth_professional_id())
WITH CHECK (professional_id = auth_professional_id());
```

---

### 16.10 Infraestrutura Operacional

#### idempotency_log

```sql
-- Evita processar o mesmo webhook/evento 2x
-- O PRIMARY KEY é o UNIQUE constraint que garante o claim atômico:
--   INSERT INTO idempotency_log (idempotency_key) VALUES ($idempotency_key)
--   ON CONFLICT (idempotency_key) DO NOTHING RETURNING idempotency_key;
-- Se RETURNING retornar vazio → duplicata → retornar 200 sem processar
--
-- Formatos de idempotency_key por canal:
--   WhatsApp: '{source_webhook}:{instance_name}:{external_message_id}'
--     → instance_name é UNIQUE em professional_whatsapp (garante namespace global)
--     → source_webhook = 'admin' | 'professional' (isola os dois canais)
--   Stripe:   'stripe:{event_id}'
--   QStash:   'qstash:{job_id}'
CREATE TABLE idempotency_log (
  idempotency_key  text PRIMARY KEY,
  created_at       timestamptz DEFAULT now(),
  expires_at       timestamptz DEFAULT (now() + interval '7 days')
);

-- Imutabilidade condicional: bloqueia delete de linhas ainda válidas
-- Permite delete de linhas expiradas (TTL cleanup via pg_cron)
CREATE FUNCTION fn_idempotency_log_immutable() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.expires_at > now() THEN
    RAISE EXCEPTION 'idempotency_log: linha ainda válida — não pode ser deletada antes de expirar';
  END IF;
  RETURN OLD;  -- permite deletar apenas se expirada
END $$;

CREATE TRIGGER prevent_idempotency_delete BEFORE DELETE ON idempotency_log
  FOR EACH ROW EXECUTE FUNCTION fn_idempotency_log_immutable();
CREATE TRIGGER prevent_idempotency_update BEFORE UPDATE ON idempotency_log
  FOR EACH ROW EXECUTE FUNCTION fn_log_immutable();  -- update nunca permitido

REVOKE UPDATE, DELETE ON idempotency_log FROM authenticated, anon;

-- TTL via pg_cron (deleta apenas expiradas — trigger permite por ser condicional)
-- SELECT cron.schedule('idempotency-cleanup', '0 3 * * *', $$
--   DELETE FROM idempotency_log WHERE expires_at < now();
-- $$);
```

#### qstash_job_log

```sql
-- Telemetria de infraestrutura de fila — separada de agent_executions (logs de negócio)
-- Registra: publish, consume, fail, dead_letter
-- Fonte única dos eventos QStash documentados em EVENTS.md seção 8
CREATE TABLE qstash_job_log (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id              text NOT NULL,                       -- ID retornado pelo QStash
  queue_name          text NOT NULL,                       -- 'message-processor' | 'admin-message-processor' | ...
  event_type          text NOT NULL CHECK (
                        event_type IN ('published', 'consumed', 'failed', 'dead_lettered')
                      ),
  message_event_id    uuid REFERENCES message_events(id),  -- nullable (jobs não-WhatsApp)
  professional_id     uuid REFERENCES professionals(id) ON DELETE RESTRICT,
  retry_count         integer DEFAULT 0,
  max_retries         integer DEFAULT 3,
  error_type          text,    -- 'timeout' | 'signature_invalid' | 'llm_error' | 'db_error' | 'unknown'
  error_message       text,
  published_at        timestamptz,
  consumed_at         timestamptz,
  failed_at           timestamptz,
  dead_lettered_at    timestamptz,
  created_at          timestamptz DEFAULT now()
);

-- Busca por job_id (diagnóstico de fila)
CREATE INDEX idx_qstash_job_log_job_id ON qstash_job_log(job_id);
-- Busca por mensagem associada
CREATE INDEX idx_qstash_job_log_message_event ON qstash_job_log(message_event_id) WHERE message_event_id IS NOT NULL;
-- Busca por falhas recentes
CREATE INDEX idx_qstash_job_log_failed ON qstash_job_log(event_type, created_at DESC) WHERE event_type IN ('failed', 'dead_lettered');

-- Imutável para UPDATE; DELETE condicional — só permite após TTL de 90 dias
CREATE FUNCTION fn_qstash_log_update_immutable() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'qstash_job_log is immutable — updates not allowed'; END $$;

CREATE FUNCTION fn_qstash_log_delete_conditional() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.created_at > now() - interval '90 days' THEN
    RAISE EXCEPTION 'qstash_job_log: registro ainda dentro do TTL de 90 dias — não pode ser deletado';
  END IF;
  RETURN OLD;  -- permite deletar apenas se expirado
END $$;

CREATE TRIGGER prevent_qstash_log_update BEFORE UPDATE ON qstash_job_log
  FOR EACH ROW EXECUTE FUNCTION fn_qstash_log_update_immutable();
CREATE TRIGGER prevent_qstash_log_delete BEFORE DELETE ON qstash_job_log
  FOR EACH ROW EXECUTE FUNCTION fn_qstash_log_delete_conditional();

REVOKE UPDATE, DELETE ON qstash_job_log FROM authenticated, anon;

-- TTL via pg_cron (90 dias — dados de diagnóstico operacional)
-- Trigger condicional permite que este cron funcione sem conflito
-- SELECT cron.schedule('qstash-log-cleanup', '0 4 * * *', $$
--   DELETE FROM qstash_job_log WHERE created_at < now() - interval '90 days';
-- $$);
```

#### message_queue

```sql
-- Fila de mensagens outbound (WhatsApp, email, push) com retry
CREATE TABLE message_queue (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  professional_id uuid REFERENCES professionals(id) ON DELETE RESTRICT,

  channel         text NOT NULL CHECK (channel IN ('whatsapp','email','push','sms')),
  recipient       text NOT NULL,   -- phone (E.164), email, push_token
  message_text    text,
  metadata        jsonb DEFAULT '{}',  -- {template, variables, attachments}

  status          text DEFAULT 'pending'
                  CHECK (status IN ('pending','processing','sent','failed','cancelled')),
  attempts        integer DEFAULT 0,
  max_attempts    integer DEFAULT 3,
  scheduled_for   timestamptz DEFAULT now(),
  last_attempt_at timestamptz,
  error_message   text,
  sent_at         timestamptz,
  external_msg_id text,

  created_at      timestamptz DEFAULT now()
);

CREATE INDEX idx_mq_status_scheduled ON message_queue(status, scheduled_for) WHERE status = 'pending';

ALTER TABLE message_queue ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON message_queue FROM authenticated;
-- Apenas service_role lê e escreve (Edge Functions)
```

#### subscription_history

```sql
-- Histórico de mudanças de plano (compliance + analytics)
CREATE TABLE subscription_history (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  professional_id     uuid NOT NULL REFERENCES professionals(id) ON DELETE RESTRICT,
  from_plan           text,
  to_plan             text NOT NULL,
  change_type         text NOT NULL
                      CHECK (change_type IN ('upgrade','downgrade','trial_start','trial_end','cancel','reactivate')),
  stripe_event_id     text,
  amount_paid         numeric(10,2),
  changed_at          timestamptz DEFAULT now()
  -- NUNCA deleted_at — histórico é imutável
);

CREATE INDEX idx_sub_history_professional ON subscription_history(professional_id);

ALTER TABLE subscription_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sub_history_self" ON subscription_history FOR SELECT TO authenticated
USING (professional_id = auth_professional_id());
REVOKE INSERT, UPDATE, DELETE ON subscription_history FROM authenticated;
```

#### platform_metrics_daily

```sql
-- Métricas agregadas da plataforma (admin Ismael)
CREATE TABLE platform_metrics_daily (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  date                  date NOT NULL UNIQUE,

  -- Usuários
  total_professionals   integer DEFAULT 0,
  new_professionals     integer DEFAULT 0,
  active_professionals  integer DEFAULT 0,  -- ao menos 1 sessão registrada no dia
  churned_professionals integer DEFAULT 0,

  -- Receita
  mrr                   numeric(12,2) DEFAULT 0,
  new_mrr               numeric(12,2) DEFAULT 0,
  churned_mrr           numeric(12,2) DEFAULT 0,
  total_revenue_day     numeric(12,2) DEFAULT 0,

  -- Uso
  total_sessions        integer DEFAULT 0,
  total_messages_sent   integer DEFAULT 0,
  total_ai_credits_used integer DEFAULT 0,
  total_appointments    integer DEFAULT 0,

  -- Por plano
  plan_breakdown        jsonb DEFAULT '{}',
  -- {'trial': N, 'individual': N, 'equipe': N, 'team': N, 'enterprise': N}

  created_at            timestamptz DEFAULT now()
);

-- Apenas master_admin lê
ALTER TABLE platform_metrics_daily ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON platform_metrics_daily FROM authenticated;
-- service_role escreve via cron; master_admin lê via RPC
```

#### onboarding_sessions

```sql
-- Tracking granular de progresso no onboarding do profissional
CREATE TABLE onboarding_sessions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  professional_id uuid NOT NULL UNIQUE REFERENCES professionals(id) ON DELETE RESTRICT,

  -- Etapas completadas
  step_perfil         boolean DEFAULT false,
  step_servicos       boolean DEFAULT false,
  step_whatsapp       boolean DEFAULT false,
  step_agenda         boolean DEFAULT false,
  step_financeiro     boolean DEFAULT false,
  step_agentes_ia     boolean DEFAULT false,

  -- Nerissa setup
  nerissa_completed   boolean DEFAULT false,
  nerissa_session_id  uuid REFERENCES nerissa_setup_sessions(id),

  -- Timestamps de cada etapa
  completed_steps     jsonb DEFAULT '{}',  -- {step: timestamptz}

  started_at          timestamptz DEFAULT now(),
  completed_at        timestamptz,
  abandoned_at        timestamptz
);

ALTER TABLE onboarding_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "onboarding_sessions_isolation" ON onboarding_sessions FOR ALL TO authenticated
USING (professional_id = auth_professional_id())
WITH CHECK (professional_id = auth_professional_id());
```

---

### 16.11 Nerissa — Estado e Memória

#### nerissa_inbound_queue

```sql
-- Fila de mensagens recebidas do profissional para o admin/Nerissa
CREATE TABLE nerissa_inbound_queue (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  professional_id     uuid REFERENCES professionals(id) ON DELETE SET NULL,
  sales_lead_id       uuid REFERENCES sales_leads(id),

  raw_message         jsonb NOT NULL,   -- payload original do Evolution Go
  phone_from          text NOT NULL,
  message_text        text,
  message_type        text DEFAULT 'text' CHECK (message_type IN ('text','audio','image','document')),
  media_url           text,

  status              text DEFAULT 'pending'
                      CHECK (status IN ('pending','processing','processed','failed')),
  processed_at        timestamptz,
  error_message       text,

  created_at          timestamptz DEFAULT now()
);

CREATE INDEX idx_nerissa_inbound_status ON nerissa_inbound_queue(status, created_at);

-- Apenas service_role acessa
ALTER TABLE nerissa_inbound_queue ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON nerissa_inbound_queue FROM authenticated;
```

#### nerissa_learning_memories

```sql
-- Memórias de longo prazo da Nerissa sobre cada profissional/lead
CREATE TABLE nerissa_learning_memories (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  professional_id uuid REFERENCES professionals(id) ON DELETE CASCADE,
  sales_lead_id   uuid REFERENCES sales_leads(id),

  memory_type     text NOT NULL
                  CHECK (memory_type IN ('objection','preference','context','qualification','commitment')),
  content         text NOT NULL,
  source_message  text,
  confidence      numeric(3,2) DEFAULT 1.0,  -- 0 a 1
  is_active       boolean DEFAULT true,

  created_at      timestamptz DEFAULT now()
);

-- Apenas service_role acessa
ALTER TABLE nerissa_learning_memories ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON nerissa_learning_memories FROM authenticated;
```

---

### 16.12 Imutabilidade adicional

```sql
-- idempotency_log nunca é modificado
CREATE TRIGGER prevent_idempotency_update BEFORE UPDATE OR DELETE ON idempotency_log
  FOR EACH ROW EXECUTE FUNCTION fn_log_immutable();

-- subscription_history nunca é modificado
CREATE TRIGGER prevent_sub_history_update BEFORE UPDATE OR DELETE ON subscription_history
  FOR EACH ROW EXECUTE FUNCTION fn_log_immutable();

-- campaign_dispatches enviados são imutáveis
CREATE OR REPLACE FUNCTION fn_dispatch_immutable()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status = 'sent' THEN
    RAISE EXCEPTION 'Dispatches enviados são imutáveis';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER prevent_dispatch_update BEFORE UPDATE ON campaign_dispatches
  FOR EACH ROW EXECUTE FUNCTION fn_dispatch_immutable();
```

---

## Resumo de Tabelas v2

| Domínio | Tabelas |
|---|---|
| Auth & Tenancy | professionals, team_members, user_roles, master_admins |
| Clientes & CRM | clients, client_clinical_profiles, client_photos, client_pets, registration_links, registration_sessions |
| Agenda & Sessões | service_categories, services, appointment_series, appointment_waitlist, appointments, sessions, confirmation_messages, calendars, calendar_permissions |
| Documentos Clínicos | anamnese_templates, anamnese_fichas, modelos, questionnaires, questionnaire_questions, questionnaire_responses |
| Documentos Comerciais | quotes, contracts |
| Financeiro | financial_transactions, financeiro_bancos, financeiro_categorias, financeiro_centros_custo, payment_gateway_credentials, financeiro_conciliacoes, financeiro_conciliacao_items |
| SaaS Billing | plans, professional_subscriptions, subscription_history, credit_wallets, credit_transactions |
| Afiliados | affiliate_partners, affiliate_commissions |
| Estoque & Pacotes | stock_items, stock_history, service_stock_items, packages, client_packages, package_session_usage |
| Fidelidade | client_loyalty, loyalty_transactions, loyalty_rewards, loyalty_redemptions |
| Indicação | referral_links, referral_events, referral_program_configs, referral_templates |
| Campanhas | campaigns, campaign_recipients, campaign_dispatches, campaign_calendars, campaign_calendar_messages, campaign_calendar_enrollments |
| Funil de Vendas | sales_funnels, funnel_stages, funnel_opportunities, funnel_opportunity_history, funnel_automations, funnel_automation_logs |
| IA & Agentes | conversations, conversation_contexts, message_events, agent_executions, shadow_suggestions, professional_agents, personas, rlhf_diffs, rlhf_rules, ai_usage_log, proactive_triggers, proactive_trigger_logs |
| Inteligência | rfm_scores, client_health_scores, professional_platform_health_scores, lead_scores, professional_insights |
| Notificações | professional_notifications, notification_preferences, professional_push_tokens |
| Admin/Nerissa | master_admins, sales_leads, nerissa_setup_sessions, nerissa_setup_items, nerissa_setup_events, nerissa_inbound_queue, nerissa_learning_memories |
| Perfil Público | professional_public_profiles |
| Infra Operacional | idempotency_log, qstash_job_log, message_queue, platform_metrics_daily, onboarding_sessions, settings_entries, platform_settings |

**Total: ~90 tabelas** (v1 tinha 156 com muita fragmentação e tabelas mortas)

---

## 17. Auditoria de Colunas v1 — Correções e Adições (Query 4)

_Baseado nas 2197 colunas reais de produção (Query 4 truncada nos 50k chars — cobre até `funnel_templates`). Tabelas restantes a verificar na próxima iteração._

---

### 17.1 Correções Arquiteturais Críticas

#### `calendars` — revisão completa (não é Google Calendar)

Em v1, `calendars` é um sistema de **agendas internas** por profissional (ex: "Agenda da Dra. Maria", "Agenda da Equipe"), não uma integração com Google Calendar. Cada professional_id pode ter N calendários internos.

```sql
-- DROP a modelagem anterior (era OAuth/Google)
-- Substituir por:

CREATE TABLE calendars (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_professional_id   uuid NOT NULL REFERENCES professionals(id) ON DELETE RESTRICT,
  assigned_professional_id uuid REFERENCES professionals(id),  -- team member responsável
  name                    text NOT NULL,
  description             text,
  color                   text DEFAULT '#0D6E6E',
  is_default              boolean DEFAULT false,
  is_active               boolean DEFAULT true,
  sort_order              integer DEFAULT 0,

  -- Configurações de horário desta agenda
  work_start_time         time DEFAULT '08:00:00',
  work_end_time           time DEFAULT '19:00:00',
  work_days               integer[] DEFAULT ARRAY[1,2,3,4,5],  -- 1=seg..7=dom
  slot_duration_minutes   integer DEFAULT 60,

  created_at              timestamptz DEFAULT now(),
  updated_at              timestamptz DEFAULT now()
);

-- Permissões por membro da equipe (role-based)
CREATE TABLE calendar_permissions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  calendar_id     uuid NOT NULL REFERENCES calendars(id) ON DELETE CASCADE,
  professional_id uuid NOT NULL REFERENCES professionals(id) ON DELETE RESTRICT,
  role            text NOT NULL DEFAULT 'viewer'
                  CHECK (role IN ('owner','editor','viewer')),
  can_create      boolean DEFAULT false,
  can_edit        boolean DEFAULT false,
  can_delete      boolean DEFAULT false,
  created_at      timestamptz DEFAULT now(),
  UNIQUE(calendar_id, professional_id)
);

-- appointments.calendar_id aponta para esta tabela (não para Google)
ALTER TABLE appointments
  ADD COLUMN calendar_id uuid REFERENCES calendars(id);
```

> **Nota:** Google Calendar sync (se vier) será uma tabela separada `google_calendar_sync` com OAuth tokens via Vault.

---

#### `credit_wallets` — múltiplas wallets por profissional

Em v1, um profissional tem N wallets com tipos diferentes (ex: `monthly` com expiração, `purchased` sem expiração). A constraint UNIQUE deve ser removida.

```sql
-- Revisão da tabela credit_wallets
CREATE TABLE credit_wallets (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  professional_id     uuid NOT NULL REFERENCES professionals(id) ON DELETE RESTRICT,
  -- SEM UNIQUE em professional_id — múltiplas wallets por profissional

  wallet_type         text NOT NULL DEFAULT 'monthly',
  -- 'monthly' = créditos do plano, expire em data
  -- 'purchased' = créditos comprados, sem expiração
  -- 'bonus' = créditos bônus de promoção

  status              text NOT NULL DEFAULT 'active'
                      CHECK (status IN ('active','expired','depleted')),
  balance             bigint NOT NULL DEFAULT 0 CHECK (balance >= 0),

  expires_at          timestamptz,   -- NULL = sem expiração
  grant_reason        text DEFAULT 'subscription_cycle',
  billing_product_id  uuid,          -- FK para billing_products (Stripe catalog)
  source_transaction_id text,        -- Stripe payment_intent_id

  metadata            jsonb DEFAULT '{}',
  created_at          timestamptz DEFAULT now(),
  updated_at          timestamptz DEFAULT now(),
  deleted_at          timestamptz
);

CREATE INDEX idx_credit_wallets_professional ON credit_wallets(professional_id) WHERE status = 'active' AND deleted_at IS NULL;
```

---

### 17.2 Correções de Colunas em Tabelas Existentes

#### appointments — colunas adicionais

```sql
ALTER TABLE appointments
  ADD COLUMN calendar_id                  uuid REFERENCES calendars(id),
  ADD COLUMN assigned_to_professional_id  uuid REFERENCES professionals(id),
  ADD COLUMN feedback_status              text,
  -- NULL = aguardando, 'positivo', 'neutro', 'negativo'
  ADD COLUMN source                       text DEFAULT 'manual',
  -- 'manual', 'online_booking', 'whatsapp', 'recorrente'
  ADD COLUMN client_name                  text,   -- cache denormalizado
  ADD COLUMN client_phone                 text,   -- cache denormalizado
  ADD COLUMN confirmation_token           uuid DEFAULT gen_random_uuid(),
  ADD COLUMN reminder_day_sent_at         timestamptz,
  ADD COLUMN reminder_retry_sent_at       timestamptz,
  ADD COLUMN reminder_attempts            integer DEFAULT 0,
  ADD COLUMN reminder_day_attempts        integer DEFAULT 0,
  ADD COLUMN recurrence_id               uuid REFERENCES appointment_series(id),
  ADD COLUMN recurrence_index             integer,
  ADD COLUMN nps_score                    integer CHECK (nps_score BETWEEN 1 AND 5),
  ADD COLUMN notes_pos                    text;   -- notas pós-atendimento
```

#### clients — colunas adicionais

```sql
ALTER TABLE clients
  -- Endereço: em v1 é jsonb, não colunas separadas
  -- A coluna address jsonb já cobre city/neighborhood/full_address

  ADD COLUMN avatar_url                   text,   -- foto do perfil
  ADD COLUMN tags                         text[] DEFAULT '{}',
  ADD COLUMN optout_whatsapp              boolean DEFAULT false,
  ADD COLUMN optout_email                 boolean DEFAULT false,
  ADD COLUMN insatisfacoes_consecutivas   integer DEFAULT 0,
  ADD COLUMN last_conversation_summary    text,
  ADD COLUMN journey_stage_updated_at     timestamptz DEFAULT now(),
  ADD COLUMN journey_stage_updated_by     text DEFAULT 'manual',
  ADD COLUMN first_complaint              text,
  ADD COLUMN has_anamnese                 boolean DEFAULT false,
  ADD COLUMN last_anamnese_at             timestamptz,
  ADD COLUMN assigned_professional_id     uuid REFERENCES professionals(id);
  -- assigned_professional_id: em clínicas multi-profissional
```

#### anamnese_fichas — estrutura revisada

```sql
-- A tabela em v1 usa campos jsonb separados por domínio clínico
-- Revisão do DDL original:

-- Adicionar ao schema existente:
ALTER TABLE anamnese_fichas
  DROP COLUMN IF EXISTS token,
  DROP COLUMN IF EXISTS answers,
  ADD COLUMN public_token         uuid UNIQUE DEFAULT gen_random_uuid(),
  ADD COLUMN status               text DEFAULT 'aguardando'
                                  CHECK (status IN ('aguardando','preenchido','revisado','expirado')),
  ADD COLUMN dados_pessoais       jsonb DEFAULT '{}',
  ADD COLUMN queixas              jsonb DEFAULT '{}',
  ADD COLUMN historico            jsonb DEFAULT '{}',
  ADD COLUMN alergias             jsonb DEFAULT '{}',
  ADD COLUMN habitos              jsonb DEFAULT '{}',
  ADD COLUMN custom_data          jsonb DEFAULT '{}',
  ADD COLUMN fotos                jsonb DEFAULT '[]',  -- [{url, type, taken_at}]
  ADD COLUMN assinatura_url       text,
  ADD COLUMN assinado_em          timestamptz,
  ADD COLUMN lgpd_aceito          boolean DEFAULT false,
  ADD COLUMN lgpd_aceito_em       timestamptz,
  ADD COLUMN lgpd_ip              text,
  ADD COLUMN notas_profissional   text,
  ADD COLUMN preenchido_em        timestamptz,
  ADD COLUMN revisado_em          timestamptz,
  ADD COLUMN revisado_por         uuid REFERENCES team_members(id);
```

#### anamnese_templates — colunas adicionais

```sql
ALTER TABLE anamnese_templates
  ADD COLUMN specialty    text,   -- 'fisioterapia', 'estetica', 'odontologia'
  ADD COLUMN sections     jsonb DEFAULT '{
    "dados_pessoais": true,
    "queixas": true,
    "historico": true,
    "alergias": true,
    "habitos": true,
    "fotos": true,
    "assinatura": true,
    "lgpd": true
  }',
  ADD COLUMN lgpd_text    text DEFAULT 'Autorizo o uso dos meus dados pessoais...';
  -- Texto LGPD personalizável por profissional
```

---

### 17.3 Novas Tabelas Descobertas na Query 4

#### Sistema de Afiliados — revisão completa

Em v1, afiliados têm 3 tabelas separadas (mais granular que o PRD):

```sql
-- affiliate_conversions: cada profissional indicado (signed up via código)
CREATE TABLE affiliate_conversions (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  affiliate_id              uuid NOT NULL REFERENCES affiliate_partners(id),
  referred_professional_id  uuid REFERENCES professionals(id),
  referred_email            text NOT NULL,
  status                    text DEFAULT 'pendente'
                            CHECK (status IN ('pendente','ativo','pausado','cancelado')),
  signed_up_at              timestamptz DEFAULT now(),
  activated_at              timestamptz,
  paused_at                 timestamptz,
  plan_slug                 text,
  plan_monthly_price        numeric(10,2),
  commission_pct            numeric(5,2),
  commission_monthly_value  numeric(10,2),
  created_at                timestamptz DEFAULT now(),
  updated_at                timestamptz DEFAULT now()
);

-- affiliate_payments: pagamentos mensais consolidados ao afiliado
CREATE TABLE affiliate_payments (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  affiliate_id      uuid NOT NULL REFERENCES affiliate_partners(id),
  reference_month   date NOT NULL,   -- primeiro dia do mês
  active_conversions integer DEFAULT 0,
  gross_amount      numeric(10,2) DEFAULT 0,
  net_amount        numeric(10,2) DEFAULT 0,
  status            text DEFAULT 'pendente'
                    CHECK (status IN ('pendente','aprovado','pago','cancelado')),
  pix_key           text,
  payment_id        text,           -- ID do pagamento externo (PIX)
  paid_at           timestamptz,
  notes             text,
  created_at        timestamptz DEFAULT now()
);

ALTER TABLE affiliate_partners
  ADD COLUMN affiliate_type    text DEFAULT 'externo'
                               CHECK (affiliate_type IN ('profissional','externo','influencer')),
  ADD COLUMN name              text,    -- nome do afiliado externo (pode não ter professional_id)
  ADD COLUMN email             text,
  ADD COLUMN phone_whatsapp    text,
  ADD COLUMN instagram_handle  text,
  ADD COLUMN audience_size     integer,
  ADD COLUMN niche             text,
  ADD COLUMN affiliate_code    text UNIQUE,
  ADD COLUMN affiliate_link    text,
  ADD COLUMN pix_key           text,
  ADD COLUMN pix_key_type      text,   -- 'cpf','cnpj','email','telefone','aleatoria'
  ADD COLUMN payment_preference text DEFAULT 'pix',
  ADD COLUMN pending_payment   numeric(10,2) DEFAULT 0,
  ADD COLUMN active_conversions integer DEFAULT 0;
```

#### Billing Products (Catálogo Stripe)

```sql
-- Catálogo de produtos/preços Stripe sincronizado localmente
CREATE TABLE billing_products (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider          text NOT NULL DEFAULT 'stripe',
  external_price_id text NOT NULL UNIQUE,   -- Stripe price_id
  product_key       text NOT NULL,           -- 'plan_individual', 'credits_600', etc.
  product_type      text NOT NULL,           -- 'subscription', 'credits', 'addon'
  credits_amount    bigint DEFAULT 0,        -- créditos que este produto concede
  wallet_type       text DEFAULT 'monthly',
  expires_in_days   integer,                 -- NULL = sem expiração
  included_in_plans text[] DEFAULT '{}',
  grant_reason      text DEFAULT 'subscription_cycle',
  metadata          jsonb DEFAULT '{}',
  active            boolean DEFAULT true,
  created_at        timestamptz DEFAULT now(),
  updated_at        timestamptz DEFAULT now()
);
```

#### Billing Cycles e Invoices (rastreamento de faturas)

```sql
-- Ciclos de billing por profissional (snapshot do plano no momento)
CREATE TABLE billing_cycles (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  professional_id   uuid NOT NULL REFERENCES professionals(id) ON DELETE RESTRICT,
  starts_at         timestamptz NOT NULL,
  ends_at           timestamptz NOT NULL,
  included_credits  bigint DEFAULT 0,
  included_clients  integer DEFAULT 0,
  plan_snapshot     jsonb DEFAULT '{}',   -- snapshot do plano no início do ciclo
  created_at        timestamptz DEFAULT now()
);

-- Faturas Stripe sincronizadas localmente (para exibição no app)
CREATE TABLE billing_invoices (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stripe_invoice_id text UNIQUE,
  professional_id   uuid NOT NULL REFERENCES professionals(id) ON DELETE RESTRICT,
  amount            bigint NOT NULL,   -- em centavos
  currency          text DEFAULT 'BRL',
  status            text NOT NULL,
  paid_at           timestamptz,
  invoice_pdf       text,
  created_at        timestamptz DEFAULT now(),
  deleted_at        timestamptz
);

ALTER TABLE billing_cycles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "billing_cycles_self" ON billing_cycles FOR SELECT TO authenticated
USING (professional_id = auth_professional_id());
REVOKE INSERT, UPDATE, DELETE ON billing_cycles FROM authenticated;

ALTER TABLE billing_invoices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "billing_invoices_self" ON billing_invoices FOR SELECT TO authenticated
USING (professional_id = auth_professional_id());
REVOKE INSERT, UPDATE, DELETE ON billing_invoices FROM authenticated;
```

#### Credit Packages (Catálogo de Pacotes Avulsos)

```sql
CREATE TABLE credit_packages (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  credits     numeric NOT NULL,
  price_brl   numeric NOT NULL,
  bonus_pct   integer DEFAULT 0,
  is_active   boolean DEFAULT true,
  is_featured boolean DEFAULT false,
  sort_order  integer DEFAULT 0,
  created_at  timestamptz DEFAULT now()
);

-- Legível por authenticated (para exibir na tela de upgrade)
ALTER TABLE credit_packages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "credit_packages_read" ON credit_packages FOR SELECT TO authenticated
USING (is_active = true);
REVOKE INSERT, UPDATE, DELETE ON credit_packages FROM authenticated;
```

#### Credit Reservations (rastreamento granular)

```sql
-- Reservas individuais de crédito (substituem a coluna reserved em credit_wallets)
CREATE TABLE credit_reservations (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  professional_id   uuid NOT NULL REFERENCES professionals(id) ON DELETE RESTRICT,
  wallet_id         uuid NOT NULL REFERENCES credit_wallets(id),
  reserved_credits  bigint NOT NULL,
  status            text NOT NULL DEFAULT 'reserved'
                    CHECK (status IN ('reserved','committed','released','expired')),
  expires_at        timestamptz DEFAULT (now() + interval '5 minutes'),
  usage_event_id    uuid,   -- referência ao agente que reservou
  metadata          jsonb DEFAULT '{}',
  created_at        timestamptz DEFAULT now(),
  updated_at        timestamptz DEFAULT now()
);

CREATE INDEX idx_credit_reservations_status ON credit_reservations(status, expires_at)
  WHERE status = 'reserved';
-- Apenas service_role acessa
ALTER TABLE credit_reservations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON credit_reservations FROM authenticated;
```

#### Client Profiles Extended (Perfil Psicográfico para IA)

```sql
-- Perfil enriquecido do cliente para personalização da IA
CREATE TABLE client_profiles_extended (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id                   uuid NOT NULL UNIQUE REFERENCES clients(id),
  professional_id             uuid NOT NULL REFERENCES professionals(id) ON DELETE RESTRICT,

  -- Dados socioeconômicos
  marital_status              text,
  profession                  text,
  education_level             text,
  income_range                text,
  has_children                boolean,
  children_count              integer DEFAULT 0,
  household_size              integer DEFAULT 1,

  -- Preferências de contato
  preferred_contact_time      text,   -- 'manha', 'tarde', 'noite'
  preferred_contact_channel   text DEFAULT 'whatsapp',

  -- Estilo de vida
  how_often_self_care         text,
  self_care_budget_monthly    text,
  interests                   text[] DEFAULT '{}',
  practices_physical_activity boolean,
  physical_activity_type      text,
  has_dietary_restrictions    boolean,
  dietary_notes               text,
  sleep_quality               text,
  stress_level                text,

  -- Metas e histórico estético/clínico
  biggest_concern             text,
  dream_result                text,
  skin_care_routine           text,
  hair_care_routine           text,

  -- Completude do perfil (para gamificação de preenchimento)
  profile_completion_pct      integer DEFAULT 0,
  last_enriched_at            timestamptz DEFAULT now(),

  created_at                  timestamptz DEFAULT now(),
  updated_at                  timestamptz DEFAULT now()
);

ALTER TABLE client_profiles_extended ENABLE ROW LEVEL SECURITY;
CREATE POLICY "profiles_extended_isolation" ON client_profiles_extended FOR ALL TO authenticated
USING (professional_id = auth_professional_id())
WITH CHECK (professional_id = auth_professional_id());
```

#### Client Family Members (Círculo Familiar)

```sql
-- Familiares do cliente (leads potenciais, cross-sell)
CREATE TABLE client_family_members (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id           uuid NOT NULL REFERENCES clients(id),
  professional_id     uuid NOT NULL REFERENCES professionals(id) ON DELETE RESTRICT,
  name                text NOT NULL,
  relationship        text NOT NULL,   -- 'conjuge', 'filho', 'pai', 'mae', 'irmao', 'outro'
  birth_date          date,
  gender              text,
  health_notes        text,
  potential_services  text[] DEFAULT '{}',  -- serviços que esse familiar pode ter interesse
  created_at          timestamptz DEFAULT now()
);

ALTER TABLE client_family_members ENABLE ROW LEVEL SECURITY;
CREATE POLICY "family_members_isolation" ON client_family_members FOR ALL TO authenticated
USING (professional_id = auth_professional_id())
WITH CHECK (professional_id = auth_professional_id());
```

#### Funnel Templates (Funis Globais Pré-configurados)

```sql
-- Templates de funil pré-definidos pela plataforma (admin cria, professional escolhe)
CREATE TABLE funnel_templates (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name                      text NOT NULL,
  description               text,
  group_type                text NOT NULL,
  -- 'captacao' | 'reativacao' | 'pos_venda' | 'indicacao' | 'upsell'
  icon                      text DEFAULT 'TrendingUp',
  color                     text DEFAULT '#0D6E6E',
  is_active                 boolean DEFAULT true,
  is_global                 boolean DEFAULT true,   -- false = template do próprio profissional
  requires_approval         boolean DEFAULT false,
  ai_can_activate           boolean DEFAULT true,   -- IA pode abrir oportunidade automaticamente
  ai_description            text,   -- para o agente entender quando usar este funil
  ai_first_message_template text,   -- template da primeira mensagem
  sort_order                integer DEFAULT 0,
  created_at                timestamptz DEFAULT now()
);

CREATE TABLE funnel_template_stages (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id      uuid NOT NULL REFERENCES funnel_templates(id) ON DELETE CASCADE,
  name             text NOT NULL,
  slug             text NOT NULL,
  color            text DEFAULT '#94A3B8',
  position         integer NOT NULL,
  is_won           boolean DEFAULT false,
  is_lost          boolean DEFAULT false,
  days_to_expire   integer,
  ai_suggested_action text,
  created_at       timestamptz DEFAULT now()
);

-- Globais: anon e authenticated podem ler templates
ALTER TABLE funnel_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "funnel_templates_read" ON funnel_templates FOR SELECT TO authenticated USING (true);
REVOKE INSERT, UPDATE, DELETE ON funnel_templates FROM authenticated;

ALTER TABLE funnel_template_stages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "funnel_template_stages_read" ON funnel_template_stages FOR SELECT TO authenticated USING (true);
REVOKE INSERT, UPDATE, DELETE ON funnel_template_stages FROM authenticated;
```

#### Campaign Pipelines (Mini-CRM por Campanha)

```sql
-- Pipeline de conversão específico de uma campanha
CREATE TABLE campaign_pipelines (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  professional_id uuid NOT NULL REFERENCES professionals(id) ON DELETE RESTRICT,
  campaign_id     uuid NOT NULL REFERENCES campaigns(id),
  name            text NOT NULL,
  stages          jsonb NOT NULL DEFAULT '[]',  -- [{id, name, position, is_won, is_lost}]
  is_active       boolean DEFAULT true,
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now()
);

-- Clientes em cada estágio do pipeline de campanha
CREATE TABLE campaign_pipeline_clients (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  professional_id     uuid NOT NULL REFERENCES professionals(id) ON DELETE RESTRICT,
  campaign_id         uuid NOT NULL REFERENCES campaigns(id),
  pipeline_id         uuid NOT NULL REFERENCES campaign_pipelines(id),
  client_id           uuid NOT NULL REFERENCES clients(id),
  current_stage_id    uuid NOT NULL,   -- stage dentro do pipeline (jsonb)
  stage_entered_at    timestamptz DEFAULT now(),
  notes               text,
  ai_notes            text,
  converted           boolean DEFAULT false,
  converted_at        timestamptz,
  conversion_value    numeric(10,2),
  created_at          timestamptz DEFAULT now(),
  updated_at          timestamptz DEFAULT now()
);

ALTER TABLE campaign_pipelines ENABLE ROW LEVEL SECURITY;
CREATE POLICY "camp_pipelines_isolation" ON campaign_pipelines FOR ALL TO authenticated
USING (professional_id = auth_professional_id())
WITH CHECK (professional_id = auth_professional_id());

ALTER TABLE campaign_pipeline_clients ENABLE ROW LEVEL SECURITY;
CREATE POLICY "camp_pipeline_clients_isolation" ON campaign_pipeline_clients FOR ALL TO authenticated
USING (professional_id = auth_professional_id())
WITH CHECK (professional_id = auth_professional_id());
```

#### Campaign Message Queue revisada

```sql
-- Em v1, campaign_message_queue tem shadow mode próprio para campanhas
ALTER TABLE campaign_dispatches  -- ou criar campaign_message_queue separada
  ADD COLUMN requires_approval          boolean DEFAULT false,
  ADD COLUMN approved_by_professional_id uuid REFERENCES professionals(id),
  ADD COLUMN approved_at                timestamptz,
  ADD COLUMN delivered_at               timestamptz,
  ADD COLUMN read_at                    timestamptz,
  ADD COLUMN replied_at                 timestamptz,
  ADD COLUMN whatsapp_message_id        text,
  ADD COLUMN ai_generated               boolean DEFAULT false,
  ADD COLUMN ai_context_summary         text;
```

#### Confirmation Messages revisada (é log, não template)

```sql
-- Em v1, confirmation_messages é um LOG de mensagens enviadas (não template)
-- Substituir a modelagem do PRD anterior:
DROP TABLE IF EXISTS confirmation_messages;

CREATE TABLE confirmation_messages (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  appointment_id  uuid NOT NULL REFERENCES appointments(id),
  professional_id uuid NOT NULL REFERENCES professionals(id) ON DELETE RESTRICT,
  type            text NOT NULL,
  -- 'confirmacao_criacao' | 'lembrete_d1' | 'lembrete_1h' | 'pos_atendimento'
  phone           text NOT NULL,
  message         text NOT NULL,
  sent_at         timestamptz DEFAULT now(),
  evolution_msg_id text,    -- ID retornado pelo Evolution Go
  status          text DEFAULT 'sent'
                  CHECK (status IN ('sent','delivered','read','failed'))
);

CREATE INDEX idx_confirm_msgs_appointment ON confirmation_messages(appointment_id);
-- IMUTÁVEL — é um log
CREATE TRIGGER prevent_confirm_msgs_update BEFORE UPDATE OR DELETE ON confirmation_messages
  FOR EACH ROW EXECUTE FUNCTION fn_log_immutable();

ALTER TABLE confirmation_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "confirm_msgs_isolation" ON confirmation_messages FOR SELECT TO authenticated
USING (professional_id = auth_professional_id());
REVOKE INSERT, UPDATE, DELETE ON confirmation_messages FROM authenticated;
```

#### Business Events (Telemetria de Negócio)

```sql
-- Eventos de negócio para analytics interno (value_generated por evento)
CREATE TABLE business_events (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  professional_id uuid NOT NULL REFERENCES professionals(id) ON DELETE RESTRICT,
  event_type      text NOT NULL,
  -- 'session_completed' | 'package_sold' | 'appointment_created' | 'referral_converted'
  value_generated numeric(10,2) DEFAULT 0,
  source          text,
  correlation_id  text,   -- para rastrear causa→efeito
  metadata        jsonb DEFAULT '{}',
  created_at      timestamptz DEFAULT now()
);

CREATE INDEX idx_business_events_professional ON business_events(professional_id, event_type, created_at);

-- Imutável (telemetria)
CREATE TRIGGER prevent_business_events_update BEFORE UPDATE OR DELETE ON business_events
  FOR EACH ROW EXECUTE FUNCTION fn_log_immutable();

ALTER TABLE business_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "business_events_isolation" ON business_events FOR SELECT TO authenticated
USING (professional_id = auth_professional_id());
REVOKE INSERT, UPDATE, DELETE ON business_events FROM authenticated;
```

---

### 17.4 RPCs e Trigger Functions (Query 3 — ~95 funções de negócio)

#### RPCs Públicas (anon — rotas públicas)

```sql
-- public_get_booked_slots: retorna horários ocupados para o calendário de agendamento
CREATE OR REPLACE FUNCTION public_get_booked_slots(
  p_professional_slug text,
  p_service_id uuid,
  p_start_date date,
  p_end_date date
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
-- Retorna slots ocupados para /agendar/:slug
-- Sem auth — anon pode consultar
$$;

-- public_create_online_booking: cria appointment sem auth
CREATE OR REPLACE FUNCTION public_create_online_booking(
  p_professional_slug text,
  p_service_id uuid,
  p_scheduled_at timestamptz,
  p_client_name text,
  p_client_phone text,
  p_client_email text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
-- Cria appointment com source='online_booking'
-- Retorna appointment_id + confirmation_token
$$;

-- public_buy_package_offer: compra pacote (anon/client)
CREATE OR REPLACE FUNCTION public_buy_package_offer(
  p_package_slug text,
  p_client_phone text,
  p_client_name text,
  p_payment_method text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
-- Cria client_package + financial_transaction
$$;

-- public_lookup_client_by_phone: busca cliente por telefone
CREATE OR REPLACE FUNCTION public_lookup_client_by_phone(
  p_phone text,
  p_professional_slug text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
-- Retorna {exists: bool, client_name?: text}
-- Nunca retorna dados sensíveis
$$;
```

#### RPCs Autenticadas (negócio crítico)

```sql
-- move_client_stage: com IDOR protection
CREATE OR REPLACE FUNCTION move_client_stage(
  p_client_id uuid,
  p_new_stage journey_stage_enum,
  p_updated_by text DEFAULT 'manual'
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF auth_professional_id() IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM clients WHERE id = p_client_id AND professional_id = auth_professional_id()) THEN
    RAISE EXCEPTION 'Unauthorized: client does not belong to your clinic';
  END IF;
  UPDATE clients SET
    journey_stage = p_new_stage,
    journey_stage_updated_at = now(),
    journey_stage_updated_by = p_updated_by
  WHERE id = p_client_id;
END;
$$;

-- get_professional_dashboard: dados agregados em 1 query
CREATE OR REPLACE FUNCTION get_professional_dashboard()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
-- Retorna: agendamentos_hoje, receita_mes, clientes_ativos,
--          alertas, creditos_saldo, next_appointment
$$;

-- get_entitlements: capabilities do plano atual
CREATE OR REPLACE FUNCTION get_entitlements()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
-- Retorna capabilities do plano atual baseado no JWT
$$;

-- use_package_session: desconta 1 sessão do pacote com IDOR
CREATE OR REPLACE FUNCTION use_package_session(
  p_client_package_id uuid,
  p_session_id uuid
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM client_packages WHERE id = p_client_package_id AND professional_id = auth_professional_id()) THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;
  UPDATE client_packages SET sessions_used = sessions_used + 1 WHERE id = p_client_package_id;
  INSERT INTO package_session_usage (client_package_id, session_id, professional_id)
    VALUES (p_client_package_id, p_session_id, auth_professional_id());
END;
$$;

-- close_session: fecha sessão e dispara chain de eventos
CREATE OR REPLACE FUNCTION close_session(p_session_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
-- 1. Valida ownership
-- 2. Atualiza appointment.status = 'concluido'
-- 3. Cria financial_transaction se não existir
-- 4. Dispara proactive_trigger para NPS
-- 5. Atualiza clients.last_contact_at
$$;
```

#### Trigger Functions Críticas

```sql
-- initialize_professional_agents: cria agentes padrão ao criar professional
CREATE OR REPLACE FUNCTION initialize_professional_agents()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO professional_agents (professional_id, agent_slug, is_active, shadow_mode)
  VALUES
    (NEW.id, 'rosane', true, true),       -- shadow mode ativo por padrão
    (NEW.id, 'lembrete', true, false),
    (NEW.id, 'pos_atendimento', true, false),
    (NEW.id, 'aniversariantes', true, false),
    (NEW.id, 'reativacao', true, true),
    (NEW.id, 'relacionamento', true, true),
    (NEW.id, 'indicacao', true, false),
    (NEW.id, 'upsell', true, true);
  RETURN NEW;
END;
$$;
CREATE TRIGGER trg_initialize_agents
  AFTER INSERT ON professionals
  FOR EACH ROW EXECUTE FUNCTION initialize_professional_agents();

-- generate_recurring_appointments: gera appointments da série
CREATE OR REPLACE FUNCTION generate_recurring_appointments()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
-- Gera até 90 dias à frente de appointments recorrentes
-- Chamado no INSERT em appointment_series
$$;

-- prevent_overlapping_appointments: evita conflito de horário
CREATE OR REPLACE FUNCTION prevent_overlapping_appointments()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_conflict BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM appointments
    WHERE professional_id = NEW.professional_id
      AND calendar_id = NEW.calendar_id
      AND status NOT IN ('cancelado', 'falta')
      AND id != COALESCE(NEW.id, gen_random_uuid())
      AND tstzrange(scheduled_at, scheduled_at + (duration_minutes || ' minutes')::interval)
          && tstzrange(NEW.scheduled_at, NEW.scheduled_at + (NEW.duration_minutes || ' minutes')::interval)
  ) INTO v_conflict;
  IF v_conflict THEN
    RAISE EXCEPTION 'appointment_overlap';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER prevent_overlap
  BEFORE INSERT OR UPDATE ON appointments
  FOR EACH ROW EXECUTE FUNCTION prevent_overlapping_appointments();

-- award_points_on_session: fidelidade automática ao fechar sessão paga
CREATE OR REPLACE FUNCTION award_points_on_session()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NEW.payment_status = 'pago' AND OLD.payment_status != 'pago' THEN
    PERFORM add_loyalty_points(NEW.professional_id, NEW.client_id, 10, 'session_completed');
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER trg_award_points_session
  AFTER UPDATE ON sessions
  FOR EACH ROW EXECUTE FUNCTION award_points_on_session();

-- update_client_last_contact: mantém last_contact_at atualizado
CREATE OR REPLACE FUNCTION update_client_last_contact()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE clients SET last_contact_at = now()
  WHERE id = NEW.client_id;
  RETURN NEW;
END;
$$;
CREATE TRIGGER trg_update_last_contact_sessions
  AFTER INSERT ON sessions
  FOR EACH ROW EXECUTE FUNCTION update_client_last_contact();
CREATE TRIGGER trg_update_last_contact_conversations
  AFTER INSERT ON conversations
  FOR EACH ROW EXECUTE FUNCTION update_client_last_contact();

-- normalize_whatsapp_phone: normaliza para E.164 antes de salvar
CREATE OR REPLACE FUNCTION normalize_whatsapp_phone()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.phone_whatsapp IS NOT NULL THEN
    NEW.phone_whatsapp := regexp_replace(NEW.phone_whatsapp, '[^0-9]', '', 'g');
    IF length(NEW.phone_whatsapp) IN (10, 11) THEN
      NEW.phone_whatsapp := '55' || NEW.phone_whatsapp;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER normalize_phone_clients
  BEFORE INSERT OR UPDATE ON clients
  FOR EACH ROW EXECUTE FUNCTION normalize_whatsapp_phone();

-- mask_pii: ofusca dados sensíveis em audit logs
CREATE OR REPLACE FUNCTION mask_pii(data jsonb) RETURNS jsonb LANGUAGE plpgsql AS $$
BEGIN
  RETURN data
    - 'cpf' - 'email' - 'phone_whatsapp' - 'full_name'
    || jsonb_build_object(
         'cpf', CASE WHEN data->>'cpf' IS NOT NULL THEN '***' ELSE NULL END,
         'email', CASE WHEN data->>'email' IS NOT NULL
                       THEN left(data->>'email', 2) || '***@***' ELSE NULL END
       );
END;
$$;

-- add_loyalty_points: helper centralizado de pontos
CREATE OR REPLACE FUNCTION add_loyalty_points(
  p_professional_id uuid,
  p_client_id uuid,
  p_points integer,
  p_reason text
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO client_loyalty (professional_id, client_id, points_balance, points_lifetime)
  VALUES (p_professional_id, p_client_id, p_points, p_points)
  ON CONFLICT (professional_id, client_id)
  DO UPDATE SET
    points_balance = client_loyalty.points_balance + p_points,
    points_lifetime = client_loyalty.points_lifetime + p_points,
    last_activity_at = now();

  INSERT INTO loyalty_transactions (professional_id, client_id, points, type, description)
  VALUES (p_professional_id, p_client_id, p_points, 'earn', p_reason);
END;
$$;
```

---

### 17.5 ✅ Resolvido — CSV completo processado na Seção 18

Query 4 foi recebida completa via CSV (2197 linhas, todas as colunas).
Todas as correções e tabelas novas estão documentadas na Seção 18.

---

## 18. Auditoria Completa — CSV Query 4 (2197 linhas)

_Processado em 2026-06-04. Fonte: exportação completa da information_schema.columns da v1._

---

### 18.1 Correções Críticas a Tabelas Existentes

#### professionals — colunas ausentes no PRD

```sql
ALTER TABLE professionals ADD COLUMN IF NOT EXISTS
  -- Identidade estendida
  display_name              text,
  specialties               text[]    DEFAULT '{}',
  assistant_name            text      DEFAULT 'Rosane',
  assistant_tone            text      DEFAULT 'profissional',

  -- WhatsApp do profissional fica em professional_whatsapp.
  -- Nao criar whatsapp_type, nao usar baileys como contrato de produto.
  -- Provider canonico: evolution_go ou meta_waba.

  -- Programa de indicação pro→pro
  referral_code             text      UNIQUE,
  referred_by_professional_id uuid    REFERENCES professionals(id),

  -- Perfil de negócio
  has_team                  boolean   DEFAULT false,
  team_size                 int       DEFAULT 0,
  has_receptionist          boolean   DEFAULT false,
  main_acquisition_channel  text,     -- 'instagram', 'google', 'indicacao', etc.
  account_type              text      DEFAULT 'clinic',
                            -- 'clinic' | 'solo' | 'franchise'

  -- Produto / PWA
  pwa_installed             boolean   DEFAULT false,
  shadow_mode_forced        boolean   DEFAULT false,
  onboarding_funnel_step    text;     -- etapa atual do funil Nerissa
```

#### sessions — estrutura real do v1 (diverge do PRD original)

> A tabela `sessions` do v1 **não tem** `session_number`, `prescriptions`, nem `evolution`.
> Os campos corretos são:

```sql
-- Recriar com estrutura correta (migration de rename de colunas)
ALTER TABLE sessions
  RENAME COLUMN evolution TO clinical_evolution;

ALTER TABLE sessions
  RENAME COLUMN amount TO session_value;

ALTER TABLE sessions ADD COLUMN IF NOT EXISTS
  session_time              text,        -- duração legível, ex: "01:30"
  procedures_performed      text[]  DEFAULT '{}',
  products_used             text[]  DEFAULT '{}',
  ai_registered             boolean DEFAULT false,
  ai_raw_transcript         text,
  ai_confidence_score       numeric(4,3);

-- Remover colunas inexistentes no v1
-- session_number: não existe
-- prescriptions: dados clínicos ficam em anamnese_fichas
```

#### services — colunas adicionais e correção de FK

```sql
ALTER TABLE services ADD COLUMN IF NOT EXISTS
  -- Custo e margem (para relatório de lucratividade)
  cost_product              numeric(10,2)  DEFAULT 0,
  cost_labor                numeric(10,2)  DEFAULT 0,
  markup_percent            numeric(5,2)   DEFAULT 0,

  -- Peso no cálculo RFM (serviços premium pesam mais)
  rfm_weight                numeric(3,2)   DEFAULT 1.0;

-- NOTA: category_id não existe no v1 como FK direta.
-- service_categories é referenciada via services.category (text).
-- Em v2, manter como text ou criar FK se desejar migrar.
```

#### plans — feature flags booleanas (não jsonb)

```sql
-- PRD modelou como capabilities jsonb — v1 usa booleanos separados
ALTER TABLE plans ADD COLUMN IF NOT EXISTS
  feature_agenda            boolean DEFAULT true,
  feature_ai_agents         boolean DEFAULT true,   -- NUNCA false em Individual/Solo
  feature_financial         boolean DEFAULT true,
  feature_stock             boolean DEFAULT false,
  feature_anamnese          boolean DEFAULT true,
  feature_team              boolean DEFAULT false,
  feature_packages          boolean DEFAULT false,
  feature_referrals         boolean DEFAULT false,
  price_annual              numeric(10,2),           -- preço anual (desconto ~20%)
  trial_days                int     DEFAULT 14,
  badge_text                text;                   -- ex: "Mais popular"

-- Remover capabilities jsonb se existir (substituída por booleanos)
```

#### payment_gateway_credentials — estrutura simplificada

```sql
-- PRD modelou como Vault jsonb — v1 usa text simples
-- TODO v2: migrar api_key para Supabase Vault
ALTER TABLE payment_gateway_credentials
  DROP COLUMN IF EXISTS credentials_vault_id,
  ADD COLUMN IF NOT EXISTS
    api_key         text,            -- ⚠️ plaintext, migrar para Vault
    webhook_token   text;
```

#### professional_subscriptions — colunas adicionais do v1

```sql
ALTER TABLE professional_subscriptions ADD COLUMN IF NOT EXISTS
  billing_cycle             text    DEFAULT 'monthly'
                            CHECK (billing_cycle IN ('monthly', 'annual')),
  trial_started_at          timestamptz,
  trial_ends_at             timestamptz,
  activated_at              timestamptz,
  readonly_since            timestamptz,  -- quando entrou em modo somente-leitura
  external_customer_id      text,         -- Stripe customer ID
  external_subscription_id  text;         -- Stripe subscription ID
```

#### rfm_scores — sub-componentes separados (não agregados)

```sql
-- PRD original tinha apenas recency_score, frequency_score, monetary_score
-- v1 tem sub-componentes detalhados:
ALTER TABLE rfm_scores ADD COLUMN IF NOT EXISTS
  recency_last_event        timestamptz,
  frequency_sessions        int     DEFAULT 0,
  frequency_products        int     DEFAULT 0,
  frequency_total           int     DEFAULT 0,
  value_services            numeric(10,2) DEFAULT 0,
  value_products            numeric(10,2) DEFAULT 0,
  value_total               numeric(10,2) DEFAULT 0,
  rfm_combined_score        text,          -- ex: '555', '311', '422'
  previous_segment          text,
  segment_changed           boolean DEFAULT false;
```

#### questionnaires — colunas adicionais do v1

```sql
ALTER TABLE questionnaires ADD COLUMN IF NOT EXISTS
  delivery_mode             text    DEFAULT 'manual'
                            CHECK (delivery_mode IN
                              ('manual','automatic','after_session','after_anamnese')),
  reward_points             int     DEFAULT 0,
  is_anamnese               boolean DEFAULT false,
  products_qualified        uuid[]  DEFAULT '{}',  -- produtos que disparam este questionário
  times_used                int     DEFAULT 0;
```

#### questionnaire_sessions — token público e posição

```sql
ALTER TABLE questionnaire_sessions ADD COLUMN IF NOT EXISTS
  form_token                text UNIQUE,  -- token público para link de preenchimento
  current_question_position int DEFAULT 0,
  points_awarded            boolean DEFAULT false,
  points_amount             int     DEFAULT 0;
```

#### questionnaire_responses — resposta por pergunta (não por sessão)

```sql
-- v1 tem 1 linha por pergunta respondida, não 1 linha por sessão completa
ALTER TABLE questionnaire_responses ADD COLUMN IF NOT EXISTS
  question_id               uuid REFERENCES questionnaire_questions(id),
  field_updated             text,    -- campo do cliente atualizado, ex: 'has_diabetes'
  field_update_status       text DEFAULT 'pending'
                            CHECK (field_update_status IN ('pending','applied','error'));
```

#### idempotency_log — estrutura real com status e payload

```sql
-- PRD tinha só key + expires_at — v1 tem campos de rastreamento de execução
ALTER TABLE idempotency_log ADD COLUMN IF NOT EXISTS
  agent                     text,           -- qual cron/agent fez o lock
  status                    text DEFAULT 'processing'
                            CHECK (status IN ('processing','done','failed')),
  payload                   jsonb DEFAULT '{}',
  error                     text;
```

#### referral_program_configs — pontos (não desconto)

```sql
-- PRD modelou como discount_percent — v1 é baseado em pontos
ALTER TABLE referral_program_configs
  DROP COLUMN IF EXISTS discount_percent,
  DROP COLUMN IF EXISTS discount_type,
  ADD COLUMN IF NOT EXISTS
    referrer_points_signup       int DEFAULT 50,
    referrer_points_appointment  int DEFAULT 100,
    referrer_points_completion   int DEFAULT 200,
    referred_welcome_points      int DEFAULT 50,
    referral_cooldown_days       int DEFAULT 30;
```

#### sales_funnels — activation_mode e stats

```sql
ALTER TABLE sales_funnels ADD COLUMN IF NOT EXISTS
  activation_mode           text DEFAULT 'manual'
                            CHECK (activation_mode IN
                              ('manual','automatic','on_lead_capture')),
  auto_expire_days          int  DEFAULT 0,   -- 0 = sem expiração
  notify_on_stagnation      boolean DEFAULT true,
  total_leads               int  DEFAULT 0,
  converted_leads           int  DEFAULT 0,
  conversion_rate           numeric(5,2) DEFAULT 0;
```

#### platform_ai_usage_log — tokens de cache e custo estimado

```sql
ALTER TABLE ai_usage_log ADD COLUMN IF NOT EXISTS
  cache_write_tokens        int     DEFAULT 0,
  cache_hit_tokens          int     DEFAULT 0,
  estimated_cost_usd        numeric(10,6) DEFAULT 0,
  session_id                uuid    REFERENCES sessions(id),
  client_phone              text;
```

#### nerissa_learning_memories — estrutura real do v1

```sql
-- PRD tinha memory_type + content text — v1 usa memory_key + evidências
ALTER TABLE nerissa_learning_memories
  DROP COLUMN IF EXISTS memory_type,
  ADD COLUMN IF NOT EXISTS
    memory_key              text NOT NULL,   -- slug identificador da memória
    evidence_count          int  DEFAULT 1,
    cache_payload           jsonb DEFAULT '{}',
    score                   numeric(4,3) DEFAULT 0.5;
```

#### professional_public_profiles — slug e booking_config

```sql
ALTER TABLE professional_public_profiles ADD COLUMN IF NOT EXISTS
  slug                      text UNIQUE NOT NULL,
  booking_config            jsonb DEFAULT '{
    "working_hours": {
      "monday":    {"start": "08:00", "end": "18:00", "enabled": true},
      "tuesday":   {"start": "08:00", "end": "18:00", "enabled": true},
      "wednesday": {"start": "08:00", "end": "18:00", "enabled": true},
      "thursday":  {"start": "08:00", "end": "18:00", "enabled": true},
      "friday":    {"start": "08:00", "end": "18:00", "enabled": true},
      "saturday":  {"start": "08:00", "end": "13:00", "enabled": false},
      "sunday":    {"start": "00:00", "end": "00:00", "enabled": false}
    },
    "slot_duration_minutes": 60,
    "advance_booking_days": 30,
    "min_notice_hours": 2
  }';
```

---

### 18.2 Novas Tabelas Operacionais

#### professional_whatsapp — instâncias WA por profissional

```sql
CREATE TABLE professional_whatsapp (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  professional_id       uuid NOT NULL REFERENCES professionals(id) ON DELETE RESTRICT,
  provider              text NOT NULL DEFAULT 'evolution_go'
                        CHECK (provider IN ('evolution_go', 'meta_waba')),
  instance_name         text,
  instance_id           text,
  instance_token        text,             -- token da instancia, nunca exposto ao frontend
  phone_number          text,             -- número vinculado (E.164)
  status                text NOT NULL DEFAULT 'disconnected'
                        CHECK (status IN ('disconnected', 'connecting', 'connected', 'error')),
  is_connected          boolean NOT NULL DEFAULT false,
  last_connected_at     timestamptz,      -- último momento em que ficou conectado
  last_disconnected_at  timestamptz,      -- último momento em que desconectou
  disconnection_reason  text,             -- 'logout' | 'connection_closed' | 'ban' | null
  connection_mode       text NOT NULL DEFAULT 'qr'
                        CHECK (connection_mode IN ('qr', 'pairing_code', 'waba')),
  number_kind           text
                        CHECK (number_kind IS NULL OR number_kind IN ('personal', 'business', 'unknown')),
  qr_code               text,
  qr_expires_at         timestamptz,
  meta_phone_number_id  text,
  meta_waba_id          text,
  created_at            timestamptz DEFAULT now(),
  updated_at            timestamptz DEFAULT now(),
  CONSTRAINT professional_whatsapp_provider_fields CHECK (
    (provider = 'evolution_go' AND instance_name IS NOT NULL)
    OR provider = 'meta_waba'
  ),
  CONSTRAINT professional_whatsapp_connected_fields CHECK (
    is_connected = false
    OR (
      (provider = 'evolution_go' AND instance_name IS NOT NULL)
      OR (provider = 'meta_waba' AND meta_phone_number_id IS NOT NULL AND meta_waba_id IS NOT NULL)
    )
  ),
  CONSTRAINT professional_whatsapp_status_consistency CHECK (
    (status = 'connected' AND is_connected = true)
    OR (status <> 'connected' AND is_connected = false)
  )
);

-- Um profissional pode ter no máximo 1 instância por tipo de WhatsApp
CREATE UNIQUE INDEX idx_prof_whatsapp_prof_provider
  ON professional_whatsapp(professional_id, provider);

-- instance_name deve ser globalmente único: é o namespace da chave de idempotência
-- key = source_webhook + instance_name + external_message_id
-- Sem unicidade global de instance_name, colisão de idempotency_key é possível
-- ao escalar para centenas de profissionais com instâncias próprias
CREATE UNIQUE INDEX idx_prof_whatsapp_instance_name
  ON professional_whatsapp(instance_name)
  WHERE instance_name IS NOT NULL;

ALTER TABLE professional_whatsapp ENABLE ROW LEVEL SECURITY;
CREATE POLICY "professional_whatsapp_isolation" ON professional_whatsapp
  FOR ALL TO authenticated
  USING (professional_id = auth_professional_id())
  WITH CHECK (professional_id = auth_professional_id());
```

#### tasks — tarefas internas da clínica

```sql
CREATE TABLE tasks (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  professional_id uuid NOT NULL REFERENCES professionals(id) ON DELETE RESTRICT,
  client_id       uuid REFERENCES clients(id),
  title           text NOT NULL,
  description     text,
  status          text DEFAULT 'pendente'
                  CHECK (status IN ('pendente','em_andamento','concluida','cancelada')),
  priority        text DEFAULT 'normal'
                  CHECK (priority IN ('baixa','normal','alta','urgente')),
  due_date        date,
  assigned_to     uuid REFERENCES team_members(id),
  created_by      uuid REFERENCES auth.users(id),
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now(),
  completed_at    timestamptz
);

CREATE INDEX idx_tasks_professional ON tasks(professional_id, status, due_date);
CREATE INDEX idx_tasks_client ON tasks(client_id) WHERE client_id IS NOT NULL;

ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tasks_isolation" ON tasks FOR ALL TO authenticated
  USING (professional_id = auth_professional_id())
  WITH CHECK (professional_id = auth_professional_id());
```

#### products — catálogo de produtos clínicos

```sql
CREATE TABLE products (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  professional_id uuid NOT NULL REFERENCES professionals(id) ON DELETE RESTRICT,
  name            text NOT NULL,
  description     text,
  category        text,
  unit_price      numeric(10,2) NOT NULL DEFAULT 0,
  cost_price      numeric(10,2) DEFAULT 0,
  markup_percent  numeric(5,2)  DEFAULT 0,
  stock_controlled boolean DEFAULT false,
  stock_item_id   uuid REFERENCES stock_items(id),  -- link ao estoque físico
  rfm_weight      numeric(3,2)  DEFAULT 1.0,
  is_active       boolean DEFAULT true,
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now(),
  deleted_at      timestamptz
);

CREATE INDEX idx_products_professional ON products(professional_id) WHERE deleted_at IS NULL;

ALTER TABLE products ENABLE ROW LEVEL SECURITY;
CREATE POLICY "products_isolation" ON products FOR ALL TO authenticated
  USING (professional_id = auth_professional_id())
  WITH CHECK (professional_id = auth_professional_id());
```

#### product_sales — vendas de produtos (separado de sessões)

```sql
CREATE TABLE product_sales (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  professional_id uuid NOT NULL REFERENCES professionals(id) ON DELETE RESTRICT,
  client_id       uuid NOT NULL REFERENCES clients(id),
  product_id      uuid NOT NULL REFERENCES products(id),
  session_id      uuid REFERENCES sessions(id),   -- opcional: vendido durante sessão
  quantity        int NOT NULL DEFAULT 1 CHECK (quantity > 0),
  unit_price      numeric(10,2) NOT NULL,
  total_price     numeric(10,2) NOT NULL,
  payment_method  text,
  payment_status  text DEFAULT 'pendente'
                  CHECK (payment_status IN ('pendente','pago','cancelado')),
  sold_at         timestamptz DEFAULT now(),
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now()
);

CREATE INDEX idx_product_sales_professional ON product_sales(professional_id, sold_at);
CREATE INDEX idx_product_sales_client ON product_sales(client_id);

ALTER TABLE product_sales ENABLE ROW LEVEL SECURITY;
CREATE POLICY "product_sales_isolation" ON product_sales FOR ALL TO authenticated
  USING (professional_id = auth_professional_id())
  WITH CHECK (professional_id = auth_professional_id());
```

#### pipeline_stages — estágios instância por profissional

```sql
CREATE TABLE pipeline_stages (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  professional_id uuid NOT NULL REFERENCES professionals(id) ON DELETE RESTRICT,
  funnel_id       uuid REFERENCES sales_funnels(id),
  name            text NOT NULL,
  position        int NOT NULL,
  color           text DEFAULT '#6B7280',
  auto_action     text,         -- 'send_message' | 'create_task' | 'assign_agent'
  auto_action_config jsonb DEFAULT '{}',
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now()
);

CREATE UNIQUE INDEX idx_pipeline_stages_pos
  ON pipeline_stages(professional_id, funnel_id, position);

ALTER TABLE pipeline_stages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pipeline_stages_isolation" ON pipeline_stages FOR ALL TO authenticated
  USING (professional_id = auth_professional_id())
  WITH CHECK (professional_id = auth_professional_id());
```

#### pipeline_stage_templates — templates globais de funil

```sql
CREATE TABLE pipeline_stage_templates (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  slug        text UNIQUE NOT NULL,
  position    int NOT NULL,
  description text,
  color       text DEFAULT '#6B7280',
  is_default  boolean DEFAULT false,
  created_at  timestamptz DEFAULT now()
);

-- Sem RLS — é um catálogo global somente-leitura
REVOKE INSERT, UPDATE, DELETE ON pipeline_stage_templates FROM authenticated;
GRANT SELECT ON pipeline_stage_templates TO authenticated;
```

---

### 18.3 Campanhas Admin (Multi-Profissional)

#### master_campaigns — campanhas da plataforma para todos os profissionais

```sql
CREATE TABLE master_campaigns (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title             text NOT NULL,
  description       text,
  type              text NOT NULL
                    CHECK (type IN ('email','whatsapp','push','in_app')),
  status            text DEFAULT 'draft'
                    CHECK (status IN ('draft','scheduled','running','completed','cancelled')),
  target_plan_types text[] DEFAULT '{}',  -- [] = todos os planos
  message_template  text,
  scheduled_at      timestamptz,
  created_by        uuid REFERENCES master_admins(id),
  created_at        timestamptz DEFAULT now(),
  updated_at        timestamptz DEFAULT now()
);

-- Sem RLS de profissional — é admin-only
REVOKE ALL ON master_campaigns FROM authenticated;
GRANT SELECT ON master_campaigns TO authenticated;  -- profissional pode ver campanhas recebidas
```

#### master_campaign_executions — execução por profissional

```sql
CREATE TABLE master_campaign_executions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id     uuid NOT NULL REFERENCES master_campaigns(id),
  professional_id uuid NOT NULL REFERENCES professionals(id) ON DELETE RESTRICT,
  status          text DEFAULT 'pending'
                  CHECK (status IN ('pending','sent','failed','skipped','opted_out')),
  sent_at         timestamptz,
  error_message   text,
  created_at      timestamptz DEFAULT now()
);

CREATE INDEX idx_master_exec_campaign ON master_campaign_executions(campaign_id, status);
CREATE INDEX idx_master_exec_professional ON master_campaign_executions(professional_id);

ALTER TABLE master_campaign_executions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "master_exec_isolation" ON master_campaign_executions FOR SELECT TO authenticated
  USING (professional_id = auth_professional_id());
```

#### admin_campaigns — campanhas administrativas com critérios de segmentação

```sql
CREATE TABLE admin_campaigns (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title             text NOT NULL,
  description       text,
  type              text NOT NULL,
  status            text DEFAULT 'draft',
  target_criteria   jsonb DEFAULT '{}',  -- {plan_type: 'trial', city: 'SP', min_clients: 50}
  message_template  text,
  scheduled_at      timestamptz,
  total_targeted    int DEFAULT 0,
  total_sent        int DEFAULT 0,
  created_at        timestamptz DEFAULT now(),
  updated_at        timestamptz DEFAULT now()
);

REVOKE ALL ON admin_campaigns FROM authenticated;
```

---

### 18.4 Indicação — Estrutura Completa

#### professional_referrals — profissional indicou outro profissional

```sql
CREATE TABLE professional_referrals (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_professional_id uuid NOT NULL REFERENCES professionals(id) ON DELETE RESTRICT,
  referred_professional_id uuid REFERENCES professionals(id) ON DELETE SET NULL,
  referral_code           text NOT NULL,
  referred_email          text,    -- email preenchido no convite (antes do cadastro)
  status                  text DEFAULT 'pending'
                          CHECK (status IN ('pending','active','completed','cancelled')),
  reward_type             text DEFAULT 'percentage'
                          CHECK (reward_type IN ('percentage','credits','discount')),
  reward_value            numeric(10,2) DEFAULT 15.0,
  reward_paid_at          timestamptz,
  created_at              timestamptz DEFAULT now(),
  updated_at              timestamptz DEFAULT now()
);

CREATE INDEX idx_prof_referrals_referrer ON professional_referrals(referrer_professional_id);
CREATE INDEX idx_prof_referrals_code ON professional_referrals(referral_code);

ALTER TABLE professional_referrals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "prof_referrals_isolation" ON professional_referrals FOR SELECT TO authenticated
  USING (referrer_professional_id = auth_professional_id()
      OR referred_professional_id = auth_professional_id());
```

#### professional_referral_summary — sumário de indicações do profissional

```sql
CREATE TABLE professional_referral_summary (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  professional_id     uuid UNIQUE NOT NULL REFERENCES professionals(id) ON DELETE RESTRICT,
  total_referrals     int     DEFAULT 0,
  active_referrals    int     DEFAULT 0,
  completed_referrals int     DEFAULT 0,
  total_earned        numeric(10,2) DEFAULT 0,
  pending_reward      numeric(10,2) DEFAULT 0,
  updated_at          timestamptz DEFAULT now()
);

ALTER TABLE professional_referral_summary ENABLE ROW LEVEL SECURITY;
CREATE POLICY "prof_ref_summary_isolation" ON professional_referral_summary
  FOR SELECT TO authenticated
  USING (professional_id = auth_professional_id());
```

#### referrals — tabela separada de indicações cliente→cliente

```sql
-- NOTA: v1 tem DUAS tabelas de indicação separadas:
-- 1. client_referrals (ou referral_links/referral_events — já no PRD Seção 9)
-- 2. professional_referrals (pro→pro — acima)
-- Verificar no v1 se 'referrals' é sinônimo de 'referral_links' ou tabela distinta.
-- Tratado como client_referrals para não duplicar com referral_links já modelado.
```

---

### 18.5 Nerissa — Tabelas de Runtime

#### nerissa_runtime_state — key-value de locks e estado

```sql
CREATE TABLE nerissa_runtime_state (
  key         text PRIMARY KEY,    -- ex: 'nerissa_lock_pro_uuid', 'setup_phase_uuid'
  value       jsonb NOT NULL DEFAULT '{}',
  locked_by   text,                -- qual agent/cron fez o lock
  locked_at   timestamptz,
  expires_at  timestamptz,
  updated_at  timestamptz DEFAULT now()
);

-- Sem RLS — acessado apenas por service_role (Edge Functions internas)
REVOKE ALL ON nerissa_runtime_state FROM authenticated;
```

#### nerissa_skill_topics — tópicos de conhecimento da Nerissa

```sql
CREATE TABLE nerissa_skill_topics (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug            text UNIQUE NOT NULL,   -- ex: 'objecao_preco', 'agenda_manual'
  name            text NOT NULL,
  description     text,
  prompt_context  text,   -- texto injetado no system prompt quando este tópico é ativado
  is_active       boolean DEFAULT true,
  priority        int DEFAULT 0,
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now()
);

-- Catálogo global — somente service_role escreve
REVOKE INSERT, UPDATE, DELETE ON nerissa_skill_topics FROM authenticated;
GRANT SELECT ON nerissa_skill_topics TO authenticated;
```

---

### 18.6 Rastreamento e Infra

#### session_events — eventos granulares dentro de uma sessão

```sql
CREATE TABLE session_events (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id      uuid NOT NULL REFERENCES sessions(id),
  professional_id uuid NOT NULL REFERENCES professionals(id) ON DELETE RESTRICT,
  event_type      text NOT NULL,
  -- 'session_started' | 'procedure_added' | 'product_added' | 'payment_registered'
  -- 'anamnese_linked' | 'session_closed' | 'ai_transcript_saved'
  event_data      jsonb DEFAULT '{}',
  occurred_at     timestamptz DEFAULT now(),
  created_at      timestamptz DEFAULT now()
);

CREATE INDEX idx_session_events_session ON session_events(session_id, occurred_at);

-- Imutável (log de auditoria)
CREATE TRIGGER prevent_session_events_change BEFORE UPDATE OR DELETE ON session_events
  FOR EACH ROW EXECUTE FUNCTION fn_log_immutable();

ALTER TABLE session_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "session_events_isolation" ON session_events FOR SELECT TO authenticated
  USING (professional_id = auth_professional_id());
REVOKE INSERT, UPDATE, DELETE ON session_events FROM authenticated;
```

#### usage_events — rastreamento de uso de features (produto analytics)

```sql
CREATE TABLE usage_events (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  professional_id uuid NOT NULL REFERENCES professionals(id) ON DELETE RESTRICT,
  event_name      text NOT NULL,    -- ex: 'anamnese_sent', 'campaign_created'
  feature         text,             -- ex: 'anamnese', 'campanhas', 'agendamento'
  metadata        jsonb DEFAULT '{}',
  created_at      timestamptz DEFAULT now()
);

CREATE INDEX idx_usage_events_professional ON usage_events(professional_id, event_name, created_at);

-- Imutável
CREATE TRIGGER prevent_usage_events_change BEFORE UPDATE OR DELETE ON usage_events
  FOR EACH ROW EXECUTE FUNCTION fn_log_immutable();

ALTER TABLE usage_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "usage_events_isolation" ON usage_events FOR SELECT TO authenticated
  USING (professional_id = auth_professional_id());
REVOKE INSERT, UPDATE, DELETE ON usage_events FROM authenticated;
```

#### whatsapp_message_logs — REMOVIDA (consolidada em message_events)

> Esta tabela existia no v1. No v2 foi consolidada em `message_events`.
> Campos mapeados: `evolution_message_id` → `external_message_id`, demais campos são idênticos.
> Ver seção de `message_events` (Seção 12) e PRD-CONSOLIDATION.md para o DDL completo.

#### processed_billing_events — idempotência de eventos Stripe

```sql
CREATE TABLE processed_billing_events (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id        text UNIQUE NOT NULL,   -- Stripe event ID (ex: evt_xxx)
  event_type      text NOT NULL,          -- ex: 'invoice.paid', 'customer.subscription.deleted'
  processed_at    timestamptz DEFAULT now(),
  payload         jsonb DEFAULT '{}'
);

-- Service role only
REVOKE ALL ON processed_billing_events FROM authenticated;
```

#### processed_webhooks — idempotência de webhooks externos

```sql
CREATE TABLE processed_webhooks (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  webhook_id      text UNIQUE NOT NULL,   -- ID único do webhook (ex: Evolution message ID)
  source          text NOT NULL           -- 'evolution' | 'stripe' | 'meta' | 'asaas'
                  CHECK (source IN ('evolution','stripe','meta','asaas','other')),
  processed_at    timestamptz DEFAULT now(),
  payload         jsonb DEFAULT '{}'
);

CREATE INDEX idx_processed_webhooks_source ON processed_webhooks(source, processed_at);

-- Service role only
REVOKE ALL ON processed_webhooks FROM authenticated;
```

---

### 18.7 Profissional — Extras

#### professional_addons — add-ons contratados

```sql
CREATE TABLE professional_addons (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  professional_id uuid NOT NULL REFERENCES professionals(id) ON DELETE RESTRICT,
  addon_type      text NOT NULL,
  -- 'extra_credits' | 'extra_channels' | 'white_label' | 'priority_support'
  status          text DEFAULT 'active'
                  CHECK (status IN ('active','cancelled','expired')),
  price           numeric(10,2),
  activated_at    timestamptz DEFAULT now(),
  expires_at      timestamptz,
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now()
);

CREATE INDEX idx_addons_professional ON professional_addons(professional_id, status);

ALTER TABLE professional_addons ENABLE ROW LEVEL SECURITY;
CREATE POLICY "addons_isolation" ON professional_addons FOR SELECT TO authenticated
  USING (professional_id = auth_professional_id());
```

#### professional_api_keys — chaves de API para integrações externas

```sql
CREATE TABLE professional_api_keys (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  professional_id uuid NOT NULL REFERENCES professionals(id) ON DELETE RESTRICT,
  name            text NOT NULL,        -- 'Google Calendar', 'Zapier', 'Make', etc.
  key_hash        text NOT NULL,        -- hash da chave (NUNCA armazenar plaintext)
  scopes          text[] DEFAULT '{}',  -- ['read:appointments', 'write:clients']
  last_used_at    timestamptz,
  expires_at      timestamptz,
  is_active       boolean DEFAULT true,
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now()
);

ALTER TABLE professional_api_keys ENABLE ROW LEVEL SECURITY;
CREATE POLICY "api_keys_isolation" ON professional_api_keys FOR ALL TO authenticated
  USING (professional_id = auth_professional_id())
  WITH CHECK (professional_id = auth_professional_id());
```

#### professional_badges — gamificação e conquistas

```sql
CREATE TABLE professional_badges (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  professional_id uuid NOT NULL REFERENCES professionals(id) ON DELETE RESTRICT,
  badge_type      text NOT NULL,
  -- 'first_session' | 'hundred_clients' | 'referral_star' | 'ai_power_user'
  earned_at       timestamptz DEFAULT now(),
  metadata        jsonb DEFAULT '{}',
  UNIQUE (professional_id, badge_type)  -- cada badge 1 vez por profissional
);

ALTER TABLE professional_badges ENABLE ROW LEVEL SECURITY;
CREATE POLICY "badges_isolation" ON professional_badges FOR SELECT TO authenticated
  USING (professional_id = auth_professional_id());
```

#### service_packages — nome real no v1 (substitui `packages`)

```sql
-- Em v1, a tabela se chama service_packages, não packages
-- Estrutura mais rica que o PRD original (Seção 7 packages):
DROP TABLE IF EXISTS packages;

CREATE TABLE service_packages (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  professional_id     uuid NOT NULL REFERENCES professionals(id) ON DELETE RESTRICT,
  name                text NOT NULL,
  slug                text NOT NULL,
  type                text DEFAULT 'session_pack'
                      CHECK (type IN ('session_pack','subscription','product_bundle')),
  services_list       uuid[] DEFAULT '{}',    -- IDs de services inclusos
  allows_installments boolean DEFAULT false,
  max_installments    int     DEFAULT 1,
  total_sessions      int,                    -- null = ilimitado (subscription)
  validity_days       int     DEFAULT 365,
  price               numeric(10,2) NOT NULL,
  discount_percent    numeric(5,2)  DEFAULT 0,
  is_active           boolean DEFAULT true,
  photo_url           text,
  description         text,
  created_at          timestamptz DEFAULT now(),
  updated_at          timestamptz DEFAULT now(),
  deleted_at          timestamptz
);

CREATE UNIQUE INDEX idx_service_packages_slug
  ON service_packages(professional_id, slug) WHERE deleted_at IS NULL;
CREATE INDEX idx_service_packages_professional
  ON service_packages(professional_id) WHERE deleted_at IS NULL;

ALTER TABLE service_packages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_packages_pro_isolation" ON service_packages
  FOR ALL TO authenticated
  USING (professional_id = auth_professional_id())
  WITH CHECK (professional_id = auth_professional_id());
CREATE POLICY "service_packages_anon_read" ON service_packages
  FOR SELECT TO anon
  USING (is_active = true AND deleted_at IS NULL);
-- anon pode ler (página pública /pacote/:slug)
```

---

### 18.8 Views do v1 (11 identificadas)

```sql
-- Todas as views devem ter WITH (security_invoker = on) quando filtram por clínica
-- Regra de segurança absoluta #6

-- v_professional_stats: métricas agregadas
CREATE OR REPLACE VIEW v_professional_stats
  WITH (security_invoker = on) AS
  SELECT
    p.id AS professional_id,
    COUNT(DISTINCT c.id) AS total_clients,
    COUNT(DISTINCT CASE WHEN c.journey_stage != 'inativo' THEN c.id END) AS active_clients,
    COUNT(DISTINCT s.id) AS total_sessions_30d,
    COALESCE(SUM(ft.amount) FILTER (
      WHERE ft.created_at > now() - interval '30 days'
        AND ft.status = 'paid'
    ), 0) AS revenue_30d
  FROM professionals p
  LEFT JOIN clients c ON c.professional_id = p.id AND c.deleted_at IS NULL
  LEFT JOIN sessions s ON s.professional_id = p.id
    AND s.created_at > now() - interval '30 days'
  LEFT JOIN financial_transactions ft ON ft.professional_id = p.id
  WHERE p.id = auth_professional_id()
  GROUP BY p.id;

-- v_active_clients: clientes com sessão nos últimos 90 dias
CREATE OR REPLACE VIEW v_active_clients
  WITH (security_invoker = on) AS
  SELECT c.*
  FROM clients c
  WHERE c.professional_id = auth_professional_id()
    AND c.deleted_at IS NULL
    AND c.last_contact_at > now() - interval '90 days';

-- v_credit_balance: saldo total de créditos por profissional
CREATE OR REPLACE VIEW v_credit_balance
  WITH (security_invoker = on) AS
  SELECT
    professional_id,
    SUM(balance) AS total_balance,
    SUM(balance) FILTER (WHERE wallet_type = 'plan')    AS plan_balance,
    SUM(balance) FILTER (WHERE wallet_type = 'addon')   AS addon_balance,
    SUM(balance) FILTER (WHERE wallet_type = 'bonus')   AS bonus_balance
  FROM credit_wallets
  WHERE professional_id = auth_professional_id()
    AND (expires_at IS NULL OR expires_at > now())
  GROUP BY professional_id;

-- v_trial_expiring: trials expirando nos próximos 3 dias (admin)
CREATE OR REPLACE VIEW v_trial_expiring AS
  SELECT id, name, email, trial_ends_at,
         EXTRACT(DAY FROM trial_ends_at - now())::int AS days_remaining
  FROM professionals
  WHERE plan_type = 'trial'
    AND trial_ends_at BETWEEN now() AND now() + interval '3 days'
    AND deleted_at IS NULL;
-- Sem security_invoker — é view admin (service_role only)
REVOKE ALL ON v_trial_expiring FROM authenticated;

-- v_rfm_segments: distribuição de clientes por segmento
CREATE OR REPLACE VIEW v_rfm_segments
  WITH (security_invoker = on) AS
  SELECT
    rfm_segment,
    COUNT(*) AS client_count,
    AVG(value_total) AS avg_value
  FROM rfm_scores
  WHERE professional_id = auth_professional_id()
  GROUP BY rfm_segment;

-- Demais views (nomes a confirmar no v1):
-- v_client_journey, v_revenue_by_month, v_appointment_conflicts,
-- v_package_utilization, v_campaign_performance, v_lead_funnel
-- → modelar na Seção 19 após confirmar nomes exatos com query:
-- SELECT viewname FROM pg_views WHERE schemaname = 'public';
```

---

### 18.9 Contagem Final — Cobertura do PRD v2

| Categoria | Tabelas v1 | Cobertas no PRD | Gap |
|---|---|---|---|
| Auth & Tenancy | 5 | 5 | ✅ 0 |
| Clientes & CRM | 12 | 11 | 1 (client_referrals alias) |
| Agenda & Sessões | 10 | 9 | 1 (session_events → Seção 18.6) |
| Documentos Clínicos | 8 | 8 | ✅ 0 |
| Financeiro | 10 | 10 | ✅ 0 |
| SaaS Billing | 9 | 9 | ✅ 0 |
| Estoque & Pacotes | 6 | 6 | ✅ 0 |
| WhatsApp & IA | 12 | 12 | ✅ 0 |
| Comunicação & Campanhas | 15 | 15 | ✅ 0 |
| Funil de Vendas | 8 | 8 | ✅ 0 |
| Relatórios & Métricas | 10 | 10 | ✅ 0 |
| Notificações | 5 | 5 | ✅ 0 |
| Admin / Nerissa | 15 | 14 | 1 (nerissa_skill_topics → Seção 18.5) |
| Configurações | 3 | 3 | ✅ 0 |
| Novos (Seção 18) | 25 | 25 | ✅ 0 |
| **Total estimado** | **~153** | **~150** | **~3** |

> As ~3 tabelas em aberto são aliases ou confirmações pendentes do Query 1 original.
> Views (11): 5 modeladas com DDL completo, 6 com nomes a confirmar.

---

## 19. Cérebro de IA — Knowledge Graph (GraphRAG)

_Definido em 2026-06-04. Sistema de conhecimento acumulativo compartilhado entre todos os agentes._

### Princípio

O Knowledge Brain é um grafo de conhecimento com busca semântica — como um Obsidian interno da plataforma. Cada nó é uma unidade atômica de conhecimento; arestas são relações tipadas entre eles. Todos os agentes (Rosane, Nerissa, lembrete, indicação, reativação) lêem e escrevem nesse grafo ao longo do tempo.

**Por que grafo e não só RAG vetorial?**
Vector search retorna documentos parecidos. O grafo preserva o "porquê": esta técnica de copy funciona para este perfil de objeção, que se relaciona com este segmento de cliente. Sem o grafo, o agente encontra o nó mas perde o contexto que o torna útil.

### Camadas de Conhecimento

```
GLOBAL (service_role) ─── profissional_id IS NULL
  Técnicas de vendas, procedimentos clínicos, templates de copy,
  padrões de objeção, cursos técnicos, marketing, benchmarks

PROFISSIONAL (professional_id) ─── por clínica
  Estilo de comunicação do profissional, preferências dos seus clientes
  como grupo, campanhas que funcionaram nessa clínica, tom e expressões

CLIENTE (client_id + professional_id) ─── por paciente
  Sensibilidades, preferências de horário/canal, histórico de objeções,
  serviços de maior adesão, nível de engajamento
```

### 19.1 Tabelas do Knowledge Brain

#### knowledge_domains — namespaces de conhecimento

```sql
CREATE EXTENSION IF NOT EXISTS vector;  -- pgvector

CREATE TABLE knowledge_domains (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug            text UNIQUE NOT NULL,
  -- 'sales' | 'conversion' | 'copy' | 'marketing' | 'clinical_procedures'
  -- 'tech_stack' | 'training_courses' | 'client_preferences'
  -- 'professional_preferences' | 'objections' | 'campaigns'
  name            text NOT NULL,
  description     text,
  parent_domain_id uuid REFERENCES knowledge_domains(id),  -- hierarquia
  is_global       boolean DEFAULT true,  -- false = domínio por profissional
  color           text DEFAULT '#6B7280',
  icon            text,
  created_at      timestamptz DEFAULT now()
);

-- Seeds iniciais (inseridos pelo admin na ativação da plataforma)
INSERT INTO knowledge_domains (slug, name, is_global) VALUES
  ('sales',                'Vendas e Negociação',          true),
  ('conversion',           'Conversão e Persuasão',        true),
  ('copy',                 'Copywriting',                  true),
  ('marketing',            'Marketing e Aquisição',        true),
  ('clinical_procedures',  'Procedimentos Clínicos',       true),
  ('tech_stack',           'Stack Tecnológica',            true),
  ('training_courses',     'Cursos e Treinamentos',        true),
  ('objections',           'Objeções e Respostas',         true),
  ('client_preferences',   'Preferências de Clientes',     false),  -- por profissional
  ('professional_prefs',   'Preferências do Profissional', false);
```

#### knowledge_nodes — nós do grafo (unidades atômicas de conhecimento)

```sql
CREATE TABLE knowledge_nodes (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  domain_id       uuid NOT NULL REFERENCES knowledge_domains(id),
  professional_id uuid REFERENCES professionals(id) ON DELETE RESTRICT,
  -- NULL = conhecimento global; NOT NULL = conhecimento da clínica
  client_id       uuid REFERENCES clients(id) ON DELETE SET NULL,
  -- NOT NULL = conhecimento sobre cliente específico

  -- Conteúdo
  title           text NOT NULL,             -- headline do conhecimento
  content         text NOT NULL,             -- conteúdo completo
  content_summary text,                      -- versão curta para context window
  tags            text[] DEFAULT '{}',       -- ex: ['reativacao', 'objecao_preco']

  -- Classificação
  node_type       text NOT NULL
                  CHECK (node_type IN (
                    'fact',          -- dado verificável
                    'procedure',     -- como fazer algo passo a passo
                    'preference',    -- o que alguém prefere
                    'technique',     -- abordagem que funciona em contexto
                    'template',      -- template de mensagem/copy
                    'case_study',    -- caso real com resultado
                    'objection',     -- objeção + resposta validada
                    'insight',       -- padrão identificado por análise
                    'rule'           -- regra de negócio ou invariante
                  )),

  -- Vetor semântico (para busca por similaridade)
  embedding       vector(1536),              -- Claude/OpenAI text-embedding-3-small

  -- Qualidade e confiança
  confidence      numeric(3,2) DEFAULT 0.5
                  CHECK (confidence BETWEEN 0.0 AND 1.0),
  evidence_count  int DEFAULT 1,             -- quantas evidências suportam este nó
  access_count    int DEFAULT 0,             -- quantas vezes foi recuperado
  helpful_count   int DEFAULT 0,             -- quantas vezes foi marcado como útil
  last_accessed_at timestamptz,

  -- Proveniência
  source_type     text NOT NULL DEFAULT 'manual'
                  CHECK (source_type IN (
                    'manual',             -- criado pelo admin/profissional
                    'agent_learned',      -- identificado por agente
                    'document_ingested',  -- extraído de PDF/documento
                    'conversation_extracted', -- extraído de conversa
                    'rlhf_diff',          -- gerado pela diferença de edição do profissional
                    'cron_consolidated'   -- consolidado pelo cron semanal de insights
                  )),
  source_id       uuid,                  -- referência ao documento/conversa de origem

  -- Ciclo de vida
  is_active       boolean DEFAULT true,
  expires_at      timestamptz,           -- conhecimento que caduca (ex: promoção sazonal)
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now(),
  deleted_at      timestamptz
);

-- Índice vetorial (HNSW — melhor para busca aproximada em alta dimensão)
CREATE INDEX idx_knowledge_nodes_embedding
  ON knowledge_nodes USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

CREATE INDEX idx_knowledge_nodes_domain ON knowledge_nodes(domain_id, node_type, is_active);
CREATE INDEX idx_knowledge_nodes_professional ON knowledge_nodes(professional_id)
  WHERE professional_id IS NOT NULL;
CREATE INDEX idx_knowledge_nodes_client ON knowledge_nodes(client_id)
  WHERE client_id IS NOT NULL;
CREATE INDEX idx_knowledge_nodes_tags ON knowledge_nodes USING gin(tags);

-- Busca full-text em português
CREATE INDEX idx_knowledge_nodes_fts ON knowledge_nodes
  USING gin(to_tsvector('portuguese', title || ' ' || content));

ALTER TABLE knowledge_nodes ENABLE ROW LEVEL SECURITY;

-- Global: qualquer autenticado pode ler nós globais
CREATE POLICY "knowledge_global_read" ON knowledge_nodes FOR SELECT TO authenticated
  USING (professional_id IS NULL AND is_active = true AND deleted_at IS NULL);

-- Profissional: lê seus próprios nós
CREATE POLICY "knowledge_professional_read" ON knowledge_nodes FOR SELECT TO authenticated
  USING (professional_id = auth_professional_id() AND deleted_at IS NULL);

-- Cliente: lê nós do seu cliente (dentro da clínica)
CREATE POLICY "knowledge_client_read" ON knowledge_nodes FOR SELECT TO authenticated
  USING (professional_id = auth_professional_id()
     AND client_id IS NOT NULL
     AND deleted_at IS NULL);

-- Escrita: apenas service_role para nós globais; authenticated para seus próprios
CREATE POLICY "knowledge_professional_write" ON knowledge_nodes
  FOR INSERT TO authenticated
  WITH CHECK (professional_id = auth_professional_id());

CREATE POLICY "knowledge_professional_update" ON knowledge_nodes
  FOR UPDATE TO authenticated
  USING (professional_id = auth_professional_id())
  WITH CHECK (professional_id = auth_professional_id());
```

#### knowledge_edges — arestas tipadas (relações entre nós)

```sql
CREATE TABLE knowledge_edges (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  from_node_id  uuid NOT NULL REFERENCES knowledge_nodes(id) ON DELETE CASCADE,
  to_node_id    uuid NOT NULL REFERENCES knowledge_nodes(id) ON DELETE CASCADE,
  edge_type     text NOT NULL
                CHECK (edge_type IN (
                  'supports',       -- A reforça B
                  'extends',        -- A é extensão/variante de B
                  'contradicts',    -- A contradiz B (para revisão)
                  'requires',       -- para aplicar A, precisa de B
                  'example_of',     -- A é exemplo concreto de B
                  'related_to',     -- associação semântica genérica
                  'opposite_of',    -- A é o oposto/alternativa a B
                  'worked_for',     -- A funcionou no contexto de B (client/professional node)
                  'failed_for'      -- A não funcionou no contexto de B
                )),
  weight        numeric(3,2) DEFAULT 1.0
                CHECK (weight BETWEEN 0.0 AND 1.0),  -- força da relação
  created_by    text DEFAULT 'agent'
                CHECK (created_by IN ('agent','manual','inferred','rlhf')),
  created_at    timestamptz DEFAULT now(),
  UNIQUE (from_node_id, to_node_id, edge_type)  -- sem duplicatas por tipo
);

CREATE INDEX idx_knowledge_edges_from ON knowledge_edges(from_node_id, edge_type);
CREATE INDEX idx_knowledge_edges_to ON knowledge_edges(to_node_id, edge_type);
-- Sem RLS — edges seguem a visibilidade dos nós
```

#### knowledge_sources — proveniência dos nós

```sql
CREATE TABLE knowledge_sources (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  professional_id uuid REFERENCES professionals(id) ON DELETE RESTRICT,
  -- NULL = fonte global da plataforma
  source_type   text NOT NULL
                CHECK (source_type IN (
                  'pdf_document',   -- PDF de curso, procedimento, manual
                  'web_article',    -- artigo da web
                  'youtube_video',  -- transcrição de vídeo
                  'conversation',   -- conversa do WhatsApp
                  'admin_manual',   -- criado manualmente pelo admin
                  'rlhf_session',   -- sessão de aprendizado por feedback
                  'cron_insight'    -- gerado por cron de análise
                )),
  name          text NOT NULL,        -- título do documento/fonte
  url           text,                 -- URL original (se aplicável)
  file_path     text,                 -- path no Storage do Supabase
  metadata      jsonb DEFAULT '{}',   -- {author, date, word_count, topics}
  nodes_created int DEFAULT 0,        -- quantos nós foram extraídos desta fonte
  ingested_at   timestamptz DEFAULT now(),
  ingested_by   text                  -- 'agent', 'admin', 'cron'
);

ALTER TABLE knowledge_sources ENABLE ROW LEVEL SECURITY;
CREATE POLICY "knowledge_sources_global_read" ON knowledge_sources
  FOR SELECT TO authenticated
  USING (professional_id IS NULL OR professional_id = auth_professional_id());
```

#### knowledge_node_versions — histórico de versões dos nós

```sql
CREATE TABLE knowledge_node_versions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  node_id         uuid NOT NULL REFERENCES knowledge_nodes(id) ON DELETE CASCADE,
  version_number  int NOT NULL,
  content         text NOT NULL,
  confidence      numeric(3,2),
  changed_by      text NOT NULL,    -- 'agent', 'admin', 'rlhf', 'cron'
  change_reason   text,             -- motivo da alteração
  changed_at      timestamptz DEFAULT now()
);

CREATE INDEX idx_knowledge_versions_node ON knowledge_node_versions(node_id, version_number DESC);

-- Imutável (log)
CREATE TRIGGER prevent_knowledge_versions_change
  BEFORE UPDATE OR DELETE ON knowledge_node_versions
  FOR EACH ROW EXECUTE FUNCTION fn_log_immutable();
```

#### knowledge_access_log — log de uso (aprende o que é útil)

```sql
CREATE TABLE knowledge_access_log (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  node_id         uuid NOT NULL REFERENCES knowledge_nodes(id) ON DELETE CASCADE,
  agent_slug      text NOT NULL,       -- 'rosane', 'nerissa', 'indicacao', etc.
  professional_id uuid REFERENCES professionals(id) ON DELETE RESTRICT,
  client_id       uuid REFERENCES clients(id),
  query_text      text,                -- o que o agente estava procurando
  similarity_score numeric(4,3),       -- cosine similarity da busca
  was_helpful     boolean,             -- feedback pós-uso (null = não coletado)
  feedback_note   text,
  accessed_at     timestamptz DEFAULT now()
);

CREATE INDEX idx_knowledge_access_node ON knowledge_access_log(node_id, accessed_at);
CREATE INDEX idx_knowledge_access_agent ON knowledge_access_log(agent_slug, was_helpful);

-- Imutável
CREATE TRIGGER prevent_knowledge_access_change
  BEFORE UPDATE OR DELETE ON knowledge_access_log
  FOR EACH ROW EXECUTE FUNCTION fn_log_immutable();

ALTER TABLE knowledge_access_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "knowledge_access_isolation" ON knowledge_access_log
  FOR SELECT TO authenticated
  USING (professional_id = auth_professional_id());
REVOKE INSERT, UPDATE, DELETE ON knowledge_access_log FROM authenticated;
```

---

### 19.2 Funções de Busca e Escrita no Knowledge Brain

#### search_knowledge — busca híbrida (vetorial + full-text + grafo)

```sql
CREATE OR REPLACE FUNCTION search_knowledge(
  p_query_text    text,
  p_query_embedding vector(1536),
  p_domain_slugs  text[]    DEFAULT NULL,  -- filtrar por domínio(s)
  p_node_types    text[]    DEFAULT NULL,  -- filtrar por tipo de nó
  p_professional_id uuid    DEFAULT NULL,  -- NULL = só global; UUID = global + da clínica
  p_client_id     uuid      DEFAULT NULL,  -- incluir nós do cliente
  p_limit         int       DEFAULT 10,
  p_similarity_threshold numeric DEFAULT 0.7
) RETURNS TABLE (
  node_id         uuid,
  title           text,
  content_summary text,
  node_type       text,
  domain_slug     text,
  similarity      numeric,
  confidence      numeric,
  tags            text[]
) LANGUAGE plpgsql STABLE SECURITY DEFINER AS $$
BEGIN
  RETURN QUERY
  WITH candidate_nodes AS (
    SELECT
      n.id,
      n.title,
      COALESCE(n.content_summary, left(n.content, 300)) AS content_summary,
      n.node_type,
      kd.slug AS domain_slug,
      1 - (n.embedding <=> p_query_embedding) AS vec_similarity,
      ts_rank(to_tsvector('portuguese', n.title || ' ' || n.content),
              plainto_tsquery('portuguese', p_query_text)) AS text_rank,
      n.confidence,
      n.tags,
      n.helpful_count::numeric / GREATEST(n.access_count, 1) AS helpfulness,
      n.access_count
    FROM knowledge_nodes n
    JOIN knowledge_domains kd ON kd.id = n.domain_id
    WHERE n.is_active = true
      AND n.deleted_at IS NULL
      AND (n.expires_at IS NULL OR n.expires_at > now())
      AND (
        -- Nós globais
        n.professional_id IS NULL
        -- Nós do profissional autenticado (se p_professional_id fornecido)
        OR (p_professional_id IS NOT NULL AND n.professional_id = p_professional_id)
        -- Nós do cliente específico
        OR (p_client_id IS NOT NULL AND n.client_id = p_client_id)
      )
      AND (p_domain_slugs IS NULL OR kd.slug = ANY(p_domain_slugs))
      AND (p_node_types IS NULL OR n.node_type = ANY(p_node_types))
  )
  SELECT
    id AS node_id,
    title,
    content_summary,
    node_type,
    domain_slug,
    -- Score híbrido: 70% vetorial + 20% texto + 10% popularidade/utilidade
    ROUND((
      0.7 * vec_similarity +
      0.2 * LEAST(text_rank, 1.0) +
      0.1 * helpfulness
    )::numeric, 4) AS similarity,
    confidence,
    tags
  FROM candidate_nodes
  WHERE vec_similarity >= p_similarity_threshold
  ORDER BY similarity DESC, confidence DESC
  LIMIT p_limit;
END;
$$;
```

#### expand_knowledge_graph — expande vizinhos relevantes do grafo

```sql
CREATE OR REPLACE FUNCTION expand_knowledge_graph(
  p_node_ids      uuid[],
  p_edge_types    text[] DEFAULT ARRAY['supports','extends','example_of','worked_for'],
  p_max_hops      int    DEFAULT 2,
  p_max_nodes     int    DEFAULT 20
) RETURNS TABLE (
  node_id   uuid,
  title     text,
  node_type text,
  depth     int,
  edge_type text
) LANGUAGE plpgsql STABLE SECURITY DEFINER AS $$
BEGIN
  RETURN QUERY
  WITH RECURSIVE graph_walk AS (
    -- Nível 0: nós iniciais
    SELECT kn.id, kn.title, kn.node_type, 0 AS depth, NULL::text AS edge_type
    FROM knowledge_nodes kn
    WHERE kn.id = ANY(p_node_ids) AND kn.is_active = true

    UNION ALL

    -- Expansão pelos vizinhos
    SELECT kn.id, kn.title, kn.node_type, gw.depth + 1, ke.edge_type
    FROM graph_walk gw
    JOIN knowledge_edges ke ON ke.from_node_id = gw.node_id
      AND ke.edge_type = ANY(p_edge_types)
    JOIN knowledge_nodes kn ON kn.id = ke.to_node_id
      AND kn.is_active = true
      AND kn.deleted_at IS NULL
    WHERE gw.depth < p_max_hops
  )
  SELECT DISTINCT ON (node_id) node_id, title, node_type, depth, edge_type
  FROM graph_walk
  ORDER BY node_id, depth
  LIMIT p_max_nodes;
END;
$$;
```

#### upsert_knowledge_node — agentes escrevem/atualizam conhecimento

```sql
CREATE OR REPLACE FUNCTION upsert_knowledge_node(
  p_title           text,
  p_content         text,
  p_node_type       text,
  p_domain_slug     text,
  p_embedding       vector(1536),
  p_tags            text[]    DEFAULT '{}',
  p_professional_id uuid      DEFAULT NULL,
  p_client_id       uuid      DEFAULT NULL,
  p_source_type     text      DEFAULT 'agent_learned',
  p_confidence      numeric   DEFAULT 0.5,
  p_evidence_count  int       DEFAULT 1
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_domain_id uuid;
  v_node_id   uuid;
  v_existing_id uuid;
BEGIN
  SELECT id INTO v_domain_id FROM knowledge_domains WHERE slug = p_domain_slug;
  IF v_domain_id IS NULL THEN
    RAISE EXCEPTION 'Domain not found: %', p_domain_slug;
  END IF;

  -- Verificar se já existe nó similar (cosine similarity > 0.95 = provável duplicata)
  SELECT id INTO v_existing_id
  FROM knowledge_nodes
  WHERE domain_id = v_domain_id
    AND (professional_id IS NOT DISTINCT FROM p_professional_id)
    AND (client_id IS NOT DISTINCT FROM p_client_id)
    AND embedding <=> p_embedding < 0.05  -- similarity > 0.95
    AND is_active = true
    AND deleted_at IS NULL
  LIMIT 1;

  IF v_existing_id IS NOT NULL THEN
    -- Atualizar: incrementar evidência e mesclar conteúdo se diferente
    INSERT INTO knowledge_node_versions (node_id, version_number, content, confidence, changed_by)
    SELECT id, (SELECT COALESCE(MAX(version_number), 0) + 1
                FROM knowledge_node_versions WHERE node_id = v_existing_id),
           content, confidence, p_source_type
    FROM knowledge_nodes WHERE id = v_existing_id;

    UPDATE knowledge_nodes SET
      evidence_count = evidence_count + p_evidence_count,
      confidence     = LEAST((confidence * evidence_count + p_confidence * p_evidence_count)
                           / (evidence_count + p_evidence_count), 1.0),
      tags           = ARRAY(SELECT DISTINCT unnest(tags || p_tags)),
      updated_at     = now()
    WHERE id = v_existing_id;

    RETURN v_existing_id;
  ELSE
    -- Criar novo nó
    INSERT INTO knowledge_nodes (
      domain_id, professional_id, client_id,
      title, content, content_summary, tags,
      node_type, embedding, confidence, evidence_count,
      source_type
    ) VALUES (
      v_domain_id, p_professional_id, p_client_id,
      p_title, p_content, left(p_content, 300), p_tags,
      p_node_type, p_embedding, p_confidence, p_evidence_count,
      p_source_type
    ) RETURNING id INTO v_node_id;

    RETURN v_node_id;
  END IF;
END;
$$;
```

---

### 19.3 Como os Agentes Consomem o Knowledge Brain

#### Rosane — atendimento ao cliente

```
ROSANE recebe mensagem do cliente
  ↓
1. Gera embedding da mensagem + contexto da conversa
2. Chama search_knowledge(
     query_embedding,
     domains: ['sales', 'objections', 'client_preferences', 'copy'],
     professional_id: professional.id,
     client_id: client.id  -- preferências específicas do cliente
   )
3. Chama expand_knowledge_graph(node_ids, edge_types: ['extends','example_of'])
4. Injeta top-5 nós no system prompt como "Conhecimento relevante"
5. Gera resposta
  ↓
PÓS-RESPOSTA (async, não bloqueia):
  - Se profissional editou → rlhf_diff vira novo nó (node_type='technique')
  - Se cliente respondeu positivamente → marca nó como was_helpful=true
  - Se novo padrão detectado → cria nó no domínio 'client_preferences'
```

#### Nerissa — setup de novos profissionais

```
NERISSA no setup de um novo profissional
  ↓
1. Busca conhecimento global sobre o tipo de clínica (profession_type)
2. Recupera templates de mensagem validados (node_type='template')
3. Recupera procedimentos mais comuns para a especialidade
4. Recupera padrões de objeção mais frequentes no nicho
5. Usa para configurar os agentes iniciais da clínica
  ↓
APÓS 30 DIAS:
  - Analisa interações da clínica
  - Cria nós professional-level com preferências descobertas
  - Ajusta pesos dos nós globais com base no que funcionou para este profissional
```

#### Crons do Knowledge Brain

```
insight-analyzer-daily (0 4 * * *)
  → Analisa interações das últimas 24h
  → Identifica padrões (3+ ocorrências do mesmo tipo)
  → Propõe novos nós para revisão ou cria diretamente (confiança > 0.8)

knowledge-consolidation-weekly (0 3 * * 0)
  → Mescla nós com similarity > 0.90 (duplicatas semânticas)
  → Atualiza confidence de nós com base em helpful_count / access_count
  → Marca como is_active=false nós com confidence < 0.2 e evidence_count < 2
  → Identifica lacunas no grafo (nós com 0 arestas = "ilha de conhecimento")

knowledge-ingestion-trigger (HTTP, on-demand)
  → Aceita PDF/texto de admin
  → Extrai chunks, gera embeddings
  → Chama upsert_knowledge_node para cada chunk
  → Cria arestas entre chunks do mesmo documento
```

---

## 20. API de Parceiros — REST Versionada + Webhooks

_Definido em 2026-06-04. Para empresas que integram com a plataforma como consumidoras da API._

### Distinção crítica

| Tabela | Quem usa | Para quê |
|---|---|---|
| `professional_api_keys` (Seção 18.7) | Profissional | Conectar ferramentas externas à clínica (Zapier, Google Calendar) |
| `partner_api_keys` (esta seção) | Empresa parceira | Consumir a API da plataforma como produto (ERPs, marketplaces) |

### 20.1 Tabelas da API de Parceiros

#### partner_organizations — empresas parceiras cadastradas

```sql
CREATE TABLE partner_organizations (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name            text NOT NULL,
  slug            text UNIQUE NOT NULL,       -- identificador único
  website         text,
  contact_email   text NOT NULL,
  contact_name    text,
  status          text DEFAULT 'pending'
                  CHECK (status IN ('pending','active','suspended','rejected')),
  tier            text DEFAULT 'standard'
                  CHECK (tier IN ('standard','preferred','enterprise')),
  -- standard: 60 req/min | preferred: 300 req/min | enterprise: custom
  rate_limit_per_minute int DEFAULT 60,
  allowed_scopes  text[] DEFAULT '{}',        -- scopes liberados para este parceiro
  approved_at     timestamptz,
  approved_by     uuid REFERENCES master_admins(id),
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now()
);

-- Admin only
REVOKE ALL ON partner_organizations FROM authenticated;
```

#### partner_api_keys — chaves de acesso dos parceiros

```sql
CREATE TABLE partner_api_keys (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id      uuid NOT NULL REFERENCES partner_organizations(id),
  name            text NOT NULL,              -- 'Produção', 'Staging', 'Teste'
  key_prefix      text NOT NULL,              -- primeiros 8 chars (para identificar sem expor)
  key_hash        text NOT NULL UNIQUE,       -- bcrypt/sha256 da chave completa
  scopes          text[] DEFAULT '{}',        -- subset de allowed_scopes do parceiro
  -- Scopes disponíveis:
  -- 'read:clients'         'write:clients'
  -- 'read:appointments'    'write:appointments'
  -- 'read:sessions'        'write:sessions'
  -- 'read:financial'       'write:financial'
  -- 'webhooks:subscribe'   'webhooks:manage'
  rate_limit_per_minute int DEFAULT 60,
  last_used_at    timestamptz,
  last_used_ip    inet,
  expires_at      timestamptz,
  is_active       boolean DEFAULT true,
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now()
);

CREATE INDEX idx_partner_api_keys_partner ON partner_api_keys(partner_id, is_active);
REVOKE ALL ON partner_api_keys FROM authenticated;
```

#### partner_webhooks — endpoints registrados pelos parceiros

```sql
CREATE TABLE partner_webhooks (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id      uuid NOT NULL REFERENCES partner_organizations(id),
  url             text NOT NULL,              -- endpoint HTTPS do parceiro
  secret_hash     text NOT NULL,             -- hash do secret para assinatura HMAC
  events          text[] DEFAULT '{}',        -- eventos subscritos
  -- Eventos disponíveis:
  -- 'appointment.created'    'appointment.cancelled'    'appointment.confirmed'
  -- 'session.created'        'session.completed'
  -- 'payment.received'       'payment.refunded'
  -- 'client.created'         'client.updated'
  -- 'professional.updated'
  is_active       boolean DEFAULT true,
  retry_count     int DEFAULT 3,
  timeout_seconds int DEFAULT 10,
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now()
);

CREATE INDEX idx_partner_webhooks_partner ON partner_webhooks(partner_id, is_active);
REVOKE ALL ON partner_webhooks FROM authenticated;
```

#### partner_webhook_deliveries — log de entregas com retry

```sql
CREATE TABLE partner_webhook_deliveries (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  webhook_id      uuid NOT NULL REFERENCES partner_webhooks(id),
  event_type      text NOT NULL,
  event_id        text NOT NULL,              -- ID único do evento (idempotência)
  payload         jsonb NOT NULL,
  response_status int,
  response_body   text,
  attempt_count   int DEFAULT 0,
  delivered_at    timestamptz,
  next_retry_at   timestamptz,
  status          text DEFAULT 'pending'
                  CHECK (status IN ('pending','delivered','failed','dead_letter')),
  created_at      timestamptz DEFAULT now()
);

CREATE INDEX idx_webhook_deliveries_webhook ON partner_webhook_deliveries(webhook_id, status);
CREATE INDEX idx_webhook_deliveries_retry ON partner_webhook_deliveries(next_retry_at)
  WHERE status = 'pending';
CREATE UNIQUE INDEX idx_webhook_deliveries_idempotency
  ON partner_webhook_deliveries(webhook_id, event_id);

-- Imutável (log de auditoria)
CREATE TRIGGER prevent_webhook_deliveries_change
  BEFORE UPDATE OR DELETE ON partner_webhook_deliveries
  FOR EACH ROW EXECUTE FUNCTION fn_log_immutable();

REVOKE ALL ON partner_webhook_deliveries FROM authenticated;
```

#### api_rate_limit_buckets — token bucket para rate limiting

```sql
CREATE TABLE api_rate_limit_buckets (
  key               text PRIMARY KEY,
  -- 'partner_{partner_id}' | 'key_{api_key_id}' | 'professional_{professional_id}'
  tokens_remaining  int NOT NULL,
  window_start      timestamptz NOT NULL DEFAULT now(),
  last_request_at   timestamptz DEFAULT now()
);

-- Sem RLS — gerenciado apenas por Edge Functions de gateway
REVOKE ALL ON api_rate_limit_buckets FROM authenticated;
```

#### api_request_logs — log de requests da API de parceiros

```sql
CREATE TABLE api_request_logs (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id      uuid NOT NULL REFERENCES partner_organizations(id),
  api_key_id      uuid REFERENCES partner_api_keys(id),
  professional_id uuid REFERENCES professionals(id) ON DELETE RESTRICT,
  method          text NOT NULL,              -- GET, POST, PUT, DELETE
  endpoint        text NOT NULL,              -- /v1/clients, /v1/appointments, etc.
  status_code     int,
  request_ms      int,                        -- tempo de resposta em ms
  ip_address      inet,
  user_agent      text,
  requested_at    timestamptz DEFAULT now()
);

CREATE INDEX idx_api_request_logs_partner ON api_request_logs(partner_id, requested_at);
CREATE INDEX idx_api_request_logs_professional ON api_request_logs(professional_id, requested_at);

-- Imutável (log de segurança)
CREATE TRIGGER prevent_api_logs_change
  BEFORE UPDATE OR DELETE ON api_request_logs
  FOR EACH ROW EXECUTE FUNCTION fn_log_immutable();

REVOKE ALL ON api_request_logs FROM authenticated;
```

---

### 20.2 Endpoints REST — v1

Base URL: `https://api.iaprafaturar.com/v1`

Autenticação: `Authorization: Bearer {api_key}`

O profissional-alvo é identificado pela chave da API (cada chave pertence a uma parceria que já foi configurada para um profissional específico ou para vários profissionais autorizados).

#### Clientes

```
GET    /v1/clients
  Query: ?journey_stage=em_tratamento&limit=50&offset=0
  Response: { data: [ClientRecord], total: int, next_cursor: string }
  Scopes: read:clients

GET    /v1/clients/:id
  Response: { data: ClientRecord }
  Scopes: read:clients

POST   /v1/clients
  Body: { full_name, phone_whatsapp, email? }
  Response: { data: { id, created: true } }
  Scopes: write:clients

PATCH  /v1/clients/:id
  Body: campos permitidos (não inclui professional_id, journey_stage via endpoint dedicado)
  Scopes: write:clients

POST   /v1/clients/:id/stage
  Body: { journey_stage: "em_tratamento" }
  Scopes: write:clients
```

#### Agendamentos

```
GET    /v1/appointments
  Query: ?date_from=2026-06-01&date_to=2026-06-30&status=confirmado
  Scopes: read:appointments

GET    /v1/appointments/:id
  Scopes: read:appointments

POST   /v1/appointments
  Body: { client_id, service_id, scheduled_at, duration_minutes? }
  Response: { data: { id, confirmation_token } }
  Scopes: write:appointments

PATCH  /v1/appointments/:id/status
  Body: { status: "cancelado", reason? }
  Scopes: write:appointments
```

#### Sessões

```
GET    /v1/sessions
  Query: ?client_id=uuid&from=2026-01-01
  Scopes: read:sessions

GET    /v1/sessions/:id
  Scopes: read:sessions

POST   /v1/sessions
  Body: { client_id, service_id, session_value, clinical_evolution?, procedures_performed? }
  Scopes: write:sessions
```

#### Financeiro

```
GET    /v1/financial/transactions
  Query: ?status=paid&from=2026-06-01
  Scopes: read:financial

POST   /v1/financial/transactions
  Body: { client_id, amount, type, payment_method, description? }
  Scopes: write:financial
```

#### Webhooks (gerenciados pelo parceiro via API)

```
GET    /v1/webhooks
  Lista webhooks registrados pelo parceiro
  Scopes: webhooks:subscribe

POST   /v1/webhooks
  Body: { url, events: ["appointment.created", "session.completed"], secret }
  Scopes: webhooks:subscribe

DELETE /v1/webhooks/:id
  Scopes: webhooks:manage

GET    /v1/webhooks/:id/deliveries
  Lista entregas recentes (últimas 100)
  Scopes: webhooks:manage

POST   /v1/webhooks/:id/deliveries/:delivery_id/retry
  Força retry manual de uma entrega falha
  Scopes: webhooks:manage
```

#### Utilitários

```
GET    /v1/me
  Dados do profissional autenticado pela chave
  Scopes: (nenhum especial — toda chave tem acesso)

GET    /v1/health
  Status da API (sem auth)
  Response: { status: "ok", version: "1.0.0", latency_ms: int }
```

---

### 20.3 Formato de Webhook Delivery

```json
POST https://parceiro.com/seu-endpoint
Headers:
  Content-Type: application/json
  X-Iaprafaturar-Event: appointment.created
  X-Iaprafaturar-Delivery: {delivery_id}
  X-Iaprafaturar-Signature: sha256={hmac_hex}
  X-Iaprafaturar-Timestamp: 1748985600

Body:
{
  "event": "appointment.created",
  "event_id": "evt_abc123",
  "professional_id": "uuid",
  "created_at": "2026-06-04T10:00:00Z",
  "data": {
    "appointment": {
      "id": "uuid",
      "client_id": "uuid",
      "service_id": "uuid",
      "scheduled_at": "2026-06-10T14:00:00Z",
      "status": "confirmado"
    }
  }
}
```

**Verificação HMAC (responsabilidade do parceiro):**
```python
import hmac, hashlib
signature = hmac.new(secret.encode(), payload_bytes, hashlib.sha256).hexdigest()
expected = f"sha256={signature}"
assert expected == request.headers['X-Iaprafaturar-Signature']
```

---

### 20.4 Política de Retry de Webhooks

```
Tentativa 1: imediata (t+0)
Tentativa 2: t+60s
Tentativa 3: t+300s (5 min)
Falha final → status = 'dead_letter' → notifica admin do parceiro via email
Sucesso = qualquer HTTP 2xx
Timeout = 10 segundos por tentativa
```

```sql
-- Cron de retry (a cada 5 minutos)
-- Adicionar à Seção 8 do EXECUTION-PRD.md:
-- partner-webhook-retry (*/5 * * * *)
-- Busca deliveries WHERE status='pending' AND next_retry_at <= now()
-- Reentrega e atualiza attempt_count e next_retry_at
```

---

### 20.5 Resumo de Tabelas Novas

| Tabela | Linhas esperadas | Propósito |
|---|---|---|
| `knowledge_domains` | ~20 (global) | Namespaces do grafo |
| `knowledge_nodes` | 10k–1M+ | Nós de conhecimento + embeddings |
| `knowledge_edges` | 50k–5M+ | Relações entre nós |
| `knowledge_sources` | 100–10k | Proveniência dos nós |
| `knowledge_node_versions` | 50k+ | Histórico de alterações |
| `knowledge_access_log` | 1M+/mês | Qual conhecimento foi útil |
| `partner_organizations` | 10–500 | Empresas parceiras |
| `partner_api_keys` | 20–2k | Chaves de acesso |
| `partner_webhooks` | 50–5k | Endpoints de webhook |
| `partner_webhook_deliveries` | 1M+/mês | Log de entregas |
| `api_rate_limit_buckets` | ~= parceiros ativos | Token bucket (redis-like) |
| `api_request_logs` | 10M+/mês | Auditoria de uso da API |

> `knowledge_nodes` com embedding vector(1536) ≈ 6KB/nó. Para 100k nós = ~600MB.
> Usar pgvector HNSW index (já no DDL) — busca em ~10ms para até 1M nós.
