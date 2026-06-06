# PRD de Execução — iaprafaturar v2

Este documento descreve, em ordem, tudo que precisa ser feito para construir e lançar o iaprafaturar v2 do zero — desde criação de contas até o primeiro fluxo em produção.

A ordem é normativa. Nenhuma fase avança sem o portão da fase anterior aprovado.

---

## Fase 0 — Infraestrutura Externa

Antes de escrever uma linha de código, toda infraestrutura precisa existir e estar documentada.

### 0.1 GitHub

- [x] Criar repositório `iaprafaturar-v2` como monorepo privado
  - URL: https://github.com/ismfer2026/iaprafaturar.v2.git
- [ ] Configurar branch protection em `main`:
  - exigir Pull Request antes de merge
  - bloquear push direto na main
- [ ] Criar branch `dev` para desenvolvimento

### 0.2 Supabase

- [x] Criar conta Supabase — org: `barbeariasappcode@gmail.com`
- [x] Criar projeto `iaprafaturar.v2` na região `sa-east-1` (São Paulo) — ref: `hqjghltqnbhbfoybtrgq`
- [ ] Anotar as credenciais (salvar em local seguro, **nunca no repositório**):
  - `SUPABASE_URL` = `https://hqjghltqnbhbfoybtrgq.supabase.co`
  - `SUPABASE_ANON_KEY`
  - `SUPABASE_SERVICE_ROLE_KEY`
- [x] Ativar extensões:
  - `pgcrypto` ✅
  - `pg_net` ✅
  - `pg_cron` ✅
  - `vector` ✅
- [ ] Instalar Supabase CLI: `npm install -g supabase`
- [x] Fazer login: `supabase login`
- [x] Linkar CLI: `supabase link --project-ref hqjghltqnbhbfoybtrgq`

### 0.3 Vercel

