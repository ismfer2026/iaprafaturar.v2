# Runbook — Agente Não Respondeu (Timeout)

## Sintoma

Mensagem chegou (registrada em `message_events`), o QStash recebeu e enfileirou, mas o agente não respondeu ao cliente. Em `agent_executions`, o registro mostra `status='failed'` ou `duration_ms` excede o limite esperado. O cliente ficou sem resposta.

## Impacto

- Cliente não recebido = potencial perda de agendamento
- Crédito de IA pode ter sido consumido sem resultado útil
- Profissional não foi alertado

## Primeiras Perguntas

1. O registro em `agent_executions` existe? Qual o `status` e `error_code`?
2. O `message-processor` recebeu a chamada do QStash? (ver logs da edge function)
3. A falha foi no LLM (timeout de API), na Evolution Go (envio), ou na edge function (código)?
4. O `status` em `message_events` está como `queued`, `processing` ou `failed`?
5. O profissional tem créditos suficientes? (status de crédito zero aciona fallback, não timeout)

## Consultas Seguras

Verificar execuções falhas recentes:
```sql
SELECT
  ae.id,
  ae.agent_slug,
  ae.status,
  ae.error_code,
  ae.duration_ms,
  ae.created_at,
  me.phone,
  me.direction
FROM agent_executions ae
JOIN message_events me ON me.id = ae.trigger_ref::uuid
WHERE ae.professional_id = '<professional_id>'
  AND ae.status IN ('failed', 'timeout')
  AND ae.created_at > NOW() - INTERVAL '2 hours'
ORDER BY ae.created_at DESC;
```

Verificar mensagem em `message_events`:
```sql
SELECT id, status, direction, created_at, metadata
FROM message_events
WHERE professional_id = '<professional_id>'
  AND status IN ('queued', 'processing', 'failed')
  AND created_at > NOW() - INTERVAL '2 hours'
ORDER BY created_at DESC;
```

## Interpretação

- **`error_code = 'llm_timeout'`:** API do LLM demorou mais que o limite da edge function (tipicamente 25s). Problema de latência do provedor.
- **`error_code = 'evolution_send_failed'`:** Agente gerou resposta mas a Evolution Go não aceitou o envio. Verificar se instância ainda está conectada.
- **`error_code = 'credits_zero'`:** créditos esgotados. Rosane deve ter enviado mensagem de fallback. Se não enviou, verificar fluxo de degradação graceful.
- **`status = 'processing'` há mais de 5 minutos:** edge function travou. Verificar logs do Supabase.
- **Sem registro em `agent_executions`:** o `message-processor` nunca foi chamado. Problema no QStash (ver runbook `qstash-jobs-stuck.md`).

## Correção Imediata

1. Se o agente falhou com `llm_timeout`: o QStash deve ter reentregado automaticamente (configurar max 2 retries). Verificar se a reentrega aconteceu.
2. Se a mensagem está em `status='queued'` há mais de 10 minutos: reprocessar manualmente via painel do QStash ou chamada direta à edge function com o `message_event_id`.
3. Se créditos zerados: alertar profissional via Nerissa para recarregar.

## Correção Definitiva

- Edge functions de agente devem ter timeout explícito de 25s com resposta de fallback ao cliente.
- QStash retry configurado para máximo 2 tentativas com delay de 30s.
- `agent_executions` deve registrar `duration_ms` em todo caso (mesmo em falha).
- Alarme: se `agent_executions` acumular mais de 5 `status='failed'` em 10 minutos para o mesmo profissional → alertar via Nerissa.

## Prevenção

- Testar todos os agentes com latência simulada de 20s antes de produção.
- Configurar DLQ (Dead Letter Queue) no QStash para mensagens que falharam todas as tentativas.
- Monitorar `avg(duration_ms)` por `agent_slug` — se subir > 15s, investigar provedor LLM.
