# Runbook — Mensagem WhatsApp Não Chegou (ou Rosane Não Respondeu)

## Sintoma

Usuário afirma que enviou mensagem por WhatsApp, mas a IA não respondeu e não há evidência clara de processamento. Pode ser: mensagem não chegou ao sistema, chegou mas não processou, processou mas Rosane não respondeu, ou respondeu mas o envio falhou.

## Impacto

- Atendimento de cliente perdido — potencial cancelamento ou no-show
- Onboarding de profissional interrompido
- SLA de resposta violado

## Primeiras Perguntas

1. A mensagem foi enviada para a instância da Nerissa (admin) ou do profissional (Rosane)?
2. Qual número enviou? Qual instância (instance_name)?
3. Qual horário aproximado (UTC)?
4. A instância estava conectada? (verificar `professional_agents.is_connected`)
5. Foi só essa mensagem ou todas as mensagens desse número/instância estão falhando?

---

## Cadeia de Diagnóstico (seguir em ordem)

### Passo 1: A Evolution Go recebeu a mensagem?

Isso está fora do nosso sistema — verificar no painel da Evolution Go se a mensagem foi recebida pela instância. Se não recebeu, o problema está na conexão do WhatsApp (ver runbook `evolution-disconnected.md`).

### Passo 2: O webhook recebeu?

```sql
-- Buscar em message_events pelo número ou instância
SELECT id, direction, status, external_message_id, message_type, created_at, metadata
FROM message_events
WHERE professional_id = (
  SELECT id FROM professionals
  WHERE instance_name = '<instance_name>'
    OR phone_whatsapp = '<phone_normalizado>'
  LIMIT 1
)
AND direction = 'inbound'
AND created_at > NOW() - INTERVAL '2 hours'
ORDER BY created_at DESC
LIMIT 20;
```

**Sem resultado:** o webhook não recebeu (ou HMAC falhou e rejeitou sem logar).

**Com resultado:** ir para Passo 3.

### Passo 3: O HMAC foi validado?

Se há registro em `message_events` → HMAC foi validado (webhook só insere após HMAC OK).

Se não há registro → pode ser rejeição silenciosa por HMAC inválido. Verificar logs da edge function `webhook-whatsapp` no Supabase Dashboard → buscar linhas com `401` ou `invalid hmac`.

### Passo 4: O claim de idempotência funcionou?

```sql
-- Verificar se há entrada em idempotency_log para o external_message_id
SELECT *
FROM idempotency_log
WHERE idempotency_key LIKE '%<external_message_id>%'
ORDER BY created_at DESC;
```

**Sem entrada:** idempotência não claimou → INSERT em idempotency_log falhou antes de enfileirar. Bug no webhook.

**Com entrada:** idempotência OK. Verificar se message_events foi criado (Passo 2 já verifica isso).

### Passo 5: O job foi publicado no QStash?

O evento `qstash.job.published` deve existir no log. Verificar também nos logs da edge function (Supabase Dashboard → Edge Functions → webhook-whatsapp → Logs) se há linha de sucesso de publicação no QStash.

```sql
-- Se houver tabela qstash_job_log
SELECT *
FROM qstash_job_log
WHERE message_event_id = '<message_event_id>'
ORDER BY created_at DESC;
```

**Sem publicação:** QStash não recebeu. Verificar `QSTASH_URL` e `QSTASH_TOKEN` nos secrets do Supabase. Ver runbook `qstash-jobs-stuck.md`.

### Passo 6: O message-processor consumiu?

```sql
-- Verificar se agent_executions foi criado para esta mensagem
SELECT ae.id, ae.agent_slug, ae.status, ae.error_code, ae.duration_ms, ae.created_at
FROM agent_executions ae
WHERE ae.trigger_ref = '<message_event_id>'
ORDER BY ae.created_at DESC;
```

**Sem resultado:** message-processor não foi chamado. Problema no QStash (entrega não ocorreu). Ver Passo 5.

**Com resultado:** ir para Passo 7.

### Passo 7: O agente executou com sucesso?

Verificar `agent_executions.status`:

- `success` → agente rodou. Verificar se enviou mensagem (Passo 8).
- `failed` → agente falhou. Ver `error_code` e `error_message`. Causa comum: LLM timeout, créditos zerados.
- `dry_run` → sistema em modo DRY_RUN. Nenhuma mensagem real será enviada. Isso é esperado em testes.
- `skipped` → agente classificou como `private_ignore` ou sem contexto suficiente.

### Passo 8: O send-message chamou a Evolution Go?

```sql
-- Verificar message_events outbound criado para esta conversa
SELECT id, direction, status, sent_by, agent_slug, external_message_id, created_at
FROM message_events
WHERE professional_id = '<professionalId>'
AND phone = '<phone_cliente>'
AND direction = 'outbound'
AND created_at > '<created_at do inbound>'
ORDER BY created_at DESC
LIMIT 5;
```

**Sem resultado:** send-message não foi chamado → agente rodou mas não gerou resposta (pode ser comportamento correto em `private_ignore`, shadow mode ou crédito zero com fallback enviado).

**Com `status='failed'`:** Evolution Go rejeitou o envio. Verificar se instância ainda está conectada.

**Com `status='dry_run'`:** modo DRY_RUN ativo — payloads logados, nada enviado.

**Com `status='sent'`:** mensagem foi enviada pela Evolution Go. Se o cliente não recebeu, o problema está no WhatsApp (bloqueio, número errado, etc.).

---

## Resumo da Cadeia

```
Evolution Go recebeu?         → Passo 1 (painel Evolution)
webhook recebeu?              → message_events inbound EXISTS?
HMAC validou?                 → sem message_events → checar logs 401
idempotency_log claimou?      → idempotency_log EXISTS?
QStash publicou?              → qstash_job_log EXISTS? ou logs edge fn
message-processor consumiu?   → agent_executions EXISTS?
agente executou OK?           → agent_executions.status = 'success'?
send-message chamou Evolution? → message_events outbound EXISTS?
mensagem_outbound OK?         → message_events.status = 'sent'?
```

## Correção Imediata

Identificar em qual passo a cadeia quebrou e corrigir especificamente. Não tentar reprocessar manualmente sem entender o passo de falha — pode duplicar.

## Correção Definitiva

Qualquer novo formato de payload da Evolution Go deve ser coberto por teste antes de produção. Cada passo da cadeia deve ter métrica de observabilidade.
