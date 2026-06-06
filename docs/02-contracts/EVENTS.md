# Contratos de Eventos — iaprafaturar v2

> **Autoridade:** PRD-MASTER.md (seção 8) lista os 22 eventos canônicos e as fases de cada um.
> Este documento contém o contrato completo de cada evento: payload, emissor, consumidores, idempotency key, retenção e efeitos.
>
> **Regra:** Nenhuma automação crítica deve depender de efeito implícito.
> Se algo precisa acionar outro fluxo, deve existir evento documentado aqui.

---

## Formato de Contrato

Cada evento declara:

| Campo | Significado |
|---|---|
| **Emissor** | Quem publica o evento (edge function, cron, frontend) |
| **Consumidores** | Quem reage ao evento |
| **Payload** | Estrutura de dados mínima obrigatória |
| **Idempotency key** | Campos que identificam unicidade (deduplicação) |
| **Retenção** | Por quanto tempo o registro deve existir no banco |
| **Efeitos permitidos** | O que pode acontecer como reação |
| **Efeitos proibidos** | O que nunca deve acontecer como reação |

---

## Convenções

```typescript
// actorType identifica quem causou o evento
type ActorType = 'professional' | 'team_member' | 'client' | 'admin' | 'ai' | 'system' | 'cron' | 'integration';

// Quando actor_type = 'ai': adicionar agent_slug para identificar qual agente
// agent_slug distingue Nerissa de Rosane e outros agentes sem expandir o enum
// Exemplos: 'nerissa-setup-agent' | 'rosane-duvidas-agent' | 'lembrete-agent'
// Nunca usar actor_type = 'nerissa' ou 'rosane' — enum não cresce por agente

// Todo evento tem event_id único (UUID v4)
// Todo evento tem occurred_at (ISO 8601, UTC)
// Todo evento referencia professional_id quando aplicável
```

### Idempotência — contrato obrigatório em todos os webhooks

O primeiro write de qualquer webhook **deve ser um claim atômico**:

```sql
-- Chave composta: source_webhook + ':' + instance_name + ':' + external_message_id
-- Exemplo: 'professional:clinica-dra-ana:3AB9F4D1E2C6'
INSERT INTO idempotency_log (idempotency_key)
VALUES ($idempotency_key)
ON CONFLICT (idempotency_key) DO NOTHING
RETURNING idempotency_key;

-- Se RETURNING retornar vazio → chave já existia → duplicata → retornar 200 sem continuar
-- Se RETURNING retornar idempotency_key → claim adquirido → prosseguir
```

Isso garante que dois webhooks iguais chegando em paralelo nunca processem o mesmo evento duas vezes. O claim vem antes do INSERT em `message_events` e antes de enfileirar no QStash.

---

## 1. Eventos de Profissional

---

### `professional.created`
**Fase:** 0

**Emitido quando:** profissional completa o cadastro e o registro em `professionals` é criado.

**Emissor:** `/cadastro` (frontend) via RPC ou trigger `after insert on professionals`.

**Consumidores:**
- `nerissa-setup-agent` — inicia boas-vindas via WhatsApp (FASE 2)
- Observabilidade — contagem de novos usuários

**Payload:**
```typescript
{
  event_id: string              // UUID v4
  professional_id: string       // professionals.id
  full_name: string
  email: string                 // mascarado nos logs de observabilidade
  plan_type: string             // 'trial' inicialmente
  occurred_at: string           // ISO 8601 UTC
  actor_type: 'system'
}
```

**Idempotency key:** `professional_id`

**Retenção:** permanente (dado de ciclo de vida do tenant)

**Efeitos permitidos:**
- Enviar mensagem de boas-vindas via Nerissa
- Criar configuração padrão de Rosane (`professional_agents`)

**Efeitos proibidos:**
- Cobrar o profissional antes da confirmação do trial
- Criar instância Evolution Go automaticamente (requer ação do profissional)

---

### `professional.onboarding.started`
**Fase:** 2

