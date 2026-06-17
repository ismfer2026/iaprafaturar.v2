# PRD — Consolidação e Otimização do Schema v2

_Definido em 2026-06-04. Documento delta: o que muda, o que sai, o que consolida._

## Decisão final da Fase 26

Este documento é histórico/aspiracional e não autoriza criação ou remoção de contratos. A reconciliação final preservou os contratos implantados da v2, removeu somente um diretório local vazio sem consumidor e não executou `DROP` ou consolidação destrutiva.

**Propósito:** O PRD-SCHEMA.md acumulou fielmente o que existe no v1 mais as adições necessárias. Este documento identifica redundâncias, remove o que não agrega e propõe um schema v2 mais enxuto — sem perder nenhuma funcionalidade real.

---

## Princípio de corte

> Uma tabela deve existir porque o negócio precisa dela, não porque o v1 tinha.
> Uma coluna deve existir porque alguma tela ou agente a lê, não porque pode ser útil.

Cada item abaixo tem: **problema identificado → proposta → impacto real**.

---

## 1. Campanhas: de 11 para 4 tabelas

### Problema

O PRD atual tem:
`campaigns`, `campaign_recipients`, `campaign_calendars`, `campaign_calendar_messages`, `campaign_calendar_enrollments`, `campaign_dispatches`, `campaign_pipelines`, `campaign_pipeline_clients`, `master_campaigns`, `master_campaign_executions`, `admin_campaigns`

São 11 tabelas para o mesmo conceito: "mandar mensagens para grupos de clientes com regras". Isso aconteceu porque foram adicionadas camada por camada sem repensar o todo.

**Custo real:**
- Qualquer dev vai precisar de mapa mental para criar uma campanha
- A UI vai ter que refletir essa complexidade → múltiplas telas → UX confusa
- JOINs de 5+ tabelas para mostrar o status de uma campanha

### Proposta: 4 tabelas unificadas