- [ ] Criar conta Vercel em [vercel.com](https://vercel.com) com email da organização
- [ ] Criar dois projetos:
  - `iaprafaturar-professional` → `app.iaprafaturar.com.br`
  - `iaprafaturar-admin` → `admin.iaprafaturar.com.br`
- [ ] Configurar domínios customizados em cada projeto (requer acesso ao DNS do domínio)
- [ ] Configurar variáveis de ambiente em cada projeto (após Fase 1)
- [ ] Integrar com o repositório GitHub (auto-deploy via push)

### 0.4 Upstash

- [ ] Criar conta Upstash em [upstash.com](https://upstash.com)
- [ ] Criar banco **Redis** na região `sa-east-1` (São Paulo):
  - anotar `UPSTASH_REDIS_REST_URL`
  - anotar `UPSTASH_REDIS_REST_TOKEN`
- [ ] Criar instância **QStash** na região `us-east-1` (obrigatório — QStash não tem sa-east-1):
  - anotar `QSTASH_URL` (ex: `https://qstash-us-east-1.upstash.io`)
  - anotar `QSTASH_TOKEN`
  - anotar `QSTASH_CURRENT_SIGNING_KEY`
  - anotar `QSTASH_NEXT_SIGNING_KEY`

**Atenção:** Redis e QStash são serviços separados no Upstash. Não confundir credenciais.

### 0.5 Evolution Go

- [ ] Confirmar acesso ao painel Evolution Go existente ou criar nova instância
- [ ] Criar instância da Nerissa (admin da plataforma):
  - anotar `ADMIN_WHATSAPP_INSTANCE` (nome da instância)
  - anotar `ADMIN_WHATSAPP_TOKEN`
- [ ] Configurar webhook da instância Nerissa apontando para:
  `https://<supabase-project>.supabase.co/functions/v1/webhook-admin`
- [ ] Ativar apenas o evento `MESSAGE` no webhook (não ALL)
- [ ] Definir e anotar `ADMIN_EVOLUTION_WEBHOOK_SECRET` (HMAC para validar assinaturas)
- [ ] Anotar `EVOLUTION_GO_URL` e `EVOLUTION_GO_KEY`

### 0.6 Anthropic (IA)

- [ ] Confirmar ou criar conta em [console.anthropic.com](https://console.anthropic.com)
- [ ] Gerar chave de API: anotar `ANTHROPIC_API_KEY`
- [ ] Confirmar cláusula ZDR (Zero Data Retention) ativa antes de usar Context Caching em produção

### 0.7 OpenAI (Visão e Embeddings)

- [ ] Confirmar ou criar conta em [platform.openai.com](https://platform.openai.com)
- [ ] Gerar chave de API: anotar `OPENAI_API_KEY`
- [ ] Modelos usados: `gpt-4o-mini` (visão), `text-embedding-3-small` (embeddings)

### 0.8 Groq (Transcrição de Áudio)

- [ ] Confirmar ou criar conta em [console.groq.com](https://console.groq.com)
- [ ] Gerar chave de API: anotar `GROQ_API_KEY`
- [ ] Modelo usado: `whisper-large-v3`

### 0.9 Stripe (Billing)

- [ ] Confirmar ou criar conta em [dashboard.stripe.com](https://dashboard.stripe.com)
- [ ] Criar produtos e preços no catálogo (Trial, Individual, Equipe, Team, Enterprise)
- [ ] Anotar `STRIPE_SECRET_KEY` e `STRIPE_WEBHOOK_SECRET`
- [ ] Configurar webhook Stripe apontando para:
  `https://<supabase-project>.supabase.co/functions/v1/stripe-webhook`

### 0.10 Resend (Email)

- [ ] Confirmar ou criar conta em [resend.com](https://resend.com)
- [ ] Verificar domínio `iaprafaturar.com.br`
- [ ] Anotar `RESEND_API_KEY` e `RESEND_WEBHOOK_SECRET`

### 0.11 OneSignal (Push Notifications)

- [ ] Confirmar ou criar conta em [onesignal.com](https://onesignal.com)
- [ ] Criar app para `iaprafaturar-professional`
- [ ] Anotar `ONESIGNAL_APP_ID` e `ONESIGNAL_REST_API_KEY`

### 0.12 Registro de Segredos

- [ ] Criar arquivo `.env.example` na raiz do repositório com todas as variáveis (sem valores reais)
- [ ] Criar arquivo `.env` local (no `.gitignore`) com valores reais para desenvolvimento
- [ ] Registrar todos os segredos no Supabase Dashboard → Edge Functions → Manage Secrets
- [ ] Registrar variáveis de ambiente em cada projeto Vercel
- [ ] **Nunca commitar `.env` com valores reais no repositório**

**Lista completa de segredos a registrar no Supabase:**

```
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
ANTHROPIC_API_KEY
OPENAI_API_KEY
GROQ_API_KEY
UPSTASH_REDIS_REST_URL
UPSTASH_REDIS_REST_TOKEN
QSTASH_URL
QSTASH_TOKEN
QSTASH_CURRENT_SIGNING_KEY
QSTASH_NEXT_SIGNING_KEY
EVOLUTION_GO_URL
EVOLUTION_GO_KEY
ADMIN_WHATSAPP_INSTANCE
ADMIN_WHATSAPP_TOKEN
ADMIN_EVOLUTION_WEBHOOK_SECRET
ISMAEL_PHONE
MESSAGE_PROCESSOR_URL
ADMIN_MESSAGE_PROCESSOR_URL
AUDIO_PROCESSOR_URL
IMAGE_PROCESSOR_URL
DOCUMENT_PROCESSOR_URL
STRIPE_SECRET_KEY
STRIPE_WEBHOOK_SECRET
RESEND_API_KEY
RESEND_WEBHOOK_SECRET
EMAIL_REPLY_TO_DOMAIN
ONESIGNAL_APP_ID
ONESIGNAL_REST_API_KEY
ALLOWED_ORIGIN
ALE_MASTER_KEY
```

### Portão Fase 0

- [ ] Todos os serviços criados e acessíveis
- [ ] Todos os segredos anotados em local seguro
- [ ] Supabase CLI linkado ao projeto
- [ ] GitHub com branch protection ativo
- [ ] Nenhuma credencial exposta no repositório

---

## Fase 1 — Monorepo e Tooling

### 1.1 Estrutura Inicial

```bash
npx create-turbo@latest iaprafaturar-v2
```

Estrutura alvo:

```
iaprafaturar-v2/
├── apps/
│   ├── professional/   ← Vite + React + TypeScript
│   └── admin/          ← Vite + React + TypeScript
├── packages/
│   ├── domain/         ← TypeScript puro (sem deps externas)
│   ├── shared/         ← utilitários genéricos
│   └── ui/             ← componentes compartilhados (shadcn/ui base)
├── contracts/
│   ├── events/
│   ├── edge-functions/
│   └── database/
├── supabase/
│   ├── functions/
│   ├── migrations/
│   └── config.toml
├── docs/               ← este repositório de documentação
├── turbo.json
├── package.json
└── .env.example
```

### 1.2 Configurar Turborepo

- [ ] Configurar `turbo.json` com pipelines: `build`, `dev`, `lint`, `test`
- [ ] Configurar `package.json` root com workspaces
- [ ] Garantir que `packages/domain` não tem dependências externas além de TypeScript e Zod

### 1.3 Apps

- [ ] Criar `apps/professional` com Vite + React + TypeScript + Tailwind + shadcn/ui
- [ ] Criar `apps/admin` com mesma stack
- [ ] Configurar Vercel para cada app com root directory correto

### 1.4 CI/CD

- [ ] Criar `.github/workflows/ci.yml`:
  - lint em todos os packages
  - build em todos os apps
  - validação de contratos (quando houver testes)
- [ ] Configurar deploy automático via Vercel GitHub integration

### Portão Fase 1

- [ ] `turbo run build` passa sem erro
- [ ] Dois apps acessíveis via Vercel (staging)
- [ ] `packages/domain` sem dependências externas confirmado
- [ ] CI rodando no GitHub Actions

---

## Fase 2 — Auth e Tenant

**Objetivo:** Todo profissional tem identidade única e isolada. Nenhuma query de dados cruza tenant.

### 2.1 Schema Base

- [ ] Migration: tabela `professionals` com campos obrigatórios
- [ ] Migration: tabela `user_roles`
- [ ] Função SQL `auth_professional_id()` retorna `professionals.id` do JWT
- [ ] RLS em `professionals`: `professional_id = auth_professional_id()` (nunca `auth.uid() IS NOT NULL`)
- [ ] Testes de isolamento: usuário A não acessa dados do usuário B

### 2.2 Auth Flow

- [ ] Cadastro de profissional (email + senha)
- [ ] Login
- [ ] Refresh de sessão
- [ ] Logout

### Portão Fase 2

- [ ] `SELECT * FROM professionals` retorna apenas o registro do usuário autenticado
- [ ] Tentativa de acessar registro de outro profissional retorna erro de permissão
- [ ] Evento `professional.created` registrado no log

---

## Fase 3 — Observabilidade

**Objetivo:** Todo fluxo crítico tem log consultável por identificadores reais antes de existir.

### 3.1 Tabelas de Log

- [ ] Migration: `message_events` (consolidado — substitui whatsapp_inbound_events + whatsapp_outbound_events + whatsapp_message_logs; ver DDL em PRD-SCHEMA.md §message_events)
- [ ] Migration: `idempotency_log` (deduplica webhooks — ver PRD-SCHEMA.md §idempotency_log)
- [ ] Migration: `qstash_job_log` (telemetria de fila — ver PRD-SCHEMA.md §qstash_job_log)
- [ ] RLS em message_events: `service_role` ALL; `authenticated` somente SELECT nos próprios dados via auth_professional_id()

### 3.2 Padrão de Log

- [ ] Helper TypeScript `logMessageEvent()` compartilhado em `packages/shared` (inbound e outbound via message_events)
- [ ] Helper TypeScript `logSystemEvent()` compartilhado em `packages/shared`

### 3.3 Queries de Validação

Criar arquivo `docs/05-runbook/queries-diagnostico.md` com SQLs padrão para:
- mensagens recebidas nos últimos N minutos por telefone
- envios por instância
- erros por função
- fluxo completo inbound → outbound para uma mensagem específica

### Portão Fase 3

- [ ] `SELECT * FROM message_events WHERE professional_id = '<id>' AND direction = 'inbound' ORDER BY created_at DESC` retorna resultado legível
- [ ] `SELECT * FROM message_events WHERE instance_name = '<nome>' AND source_webhook = 'admin'` funciona
- [ ] Nenhum diagnóstico operacional exige busca dentro de JSON blob

---

## Fase 4 — WhatsApp Inbound/Outbound

**Objetivo:** Mensagem entra, é registrada, vai para fila, sai pela instância correta.

### 4.1 Infra WhatsApp

- [ ] Edge Function `webhook-admin` (instância Nerissa)
- [ ] Edge Function `webhook-whatsapp` (instâncias dos profissionais)
- [ ] Helper `_shared/evolution-go.ts` com `sendText()`, `resolveAdminCredentials()`, `resolveInstanceCredentials()`
- [ ] Helper `_shared/evolution-payload.ts` com `extractCanonicalMessage()`, `selectRemoteJid()`, `dispatchMediaIfAny()`
- [ ] Helper `_shared/redis.ts` com chaves de debounce por contexto

### 4.2 Pipeline de Mensagens

- [ ] Debounce 4s via Redis + QStash
- [ ] `message-processor` (worker QStash dos profissionais)
- [ ] `admin-message-processor` (worker QStash da Nerissa)
- [ ] Suporte a áudio (`audio-processor` via Groq Whisper)
- [ ] Suporte a imagem (`image-processor` via GPT-4o-mini)
- [ ] Suporte a documento (`document-processor` via unpdf/mammoth)

### 4.3 Contratos

- [ ] `contracts/edge-functions/webhook-admin.ts` com Zod
- [ ] `contracts/edge-functions/webhook-whatsapp.ts` com Zod
- [ ] `contracts/edge-functions/message-processor.ts` com Zod

### Portão Fase 4

- [ ] Mensagem de texto → Nerissa responde em 1 mensagem única após 4-6s
- [ ] 3 mensagens em sequência → 1 resposta consolidada (não 3)
- [ ] Áudio → transcrição → resposta coerente
- [ ] `message_events` preenchido para cada teste (inbound direction='inbound', outbound direction='outbound')
- [ ] Nenhuma invariante violada: instâncias não cruzam contextos

---

## Fase 5 — Onboarding do Profissional

**Objetivo:** Novo profissional entra, cria conta, instala PWA, Nerissa chama no WhatsApp, completa setup, conecta WhatsApp.

### 5.1 Fluxo Público

- [ ] Página pública de cadastro (sem auth exigida)
- [ ] Criação de conta Supabase Auth
- [ ] Criação de registro em `professionals`
- [ ] Evento `professional.created` emitido

### 5.2 Onboarding Guiado

- [ ] Telas de onboarding no CRM
- [ ] Nerissa chama no WhatsApp após cadastro
- [ ] `nerissa-setup-agent` guia setup pelo WhatsApp
- [ ] Campos obrigatórios: nome, especialidade, WhatsApp, instância conectada

### 5.3 Conexão WhatsApp

- [ ] Interface para conectar instância Evolution Go
- [ ] QR Code ou número pareado
- [ ] Validação de conexão antes de prosseguir
- [ ] Evento `professional.whatsapp.connected` emitido

### Portão Fase 5

- [ ] Novo profissional completa fluxo do zero sem suporte manual
- [ ] Após setup, CRM está operacional (clientes, agenda acessíveis)
- [ ] `professionals.onboarding_completed = true` após conclusão
- [ ] Nerissa não responde como profissional em nenhum momento do fluxo

---

## Fase 6 — Clientes e Leads

**Objetivo:** Profissional gerencia sua base de clientes/leads no CRM.

- [ ] CRUD de clientes com `journey_stage`
- [ ] Funil Kanban por stage
- [ ] Cadastro público de cliente (slug do profissional)
- [ ] Evento `client.journey_stage.changed` emitido em toda transição
- [ ] RLS: cliente pertence ao profissional — nunca busca global

### Portão Fase 6

- [ ] Profissional A não vê clientes do profissional B
- [ ] Transição de stage gera evento com `from`, `to`, `triggered_by`
- [ ] Cadastro público não exige auth

---

## Fase 7 — Agenda

**Objetivo:** Agendamento de atendimentos, confirmações, lembretes e cancelamentos.

- [ ] CRUD de agendamentos
- [ ] Confirmação automática via WhatsApp
- [ ] Lembrete 24h antes
- [ ] Cancelamento com reagendamento
- [ ] Integração com Google Calendar (opcional na v2)
- [ ] Eventos: `appointment.created`, `appointment.confirmed`, `appointment.cancelled`

### Portão Fase 7

- [ ] Agendamento criado → cliente recebe confirmação no WhatsApp
- [ ] 24h antes → lembrete enviado
- [ ] Cancelamento → evento emitido, status atualizado

---

## Fase 8 — IA e Agentes

**Objetivo:** Agentes de IA atuam dentro dos fluxos sem sair dos contratos.

- [ ] `orchestrator-agent` classifica intenção e roteia
- [ ] Agentes específicos: agenda, cadastro, dúvidas, indicação, pós-atendimento, reativação
- [ ] Todo agente retorna `{ status, reply, reason, metadata }`
- [ ] Todo agente registra decisão em `agent_executions` (e o inbound correspondente em `message_events`)
- [ ] Créditos consumidos por invocação de IA registrados

### Portão Fase 8

- [ ] Nenhum agente envia mensagem diretamente (só via `sendText` centralizado)
- [ ] Nenhum agente cruza contexto de profissionais
- [ ] Consumo de créditos registrado para cada invocação

---

## Fase 9 — Financeiro e Billing

**Objetivo:** Trial, planos, créditos e pagamentos funcionando com auditoria completa.

- [ ] Integração Stripe completa
- [ ] Trial com contador de dias
- [ ] Upgrade/downgrade de plano
- [ ] Créditos de IA: consumo, recarga, pacotes avulsos
- [ ] Eventos: `payment.succeeded`, `payment.failed`, `credits.consumed`, `credits.exhausted`
- [ ] FK `financial_transactions → professionals` com `ON DELETE RESTRICT`

### Portão Fase 9

- [ ] Trial expira → acesso bloqueado corretamente
- [ ] Pagamento falho → notificação enviada
- [ ] `UPDATE professionals SET plan_type = ...` como usuário autenticado → falha (proteção RLS)

---

## Fase 10 — Admin da Plataforma

**Objetivo:** Painel interno para gestão de profissionais, planos, campanhas e saúde da plataforma.

- [ ] Visão de todos os profissionais (com filtros)
- [ ] Override de plano/trial
- [ ] Campanhas da plataforma
- [ ] Health scores e alertas
- [ ] Acesso restrito a `admin_master`

### Portão Fase 10

- [ ] Usuário com role `gestor` não acessa o painel admin
- [ ] Override de plano gera evento auditável

---

## Fase 11 — Migração de v1 para v2

Ver `docs/04-migration/` para plano detalhado.

Resumo:
- [ ] Script de exportação de dados de v1 (profissionais, clientes, agendamentos, histórico)
- [ ] Script de importação validada em v2
- [ ] Período de coexistência: v1 em readonly, v2 aceitando novos cadastros
- [ ] Cutover com janela de manutenção
- [ ] Rollback documentado

---

## Apêndice — Referência Rápida de URLs

| Serviço | URL |
|---------|-----|
| Supabase Dashboard | https://supabase.com/dashboard |
| Vercel Dashboard | https://vercel.com/dashboard |
| Upstash Console | https://console.upstash.com |
| Anthropic Console | https://console.anthropic.com |
| OpenAI Platform | https://platform.openai.com |
| Groq Console | https://console.groq.com |
| Stripe Dashboard | https://dashboard.stripe.com |
| Resend Dashboard | https://resend.com/dashboard |
| OneSignal Dashboard | https://app.onesignal.com |
| GitHub | https://github.com |

---

## Apêndice — Checklist de Segurança (Obrigatório em Toda Fase)

- [ ] Nenhum secret no código ou no repositório
- [ ] RLS ativo em todas as tabelas com dados de usuário
- [ ] Toda FK financeira com `ON DELETE RESTRICT`
- [ ] `auth_professional_id()` usado em todas as políticas de isolamento
- [ ] Logs de auditoria imutáveis (trigger impede UPDATE/DELETE)
- [ ] `GRANT` específico por papel — nunca `GRANT ALL`
- [ ] Views com dados por clínica usam `security_invoker = on`