**Emitido quando:** profissional inicia a configuração guiada via Nerissa.

**Emissor:** `nerissa-setup-agent`

**Consumidores:**
- Observabilidade — funnel de ativação
- `nerissa_setup_sessions` — registra sessão ativa

**Payload:**
```typescript
{
  event_id: string
  professional_id: string
  session_id: string            // nerissa_setup_sessions.id
  channel: 'whatsapp' | 'app'
  occurred_at: string
  actor_type: 'ai'
  agent_slug: 'nerissa-setup-agent'
}
```

**Idempotency key:** `professional_id + session_id`

**Retenção:** 2 anos

**Efeitos permitidos:**
- Iniciar wizard de onboarding no app
- Registrar progresso de setup

**Efeitos proibidos:**
- Cobrar créditos de IA antes do onboarding completo

---

### `professional.onboarding.completed`
**Fase:** 2

**Emitido quando:** Rosane é ativada na instância do profissional e o onboarding é concluído.

**Emissor:** `nerissa-setup-agent`

**Consumidores:**
- Observabilidade — taxa de ativação
- Frontend — remove banner de setup pendente

**Payload:**
```typescript
{
  event_id: string
  professional_id: string
  session_id: string
  instance_name: string
  completed_steps: string[]
  occurred_at: string
  actor_type: 'ai'
  agent_slug: 'nerissa-setup-agent'
}
```

**Idempotency key:** `professional_id + session_id`

**Retenção:** permanente

**Efeitos permitidos:**
- Liberar todas as features do plano
- Enviar mensagem de parabéns via Nerissa

**Efeitos proibidos:**
- Marcar onboarding completo sem instância conectada

---

### `professional.whatsapp.connected`
**Fase:** 2

**Emitido quando:** instância Evolution Go do profissional passa a estar conectada (QR code escaneado com sucesso).

**Emissor:** `webhook-whatsapp` (ao receber evento `connection.update` com status `open` da Evolution Go)

**Consumidores:**
- Frontend — atualiza status da instância em tempo real (Realtime)
- `nerissa-setup-agent` — avança etapa de onboarding
- Crons — liberam envios outbound bloqueados

**Payload:**
```typescript
{
  event_id: string
  professional_id: string
  instance_name: string
  phone: string | null          // número conectado, null se ainda não disponível
  whatsapp_type: 'personal' | 'business' | 'unknown'
  occurred_at: string
  actor_type: 'system'
}
```

**Idempotency key:** `professional_id + instance_name + date(occurred_at)`
(uma conexão por instância por dia é suficiente para deduplicar)

**Retenção:** 1 ano

**Efeitos permitidos:**
- Liberar envio de mensagens outbound
- Notificar profissional via Nerissa (admin canal)

**Efeitos proibidos:**
- Enviar mensagem para clientes automaticamente ao conectar

---

### `professional.whatsapp.disconnected`
**Fase:** 2

**Emitido quando:** instância Evolution Go é desconectada.

**Emissor:** `webhook-whatsapp` (ao receber evento `connection.update` com status `close`)

**Consumidores:**
- Frontend — exibe alerta de instância desconectada
- `nerissa-setup-agent` — avisa profissional via admin canal
- Crons — pausam envios outbound

**Payload:**
```typescript
{
  event_id: string
  professional_id: string
  instance_name: string
  reason: string | null         // motivo reportado pela Evolution Go
  occurred_at: string
  actor_type: 'system'
}
```

**Idempotency key:** `professional_id + instance_name + occurred_at`

**Retenção:** 1 ano

**Efeitos permitidos:**
- Bloquear envios outbound da instância
- Avisar profissional via canal admin (Nerissa)

**Efeitos proibidos:**
- Enviar mensagens para clientes pelo canal admin como fallback
- Deletar histórico de conversas

---

## 2. Eventos de WhatsApp

---

### `whatsapp.message.received`
**Fase:** 1