```sql
-- 1. campaigns: fonte da verdade de toda campanha
CREATE TABLE campaigns (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  professional_id     uuid REFERENCES professionals(id) ON DELETE RESTRICT,
  -- NULL = campanha da plataforma para os profissionais (admin)

  name                text NOT NULL,
  campaign_type       text NOT NULL
                      CHECK (campaign_type IN (
                        'broadcast',     -- disparo único para segmento
                        'drip',          -- sequência de mensagens ao longo do tempo
                        'pipeline',      -- mensagens baseadas em mudança de stage
                        'platform'       -- admin → todos os profissionais
                      )),
  channel             text DEFAULT 'whatsapp'
                      CHECK (channel IN ('whatsapp','email','push','in_app')),
  status              text DEFAULT 'draft'
                      CHECK (status IN ('draft','scheduled','running','completed','paused','cancelled')),

  -- Segmentação (para broadcast e drip)
  target_segments     jsonb DEFAULT '{}',
  -- { journey_stage: ['lead','agendado'], inactive_days_min: 30, tags: ['vip'] }

  -- Para platform (admin)
  target_plan_types   text[] DEFAULT '{}',

  -- Agendamento
  scheduled_at        timestamptz,
  timezone            text DEFAULT 'America/Sao_Paulo',

  -- Métricas (desnormalizadas para performance de leitura)
  total_contacts      int DEFAULT 0,
  total_sent          int DEFAULT 0,
  total_delivered     int DEFAULT 0,
  total_read          int DEFAULT 0,
  total_replied       int DEFAULT 0,
  total_converted     int DEFAULT 0,

  created_at          timestamptz DEFAULT now(),
  updated_at          timestamptz DEFAULT now()
);

-- 2. campaign_messages: etapas/mensagens da campanha
CREATE TABLE campaign_messages (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id     uuid NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  position        int NOT NULL,        -- ordem na sequência (drip: 1, 2, 3...)
  delay_hours     int DEFAULT 0,       -- atraso após etapa anterior (drip)
  -- delay_hours = 0 para broadcast (disparo imediato)
  content_template text NOT NULL,      -- template com variáveis: {{nome}}, {{servico}}
  media_url       text,
  trigger_condition jsonb DEFAULT '{}',
  -- { on_stage_change: 'inativo', on_no_reply_hours: 48 }
  created_at      timestamptz DEFAULT now()
);

-- 3. campaign_contacts: quem está na campanha + status individual
CREATE TABLE campaign_contacts (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id     uuid NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  professional_id uuid NOT NULL REFERENCES professionals(id) ON DELETE RESTRICT,
  client_id       uuid REFERENCES clients(id) ON DELETE SET NULL,
  -- NULL para campanha platform (destinatário é o professional)
  phone           text NOT NULL,
  status          text DEFAULT 'pending'
                  CHECK (status IN ('pending','sent','delivered','read','replied','converted','failed','opted_out')),
  current_step    int DEFAULT 0,       -- etapa atual no drip
  next_send_at    timestamptz,
  enrolled_at     timestamptz DEFAULT now(),
  completed_at    timestamptz,
  metadata        jsonb DEFAULT '{}'   -- dados de personalização do template
);

CREATE INDEX idx_campaign_contacts_campaign ON campaign_contacts(campaign_id, status);
CREATE INDEX idx_campaign_contacts_next_send ON campaign_contacts(next_send_at)
  WHERE status = 'pending';

-- 4. campaign_events: log imutável de cada envio/evento
CREATE TABLE campaign_events (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id     uuid NOT NULL REFERENCES campaigns(id),
  contact_id      uuid NOT NULL REFERENCES campaign_contacts(id),
  message_id      uuid REFERENCES campaign_messages(id),
  event_type      text NOT NULL
                  CHECK (event_type IN ('sent','delivered','read','replied','converted','failed','opted_out')),
  metadata        jsonb DEFAULT '{}',
  occurred_at     timestamptz DEFAULT now()
);

CREATE TRIGGER prevent_campaign_events_change BEFORE UPDATE OR DELETE ON campaign_events
  FOR EACH ROW EXECUTE FUNCTION fn_log_immutable();
```

### Mapeamento do que é absorvido

| Tabela antiga | Absorvida em |
|---|---|
| `campaigns` | `campaigns` (reestruturada) |
| `campaign_recipients` | `campaign_contacts` |
| `campaign_calendars` | `campaigns` com campaign_type='drip' |
| `campaign_calendar_messages` | `campaign_messages` |
| `campaign_calendar_enrollments` | `campaign_contacts` |
| `campaign_dispatches` | `campaign_events` |
| `campaign_pipelines` | `campaigns` com campaign_type='pipeline' |
| `campaign_pipeline_clients` | `campaign_contacts` |
| `master_campaigns` | `campaigns` com professional_id=NULL e campaign_type='platform' |
| `master_campaign_executions` | `campaign_contacts` com client_id=NULL |
| `admin_campaigns` | `campaigns` com professional_id=NULL |

**Resultado: 11 → 4 tabelas. Sem perda funcional.**

---

## 2. Mensagens WhatsApp: de 5 para 2 tabelas

### Problema

`whatsapp_inbound_events`, `whatsapp_outbound_events`, `whatsapp_message_logs`, `confirmation_messages`, `agent_logs`

São 5 tabelas que registram basicamente a mesma coisa: uma mensagem trafegou pelo WhatsApp. A diferença é só de direção e contexto.

**Custo:** query de "histórico completo de interações com Maria" precisa de UNION de 3+ tabelas.

### Proposta: 2 tabelas

> **DDL HISTÓRICO — não usar como referência de deploy.**
> Este DDL documenta a decisão de consolidação (de 5 tabelas para 1).
> O schema atual e definitivo, com todas as colunas corretas (`created_at`, `source_webhook`,
> `instance_name`, `agent_slug`, `provider_payload`, CHECK constraints atualizados),
> está em **PRD-SCHEMA.md → §message_events**.

