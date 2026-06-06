# EXECUTION-PRD v2 — iaprafaturar CRM

_Gerado colaborativamente em 2026-06-04. Cobre J1–J65._

---

## Índice

1. [Visão Geral](#1-visão-geral)
2. [Stack Tecnológica Completa](#2-stack-tecnológica-completa)
3. [Arquitetura do Monorepo](#3-arquitetura-do-monorepo)
4. [Fases de Implementação](#4-fases-de-implementação)
5. [Schema do Banco de Dados → PRD-SCHEMA.md](#5-schema)
6. [Edge Functions → PRD-EDGE-FUNCTIONS.md](#6-edge-functions)
7. [Frontend por App → PRD-FRONTEND.md](#7-frontend)
8. [Cron Jobs](#8-cron-jobs)
9. [Integrações Externas](#9-integrações-externas)
10. [Modelo de Segurança](#10-modelo-de-segurança)

---

## 1. Visão Geral

### Missão
CRM com IA para profissionais de saúde e beleza (fisioterapeutas, dentistas, nutricionistas, esteticistas, coaches, psicólogos). A plataforma substitui o WhatsApp manual por uma IA (Rosane) que atende, agenda, faz follow-up e vende — enquanto o profissional foca no atendimento.

### Apps do v2

| App | Usuário | URL |
|---|---|---|
| `apps/professional` | Profissional, gestor, operacional | `app.iaprafaturar.com` |
| `apps/client` | Pacientes/clientes | `{slug}.iaprafaturar.com` |
| `apps/admin` | Ismael e equipe interna | `admin.iaprafaturar.com` |

### Princípios arquiteturais invioláveis

1. **Tenancy absoluto**: todo dado de clínica fica isolado por `professional_id = auth_professional_id()`. Zero vazamento entre clínicas.
2. **Rosane é da clínica, Nerissa é da plataforma**: instâncias WhatsApp nunca se cruzam.
3. **IA disponível em todos os planos**: agentes que geram receita não são bloqueados por plano — diferenciação é por escala (número de clientes, equipe, canais).
4. **Dados financeiros nunca são deletados**: ON DELETE RESTRICT em todas as FKs financeiras. Compliance fiscal 5+ anos (exigência fiscal brasileira — PRD-MASTER seção 3.4).
5. **Offline-first no PWA do cliente**: cliente vê agenda e histórico mesmo sem internet.

---

## 2. Stack Tecnológica Completa

### Frontend (todos os apps)

| Tecnologia | Versão | Uso |
|---|---|---|
| React | 18.x | UI |
| TypeScript | 5.x | Tipagem |
| Vite | 6.x | Build + HMR |
| Tailwind CSS | 3.x | Estilos |
| shadcn/ui + Radix UI | latest | Componentes base |
| TanStack Query | v5 | Server state |
| react-router-dom | v7 | Roteamento |
| Zustand | 5.x | Client state (fluxos complexos) |
| React Hook Form + Zod | latest | Formulários + validação |
| vite-plugin-pwa | latest | Service worker + manifest |
| idb | 8.x | IndexedDB (offline) |
| date-fns | 3.x | Manipulação de datas |
| lucide-react | latest | Ícones |

### Backend

| Tecnologia | Uso |
|---|---|
| Supabase (PostgreSQL 15) | Banco principal, Auth, Storage, Realtime |
| Supabase Edge Functions (Deno) | Todos os workers e agentes |
| pg_cron | Jobs agendados no banco |
| Supabase Vault | Secrets (credenciais de gateway, tokens) |

### Mensageria e Cache

| Tecnologia | Uso |
|---|---|
| Upstash Redis | Debounce WhatsApp (4s), cache de roteamento, session locks |
| QStash (Upstash) | Fila de processamento de mensagens WhatsApp |

### IA / LLM

| Modelo | Slug | Uso |
|---|---|---|
| Claude Sonnet 4.6 | `claude-sonnet-4-6` | Rosane (conversas, agentes) |
| Claude Haiku 4.5 | `claude-haiku-4-5-20251001` | Classificação, respostas rápidas |
| Claude Opus 4.8 | `claude-opus-4-8` | Síntese de persona, análise profunda |
| text-embedding-ada-002 | OpenAI | Embeddings para RAG/memória |

Seleção por tarefa:
- Classificação de intenção → Haiku
- Resposta ao cliente → Sonnet
- Análise semanal de negócio → Opus
- Síntese de persona → Opus

### WhatsApp

| Tecnologia | Uso |
|---|---|
| Evolution Go | Único gateway WhatsApp. `POST /send/text` com `{id, number, text, delay}` |
| Webhook HMAC (profissional) | `PROFESSIONAL_EVOLUTION_WEBHOOK_SECRET` — valida inbound do canal da clínica |
| Webhook HMAC (admin) | `ADMIN_EVOLUTION_WEBHOOK_SECRET` — valida inbound do canal Nerissa/admin |

### Email

| Tecnologia | Uso |
|---|---|
| Resend | Envio de emails transacionais e interceptação de inbound |
| SMTP configurável | Email do profissional para respostas da Rosane |

### Pagamentos

| Gateway | Uso |
|---|---|
| Stripe | SaaS billing (planos, trial, créditos de IA) |
| Asaas | Cobranças operacionais da clínica (PIX, boleto, cartão) |
| Mercado Pago | Alternativa a Asaas |
| EfiBank | Alternativa regional |

### Push Notifications

| Tecnologia | Uso |
|---|---|
| Web Push API nativa | Push para profissional no CRM |
| OneSignal | Fallback e push mobile para profissional |
| Service Worker | Intercepta push offline |

### Storage

| Bucket | Visibilidade | Conteúdo |
|---|---|---|
| `client-photos` | Público | Fotos de perfil de clientes |
| `servico-imagens` | Público | Imagens de serviços, logos |
| `modelos-contratos` | Privado | Templates DOCX de contratos |
| `orcamentos-pdf` | Privado | PDFs de orçamentos gerados |
| `anamnese-assets` | Privado | Arquivos de anamnese |

### Documentos

| Tecnologia | Uso |
|---|---|
| docxtemplater | Geração de DOCX a partir de templates |
| pdf-lib ou puppeteer | PDF gerado a partir de HTML/DOCX |
| ClickSign / DocuSign | Assinatura digital de contratos e orçamentos |

---

## 3. Arquitetura do Monorepo

```
iaprafaturar-v2/
├── apps/
│   ├── professional/              # CRM do profissional
│   │   ├── src/
│   │   │   ├── pages/            # Todas as páginas do CRM
│   │   │   ├── components/       # Componentes específicos do CRM
│   │   │   ├── hooks/            # useQuery/useMutation por domínio
│   │   │   ├── contexts/         # AuthContext, NotificationContext
│   │   │   └── lib/              # supabase.ts, permissions.ts, offline-sync.ts
│   │   ├── public/
│   │   │   ├── manifest.json
│   │   │   └── sw-custom.js
│   │   └── vite.config.ts
│   │
│   ├── client/                    # PWA do cliente (multi-tenant)
│   │   ├── src/
│   │   │   ├── pages/
│   │   │   ├── components/
│   │   │   └── lib/              # supabase.ts (anon key), offline.ts
│   │   └── vite.config.ts
│   │
│   └── admin/                     # Painel Ismael
│       ├── src/
│       │   ├── pages/
│       │   ├── components/
│       │   └── lib/
│       └── vite.config.ts
│
├── packages/
│   ├── domain/                    # Tipos de domínio compartilhados entre apps
│   │   └── src/
│   │       ├── types/             # ClientRecord, AppointmentRecord, etc.
│   │       ├── schemas/           # Zod schemas de domínio
│   │       └── constants/
│   ├── contracts/                 # Contratos runtime de Edge Functions (Zod)
│   │   └── src/
│   │       ├── events/            # message-events.ts, whatsapp.ts
│   │       └── edge-functions/    # webhook-whatsapp.ts, send-message.ts, etc.
│   ├── shared/                    # Utilities compartilhados entre apps
│   │   └── src/
│   └── ui/                        # Componentes base reutilizáveis
│       └── src/
│           └── components/
│
└── supabase/
    ├── functions/                 # Edge Functions (Deno)
    │   ├── _shared/               # Helpers compartilhados
    │   └── {nome-da-function}/
    │       └── index.ts
    ├── migrations/                # SQL ordenadas por timestamp
    └── config.toml
```

### Convenções críticas

```typescript
// SEMPRE importar de @iaprafaturar/domain para tipos de domínio
import type { ClientRecord } from '@iaprafaturar/domain';

// SEMPRE importar de @iaprafaturar/contracts para contratos de Edge Functions
import type { SendMessageInput } from '@iaprafaturar/contracts/edge-functions/send-message';

// SEMPRE importar supabase do lib local do app
import { supabase } from '@/lib/supabase';

// SEMPRE usar professionalId do AuthContext como professional_id em queries
// NUNCA user.id (semântica ambígua) — NUNCA user.user_id (é authUserId, não professionals.id)
const { professionalId } = useAuth();
supabase.from('clients').select().eq('professional_id', professionalId);
```

---

## 4. Fases de Implementação

> A ordem de fases segue o PRD-MASTER seção 14. Em caso de conflito de sequência, o PRD-MASTER manda.
> Cada fase entrega algo utilizável — nenhuma fase é só infraestrutura para a próxima.

### FASE 0 — Fundação Técnica (Semanas 1–2)
**Objetivo**: monorepo rodando, auth funcionando, schema base.

Entregas:
- Monorepo configurado com npm workspaces + Turborepo
- `packages/domain` com tipos base (ClientRecord, AppointmentRecord, etc.)
- Supabase configurado (local + produção)
- Migration inicial: `professionals`, `team_members`, `user_roles`, `master_admins`, `idempotency_log`
- Funções SQL: `auth_professional_id()` STABLE SECURITY DEFINER, `handle_new_user` trigger, `set_updated_at()` trigger
- Auth pages no `apps/professional`: login, cadastro, recuperar-senha, reset-password
- Auth pages no `apps/admin`: login separado via `master_admins`
- Tailwind config com paleta (teal operacional, violet para IA, slate base)
- PWA manifest: `display: "standalone"`, `theme_color: "#7C3AED"`
- Bottom nav 5 áreas: Hoje | Agenda | Clientes | Financeiro | Mais
- ProtectedRoute + AuthContext (expõe `professionalId`, `authUserId`, `role`)

### FASE 1 — WhatsApp Dual-Channel + Admin Técnico Mínimo (Semanas 3–5)
**Objetivo**: Nerissa responde profissionais. Rosane recebe mensagens de clientes (mesmo que só diga "olá"). Admin monitora por logs e Supabase Dashboard.

> Admin técnico mínimo nesta fase = acesso a logs, status de instâncias e troubleshooting via Supabase Dashboard + webhook-admin funcional. Dashboard de MRR e analytics vem na FASE 9.

**Backend (1A — Canal Admin/Nerissa):**
- Tabelas: `nerissa_setup_sessions`, `nerissa_setup_items`, `nerissa_setup_events`
- Edge Functions: `webhook-admin`, `admin-message-processor`
- Roteamento mínimo: `ADMIN_MASTER_PHONES` → Nexus placeholder; profissional existente → setup/support placeholder; desconhecido → sales lead placeholder

**Backend (1B — Canal Profissional/Rosane):**
- Tabelas: `conversations`, `conversation_contexts`, `message_events`, `agent_executions`, `professional_agents`, `shadow_suggestions`, `qstash_job_log`
- Edge Functions: `webhook-whatsapp`, `message-processor`, `send-message`
- Rosane básica: placeholder em `DRY_RUN`

**Contracts runtime (`packages/contracts`):**
- `events/message-events.ts` — enums de actorType, direction, status, context_type
- `edge-functions/webhook-whatsapp.ts`, `webhook-admin.ts`, `message-processor.ts`
- `edge-functions/admin-message-processor.ts`, `send-message.ts`

**Shared helpers (`supabase/functions/_shared/`):**
- `hmac.ts`, `idempotency.ts`, `evolution-go.ts`, `qstash.ts`, `dry-run.ts`
- `message-events.ts`, `agent-executions.ts`, `internal-auth.ts`, `send-message-core.ts`

**Secrets necessários:**
- `PROFESSIONAL_EVOLUTION_WEBHOOK_SECRET`, `ADMIN_EVOLUTION_WEBHOOK_SECRET`
- `INTERNAL_FUNCTION_TOKEN`, `DRY_RUN=true`

**Tabelas proibidas (excluídas pelo schema-guard):** `whatsapp_inbound_events`, `whatsapp_outbound_events`, `whatsapp_message_logs`, `agent_logs`, `confirmation_messages`, `webhook_events`

### FASE 2 — Onboarding & Auth Completo (Semanas 6–7)
**Objetivo**: Profissional novo cria conta, configura Rosane via Nerissa, está pronto para atender.

Entregas:
- Fluxo completo de onboarding via Nerissa por WhatsApp — J33, J34
- `nerissa-setup-agent` completo com `nerissa_setup_sessions`, `nerissa_setup_items`
- Evolution Go: conectar instância do profissional via Nerissa
- `/cadastro` → cria `professionals` + `auth.users`
- `/onboarding` → configuração guiada (5 passos essenciais) — J1
- Configurações → grupo "Assistente (Rosane)" funcional
- Nerissa informa riscos do WhatsApp pessoal e oferece guia do Business (sem bloquear)

### FASE 3 — CRM Core (Semanas 8–10)
**Objetivo**: Profissional gerencia clientes, agenda e sessões pelo app.

Entregas:
- Tabelas: `clients`, `service_categories`, `services`, `appointments`, `sessions`
- RPC: `move_client_stage()` com IDOR protection
- RPC: `get_dashboard_rpc()` — agrega dados do dashboard em 1 query
- Máquina de estados de `appointments` (ver PRD-MASTER seção 9)
- Dashboard: 3 zonas (Hoje, Atenção, Pulso)
- Agenda: semana compacta (barras de ocupação) + lista do dia — J4
- Clientes: lista com filtro por `journey_stage` + swipe actions — J12, J14
- Perfil do cliente: tabs (Resumo, Histórico, Financeiro)
- Registro de sessão: 3 momentos (durante, ao encerrar, automático) — J6

> Confirmação automática via WhatsApp vem na FASE 5 com `appointment-confirmation-agent`.

### FASE 4 — Financeiro Básico (Semanas 11–12)
**Objetivo**: Profissional sabe o que entrou, o que está pendente, e fecha o caixa.

Entregas:
- Tabela: `financial_transactions` com FKs `ON DELETE RESTRICT` (nunca CASCADE)
- Lançamento manual + PIX (sem gateway externo neste momento)
- Vincular transação a sessão/agendamento
- Página /financeiro — extrato com filtros básicos (período, status, tipo) — J7
- DRE simplificado: receitas vs despesas do mês
- Lançamento rápido (bottom sheet, 4 campos)
- Dashboard Zona 3 com dado real de receita

### FASE 5 — Agentes Rosane Completos (Semanas 13–14)
**Objetivo**: Rosane automatiza o ciclo completo — confirmar, lembrar, pós-atendimento, NPS.

Entregas:
- Edge Functions: `lembrete-agent`, `appointment-confirmation-agent`, `relacionamento-agent`
- Edge Functions: `pos-atendimento-agent`, `objecoes-agent`, `cadastro-agent`
- Crons: D-1 lembretes (`lembrete-d1`), D+1 pós-atendimento, confirmação (`agenda-confirmacao`)
- Tabelas: `rlhf_rules`, `rlhf_diffs`, `personas`, `anamnese_templates`, `anamnese_fichas`
- `shadow_suggestions` com interface de aprovação
- `professional_agents`: configuração completa (tom, horário, agentes ativos, casual)
- Crons RLHF: `rlhf-extraction` (2h), `rlhf-drift-analysis` (6h), `persona-synthesis` (3h), `persona-rollback-monitor` (*/15), `drift-decay-enforce`
- Inbox omnichannel: hierarquia (urgente/rose, shadow/amber, normal) — J3
- Shadow mode UI: aprovar/editar/ignorar inline — J24
- Configurações → Assistente (Rosane): shadow mode toggle, agentes ativos, horário
- Página /agentes no CRM — J20, J21
- Fluxo público `/anamnese/:token` — J5

### FASE 6 — PWA Cliente (Semanas 15–16)
**Objetivo**: Cliente agenda, preenche anamnese e recebe confirmações sem instalar nada.

Entregas:
- `apps/client` configurado como PWA com manifest dinâmico por slug
- Tabelas: `registration_links`, `registration_sessions`, `client_pwa_sessions`
- Public endpoints: GET `/agendar/:slug`, POST `/appointments/public`
- Edge Function: `anamnese-public-handler`
- Magic link auth (OTP WhatsApp → link → auto-login)
- `/agendar/:slug` — brand color da clínica, serviços, horários — J32
- Home do cliente: agenda, histórico — J28, J29
- Cancelamento e reagendamento pelo cliente — J30
- Pacote ativo (sessões restantes) — J31
- Onboarding do cliente no PWA — J60
- Push notifications (lembrete D-1)

### FASE 7 — Documentos & Pacotes (Semanas 17–18)
**Objetivo**: Orçamentos enviados via WhatsApp, anamnese estruturada, pacotes de sessões, estoque.

Entregas:
- Tabelas: `quotes`, `contracts`, `packages`, `client_packages`, `package_session_usage`, `modelos`
- Tabelas: `stock_items`, `stock_history`, `service_stock_items`
- Edge Functions: `enviar-orcamento`, `processar-contrato-docx`
- Storage: `modelos-contratos`, `orcamentos-pdf`, `anamnese-assets`
- Libs: `docxtemplater`, `pdf-lib` (ou `puppeteer`), `ClickSign`/`DocuSign`
- Orçamentos: criar, enviar por WhatsApp, assinar digitalmente — J54
- Pacotes: criar, vincular a cliente, controlar uso por sessão — J24, J12
- Anamnese Builder: criar templates de ficha por profissão
- Estoque: controle de itens — J22
- Fluxo público `/pacote/:slug` — J25
- Página /recompensas (fidelidade + indicação) — J9, J16

### FASE 8 — Growth (Semanas 19–22)
**Objetivo**: Automações de crescimento — indicação, reativação, campanhas, RFM, billing SaaS.

Entregas:
- Tabelas: `campaigns`, `campaign_recipients`, `campaign_dispatches`
- Tabelas: `referral_links`, `referral_events`, `rfm_scores`, `client_health_scores`, `lead_scores`
- Tabelas: `proactive_triggers`, `proactive_trigger_logs`
- Tabelas: `funnel_opportunities`, `funnel_stages`, `sales_funnels`, `funnel_automations`, `funnel_automation_logs`
- Tabelas: `plans`, `billing_products`, `professional_subscriptions`, `credit_wallets`, `credit_transactions`
- Tabelas: `affiliate_partners`, `affiliate_commissions`
- Tabelas: `professional_insights`, `weekly_metrics_log`
- Edge Functions: `reativacao-agent`, `indicacao-agent`, `upsell-agent`, `lead-followup-agent`
- Edge Functions: `proactive-triggers` (cron), `aniversariantes-agent`, `relacionamento-agent`
- Edge Functions: `stripe-webhook`, `create-checkout`, `affiliate-commission-cron`
- Integração Stripe — planos: **Solo** (R$97/mês), **Pro** (R$297/mês), **Clínica** (R$697/mês), **Enterprise** (sob consulta)
- Trial: 14 dias em Solo e Pro; `plan_type = 'free_internal'` apenas via service_role
- Email canal (Resend + SMTP configurável) — J64
- Página /campanhas — J19
- Página /funil — J55
- Página /upgrade + trial management — J11
- Affiliate program — J48
- Agendamento recorrente — J56
- Chat público + widget — J57
- PDV modal — J62
- Configurações financeiras (gateways, conciliação bancária) — J63, J65
- Crons de growth: `reativacao-cron`, `aniversariantes-diario`, `select-casual-contacts`, `run-proactive-triggers`
- Crons de inteligência: `calculate-rfm`, `health-scores`, `calculate-lead-scores`, `insight-analyzer-daily`, `weekly-metrics`
- Crons de billing: `affiliate-commission-cron`, `affiliate-notify-cron`

### FASE 9 — Admin Analytics Completo + Hardening (Semanas 23–25)
**Objetivo**: Plataforma monitorada, admin gerencia profissionais com dados reais. PWA polish e segurança para produção.

**Admin:**
- `apps/admin` completo
- Tabelas: `professional_platform_health_scores`, `platform_metrics_daily`, `sales_leads`, `professional_alerts`
- Edge Functions: `platform-health-agent`, `nerissa-lifecycle`, `admin-broadcast`
- Admin WhatsApp pipeline completo: `admin-ai-gateway`, `sales-agent`, `support-agent`
- Nexus: chat com Nerissa para gerenciar plataforma — J47
- Dashboard admin: MRR, churn, profissionais ativos, alertas críticos
- Pipeline Nerissa: captação de leads, onboarding — J2, J33, J34, J36
- Crons: `nerissa-setup-followups`, `nerissa-lifecycle-sweep`, `platform-health-trial-watch`, `platform-health-weekly`

**PWA Polish:**
- Service worker unificado (IndexedDB como source of truth offline)
- Briefing matinal cron — J27
- Push notifications completas (OneSignal + Web Push)
- i18n completo (pt-BR + en-US + es-419)
- Offline: cache de clientes e agenda, fila de sync

**Hardening:**
- Auditoria RLS completa (EXPLAIN ANALYZE em todas as policies — 0 `Subquery Scan`)
- Vault para todas as credenciais (gateways, tokens, HMAC secrets)
- Rate limiting em todos os endpoints públicos
- Monitoring: alertas de erro, latência, uso de créditos
- Load testing WhatsApp pipeline (100 mensagens simultâneas em dry_run)
- Crons de infraestrutura: `reservation-recovery`, `sweep-processing-redis`, `sweep-zombie-handoffs`, `key-rotation-fanout`, `cleanup-notifications`, `cleanup-idempotency-log`, `cleanup-cron-job-run-details`, `audit-conversations`

### FASE FUTURA — Advanced
Sem data. Não bloqueia nenhuma fase anterior.
- Knowledge Brain (pgvector, GraphRAG, `knowledge_nodes`)
- Partner API (`api_keys`, webhooks, rate limiting)
- Automações avançadas (funil de vendas profissional, conciliação bancária OFX/CSV avançada)
- NFS-e integrado

---

## 8. Cron Jobs

_Auditado contra os 33 crons ativos de produção v1 (2026-06-04). v2 mantém 33 jobs organizados por domínio._

### 8.1 Agenda

| Job | Função / SQL | Schedule | Descrição |
|---|---|---|---|
| `agenda-briefing` | `agenda-agent` mode:briefing | `35 10 * * *` | Briefing da agenda do dia via WhatsApp para o profissional |
| `agenda-confirmacao` | `agenda-agent` mode:confirmacao | `*/15 * * * *` | Verifica agendamentos passados sem feedback → dispara pos-atendimento |
| `agenda-fechamento` | `agenda-agent` mode:fechamento | `30 1 * * *` | Fecha agendamentos confirmados do dia anterior, atualiza status |
| `lembrete-1h` | `lembrete-agent` mode:1h | `0 * * * *` | Lembrete 1h antes da consulta — executa só se houver appointment na janela |
| `lembrete-d1` | `lembrete-agent` mode:d1 | `0 21 * * *` | Lembrete D-1 (véspera) via WhatsApp |
| `lembrete-dia` | `lembrete-agent` mode:dia | `0 10 * * *` | Lembrete no dia da consulta (manhã) |
| `appointment-confirmation-fallback` | `appointment-confirmation-agent` mode:fallback | `*/5 * * * *` | Fallback: agendamentos 15+ min sem confirmação enviada |

### 8.2 Agentes Proativos e Comunicação

| Job | Função / SQL | Schedule | Descrição |
|---|---|---|---|
| `run-proactive-triggers` | `proactive-triggers` | `*/10 * * * *` | Dispara triggers pendentes da fila proactive_triggers |
| `select-casual-contacts` | SQL inline → insere em proactive_triggers | `0 12 * * *` | Seleciona clientes para contato casual (filtro RFM + cooldown por professional_agent) |
| `aniversariantes-diario` | `aniversariantes-agent` mode:diario | `0 11 * * *` | Envia mensagens de aniversário do dia |
| `aniversariantes-semanal` | `aniversariantes-agent` mode:semanal | `0 10 * * 1` | Alerta semanal com lista de aniversariantes da semana |
| `reativacao-cron` | `reativacao-agent` mode:cron | `0 12 * * *` | Dispara sequência de reativação para clientes inativos |

### 8.3 Nerissa (Admin → Profissional)

| Job | Função / SQL | Schedule | Descrição |
|---|---|---|---|
| `nerissa-setup-followups` | `nerissa-setup-agent` mode:resume_due_followups | `*/5 * * * *` | Retoma followups do setup de profissionais pendentes |
| `nerissa-lifecycle-sweep` | `nerissa-setup-agent` mode:lifecycle_sweep | `10 14 * * *` | Sweep de profissionais em etapas atrasadas do onboarding |
| `platform-health-trial-watch` | `platform-health-agent` mode:trial_watch | `20 13 * * *` | Monitora trials próximos de expirar, aciona Nerissa |
| `platform-health-weekly` | `platform-health-agent` mode:weekly | `20 12 * * 1` | Relatório semanal de saúde da plataforma para admin |

### 8.4 IA e Aprendizado

| Job | Função / SQL | Schedule | Descrição |
|---|---|---|---|
| `rlhf-extraction` | `rlhf-extraction` | `0 2 * * *` | Extrai diffs de shadow suggestions → rlhf_diffs |
| `rlhf-drift-analysis` | `rlhf-drift-analysis` | `0 6 * * *` | Analisa drift entre persona atual e sugestões recentemente rejeitadas |
| `persona-synthesis` | `persona-synthesis` | `0 3 * * *` | Sintetiza nova persona a partir de rlhf_rules acumuladas |
| `persona-rollback-monitor` | SQL inline (UPDATE personas) | `*/15 * * * *` | Reverte persona se 3+ rejeições em 15 min durante rollback window |
| `drift-decay-enforce` | SQL inline (UPDATE professionals) | `0 10 * * *` | Força shadow_mode_forced=true se alerta de drift sem resolução há 7+ dias |
| `audit-conversations` | `audit-conversations` | `0 1 * * *` | Auditoria de conversas (anomalias, compliance, PII check) |

### 8.5 Inteligência e Analytics

| Job | Função / SQL | Schedule | Descrição |
|---|---|---|---|
| `health-scores` | `calculate-health-scores` | `0 4 * * *` | Recalcula health scores de clientes e profissionais |
| `calculate-lead-scores` | `calculate-lead-scores` | `0 7 * * *` | Lead scores → widget "Leads Quentes" no dashboard |
| `insight-analyzer-daily` | `insight-analyzer` | `0 11 * * *` | Gera insight do dia para cada profissional |
| `weekly-metrics` | `weekly-metrics` | `0 8 * * 6` | Resumo semanal via push + WhatsApp pessoal |
| `calculate-rfm` | `calculate-rfm` | `0 3 * * 1` | Recalcula scores RFM de toda a base de clientes |

### 8.6 Billing e Afiliados

| Job | Função / SQL | Schedule | Descrição |
|---|---|---|---|
| `affiliate-commission-cron` | `affiliate-commission` | `0 8 5 * *` | Calcula comissões do mês anterior |
| `affiliate-notify-cron` | `affiliate-notify` | `0 8 10 * *` | Notifica afiliados do valor a pagar |

### 8.7 Infraestrutura e Limpeza

| Job | Função / SQL | Schedule | Descrição |
|---|---|---|---|
| `reservation-recovery` | `reservation-recovery` | `*/15 * * * *` | Libera reservas de créditos IA travadas (expiradas) |
| `sweep-processing-redis` | `redis-sweeper` | `*/15 * * * *` | Limpa chaves Redis em estado processing travado |
| `sweep-zombie-handoffs` | SQL inline (UPDATE message_queue) | `*/15 * * * *` | Detecta e refileira mensagens zombie da fila de envio |
| `key-rotation-fanout` | `key-rotation-fanout` | `0 2 * * 6` | Rotação semanal de secrets internos |
| `cleanup-notifications` | SQL inline (DELETE) | `0 4 * * *` | Remove notificações lidas há 30+ dias / não lidas há 90+ dias |
| `cleanup-idempotency-log` | SQL inline (DELETE) | `0 5 * * *` | Remove entradas expiradas do idempotency_log |
| `cleanup-cron-job-run-details` | SQL inline (DELETE) | `17 5 * * *` | Remove logs de execução do pg_cron com mais de 14 dias |

---

### 8.8 Colunas Descobertas nos Crons (adições ao PRD-SCHEMA.md)

Os crons revelaram colunas ausentes em tabelas já modeladas:

```sql
-- appointments
ALTER TABLE appointments
  ADD COLUMN reminder_1h_sent_at  timestamptz,   -- lembrete-1h marca quando enviou
  ADD COLUMN feedback_status      text;           -- agenda-confirmacao verifica este campo

-- professionals
ALTER TABLE professionals
  ADD COLUMN shadow_mode_forced   boolean DEFAULT false;  -- drift-decay-enforce ativa
  -- Nota: account_type = alias de plan_type. Usar plan_type diretamente no v2.

-- professional_agents
ALTER TABLE professional_agents
  ADD COLUMN casual_enabled        boolean DEFAULT false,
  ADD COLUMN casual_frequency_days integer DEFAULT 30,
  ADD COLUMN min_rfm_score         numeric(4,2) DEFAULT 0;

-- clients
ALTER TABLE clients
  ADD COLUMN opted_out_casual  boolean DEFAULT false,
  ADD COLUMN last_casual_at    timestamptz;

-- personas
ALTER TABLE personas
  ADD COLUMN rollback_until             timestamptz,
  ADD COLUMN previous_synthesized_rules text,
  ADD COLUMN prompt_version             integer DEFAULT 1;

-- credit_wallets
ALTER TABLE credit_wallets
  ADD COLUMN status     text NOT NULL DEFAULT 'active',
  ADD COLUMN expires_at timestamptz;
```

#### professional_alerts (tabela ausente — adicionada ao PRD)

```sql
CREATE TABLE professional_alerts (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  professional_id uuid NOT NULL REFERENCES professionals(id) ON DELETE RESTRICT,
  type            text NOT NULL,
  -- 'rlhf_drift_alert' | 'health_score_drop' | 'trial_expiring'
  -- 'low_credits' | 'whatsapp_disconnected' | 'appointment_no_show_spike'
  title           text NOT NULL,
  body            text,
  metadata        jsonb DEFAULT '{}',
  resolved_at     timestamptz,
  resolved_by     uuid,
  created_at      timestamptz DEFAULT now()
);

CREATE INDEX idx_professional_alerts_unresolved
  ON professional_alerts(professional_id, type)
  WHERE resolved_at IS NULL;

ALTER TABLE professional_alerts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "alerts_isolation" ON professional_alerts FOR ALL TO authenticated
USING (professional_id = auth_professional_id())
WITH CHECK (professional_id = auth_professional_id());
```

---

## 9. Integrações Externas

### Evolution Go (WhatsApp)

```typescript
// _shared/evolution-go.ts — contrato inviolável
const BASE = Deno.env.get('EVOLUTION_GO_URL'); // ex: https://evo.iaprafaturar.com
const DEFAULT_KEY = Deno.env.get('EVOLUTION_GO_KEY');

async function sendText(params: {
  instanceId: string;     // nome da instância (vai no body como "id")
  instanceToken?: string; // token da instância; fallback para DEFAULT_KEY
  number: string;         // E.164 sem + (5511999999999)
  text: string;
  delay?: number;         // ms de delay antes do envio
}): Promise<EvolutionResponse>

// Endpoint: POST {BASE}/send/text
// Body: { id: instanceId, number, text, delay }
// Header: { apikey: instanceToken ?? DEFAULT_KEY }
// NUNCA usar /message/sendText/{instance} — não existe na Evolution Go
```

**HMAC Secrets (dois canais, dois secrets):**
```
PROFESSIONAL_EVOLUTION_WEBHOOK_SECRET  ← valida inbound de instâncias de profissionais
ADMIN_EVOLUTION_WEBHOOK_SECRET         ← valida inbound da instância admin/Nerissa
```
Os dois secrets NUNCA podem ser o mesmo valor. Mistura de canais = violação de invariante.

### Supabase Client (frontend)

```typescript
// @/lib/supabase.ts — padrão obrigatório
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: { persistSession: true, autoRefreshToken: true },
  global: {
    fetch: customFetch, // retry automático 2x em 5xx
  },
});
```

### AI Client (Edge Functions)

```typescript
// _shared/ai-client.ts
type AITier = 'fast' | 'smart' | 'deep';

const MODEL_MAP: Record<AITier, string> = {
  fast: 'claude-haiku-4-5-20251001',   // classificação, respostas curtas
  smart: 'claude-sonnet-4-6',           // Rosane conversations
  deep: 'claude-opus-4-8',              // síntese de persona, análise
};

async function callAI(params: {
  professionalId: string;
  tier: AITier;
  systemPrompt: string;
  messages: Message[];
  maxTokens?: number;
  reserveCredits: boolean; // deve reservar antes de chamar
}): Promise<AIResponse>
```

### Stripe (SaaS Billing)

```typescript
// _shared/stripe.ts
const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!);

// Produtos do catálogo (IDs de produção — definidos no Stripe, nunca no código):
// Nomes canônicos de plano conforme PRD-MASTER seção 10.1
const PRODUCTS = {
  plan_solo:         'prod_xxx', // Solo — R$97/mês (até 300 clientes, 1 profissional)
  plan_pro:          'prod_xxx', // Pro — R$297/mês (até 2.000 clientes, até 3 profissionais)
  plan_clinica:      'prod_xxx', // Clínica — R$697/mês (até 10.000 clientes, até 10 profissionais)
  plan_enterprise:   'prod_xxx', // Enterprise — sob consulta (ilimitado)
  credits_600:       'prod_xxx', // Pacote de créditos — R$49
  credits_2400:      'prod_xxx', // Pacote de créditos — R$149
  credits_5000:      'prod_xxx', // Pacote de créditos — R$250
};
// plan_type = 'free_internal': apenas via service_role, nunca em checkout público
```

---

## 10. Modelo de Segurança

### Função central de tenancy

```sql
-- Sempre usar esta função em RLS policies
CREATE OR REPLACE FUNCTION auth_professional_id()
RETURNS uuid
LANGUAGE sql
STABLE SECURITY DEFINER
AS $$
  SELECT COALESCE(
    (auth.jwt() -> 'user_metadata' ->> 'professional_id')::uuid,
    (SELECT id FROM professionals WHERE user_id = auth.uid() LIMIT 1)
  )
$$;
```

### Template de RLS para tabelas com professional_id

```sql
ALTER TABLE {tabela} ENABLE ROW LEVEL SECURITY;

CREATE POLICY "{tabela}_professional_isolation"
ON {tabela}
FOR ALL
TO authenticated
USING (professional_id = auth_professional_id())
WITH CHECK (professional_id = auth_professional_id());
```

### Template de RPC com IDOR protection

```sql
CREATE OR REPLACE FUNCTION move_client_stage(
  p_client_id uuid,
  p_new_stage text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_prof_id uuid := auth_professional_id();
BEGIN
  -- 1. Validar autenticação
  IF v_prof_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;
  -- 2. Validar ownership (IDOR protection)
  IF NOT EXISTS (
    SELECT 1 FROM clients
    WHERE id = p_client_id AND professional_id = v_prof_id
  ) THEN
    RAISE EXCEPTION 'Unauthorized: resource not in your clinic';
  END IF;
  -- 3. Executar ação
  UPDATE clients SET journey_stage = p_new_stage WHERE id = p_client_id;
END;
$$;
```

### Regras de Edge Functions

| Proteção | Aplicar em |
|---|---|
| `verify_jwt = true` | Funções chamadas pelo frontend autenticado |
| `x-nerissa-internal-token` | Crons internos, workers QStash, agentes chamados por outros agentes |
| `EVOLUTION_WEBHOOK_SECRET` HMAC | `webhook-whatsapp` e `webhook-admin` |
| `stripe-signature` | `stripe-webhook` |
| Service Role key | `send-message` direto, migrations |

### 9 Regras Absolutas de Segurança

1. **RLS sempre** `professional_id = auth_professional_id()` (nunca `auth.uid() IS NOT NULL`)
2. **PII/Credenciais** nunca em plaintext — usar Supabase Vault
3. **RPCs** validam `auth_professional_id()` + ownership antes de agir (IDOR)
4. **RLS sem subqueries** — usar `auth_professional_id()` STABLE, não `IN (SELECT...)`
5. **Audit logs imutáveis** — trigger BEFORE UPDATE/DELETE levanta exception
6. **Views com filtro de clínica** obrigatório `WITH (security_invoker = on)`
7. **Dados financeiros** FKs com `ON DELETE RESTRICT` (nunca CASCADE)
8. **Permissões** `REVOKE ALL` + `GRANT SELECT/INSERT/UPDATE` específico (nunca GRANT ALL)
9. **Client-side** nunca passa `professional_id` no payload — vem do AuthContext