**Emitido quando:** mensagem inbound válida chega por qualquer instância (admin ou profissional) e é inserida em `message_events`.

**Emissor:** `webhook-whatsapp` ou `webhook-admin`

> **Invariante:** este evento é registrado em `message_events` com `direction='inbound'` ANTES de qualquer lógica de agente. O INSERT acontece no webhook, não no processador.

**Consumidores:**
- `message-processor` / `admin-message-processor` — processa e roteia
- Observabilidade — volume de mensagens

**Payload:**
```typescript
{
  event_id: string
  message_event_id: string      // message_events.id
  source_webhook: 'admin' | 'professional'
  instance_name: string
  professional_id: string | null  // null no canal admin antes de resolver
  phone: string
  message_type: 'text' | 'audio' | 'image' | 'document' | 'other'
  external_message_id: string   // ID gerado pela Evolution Go
  occurred_at: string
  actor_type: 'system'
}
```

**Idempotency key:** `source_webhook + instance_name + external_message_id`

> **Contrato de idempotência atômica (obrigatório):** o webhook deve tentar INSERT em `idempotency_log` com `ON CONFLICT DO NOTHING RETURNING id`. Se o RETURNING retornar vazio, o evento já foi processado — retornar 200 imediatamente sem inserir em `message_events` e sem enfileirar no QStash. Isso elimina race condition entre entregas paralelas do mesmo webhook.

**Retenção:** 2 anos (dado de auditoria de comunicação)

**Efeitos permitidos:**
- Enfileirar para processamento via QStash (emite `qstash.job.published`)
- Acumular mensagens rápidas com debounce Redis (4s)

**Efeitos proibidos:**
- Responder diretamente ao remetente dentro do webhook (< 300ms obrigatório)
- Processar mensagens de fromMe=true, grupos ou broadcast
- Inserir em `message_events` antes de claim atômico de idempotência

---

### `whatsapp.message.sent`
**Fase:** 1

**Emitido quando:** mensagem outbound é enviada com sucesso pela Evolution Go.

**Emissor:** `send-message` (edge function)

> **Invariante:** se DRY_RUN=true, este evento é registrado com `status='dry_run'` e nenhuma mensagem real é enviada.

**Consumidores:**
- Frontend — atualiza status da conversa
- Observabilidade — volume de envios por agente

**Payload:**
```typescript
{
  event_id: string
  message_event_id: string      // message_events.id
  professional_id: string
  instance_name: string
  phone: string
  sent_by: 'ai' | 'professional' | 'system'
  agent_slug: string | null     // qual agente enviou (se ai)
  external_message_id: string | null  // retornado pela Evolution Go
  dry_run: boolean
  occurred_at: string
  actor_type: ActorType
}
```

**Idempotency key:** `professional_id + instance_name + agent_execution_id + phone`

**Retenção:** 2 anos

**Efeitos permitidos:**
- Atualizar `conversation_contexts.last_sent_at`
- Contabilizar crédito de IA consumido

**Efeitos proibidos:**
- Reenviar automaticamente em caso de falha sem limite de tentativas
- Enviar para grupo ou broadcast (sempre 1:1)

---

## 3. Eventos de IA

---

### `ai.interaction.started`
**Fase:** 1

**Emitido quando:** agente inicia processamento de uma mensagem ou tarefa.

**Emissor:** `message-processor` (antes de invocar o agente LLM)

**Consumidores:**
- `agent_executions` — abre registro de execução
- Observabilidade — latência de agentes

**Payload:**
```typescript
{
  event_id: string
  agent_execution_id: string    // agent_executions.id
  professional_id: string
  agent_slug: string            // ex: 'rosane-duvidas', 'lembrete-agent'
  trigger_type: 'message' | 'cron' | 'manual'
  trigger_ref: string | null    // message_event_id ou job_id
  occurred_at: string
  actor_type: 'ai'
}
```

**Idempotency key:** `agent_execution_id`

**Retenção:** 1 ano

