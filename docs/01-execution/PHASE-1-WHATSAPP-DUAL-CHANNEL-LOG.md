# Phase 1 Execution Log: WhatsApp Dual-Channel + Admin Tecnico Minimo

**Data:** 2026-06-05  
**Status:** concluida  
**Escopo PRD-MASTER:** Fase 1 - WhatsApp Dual-Channel + Admin Tecnico Minimo  
**Frontend novo:** nao houve; esta fase foi backend/infra/observabilidade.

## Objetivo

Criar a base operacional segura para dois canais WhatsApp isolados:

- `admin`: instancia da plataforma/Nerissa, usada para profissionais, leads da plataforma e suporte.
- `professional`: instancia do profissional/Rosane, usada apenas dentro do contexto do profissional/clinica.

A fase deveria provar entrada, validacao, idempotencia, logging, fila, processamento minimo e saida em `DRY_RUN`, sem LLM real e sem envio real por padrao.

## O Que Foi Implementado

### Monorepo / Tooling

- `contracts` foi movido para `packages/contracts` para seguir a estrutura uniforme do monorepo.
- `package.json` raiz voltou a usar apenas:
  - `apps/*`
  - `packages/*`
- `@iaprafaturar/contracts` virou workspace package oficial.
- `zod` ficou como dependencia de `packages/contracts`, nao da raiz.
- `supabase/functions/deno.json` foi configurado para Deno resolver:
  - `@iaprafaturar/contracts/`
  - `@supabase/supabase-js`
  - `zod`
- O problema do Turbo foi corrigido:
  - antes: `npx turbo ls` retornava `0 packages`;
  - depois: `npx turbo ls` retorna 5 packages.

### Contracts Runtime

Criados/ajustados em `packages/contracts`:

- `events/message-events.ts`
- `events/whatsapp.ts` ja existente mantido
- `edge-functions/webhook-admin.ts` ja existente mantido
- `edge-functions/webhook-whatsapp.ts`
- `edge-functions/message-processor.ts`
- `edge-functions/admin-message-processor.ts`
- `edge-functions/send-message.ts`

Regras aplicadas:

- Validacao runtime com Zod.
- `agent_slug` obrigatorio quando `actor_type='ai'`.
- `instance_token` nao entra no contrato de `send-message`; credenciais sao resolvidas internamente.
- Imports Deno usam extensao `.ts` quando necessario.

### Banco de Dados

Migrations criadas e aplicadas no Supabase remoto:

- `supabase/migrations/20260605120700_phase1_whatsapp_observability.sql`
- `supabase/migrations/20260605120800_phase1_nerissa_setup.sql`
- `supabase/migrations/20260605120900_phase1_professional_phone_lookup.sql`
- `supabase/migrations/20260605121000_relax_professional_phone_lookup_uniqueness.sql`

Tabelas criadas:

- `idempotency_log`
- `conversations`
- `conversation_contexts`
- `message_events`
- `agent_executions`
- `qstash_job_log`
- `professional_agents`
- `shadow_suggestions`
- `nerissa_setup_sessions`
- `nerissa_setup_items`
- `nerissa_setup_events`

Decisoes importantes:

- Nao foram criadas tabelas legadas:
  - `whatsapp_inbound_events`
  - `whatsapp_outbound_events`
  - `whatsapp_message_logs`
  - `agent_logs`
  - `confirmation_messages`
  - `processed_webhooks`
- `client_id` e `campaign_id` nao foram criados como colunas soltas sem FK.
- Como `clients` e `campaigns` ainda nao existem na v2 limpa, essas colunas devem entrar apenas em migrations futuras, junto com as FKs reais.
- `idempotency_log` bloqueia update e bloqueia delete antes de `expires_at`.
- Logs sensiveis sao escritos por service role/Edge Function, nao pelo frontend.
- `webhook-admin` agora resolve `professional_id` antes do INSERT em `message_events`, quando o telefone inbound pertence a um profissional ativo.
- A resolucao usa `find_professional_by_whatsapp_phone(p_phone)` com telefone normalizado e indice em `professionals.phone_whatsapp`.
- O indice de telefone do profissional NAO e `UNIQUE`: ele existe para performance, nao para bloquear criacao de conta.
- Se houver exatamente 1 profissional ativo com o telefone, a RPC retorna o `professionals.id`.
- Se houver 0 ou mais de 1 profissionais ativos com o telefone, a RPC retorna `null` para evitar roteamento ambiguo.
- A RPC nunca busca em `clients`, porque o canal admin/Nerissa nao deve procurar clientes dentro de clinicas.

### Edge Functions

Criadas e deployadas no projeto Supabase `hqjghltqnbhbfoybtrgq`:

- `webhook-whatsapp`
- `webhook-admin`
- `message-processor`
- `admin-message-processor`
- `send-message`

Status confirmado via `npx supabase functions list`: todas `ACTIVE`.

### Helpers Compartilhados

