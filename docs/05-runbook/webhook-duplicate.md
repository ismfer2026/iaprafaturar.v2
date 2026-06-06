# Runbook — Webhook Processado 2x (Duplicata)

## Sintoma

A mesma mensagem do cliente aparece respondida duas vezes, ou o mesmo agendamento dispara dois lembretes. Logs mostram dois registros em `agent_executions` com o mesmo `trigger_ref` (message_event_id), ou dois registros em `message_events` com o mesmo `external_message_id`.

## Impacto

- Cliente recebe resposta duplicada (confuso, parece bug)
- Crédito de IA consumido 2x para o mesmo evento
- Potencial dupla confirmação de agendamento

## Primeiras Perguntas

1. O `idempotency_log` tem entrada para a chave composta `source_webhook:instance_name:external_message_id`?
2. Dois webhooks chegaram com timestamps diferentes (> 5s)? → Evolution Go fez reentrega por timeout
3. Ou dois webhooks chegaram quase simultâneos (< 1s)? → race condition no claim
4. O segundo processamento ocorreu em qual edge function e em qual horário?
5. O `instance_name` do profissional tem `UNIQUE INDEX` em `professional_whatsapp`? (se não, chave de idempotência pode colidir)

## Consultas Seguras

Verificar duplicata em `message_events` pela chave composta:
```sql
-- source_webhook e instance_name são colunas reais — filtro direto, sem JSONB
SELECT id, direction, status, external_message_id, source_webhook, instance_name, created_at
FROM message_events
WHERE external_message_id = '<external_message_id>'
  AND instance_name = '<instance_name>'
  AND source_webhook = '<source_webhook>'
ORDER BY created_at;
-- Se retornar 2+ linhas → duplicata confirmada
```

Verificar se o claim de idempotência foi feito:
```sql
-- A idempotency_key deve estar no formato: '{source_webhook}:{instance_name}:{external_message_id}'
SELECT idempotency_key, created_at, expires_at
FROM idempotency_log
WHERE idempotency_key = 'professional:<instance_name>:<external_message_id>'
   OR idempotency_key = 'admin:<instance_name>:<external_message_id>';
```

Verificar execuções duplicadas de agente:
```sql
SELECT id, agent_slug, status, created_at
FROM agent_executions
WHERE trigger_ref = '<message_event_id_1>'
   OR trigger_ref = '<message_event_id_2>'
ORDER BY created_at;
-- Se retornar 2+ linhas com o mesmo conteúdo → agente rodou 2x
```

## Interpretação

- **Sem entrada em `idempotency_log`:** o claim atômico não foi executado antes do INSERT em `message_events`. Bug no webhook — o padrão `ON CONFLICT DO NOTHING RETURNING id` não está implementado.

- **Com entrada em `idempotency_log` mas dois `message_events`:** race condition clássica — dois webhooks chegaram no mesmo instante, ambos checaram antes de inserir. O `SELECT ... FOR UPDATE` não funciona em edge functions distribuídas. Solução: só o `INSERT ... ON CONFLICT` é atômico neste contexto.

- **Com entrada em `idempotency_log` e dois `agent_executions`:** o `message-processor` processou o mesmo `message_event_id` duas vezes — QStash fez reentrega. O processador deve ter verificação de idempotência secundária antes de executar o agente.

- **Dois webhooks com timestamps > 5s de diferença:** Evolution Go fez reentrega por não receber 200. Webhook sempre deve retornar 200 após HMAC validado, mesmo se o processamento falhar internamente.

## Correção Imediata

1. Identificar se a resposta duplicada já chegou ao cliente — se sim, não há reversão. Registrar o incidente.
2. Se o segundo job ainda está na fila do QStash, cancelar manualmente no painel antes que processe.
3. Se `idempotency_log` não tem a entrada → o claim não foi feito → o segundo processamento era evitável. Prioridade alta de fix no webhook.

## Correção Definitiva

O contrato correto no webhook (substitui qualquer `SELECT ... FOR UPDATE SKIP LOCKED`):

```sql
-- CORRETO: claim atômico via PRIMARY KEY de idempotency_log
INSERT INTO idempotency_log (idempotency_key)
VALUES (
  '<source_webhook>:<instance_name>:<external_message_id>'
  -- Exemplo: 'professional:clinica-dra-ana:3AB9F4D1E2C6'
)
ON CONFLICT (idempotency_key) DO NOTHING
RETURNING idempotency_key;

-- Se RETURNING retornar vazio → chave já existia → retornar 200 sem processar
-- Se RETURNING retornar idempotency_key → claim adquirido → prosseguir com INSERT em message_events
```

> **Por que não `SELECT ... FOR UPDATE SKIP LOCKED`:** locks de transação não cruzam edge functions distribuídas. Duas instâncias do webhook podem ter transações independentes e ambas verão "sem conflito" antes de qualquer uma commitar. O `INSERT ... ON CONFLICT` opera na constraint do banco, que é atômica por definição — o banco serializa o conflito automaticamente.

- `message-processor` deve também verificar idempotência antes de criar `agent_executions` — segunda linha de defesa.
- Teste obrigatório: enviar o mesmo payload do webhook duas vezes em paralelo e verificar que apenas 1 registro existe em `message_events` e 1 em `agent_executions`.

## Prevenção

- `UNIQUE INDEX` em `professional_whatsapp.instance_name` deve existir (está no PRD-SCHEMA) — sem ele, dois profissionais poderiam ter o mesmo `instance_name` e colidir na chave de idempotência.
- `idempotency_log.expires_at` padrão de 7 dias cobre reentregas com segurança. Não reduzir para menos de 24h.
- Monitorar `message_events` por duplicatas de `external_message_id + instance_name` via query periódica — divergência indica bug no claim.