**Efeitos permitidos:**
- Reservar crédito temporariamente (confirmar ao finalizar)

**Efeitos proibidos:**
- Enviar mensagem antes de `ai.interaction.completed`

---

### `ai.interaction.completed`
**Fase:** 1

**Emitido quando:** agente finaliza processamento (com sucesso ou falha).

**Emissor:** `message-processor` (após execução do agente)

**Consumidores:**
- `agent_executions` — fecha registro com status e tokens consumidos
- `credits.consumed` — debita crédito real

**Payload:**
```typescript
{
  event_id: string
  agent_execution_id: string
  professional_id: string
  agent_slug: string
  status: 'success' | 'failed' | 'dry_run' | 'skipped'
  tokens_used: number | null
  credits_consumed: number | null
  error_code: string | null
  duration_ms: number
  occurred_at: string
  actor_type: 'ai'
}
```

**Idempotency key:** `agent_execution_id`

**Retenção:** 1 ano

**Efeitos permitidos:**
- Debitar créditos reais (`credits_consumed`)
- Emitir `whatsapp.message.sent` se resposta foi gerada

**Efeitos proibidos:**
- Alterar `agent_executions` após gravado (imutável)
- Debitar crédito se status='dry_run' ou status='failed' sem uso real de tokens

---

## 4. Eventos de Cliente/CRM

---

### `client.created`
**Fase:** 3

**Emitido quando:** novo cliente é cadastrado na clínica (manual ou via link público).

**Emissor:** hook `after insert on clients` ou RPC de cadastro público

**Consumidores:**
- Observabilidade — crescimento da base
- `journey_stage` inicializado como `lead`

**Payload:**
```typescript
{
  event_id: string
  professional_id: string
  client_id: string             // clients.id
  full_name: string
  source: 'manual' | 'public_link' | 'whatsapp' | 'import'
  initial_stage: string         // normalmente 'lead'
  occurred_at: string
  actor_type: ActorType
}
```

**Idempotency key:** `professional_id + client_id`

**Retenção:** permanente

**Efeitos permitidos:**
- Iniciar fluxo de boas-vindas da Rosane (se habilitado)
- Registrar em audit_log

**Efeitos proibidos:**
- Enviar mensagem de marketing imediatamente ao criar

---

### `client.updated`
**Fase:** 3

**Emitido quando:** dados do cliente são atualizados.

**Emissor:** frontend (via useMutation) ou RPC

**Consumidores:**
- Observabilidade — completude de dados
- Cache invalidation no frontend

**Payload:**
```typescript
{
  event_id: string
  professional_id: string
  client_id: string
  changed_fields: string[]      // lista de campos alterados (sem valores)
  occurred_at: string
  actor_type: ActorType
}
```

**Idempotency key:** `professional_id + client_id + occurred_at`

**Retenção:** 1 ano

**Efeitos permitidos:**
- Atualizar cache de busca
- Disparar reprocessamento de RFM se campo relevante mudou (FASE 8)

**Efeitos proibidos:**
- Incluir valores antigos ou novos no payload (LGPD — dados sensíveis)

---

### `client.journey_stage.changed`
**Fase:** 3

**Emitido quando:** `journey_stage` do cliente muda no funil.

**Emissor:** RPC `move_client_stage()` (com IDOR protection)

> **Invariante:** toda mudança de stage emite este evento. Mudanças diretas na coluna via UPDATE sem RPC são proibidas.

**Consumidores:**
- Observabilidade — conversão por stage
- Agentes Rosane (ex: enviar mensagem de reativação ao entrar em `inativo`)
- Frontend — Kanban atualiza em tempo real via Realtime

**Payload:**
```typescript
{
  event_id: string
  professional_id: string
  client_id: string
  from_stage: string | null     // null se é o primeiro stage definido
  to_stage: string              // 'lead' | 'agendado' | 'em_tratamento' | 'pos_tratamento' | 'cliente_fiel' | 'inativo'
  triggered_by: 'manual' | 'agent' | 'automation' | 'system'
  trigger_ref: string | null    // agent_execution_id ou job_id
  occurred_at: string
  actor_type: ActorType
}
```