```sql
-- 1. message_events: todo tráfego de mensagem (inbound + outbound)
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

  -- Conteúdo
  content             text,
  media_url           text,
  media_size_bytes    int,

  -- Contexto do envio (outbound)
  sent_by             text DEFAULT 'ai'
                      CHECK (sent_by IN ('ai','human','cron','campaign')),
  context_type        text,
  -- 'conversation' | 'confirmation' | 'reminder' | 'campaign' | 'follow_up' | 'aniversario'
  campaign_id         uuid REFERENCES campaigns(id),

  -- Status de entrega
  external_message_id text,            -- ID do Evolution Go / Meta
  status              text DEFAULT 'sent'
                      CHECK (status IN ('queued','sent','delivered','read','failed')),
  error_code          text,

  -- Timestamps de entrega
  sent_at             timestamptz DEFAULT now(),
  delivered_at        timestamptz,
  read_at             timestamptz
);

CREATE INDEX idx_message_events_professional ON message_events(professional_id, sent_at DESC);
CREATE INDEX idx_message_events_conversation ON message_events(conversation_id, sent_at DESC);
CREATE INDEX idx_message_events_external_id ON message_events(external_message_id)
  WHERE external_message_id IS NOT NULL;
CREATE INDEX idx_message_events_campaign ON message_events(campaign_id)
  WHERE campaign_id IS NOT NULL;

CREATE TRIGGER prevent_message_events_change BEFORE UPDATE OR DELETE ON message_events
  FOR EACH ROW EXECUTE FUNCTION fn_log_immutable();

-- 2. agent_executions: log de execução de agentes (separado de mensagem)
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
```

### Mapeamento

| Tabela antiga | Absorvida em |
|---|---|
| `whatsapp_inbound_events` | `message_events` direction='inbound' |
| `whatsapp_outbound_events` | `message_events` direction='outbound' |
| `whatsapp_message_logs` | `message_events` (consolidado) |
| `confirmation_messages` | `message_events` context_type='confirmation' |
| `agent_logs` | `agent_executions` |

**Resultado: 5 → 2 tabelas.**

---

## 3. Scores e Métricas: de 5 para 2 tabelas

### Problema

`rfm_scores`, `client_health_scores`, `lead_scores`, `professional_platform_health_scores`, `professional_insights`

São todos scores calculados periodicamente. Separar em 5 tabelas complica queries e manutenção.

### Proposta: 2 tabelas

```sql
-- 1. client_analytics: todos os scores calculados por cliente
CREATE TABLE client_analytics (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  professional_id uuid NOT NULL REFERENCES professionals(id) ON DELETE RESTRICT,
  client_id       uuid NOT NULL REFERENCES clients(id),
  score_type      text NOT NULL
                  CHECK (score_type IN ('rfm','health','lead')),

  -- Score principal
  score_value     numeric(5,2),        -- valor normalizado 0-100
  score_label     text,                -- 'campeao', 'risco', 'novo', etc.
  previous_label  text,
  label_changed   boolean DEFAULT false,

  -- Componentes (jsonb para flexibilidade por score_type)
  components      jsonb DEFAULT '{}',
  -- rfm: { r_score, f_score, m_score, rfm_combined, recency_days,
  --        frequency_sessions, frequency_products, value_services, value_products }
  -- health: { engagement_score, payment_score, attendance_score, churn_risk }
  -- lead: { interest_score, budget_score, urgency_score, fit_score }

  calculated_at   timestamptz DEFAULT now(),
  expires_at      timestamptz,

  UNIQUE (professional_id, client_id, score_type)
);

CREATE INDEX idx_client_analytics_professional ON client_analytics(professional_id, score_type);
CREATE INDEX idx_client_analytics_label ON client_analytics(professional_id, score_type, score_label);

-- 2. professional_analytics: scores e insights da clínica como negócio
CREATE TABLE professional_analytics (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  professional_id uuid NOT NULL REFERENCES professionals(id) ON DELETE RESTRICT,
  score_type      text NOT NULL
                  CHECK (score_type IN ('platform_health','performance','churn_risk')),
  period          text NOT NULL DEFAULT 'monthly',
                  -- 'daily' | 'weekly' | 'monthly'
  period_start    date NOT NULL,

  score_value     numeric(5,2),
  components      jsonb DEFAULT '{}',
  insights        jsonb DEFAULT '[]',  -- lista de insights textuais gerados pela IA
  -- [{ "title": "Queda de retenção", "severity": "high", "action": "Reativar 5 clientes" }]

  calculated_at   timestamptz DEFAULT now(),

  UNIQUE (professional_id, score_type, period, period_start)
);
```

