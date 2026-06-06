# Runbook — QStash Com Jobs Travados ou Falhando

## Sintoma

Mensagem inbound chegou (`message_events` tem registro com `direction='inbound'`), mas o processamento assíncrono não aconteceu — sem `agent_executions`, sem resposta ao cliente. Ou: job aparece no dashboard do QStash como "failed" ou "dead lettered".

## Impacto

- Mensagens de clientes ficam sem resposta
- Agentes não executam (lembretes, confirmações, follow-ups)
- SLA de resposta violado silenciosamente

## Primeiras Perguntas

1. O problema é em todas as mensagens ou só em algumas instâncias?
2. O `message_events` inbound foi criado? (se não, ver runbook `whatsapp-message-not-received.md`)
3. Há entradas no `qstash_job_log` (ou logs da edge function) mostrando publicação?
4. O QStash está chamando o endpoint `message-processor`? (verificar painel QStash)
5. Qual o `error_type` no `qstash.job.failed` — assinatura, timeout, ou erro da edge function?

---

## Cadeia de Diagnóstico

### Passo 1: Confirmar que o webhook publicou o job

```sql
-- Verificar se o webhook tentou publicar
SELECT id, status, created_at, metadata
FROM message_events
WHERE direction = 'inbound'
  AND status IN ('queued', 'failed')
  AND created_at > NOW() - INTERVAL '1 hour'
  AND professional_id = '<professionalId>'
ORDER BY created_at DESC;
```

`status='queued'` há mais de 5 minutos = job publicado mas não consumido.
`status='failed'` = webhook falhou antes de publicar.

Verificar logs da edge function `webhook-whatsapp` no Supabase Dashboard para linha de sucesso/falha da publicação QStash.

### Passo 2: Verificar se QStash recebeu

No painel Upstash QStash:
- Acessar a fila `message-processor`
- Verificar jobs com timestamp da ocorrência
- Status esperado: `delivered` (consumido com sucesso) ou `failed` (com detalhes de erro)

Se o job não aparece no QStash → publicação falhou. Ver Passo 4.

### Passo 3: Verificar se message-processor foi chamado

```sql
-- agent_executions deve existir após consumo
SELECT ae.id, ae.agent_slug, ae.status, ae.error_code, ae.duration_ms, ae.created_at
FROM agent_executions ae
WHERE ae.trigger_ref = '<message_event_id>'
ORDER BY ae.created_at DESC;
```

**Sem resultado:** QStash tentou chamar message-processor mas a edge function não iniciou (ou retornou erro antes de criar o registro). Verificar logs de `message-processor` no Supabase.

### Passo 4: Distinguir tipos de erro

**Erro de assinatura QStash (`signature_invalid`):**
- QStash usa `Upstash-Signature` header para autenticar
- Verificar que `QSTASH_CURRENT_SIGNING_KEY` e `QSTASH_NEXT_SIGNING_KEY` estão corretos no Supabase Vault
- O token rotaciona periodicamente no Upstash — atualizar o secret quando rotacionar

```bash
# Verificar secret atual (via Supabase CLI ou dashboard)
# O message-processor deve verificar assim:
const receiver = new Receiver({ currentSigningKey, nextSigningKey });
await receiver.verify({ signature: req.headers['upstash-signature'], body });
```

**Timeout da edge function:**
- Supabase Edge Functions têm limite de 25s
- Se message-processor demora mais → QStash interpreta como falha e faz retry
- Verificar `agent_executions.duration_ms` — se > 20000ms, investigar gargalo (LLM lento, query pesada)

**Erro de DB (connection refused, timeout):**
- Verificar logs do Supabase para erros de pooler
- Edge Functions usam connection pooler (pgbouncer) — verificar pool esgotado

**Erro de LLM:**
- `error_code = 'llm_timeout'` ou `'llm_rate_limit'`
- Verificar status do provedor LLM
- QStash fará retry automático (configurar max 3 retries com backoff)

### Passo 5: Verificar Dead Letter Queue

Se job atingiu max_retries → entrou no DLQ. O evento `qstash.job.dead_lettered` deve ter sido registrado.

```sql
-- Verificar message_events com status dead_lettered
SELECT id, phone, direction, status, external_message_id, created_at
FROM message_events
WHERE status = 'dead_lettered'
  AND created_at > NOW() - INTERVAL '24 hours'
ORDER BY created_at DESC;
```

Jobs no DLQ = mensagens de clientes **definitivamente perdidas**. Admin deve ser notificado via Nerissa.

---

## Correção Imediata

**Job publicado mas não consumido (stuck em 'queued'):**
```bash
# Via painel QStash: localizar job e re-enqueue manualmente
# OU chamar message-processor diretamente (em último caso):
curl -X POST https://<supabase-url>/functions/v1/message-processor \
  -H "Authorization: Bearer <service_role_key>" \
  -d '{"message_event_id": "<id>"}'
```

**Erro de assinatura:**
1. Acessar painel Upstash → copiar signing keys atuais
2. Atualizar secrets no Supabase Vault: `QSTASH_CURRENT_SIGNING_KEY` e `QSTASH_NEXT_SIGNING_KEY`
3. Re-enqueue os jobs que falharam

**Jobs no DLQ:**
- Não há retry automático — cada job deve ser revisado manualmente
- Para cada job: verificar o `message_event_id`, entender o conteúdo e decidir se deve reprocessar ou marcar como `skipped`

## Correção Definitiva

- Configurar webhook de DLQ no QStash apontando para `/webhook-dlq` — registra `qstash.job.dead_lettered` automaticamente
- Alarme: se `agent_executions` acumular > 5 `status='failed'` em 10 minutos → alertar admin
- Testar assinatura QStash em ambiente de staging antes de mudar secrets em produção
- Edge function `message-processor` deve ter timeout de agente configurado explicitamente (< 20s) para não atingir o limite da Supabase

## Prevenção

- `QSTASH_CURRENT_SIGNING_KEY` e `QSTASH_NEXT_SIGNING_KEY` devem ser rotacionados com antecedência (Upstash avisa com 7 dias)
- Monitorar `avg(duration_ms)` de `agent_executions` — se subir > 15s, investigar
- Todo job publicado deve ter correspondência em `agent_executions` — divergência é indicador de problema