**Idempotency key:** `professional_id + client_id + to_stage + date(occurred_at)`

**Retenção:** permanente (histórico de funil é dado estratégico)

**Efeitos permitidos:**
- Disparar agentes configurados para o stage de destino
- Atualizar RFM score (FASE 8)

**Efeitos proibidos:**
- Reverter stage automaticamente sem ação do profissional
- Mover para stage anterior sem confirmação explícita

---

## 5. Eventos de Agenda

---

### `appointment.created`
**Fase:** 3

**Emitido quando:** agendamento é criado (manual pelo profissional ou via link público).

**Emissor:** RPC de criação de agendamento ou handler público

**Consumidores:**
- `appointment-confirmation-agent` — envia confirmação via WhatsApp (FASE 5)
- Frontend — atualiza agenda em tempo real
- Observabilidade

**Payload:**
```typescript
{
  event_id: string
  professional_id: string
  appointment_id: string        // appointments.id
  client_id: string
  service_id: string | null
  scheduled_at: string          // ISO 8601 UTC
  initial_status: 'agendado'
  source: 'crm' | 'public_link' | 'whatsapp'
  occurred_at: string
  actor_type: ActorType
}
```

**Idempotency key:** `professional_id + appointment_id`

**Retenção:** permanente

**Efeitos permitidos:**
- Enfileirar envio de confirmação (via agente)
- Criar lembrete no cron de D-1

**Efeitos proibidos:**
- Status diferente de `agendado` ao criar
- Criar dois agendamentos simultâneos no mesmo horário para o mesmo profissional

---

### `appointment.confirmed`
**Fase:** 5

**Emitido quando:** cliente confirma presença via WhatsApp ou profissional confirma no CRM.

**Emissor:** `appointment-confirmation-agent` (IA) ou frontend (profissional)

**Consumidores:**
- Frontend — atualiza status do card na agenda
- Observabilidade — taxa de confirmação

**Payload:**
```typescript
{
  event_id: string
  professional_id: string
  appointment_id: string
  client_id: string
  actor_type: 'client' | 'professional'  // quem agiu (cliente respondeu "sim" / profissional clicou)
  source: 'whatsapp' | 'crm'             // canal pelo qual a ação veio
  processed_by: string | null            // agent_slug se foi interpretado por IA (ex: 'appointment-confirmation-agent')
  occurred_at: string
}
```

> **Nota:** quando o cliente confirma via WhatsApp, `actor_type='client'` e `processed_by='appointment-confirmation-agent'`. Rosane interpretou a resposta, mas o ator da transição é o cliente.

**Idempotency key:** `professional_id + appointment_id + 'confirmed'`

**Retenção:** permanente

**Efeitos permitidos:**
- Mover status de `agendado` para `confirmado`
- Enviar confirmação para profissional

**Efeitos proibidos:**
- Confirmar agendamento já cancelado ou realizado

---

### `appointment.cancelled`
**Fase:** 3

**Emitido quando:** agendamento é cancelado antes de ocorrer.

**Emissor:** frontend (profissional/team_member), `appointment-confirmation-agent` (se cliente cancelou via WhatsApp)

**Consumidores:**
- Frontend — remove da agenda
- Cron de lembretes — cancela lembrete pendente

**Payload:**
```typescript
{
  event_id: string
  professional_id: string
  appointment_id: string
  client_id: string
  cancelled_by: 'professional' | 'team_member' | 'client' | 'ai'
  reason: string | null
  occurred_at: string
  actor_type: ActorType
}
```

**Idempotency key:** `professional_id + appointment_id + 'cancelled'`

**Retenção:** permanente

**Efeitos permitidos:**
- Notificar a outra parte via WhatsApp (se habilitado)
- Liberar horário na agenda