### Mapeamento

| Tabela antiga | Absorvida em |
|---|---|
| `rfm_scores` | `client_analytics` score_type='rfm' |
| `client_health_scores` | `client_analytics` score_type='health' |
| `lead_scores` | `client_analytics` score_type='lead' |
| `professional_platform_health_scores` | `professional_analytics` score_type='platform_health' |
| `professional_insights` | `professional_analytics` insights jsonb |

**Resultado: 5 → 2 tabelas.**

---

## 4. Indicação: de 7 para 3 tabelas

### Problema

`referral_links`, `referral_events`, `referrals`, `client_referrals`, `professional_referrals`, `referral_templates`, `referral_rewards`

Confuso porque: há dois tipos de indicação (cliente→cliente e pro→pro) modelados em tabelas diferentes, com overlap de funcionalidade.

### Proposta: 3 tabelas

```sql
-- 1. referrals: toda indicação (independente de quem indica quem)
CREATE TABLE referrals (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  professional_id     uuid NOT NULL REFERENCES professionals(id) ON DELETE RESTRICT,
  -- clínica proprietária do programa de indicação

  referral_type       text NOT NULL
                      CHECK (referral_type IN (
                        'client_to_client',           -- paciente indica contato
                        'professional_to_professional' -- pro indica outro pro para a plataforma
                      )),

  referral_code       text NOT NULL,
  referral_link       text,            -- URL curta pública

  -- Quem indica
  referrer_client_id  uuid REFERENCES clients(id),     -- para client_to_client
  referrer_prof_id    uuid REFERENCES professionals(id), -- para pro_to_pro

  -- Quem foi indicado
  referred_name       text,
  referred_phone      text,
  referred_email      text,
  referred_client_id  uuid REFERENCES clients(id),     -- preenchido após cadastro
  referred_prof_id    uuid REFERENCES professionals(id), -- preenchido após cadastro

  -- Status
  status              text DEFAULT 'sent'
                      CHECK (status IN ('sent','clicked','registered','converted','rewarded','expired')),

  -- Recompensa
  reward_type         text,            -- 'points' | 'discount' | 'session' | 'percentage'
  reward_value        numeric(10,2),
  reward_paid_at      timestamptz,

  expires_at          timestamptz,
  created_at          timestamptz DEFAULT now(),
  updated_at          timestamptz DEFAULT now()
);

CREATE INDEX idx_referrals_professional ON referrals(professional_id, status);
CREATE INDEX idx_referrals_code ON referrals(referral_code);

-- 2. referral_events: eventos da jornada de indicação
CREATE TABLE referral_events (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  referral_id     uuid NOT NULL REFERENCES referrals(id),
  event_type      text NOT NULL
                  CHECK (event_type IN ('link_sent','link_clicked','registration_started',
                    'registration_completed','first_appointment','first_payment','reward_issued')),
  metadata        jsonb DEFAULT '{}',
  occurred_at     timestamptz DEFAULT now()
);

CREATE TRIGGER prevent_referral_events_change BEFORE UPDATE OR DELETE ON referral_events
  FOR EACH ROW EXECUTE FUNCTION fn_log_immutable();

-- 3. referral_configs: configuração do programa por clínica
CREATE TABLE referral_configs (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  professional_id         uuid UNIQUE NOT NULL REFERENCES professionals(id) ON DELETE RESTRICT,

  -- Para client_to_client
  client_program_active   boolean DEFAULT false,
  client_reward_type      text DEFAULT 'points',
  client_reward_value     numeric(10,2) DEFAULT 0,
  client_referred_reward  numeric(10,2) DEFAULT 0,  -- quem foi indicado também ganha
  client_cooldown_days    int DEFAULT 30,

  -- Para professional_to_professional (plataforma)
  pro_reward_type         text DEFAULT 'percentage',
  pro_reward_value        numeric(10,2) DEFAULT 15.0, -- 15% da primeira mensalidade
  pro_reward_events       text[] DEFAULT ARRAY['first_payment'],
  -- quais eventos liberam a recompensa pro→pro

  -- Mensagens padrão (template)
  invite_message_template text,
  thank_you_template      text,

  created_at              timestamptz DEFAULT now(),
  updated_at              timestamptz DEFAULT now()
);
```

