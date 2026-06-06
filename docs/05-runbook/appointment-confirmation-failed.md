# Runbook — Confirmação de Agendamento Não Mudou Status

## Sintoma

Cliente respondeu "sim" (ou equivalente) para confirmar o agendamento via WhatsApp, mas o status do agendamento no CRM continua como `agendado` em vez de `confirmado`. O evento `appointment.confirmed` não foi registrado. O profissional não vê a confirmação no app.

> **Nota de fase:** este agente (`appointment-confirmation-agent`) é ativado na FASE 5. Em FASE 3, status de confirmação é manual pelo profissional no CRM.

## Impacto

- Profissional não sabe se cliente comparecerá
- Agendamento não aparece como "confirmado" na agenda
- Cron de lembrete D-1 pode reenviar confirmação desnecessariamente

## Primeiras Perguntas

1. O cliente enviou a resposta para o número correto (instância do profissional, não admin)?
2. A resposta do cliente chegou ao banco em `message_events`?
3. O `appointment-confirmation-agent` foi invocado? (verificar `agent_executions`)
4. O agente identificou a intenção correta? (pode ter classificado como dúvida, não confirmação)
5. O `appointment_id` estava presente no contexto da conversa?

## Consultas Seguras

Verificar se a mensagem do cliente chegou:
```sql
SELECT id, phone, direction, status, metadata, created_at
FROM message_events
WHERE professional_id = '<professional_id>'
  AND phone = '<phone_cliente>'
  AND direction = 'inbound'
  AND created_at > NOW() - INTERVAL '2 hours'
ORDER BY created_at DESC;
```

Verificar execuções do agente de confirmação:
```sql
SELECT
  ae.id,
  ae.agent_slug,
  ae.status,
  ae.error_code,
  ae.metadata,
  ae.created_at
FROM agent_executions ae
WHERE ae.professional_id = '<professional_id>'
  AND ae.agent_slug = 'appointment-confirmation-agent'
  AND ae.created_at > NOW() - INTERVAL '2 hours'
ORDER BY ae.created_at DESC;
```

Verificar status atual do agendamento:
```sql
SELECT id, status, client_id, scheduled_at, updated_at
FROM appointments
WHERE professional_id = '<professional_id>'
  AND client_id = '<client_id>'
  AND scheduled_at > NOW() - INTERVAL '7 days'
ORDER BY scheduled_at DESC;
```

## Interpretação

- **Sem registro em `message_events`:** A mensagem do cliente não chegou ao webhook. Verificar conexão da instância (runbook `evolution-disconnected.md`).

- **`message_events` tem a mensagem mas sem `agent_executions`:** O `message-processor` não acionou o agente de confirmação. Possível falha no roteamento ou a intenção não foi identificada como `appointment_confirmation`.

- **`agent_executions` existe com `status='failed'`:** O agente foi chamado mas falhou. Ver `error_code`:
  - `appointment_not_found`: o `appointment_id` não foi encontrado no contexto da conversa
  - `invalid_transition`: agendamento já estava `cancelado` ou `realizado` — transição inválida
  - `llm_classification_failed`: LLM não conseguiu extrair intenção

- **`agent_executions` com `status='success'` mas status do agendamento não mudou:** A RPC de transição de status falhou silenciosamente. Verificar se a RPC existe e tem IDOR protection correta.

## Correção Imediata

Se a confirmação foi real e o status precisa ser corrigido manualmente, use a RPC oficial — **nunca UPDATE direto** (UPDATE direto não emite `appointment.confirmed` e não registra auditoria):

```sql
-- Usar RPC que atualiza status, emite evento e registra auditoria
-- Executar como service_role no Supabase Dashboard
SELECT confirm_appointment_manual_fix(
  p_appointment_id := '<appointment_id>',
  p_professional_id := '<professionalId>',
  p_reason := 'manual correction via runbook — client confirmed via WhatsApp but agent failed to process',
  p_message_event_id := '<message_event_id>'
);
```

> **Se a RPC ainda não existir (FASE < 5):** criar temporariamente como script de emergência que:
> 1. Atualiza `appointments.status = 'confirmado'`
> 2. Insere em `agent_executions` com `status='manual_fix'` e `actor_type='system'`
> 3. Emite `appointment.confirmed` com `actor_type='client'`, `source='whatsapp'`, `processed_by='manual_runbook'`
>
> Nunca usar UPDATE nu sem os passos 2 e 3.

## Correção Definitiva

- O `appointment-confirmation-agent` deve registrar no contexto da conversa (`conversation_contexts`) o `appointment_id` do próximo agendamento confirmado, não apenas buscar em tempo real.
- Respostas ambíguas ("ok", "sim", "ótimo") devem ser classificadas como confirmação com confidence > 0.8 antes de transitar o status.
- Se o agente não conseguir identificar o `appointment_id`, deve pedir confirmação ao cliente antes de transitar.

## Prevenção

- DoD da FASE 5 exige: "Appointment status muda de `agendado` para `confirmado` ao confirmar via WhatsApp" com seed sintético.
- Testar com seed: `clienteA` responde "sim" → status muda → evento registrado.
- Testar caso negativo: resposta ambígua "talvez" → status NÃO muda.
- DRY_RUN=true em todos os testes automatizados.