**Efeitos proibidos:**
- Cobrar pelo agendamento cancelado automaticamente

---

### `appointment.rescheduled`
**Fase:** 3

**Emitido quando:** agendamento é remarcado (o antigo é cancelado e um novo é criado).

**Emissor:** frontend (profissional) ou `appointment-confirmation-agent`

**Consumidores:**
- Frontend — atualiza agenda
- Observabilidade — taxa de remarcação

**Payload:**
```typescript
{
  event_id: string
  professional_id: string
  old_appointment_id: string
  new_appointment_id: string
  client_id: string
  rescheduled_by: 'professional' | 'client' | 'ai'
  occurred_at: string
  actor_type: ActorType
}
```

**Idempotency key:** `professional_id + old_appointment_id + 'rescheduled'`

**Retenção:** permanente

**Efeitos permitidos:**
- Cancelar automaticamente o agendamento antigo (`appointment.cancelled`)
- Emitir `appointment.created` para o novo

**Efeitos proibidos:**
- Remarcar sem criar novo agendamento (o antigo nunca vira `agendado` de novo)

---

### `appointment.completed`
**Fase:** 3

**Emitido quando:** sessão realizada é registrada pelo profissional no CRM.

**Emissor:** frontend (profissional) — **apenas profissional pode emitir**

> **Invariante:** nenhum agente de IA pode emitir este evento. Exclusivo do profissional.

**Consumidores:**
- `relacionamento-agent` — dispara pós-atendimento D+1 (FASE 5)
- Financeiro — abre lançamento pendente de pagamento
- RFM — atualiza contador de sessões (FASE 8)

**Payload:**
```typescript
{
  event_id: string
  professional_id: string
  appointment_id: string
  session_id: string            // sessions.id criado junto
  client_id: string
  occurred_at: string
  actor_type: 'professional' | 'team_member'
}
```

**Idempotency key:** `professional_id + appointment_id + 'completed'`

**Retenção:** permanente

**Efeitos permitidos:**
- Mover `journey_stage` do cliente para `em_tratamento` (se estava em `agendado`)
- Disparar fluxo pós-atendimento

**Efeitos proibidos:**
- Completar agendamento sem criar registro de sessão (`sessions`)
- Marcar como completo sem auth do profissional

---

### `appointment.no_show`
**Fase:** 5

**Emitido quando:** profissional registra falta do cliente.

**Emissor:** frontend (profissional) — **apenas profissional pode emitir**

> **Invariante:** nenhum agente de IA pode emitir este evento. Exclusivo do profissional.

**Consumidores:**
- Observabilidade — taxa de falta
- RFM — penaliza score de frequência (FASE 8)

**Payload:**
```typescript
{
  event_id: string
  professional_id: string
  appointment_id: string
  client_id: string
  occurred_at: string
  actor_type: 'professional' | 'team_member'
}
```

**Idempotency key:** `professional_id + appointment_id + 'no_show'`

**Retenção:** permanente

**Efeitos permitidos:**
- Enviar mensagem de follow-up educado via Rosane (se habilitado)

**Efeitos proibidos:**
- Bloquear cliente automaticamente por falta
- Cobrar taxa de no-show sem confirmação explícita do profissional

---

## 6. Eventos Financeiros

---

### `payment.created`
**Fase:** 4

**Emitido quando:** lançamento financeiro é criado (manual ou ao registrar sessão).

**Emissor:** frontend ou hook `after insert on financial_transactions`

**Consumidores:**
- Dashboard — atualiza Zona 3 (Pulso financeiro)
- Observabilidade — volume de receita

**Payload:**
```typescript
{
  event_id: string
  professional_id: string
  transaction_id: string        // financial_transactions.id
  amount_cents: number          // valor em centavos
  type: 'income' | 'expense'
  status: 'pending' | 'paid'
  linked_session_id: string | null
  linked_appointment_id: string | null
  occurred_at: string
  actor_type: ActorType
}
```