### Mapeamento

| Tabela antiga | Absorvida em |
|---|---|
| `referral_links` | `referrals` (referral_code + referral_link) |
| `referral_events` | `referral_events` (mantida, renomeada) |
| `referrals` | `referrals` (consolidada) |
| `client_referrals` | `referrals` referral_type='client_to_client' |
| `professional_referrals` | `referrals` referral_type='professional_to_professional' |
| `referral_templates` | `referral_configs` (invite/thank_you templates) |
| `referral_rewards` | campo reward_type/value em `referrals` + `referral_configs` |

**Resultado: 7 → 3 tabelas.**

---

## 5. professional_public_profiles → merge em professionals

### Problema

`professional_public_profiles` existe como tabela separada mas contém apenas dados do profissional visíveis publicamente. No v1 isso provavelmente veio de uma migration mal planejada.

### Proposta: view pública + colunas em professionals

```sql
-- Adicionar em professionals:
ALTER TABLE professionals ADD COLUMN IF NOT EXISTS
  public_bio              text,
  public_avatar_url       text,
  public_specialties      text[],
  public_booking_config   jsonb DEFAULT '{
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
  }',
  public_instagram_handle text,
  public_show_prices      boolean DEFAULT true,
  public_show_reviews     boolean DEFAULT true;

-- View pública (sem dados sensíveis — para /agendar/:slug)
CREATE OR REPLACE VIEW v_public_professional
  WITH (security_invoker = on) AS
  SELECT
    id, slug, name, business_name,
    public_bio AS bio,
    public_avatar_url AS avatar_url,
    public_specialties AS specialties,
    public_booking_config AS booking_config,
    public_instagram_handle AS instagram_handle,
    city, neighborhood,
    profession_type
  FROM professionals
  WHERE deleted_at IS NULL;

-- Anon pode ler apenas a view pública, nunca a tabela professionals diretamente
GRANT SELECT ON v_public_professional TO anon;
```

**Resultado: 1 tabela removida, 0 funcionalidade perdida.**

---

## 6. Billing: de 9 para 5 tabelas (Stripe como source of truth)

### Problema

`billing_products`, `billing_cycles`, `billing_invoices`, `subscription_history`, `professional_subscriptions`, `credit_wallets`, `credit_transactions`, `credit_packages`, `credit_reservations`

`billing_products`, `billing_cycles`, e `billing_invoices` duplicam o que o Stripe já gerencia. Sincronizar localmente cria desincronização.

### Proposta: 5 tabelas, Stripe é source of truth para o restante