Criados em `supabase/functions/_shared`:

- `agent-executions.ts`
- `dry-run.ts`
- `evolution-go.ts`
- `evolution-payload.ts`
- `hmac.ts`
- `http.ts`
- `idempotency.ts`
- `internal-auth.ts`
- `message-events.ts`
- `qstash.ts`
- `send-message-core.ts`
- `supabase.ts`

Regras aplicadas:

- Webhooks validam HMAC antes de qualquer processamento.
- Webhooks fazem claim atomico em `idempotency_log` antes de criar `message_events`.
- Webhooks nao executam agente diretamente.
- Processors usam token interno.
- Toda saida passa por `send-message` / `send-message-core`.
- `DRY_RUN=true` impede chamada real de Evolution Go.
- Evolution Go e a unica API de WhatsApp usada; nenhuma referencia a Evolution API antiga foi adicionada.
- `admin-message-processor` nao repete a busca por telefone: ele usa o `professional_id` ja gravado no `message_events`.
- Isso garante que a rastreabilidade nasce no evento e que o processor nao muda a identidade depois.

## Secrets Configurados

Configurados via Supabase secrets:

- `DRY_RUN=true`
- `INTERNAL_FUNCTION_TOKEN`
- `PROFESSIONAL_EVOLUTION_WEBHOOK_SECRET`
- `ADMIN_EVOLUTION_WEBHOOK_SECRET`

Nao configurado nesta fase:

- `ADMIN_MASTER_PHONES`: o smoke test do admin usou o caminho de numero desconhecido e roteou corretamente para `sales-agent`. O roteamento de numero master/admin deve ser testado quando esse secret for configurado.

Observacao: os valores usados em smoke tests foram removidos dos arquivos temporarios locais apos os testes.

## Testes Executados

### Banco / Migrations

- `npx supabase db push --dry-run`
  - passou antes da aplicacao.
- `npx supabase db push --yes`
  - aplicou as duas migrations iniciais da Fase 1.
- `npx supabase db push --dry-run`
  - validou a migration corretiva `20260605120900_phase1_professional_phone_lookup.sql`.
- `npx supabase db push --yes`
  - aplicou `20260605120900_phase1_professional_phone_lookup.sql`.
- `npx supabase db push --dry-run`
  - validou a migration corretiva `20260605121000_relax_professional_phone_lookup_uniqueness.sql`.
- `npx supabase db push --yes`
  - aplicou `20260605121000_relax_professional_phone_lookup_uniqueness.sql`.
- `npx supabase db push --dry-run`
  - confirmou depois: `Remote database is up to date`.

### Typecheck / Tooling

- `npm run typecheck --workspaces --if-present`
  - passou.
- `npx turbo ls`
  - passou e listou 5 packages.
- `npm run typecheck`
  - passou via Turbo.
- `npm run typecheck`
  - passou novamente apos a correcao do lookup do `webhook-admin` e do `admin-message-processor`.

### Edge Functions / Smoke Tests

Cobertos:

- `send-message` em `DRY_RUN`
  - retornou `dry_run: true` e `would_send`.
- `webhook-admin` com HMAC valido
  - retornou `{ received: true, queued: true }`.
- Reenvio do mesmo payload `webhook-admin`
  - retornou `{ received: true, duplicate: true }`.
- `webhook-admin` com HMAC invalido
  - retornou `401`.
- `admin-message-processor` em `DRY_RUN`
  - processou e roteou numero desconhecido para `sales-agent`.
- `webhook-whatsapp` com professional sintetico
  - retornou `{ received: true, queued: true }`.
- `message-processor` em `DRY_RUN`
  - retornou `{ processed: true, dry_run: true }`.
- Lookup admin por telefone em SQL remoto transacional (`ROLLBACK`)
  - telefone com 1 profissional ativo retornou o `professionals.id` esperado.
  - telefone repetido em 2 profissionais ativos nao bloqueou INSERT e retornou `null`, evitando roteamento ambiguo.
- `npx supabase functions list`
  - confirmou `webhook-admin` e `admin-message-processor` como `ACTIVE` apos redeploy.

Nao cobertos nesta rodada:

- Cenario BDD 6: falha de agente com `agent_executions.status='failed'`.
- Cenario BDD 7: isolamento RLS entre profissionais.

Esses dois cenarios devem ser testados antes de iniciar a proxima fase que dependa de leitura operacional dessas tabelas.

### Limpeza de Dados Sinteticos

Registros sinteticos de smoke test foram removidos de:

- `message_events`
- `agent_executions`
- `qstash_job_log`
- `professional_agents`
- `professionals`

Nao houve limpeza em `conversations` ou `conversation_contexts` porque os processors minimos desta fase ainda nao criaram/retomaram conversa durante os smoke tests. Essa capacidade esta prevista no contrato da fase, mas nao foi validada no smoke test executado.

Resultado final consultado:

- `message_events`: 0
- `agent_executions`: 0
- `qstash_job_log`: 0
- `professionals`: 0
- `idempotency_log`: 2

Observacao: as 2 linhas em `idempotency_log` ficaram por design, porque a tabela bloqueia delete antes do TTL de 7 dias.

## Arquivos Principais Alterados/Criados

### Root / Monorepo

- `package.json`
- `package-lock.json`
- `turbo.json` mantido, agora funcional com a nova estrutura

### Packages

- `packages/contracts/package.json`
- `packages/contracts/tsconfig.json`
- `packages/contracts/events/message-events.ts`
- `packages/contracts/edge-functions/webhook-whatsapp.ts`
- `packages/contracts/edge-functions/message-processor.ts`
- `packages/contracts/edge-functions/admin-message-processor.ts`
- `packages/contracts/edge-functions/send-message.ts`

### Supabase

- `supabase/functions/deno.json`
- `supabase/functions/_shared/*`
- `supabase/functions/webhook-whatsapp/index.ts`
- `supabase/functions/webhook-admin/index.ts`
- `supabase/functions/message-processor/index.ts`
- `supabase/functions/admin-message-processor/index.ts`
- `supabase/functions/send-message/index.ts`
- `supabase/migrations/20260605120700_phase1_whatsapp_observability.sql`
- `supabase/migrations/20260605120800_phase1_nerissa_setup.sql`
- `supabase/migrations/20260605120900_phase1_professional_phone_lookup.sql`
- `supabase/migrations/20260605121000_relax_professional_phone_lookup_uniqueness.sql`
- `supabase/seed.sql`

### Configuracao Local

- `apps/professional/.env.local`
  - configurado com `VITE_SUPABASE_URL` do projeto limpo v2.
  - configurado com `VITE_SUPABASE_ANON_KEY` fornecida pelo dono do produto.
  - arquivo coberto por `.gitignore`; nao deve ser versionado.

Observacao sobre seed: o planejamento citava `supabase/seed/phase1_whatsapp.sql`, mas a implementacao usou `supabase/seed.sql` porque o `supabase/config.toml` atual aponta para `./seed.sql`. Nao foi criado um caminho paralelo de seed para evitar divergencia.

## O Que Nao Foi Feito Nesta Fase

- Nenhum frontend novo.
- Nenhum LLM real.
- Nenhum envio real de WhatsApp.
- Nenhuma regra completa de Rosane/Nerissa.
- Nenhum fluxo de CRM Core com clientes.
- Nenhum `client_id`/`campaign_id` sem FK.
- Nenhum cron.
- Nenhuma tabela legada da v1.
- `nerissa_inbound_queue`: omitida por decisao do schema-guard; `message_events` + `qstash_job_log` + `conversation_contexts` cobrem o MVP tecnico sem criar fila redundante.
- `professional.onboarding.started`: adiado nesta Fase 1 porque esta subtask entregou placeholder/minimo tecnico. Resolvido na Fase 2 pelo `nerissa-setup-agent`.

## Eventos Adiados

- `professional.onboarding.started`: resolvido na Fase 2 pelo `nerissa-setup-agent` quando `mode='account_created'`.

## Correcoes Pos-Fase

Em 2026-06-05, antes de iniciar a fase seguinte:

- `_shared/evolution-go.ts` foi corrigido para usar o endpoint oficial Evolution Go `POST /send/text` com body `{ id, number, text }`.
- `webhook-whatsapp` e `webhook-admin` foram corrigidos para retornar `200` em erro interno apos HMAC, evitando retry infinito da Evolution Go. HMAC invalido continua retornando `401`.
- Functions redeployadas: `webhook-whatsapp`, `webhook-admin`, `send-message`, `message-processor`, `admin-message-processor`, `nerissa-setup-agent`.

## Pendencias / Proximos Passos

1. Definir a proxima fase conforme PRD-MASTER antes de codar.
2. Testar cenario BDD 6: falha de agente com `agent_executions.status='failed'`.
3. Testar cenario BDD 7: isolamento RLS entre profissionais.
4. Validar criacao/retomada de `conversations` e `conversation_contexts` quando o processor deixar de ser apenas minimo/dry-run.
5. Configurar e testar `ADMIN_MASTER_PHONES` para rota de numero master/admin.
6. Quando `clients` existir, adicionar `client_id` nas tabelas que precisarem, com FK real e indices.
7. Quando `campaigns` existir, adicionar `campaign_id` somente junto da FK real.
8. Substituir placeholders dos processors por agentes reais apenas na fase correta.
9. Manter `DRY_RUN=true` ate haver decisao explicita para envio real.
10. Antes de habilitar envio real, revisar secrets de Evolution Go, QStash e URLs de functions.

## Veredito

Fase 1 concluida como infraestrutura segura. A base de WhatsApp dual-channel, observabilidade, idempotencia, contracts runtime e deploy minimo das Edge Functions esta pronta para a proxima fase planejada.