**Idempotency key:** `professional_id + transaction_id`

**Retenção:** permanente — ON DELETE RESTRICT (dado fiscal)

**Efeitos permitidos:**
- Atualizar DRE do mês

**Efeitos proibidos:**
- DELETE ou UPDATE após `status='paid'` (dado fiscal imutável)
- Soft delete de transação com nota fiscal vinculada

---

### `payment.received`
**Fase:** 4

**Emitido quando:** pagamento é confirmado (manual pelo profissional).

**Emissor:** frontend (profissional confirma recebimento)

**Consumidores:**
- Dashboard — atualiza Zona 3
- Observabilidade — MRR e receita real

**Payload:**
```typescript
{
  event_id: string
  professional_id: string
  transaction_id: string
  amount_cents: number
  payment_method: 'pix' | 'cash' | 'card' | 'other'
  received_at: string
  occurred_at: string
  actor_type: 'professional' | 'team_member'
}
```

**Idempotency key:** `professional_id + transaction_id + 'received'`

**Retenção:** permanente — dado fiscal

**Efeitos permitidos:**
- Atualizar `status` para `paid` em `financial_transactions`
- Vincular a sessão/agendamento

**Efeitos proibidos:**
- Confirmar pagamento automaticamente por gateway sem revisão do profissional (FASE 4 = manual)

---

## 7. Eventos de Campanha

---

### `campaign.created`
**Fase:** 8

**Emitido quando:** campanha de broadcast é criada e agendada.

**Emissor:** frontend (profissional)

**Consumidores:**
- Cron de campanha — agenda o disparo
- Observabilidade — volume de campanhas criadas

**Payload:**
```typescript
{
  event_id: string
  professional_id: string
  campaign_id: string           // campaigns.id
  name: string
  target_segment: string        // ex: 'clientes_inativos_30d', 'todos'
  scheduled_at: string | null   // null = imediato
  recipient_count: number       // quantos clientes receberão
  occurred_at: string
  actor_type: 'professional'
}
```

**Idempotency key:** `professional_id + campaign_id`

**Retenção:** 2 anos

**Efeitos permitidos:**
- Gerar lista de destinatários em `campaign_recipients`

**Efeitos proibidos:**
- Enviar mensagens antes de `campaign.dispatched`
- Incluir clientes de outra clínica na campanha

---

### `campaign.dispatched`
**Fase:** 8

**Emitido quando:** campanha é enviada (dry_run ou real).

**Emissor:** edge function de campanha (cron ou manual)

> **Invariante:** testes automatizados usam DRY_RUN=true. Este evento é registrado mesmo em dry_run, com `dry_run: true` no payload.

**Consumidores:**
- Frontend — atualiza status da campanha para `enviada`
- Observabilidade — taxa de entrega

**Payload:**
```typescript
{
  event_id: string
  professional_id: string
  campaign_id: string
  dispatched_count: number      // quantos foram enviados neste lote
  failed_count: number          // quantos falharam
  dry_run: boolean
  occurred_at: string
  actor_type: 'cron' | 'professional'
}
```

**Idempotency key:** `professional_id + campaign_id + occurred_at`

**Retenção:** 2 anos

**Efeitos permitidos:**
- Atualizar `campaign_dispatches` com resultados por destinatário
- Notificar profissional com resumo

**Efeitos proibidos:**
- Reenviar para destinatários que já receberam na mesma campanha

---

## 8. Eventos de Infraestrutura — QStash

> Eventos operacionais internos para diagnóstico de fila. Não são eventos de produto.
> **Fonte única: `qstash_job_log`** — nunca misturar com `agent_executions`.
>
> `agent_executions` = o que Rosane/Nerissa fez (execução de negócio, tokens, resultados)
> `qstash_job_log`   = o que a fila fez (infraestrutura, entrega, retries, DLQ)
>
> Misturar os dois impede queries de diagnóstico eficientes: "quantos jobs falharam hoje?" é pergunta de infraestrutura; "quantas interações a Rosane completou?" é pergunta de negócio.