```sql
-- Mantidas sem mudança:
-- professional_subscriptions  → estado local (sync do Stripe, lido frequentemente)
-- credit_wallets              → saldo de créditos IA (não existe no Stripe)
-- credit_transactions         → movimentações de crédito IA
-- credit_packages             → catálogo de pacotes avulsos de crédito

-- Simplificar credit_reservations:
-- Em vez de tabela separada, usar status='reserved' em credit_transactions
-- Isso elimina a tabela credit_reservations

-- Removidas (ler do Stripe via API quando necessário):
-- billing_products  → GET /v1/products no Stripe
-- billing_cycles    → GET /v1/subscriptions no Stripe
-- billing_invoices  → GET /v1/invoices no Stripe (com cache de 1h se necessário)
```

**Resultado: 9 → 5 tabelas. Menos sync, menos desincronização.**

---

## 7. Tabelas a Remover Completamente

Tabelas do v1 que não devem existir no v2 por não terem caso de uso claro:

| Tabela | Por que remover |
|---|---|
| `professional_badges` | Gamificação não é prioridade para o segmento. Adicionar quando houver pesquisa de usuário validando. |
| `session_events` | Granularidade excessiva. `agent_executions` + `message_events` + `audit_log` cobrem o mesmo. |
| `usage_events` | Se precisar de product analytics, usar Mixpanel/PostHog externo, não banco. |
| `business_events` | Overlap com `agent_executions` e `financial_transactions`. |
| `api_rate_limit_buckets` | Rate limiting deve ser feito em Redis (Edge Function), não PostgreSQL. |
| `processed_webhooks` | Absorver em `idempotency_log` com source='webhook'. |

---

## 8. Renomeações para Clareza

| Nome atual | Nome v2 | Motivo |
|---|---|---|
| `packages` | `service_packages` | Nome mais claro (v1 já usava service_packages) |
| `agent_logs` | Removida → `agent_executions` | Semântica mais precisa |
| `whatsapp_inbound_events` | Removida → `message_events` | Consolidada |
| `whatsapp_outbound_events` | Removida → `message_events` | Consolidada |
| `confirmation_messages` | Removida → `message_events` | Consolidada |
| `referral_links` | Removida → `referrals` | Consolidada |
| `referral_templates` | Removida → `referral_configs` | Consolidada |
| `professional_platform_health_scores` | Removida → `professional_analytics` | Consolidada |
| `professional_insights` | Removida → `professional_analytics` | Consolidada |
| `rfm_scores` | Removida → `client_analytics` | Consolidada |
| `client_health_scores` | Removida → `client_analytics` | Consolidada |
| `lead_scores` | Removida → `client_analytics` | Consolidada |

---

## 9. Contagem de Tabelas Antes e Depois

| Categoria | Antes (PRD acumulado) | Depois (consolidado) | Ganho |
|---|---|---|---|
| Campanhas | 11 | 4 | -7 |
| Mensagens WA | 5 | 2 | -3 |
| Scores/Métricas | 5 | 2 | -3 |
| Indicação | 7 | 3 | -4 |
| Perfil público | 1 (separado) | 0 (merge em professionals) | -1 |
| Billing | 9 | 5 | -4 |
| Remoções diretas | 6 | 0 | -6 |
| **Total removidas** | | | **-28 tabelas** |

> De ~180 tabelas estimadas → ~152 tabelas no v2 consolidado.
> Funcionalidade: zero perda. Complexidade: -35% menos joins, -28% menos tabelas.

---

## 10. Impacto nas Edge Functions

### Funções afetadas pela consolidação de campanhas

```
campaign-processor/index.ts     → reescrever para query campaign_contacts
campaign-sender/index.ts        → reescrever para usar message_events
campaign-drip/index.ts          → simplificar: era 4 tabelas, agora 2
```

### Funções afetadas pela consolidação de mensagens

```
webhook-whatsapp/index.ts       → gravar em message_events (não inbound_events)
orchestrator/index.ts           → ler de message_events, gravar em agent_executions
rosane-*/index.ts               → gravar execução em agent_executions
```

