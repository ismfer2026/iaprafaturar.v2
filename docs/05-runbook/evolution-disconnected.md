# Runbook — Evolution Go Desconectou Instância

## Sintoma

Profissional relata que a Rosane parou de responder. No painel, a instância aparece como desconectada (offline). Nenhuma mensagem outbound está sendo enviada. O evento `professional.whatsapp.disconnected` foi registrado no `audit_log` e `professional_whatsapp.is_connected` está `false`.

## Impacto

- Rosane não consegue responder clientes
- Lembretes e confirmações de agendamento não são enviados
- Profissional perde receita por falta de atendimento automatizado

## Primeiras Perguntas

1. A instância foi desconectada há quanto tempo?
2. O profissional reiniciou o celular ou atualizou o WhatsApp recentemente?
3. O QR code estava sendo compartilhado em múltiplos dispositivos?
4. A Evolution Go reportou algum `reason` no evento de desconexão?
5. A instância ainda existe na Evolution Go (não foi deletada)?

## Consultas Seguras

Verificar status atual da instância e histórico de conexão:
```sql
-- Estado atual da instância (fonte: professional_whatsapp, não message_events)
-- Eventos de conexão/desconexão são eventos de sistema — não pertencem a message_events
-- (message_events.direction só aceita 'inbound' | 'outbound')
SELECT
  instance_name,
  is_connected,
  last_connected_at,
  last_disconnected_at,
  disconnection_reason,
  created_at
FROM professional_whatsapp
WHERE professional_id = '<professional_id>'
ORDER BY created_at DESC
LIMIT 5;
```

Verificar histórico de eventos de conexão no audit_log:
```sql
SELECT
  event_type,
  payload->>'reason' AS reason,
  actor_type,
  created_at
FROM audit_log
WHERE professional_id = '<professional_id>'
  AND event_type IN ('professional.whatsapp.connected', 'professional.whatsapp.disconnected')
ORDER BY created_at DESC
LIMIT 20;
```

## Interpretação

- **Reason = `logout`:** profissional saiu manualmente ou outro dispositivo deslogou.
- **Reason = `connection_closed`:** queda de rede ou celular sem bateria/internet.
- **Reason = `ban`:** número banido pelo WhatsApp (comum em envios em massa sem cautela).
- **Sem reason:** Evolution Go não reportou — verificar logs da instância no painel Evolution.

## Correção Imediata

1. Avisar o profissional via Nerissa (canal admin) que a instância está offline.
2. Instruir o profissional a acessar o app e reconectar (escanear QR code novamente).
3. Se número banido: orientar a abrir suporte no WhatsApp Business. Não há fix automático.

## Passo a Passo — Reconexão

```
1. Profissional acessa: Configurações → Assistente → Status da conexão
2. Clica em "Reconectar"
3. QR code aparece na tela
4. No celular: WhatsApp → Aparelhos conectados → Conectar novo aparelho
5. Escanear QR code
6. Aguardar até 30s → status muda para "Conectado"
7. Evento professional.whatsapp.connected deve aparecer no log
```

## Correção Definitiva

- A Nerissa deve alertar o profissional em até 5 minutos após detectar a desconexão.
- Frontend deve mostrar banner de alerta persistente enquanto instância offline.
- Crons de lembrete devem verificar `is_connected` antes de tentar enviar.

## Prevenção

- Cada instância Evolution Go deve ter único dispositivo conectado.
- Orientar profissionais a NÃO usar WhatsApp Web simultâneo com a instância Evolution.
- Monitorar `professional_agents.is_connected` via cron diário e alertar proativamente.