---

### `qstash.job.published`
**Fase:** 1

**Emitido quando:** webhook publica job no QStash com sucesso (após claim atômico de idempotência).

**Emissor:** `webhook-whatsapp` ou `webhook-admin`

**Consumidores:**
- Observabilidade — volume de jobs publicados vs consumidos

**Payload:**
```typescript
{
  event_id: string
  job_id: string                // ID retornado pelo QStash
  queue_name: string            // 'message-processor' | 'admin-message-processor'
  message_event_id: string      // message_events.id associado
  professional_id: string | null
  published_at: string
  actor_type: 'system'
}
```

**Idempotency key:** `message_event_id + queue_name`

**Retenção:** 30 dias

---

### `qstash.job.consumed`
**Fase:** 1

**Emitido quando:** `message-processor` ou `admin-message-processor` recebe e inicia o processamento do job.

**Emissor:** `message-processor` (primeira linha do handler, antes de qualquer lógica)

**Consumidores:**
- Observabilidade — latência de fila (published_at → consumed_at)

**Payload:**
```typescript
{
  event_id: string
  job_id: string                // mesmo job_id do qstash.job.published
  queue_name: string
  message_event_id: string
  professional_id: string | null
  retry_count: number           // 0 = primeira tentativa
  consumed_at: string
  actor_type: 'system'
}
```

**Idempotency key:** `job_id + retry_count`

**Retenção:** 30 dias

---

### `qstash.job.failed`
**Fase:** 1

**Emitido quando:** processamento do job falha (exception, timeout, erro de agente) e QStash fará retry.

**Emissor:** `message-processor` (no catch) ou QStash (via dead letter webhook se configurado)

**Consumidores:**
- Observabilidade — taxa de falha por fila e agent_slug
- Alerta: se > 5 falhas em 10 minutos para mesmo profissional → alertar admin

**Payload:**
```typescript
{
  event_id: string
  job_id: string
  queue_name: string
  message_event_id: string
  professional_id: string | null
  retry_count: number
  max_retries: number           // configuração do QStash (tipicamente 3)
  error_type: 'timeout' | 'signature_invalid' | 'llm_error' | 'db_error' | 'unknown'
  error_message: string | null
  failed_at: string
  actor_type: 'system'
}
```

**Idempotency key:** `job_id + retry_count + 'failed'`

**Retenção:** 90 dias

**Efeitos proibidos:**
- Alertar profissional automaticamente a cada retry — apenas ao atingir dead letter

---

### `qstash.job.dead_lettered`
**Fase:** 1

**Emitido quando:** job esgotou todas as tentativas (max_retries atingido) e entrou no Dead Letter Queue (DLQ).

**Emissor:** QStash (via webhook de DLQ configurado em endpoint `/webhook-dlq`) ou `message-processor` na última tentativa

**Consumidores:**
- Admin — alerta crítico: mensagem do cliente perdida
- Observabilidade — volume de DLQ (indicador de saúde do sistema)

**Payload:**
```typescript
{
  event_id: string
  job_id: string
  queue_name: string
  message_event_id: string
  professional_id: string | null
  total_attempts: number
  last_error_type: string
  last_error_message: string | null
  dead_lettered_at: string
  actor_type: 'system'
}
```

**Idempotency key:** `job_id + 'dead_lettered'`

**Retenção:** 1 ano

**Efeitos permitidos:**
- Notificar admin via Nerissa
- Marcar `message_events.status = 'dead_lettered'` para rastreabilidade

**Efeitos proibidos:**
- Notificar o cliente que a mensagem foi perdida (avisar profissional para agir manualmente)

---

## Regra Geral

> Nenhuma automação crítica deve depender de efeito implícito.
> Se algo precisa acionar outro fluxo, deve existir evento documentado neste arquivo.
> Eventos são imutáveis após gravação. Correções via novo evento, nunca via UPDATE.