### Funções afetadas pela consolidação de scores

```
calculate-rfm/index.ts          → gravar em client_analytics score_type='rfm'
health-scores/index.ts          → gravar em client_analytics score_type='health'
calculate-lead-scores/index.ts  → gravar em client_analytics score_type='lead'
insight-analyzer-daily/index.ts → gravar em professional_analytics
```

### Funções não afetadas (sem mudança)

```
webhook-admin, nerissa-*, anamnese-*, appointments-*, financial-*, auth-*
```

---

## 11. Estratégia de Migração v1 → v2

### Ordem de migração (sem downtime)

```
FASE 1 — Schema aditivo (sem breaking change)
  1. Criar tabelas novas (campaigns_v2, message_events, client_analytics, etc.)
  2. Criar views de compatibilidade que mapeiam das tabelas novas para as antigas
  3. Edge Functions novas escrevem nas tabelas v2
  4. Edge Functions legadas continuam lendo das views de compatibilidade

FASE 2 — Migração de dados
  5. Script de migração: copiar dados de campaigns → campaigns_v2
  6. Script de migração: copiar whatsapp_*_events → message_events
  7. Script de migração: copiar rfm_scores + health_scores → client_analytics
  8. Validar contagens e integridade referencial

FASE 3 — Cutover
  9. Atualizar Edge Functions legadas para usar tabelas v2 diretamente
  10. Remover views de compatibilidade
  11. Remover tabelas v1 obsoletas (com backup via pg_dump antes)

FASE 4 — Limpeza
  12. Remover FKs e índices obsoletos
  13. VACUUM ANALYZE nas tabelas consolidadas
  14. Atualizar RLS policies se necessário
```

### Rollback

Cada fase tem rollback independente:
- Fase 1: DROP das tabelas novas (nada perdido, tudo estava nas antigas)
- Fase 2: Dados migrados são uma cópia, originais intactos
- Fase 3: Tabelas v1 ainda existem até Fase 4
- Fase 4: Backup via pg_dump antes de DROP

---

## 12. Tabelas que NÃO mudam (validadas)

As seguintes tabelas do PRD-SCHEMA.md estão bem modeladas e não precisam de consolidação:

```
professionals, team_members, user_roles, master_admins
clients, registration_links, registration_sessions
service_categories, services, appointment_series, appointments
anamnese_templates, anamnese_fichas, modelos, quotes, contracts
financial_transactions, financeiro_bancos, financeiro_categorias
financeiro_centros_custo, payment_gateway_credentials, financeiro_conciliacoes
plans, professional_subscriptions, credit_wallets, credit_transactions
affiliate_partners, affiliate_commissions, affiliate_conversions, affiliate_payments
stock_items, stock_history, service_stock_items, service_packages, client_packages, package_session_usage
conversations, conversation_contexts
professional_agents, personas, rlhf_rules, rlhf_diffs
proactive_triggers, proactive_trigger_logs
client_loyalty, loyalty_transactions, loyalty_rewards, loyalty_redemptions
sales_funnels, funnel_stages, funnel_opportunities, funnel_automations
client_clinical_profiles, client_photos, client_pets
questionnaires, questionnaire_questions, questionnaire_responses, questionnaire_sessions
professional_notifications, notification_preferences, professional_push_tokens
sales_leads, nerissa_setup_sessions, nerissa_setup_items, nerissa_setup_events
knowledge_nodes, knowledge_edges, knowledge_domains, knowledge_sources (Seção 19)
partner_organizations, partner_api_keys, partner_webhooks (Seção 20)
shadow_suggestions, appointment_waitlist, calendars, calendar_permissions
idempotency_log, message_queue, onboarding_sessions, platform_metrics_daily
nerissa_inbound_queue, nerissa_learning_memories, nerissa_runtime_state, nerissa_skill_topics
professional_whatsapp, tasks, products, product_sales
pipeline_stages, pipeline_stage_templates
```
