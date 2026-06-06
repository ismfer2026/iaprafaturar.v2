# Runbook — Onboarding Não Finalizou

## Sintoma

Profissional criou conta, mas o onboarding travou em alguma etapa. O app continua redirecionando para `/onboarding` mesmo após o profissional completar os passos. A Nerissa não está respondendo ou o QR code da instância não foi gerado/reconhecido.

## Impacto

- Profissional bloqueado de acessar o CRM
- Rosane não está ativa (instância não conectada)
- Potencial perda de cliente no trial (primeiras horas são críticas para ativação)

## Primeiras Perguntas

1. Em qual etapa do onboarding o profissional travou? (nome, serviço, horário, WhatsApp)
2. A Nerissa chegou a responder alguma mensagem via WhatsApp?
3. O QR code apareceu na tela ou nunca carregou?
4. O profissional escaneou o QR mas a instância ainda mostra "desconectada"?
5. O evento `professional.onboarding.started` foi registrado no banco?

## Consultas Seguras

Verificar estado do onboarding no banco:
```sql
SELECT
  p.id,
  p.full_name,
  p.onboarding_completed,
  p.created_at,
  ns.id as session_id,
  ns.completed_steps,
  ns.current_step,
  ns.updated_at
FROM professionals p
LEFT JOIN nerissa_setup_sessions ns ON ns.professional_id = p.id
WHERE p.user_id = '<auth_uid>'
ORDER BY ns.updated_at DESC
LIMIT 5;
```

Verificar se a instância foi criada:
```sql
SELECT instance_name, is_connected, created_at, last_connected_at
FROM professional_agents
WHERE professional_id = '<professional_id>';
```

Verificar mensagens trocadas com Nerissa:
```sql
SELECT direction, message_type, status, created_at
FROM message_events
WHERE professional_id = '<professional_id>'
ORDER BY created_at DESC
LIMIT 20;
```

## Interpretação

- **`onboarding_completed = false` e sem `nerissa_setup_sessions`:** Nerissa nunca recebeu mensagem. O profissional não enviou WhatsApp para o número da Nerissa, ou enviou para número errado.

- **`nerissa_setup_sessions` existe mas `completed_steps` é vazio:** Nerissa recebeu mas não processou. Verificar `agent_executions` para erros do `nerissa-setup-agent`.

- **`completed_steps` inclui todos os passos mas `onboarding_completed = false`:** O trigger ou RPC que marca o onboarding completo falhou. Executar manualmente.

- **Instância não conectada:** QR code foi gerado mas não escaneado, ou escaneado mas Evolution Go não recebeu confirmação. Ver runbook `evolution-disconnected.md`.

- **App redireciona para `/onboarding` mesmo com `onboarding_completed = true`:** Bug no `ProtectedRoute` ou no `AuthContext` que não está buscando o valor atualizado.

## Correção Imediata

Se todos os passos foram completados mas a flag não foi atualizada, use a RPC oficial — **nunca UPDATE direto** (UPDATE direto não emite `professional.onboarding.completed` e não registra auditoria):

```sql
-- RPC que marca onboarding completo, emite evento e registra auditoria
SELECT complete_onboarding_manual_fix(
  p_professional_id := '<professionalId>',
  p_reason := 'manual correction via runbook — all steps completed but flag not updated'
);
```

> **Se a RPC ainda não existir (FASE < 2):** como script emergencial de serviço, executar os 3 passos juntos:
> 1. `UPDATE professionals SET onboarding_completed = true, onboarding_completed_at = NOW() WHERE id = '<professionalId>'`
> 2. INSERT em `agent_executions` com `agent_slug='nerissa-setup-agent'`, `status='manual_fix'`, `actor_type='system'`
> 3. Emitir `professional.onboarding.completed` com `actor_type='system'`, `agent_slug='manual_runbook'`
>
> Nunca usar apenas o passo 1 isolado.
>
> **FASE 2 — criar RPC:** `complete_onboarding_manual_fix(p_professional_id, p_reason)` deve ser criada na migration de FASE 2 antes de qualquer deploy de onboarding em produção. Ela encapsula os 3 passos acima em transação atômica com emissão de evento.

Se a `nerissa_setup_sessions` precisa ser reiniciada, **não use DELETE** — marque como abandonada e crie nova:
```sql
-- Marcar sessão travada como abandonada (mantém trilha de auditoria)
UPDATE nerissa_setup_sessions
SET status = 'abandoned',
    abandoned_at = NOW(),
    abandoned_reason = 'reset_by_admin — runbook: onboarding-stuck'
WHERE professional_id = '<professional_id>'
  AND status IN ('active', 'started')
  AND completed_steps = '[]'::jsonb;

-- A próxima mensagem do profissional para Nerissa criará nova sessão automaticamente
-- Ou criar sessão nova manualmente se necessário:
INSERT INTO nerissa_setup_sessions (professional_id, status, created_at)
VALUES ('<professional_id>', 'active', NOW());
```

> **Por que não DELETE:** logs de sessão são trilha de rastreabilidade. Deletar esconde falhas de onboarding que poderiam ser diagnosticadas para melhorar o produto. O campo `status` é o mecanismo correto de invalidação.

## Correção Definitiva

- O onboarding deve ter um status de "retomada" — profissional que sai no meio consegue voltar de onde parou, não do zero.
- Nerissa deve enviar lembrete via WhatsApp se o profissional não avançar em 30 minutos.
- Frontend deve mostrar progresso salvo (não perder dados preenchidos em reload).
- Admin deve conseguir visualizar profissionais com `onboarding_completed = false` há mais de 24h e intervir.

## Prevenção

- Testar o fluxo completo de onboarding com `professionalSintetico` antes de cada deploy.
- O evento `professional.onboarding.completed` só deve ser emitido após `is_connected = true` na instância.
- Timeout do QR code: se não escaneado em 60s, gerar novo automaticamente (sem intervenção manual).
