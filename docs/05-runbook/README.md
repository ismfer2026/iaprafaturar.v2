# Runbooks Operacionais

Runbooks são guias de resposta a incidentes.

Arquitetura explica como o sistema deveria funcionar. Runbook explica o que consultar quando produção falha.

## Runbooks FASE 1 (obrigatórios antes do primeiro deploy)

| Sintoma | Arquivo |
|---|---|
| Mensagem WhatsApp não chegou | `whatsapp-message-not-received.md` |
| Webhook processado 2x (duplicata) | `webhook-duplicate.md` |
| QStash job travado ou falhando | `qstash-jobs-stuck.md` |
| Evolution Go desconectou instância | `evolution-disconnected.md` |
| Agente não respondeu (timeout) | `agent-timeout.md` |
| RLS bloqueou usuário legítimo | `rls-false-positive.md` |
| Onboarding não finalizou | `onboarding-stuck.md` |
| Confirmação de agendamento não mudou status | `appointment-confirmation-failed.md` |

## Formato obrigatório

Cada runbook deve conter:

1. Sintoma observável.
2. Impacto.
3. Primeiras perguntas.
4. Queries/comandos seguros (somente SELECT ou service_role com justificativa).
5. Interpretação dos resultados.
6. Correção imediata.
7. Correção definitiva.
8. Prevenção.

## Regra

Todo bug real resolvido em produção deve atualizar ou criar um runbook.
Runbooks usam nomes de tabelas da v2 (`message_events`, `agent_executions`) — nunca tabelas legadas do v1.
