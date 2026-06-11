# Contratos RPC e Edge Functions - Fase 16

## Funil

### `get_funnel_board()`

Retorna funil ativo, estagios e oportunidades agrupadas.

Output:
```json
{
  "ok": true,
  "funnel": {},
  "stages": [],
  "opportunities": []
}
```

### `create_funnel_opportunity(...)`

Input minimo:
- `p_client_id uuid`
- `p_title text`
- `p_source text`
- `p_value numeric`
- `p_stage_id uuid default null`
- `p_metadata jsonb default '{}'`

Efeitos:
- Cria opportunity.
- Cria `funnel_events` com `opportunity.created`.
- Loga audit event.

### `move_funnel_opportunity(...)`

Input:
- `p_opportunity_id uuid`
- `p_stage_id uuid`
- `p_reason text`

Efeitos:
- Atualiza stage atual.
- Cria evento append-only.
- Nao altera `clients.journey_stage` automaticamente.

## Campanhas

### `build_campaign_recipients(p_campaign_id uuid)`

Materializa recipients elegiveis.

Regras:
- Respeita opt-out por canal.
- Respeita cooldown.
- Registra bloqueados com motivo.

### `get_campaign_results(p_campaign_id uuid)`

Retorna agregados:
- eligible
- blocked_opt_out
- blocked_cooldown
- sent
- failed
- replied
- converted

## Indicacao e Fidelidade

### `upsert_referral_config(p_config jsonb)`

Configura incentivos, limites e mensagens.

### `grant_referral_reward(p_referral_event_id uuid, p_reason text)`

Concede recompensa apenas se conversao estiver validada.

Efeitos:
- Insere `loyalty_transactions`.
- Insere `referral_events` com `reward_delivered` ou evento equivalente existente.
- Audit log sem PII crua.

## Health Score

### `calculate_client_health_for_professional(...)`

Evoluir funcao existente.

Mudancas:
- `formula_version = 'phase16_v1'`
- `score_explanation`
- `next_best_action`
- preservar campos de reativacao.

## Upsell

### `upsell-agent`

Antes de alterar:
- documentar estado atual e reversao anterior.

Nova elegibilidade:
- canal permitido
- sem pagamentos pendentes
- sem sugestao pendente
- cooldown ativo respeitado
- pacote perto do fim OU sem pacote mas com alta frequencia/RFM favoravel

Output futuro:
```json
{
  "ok": true,
  "processed": 0,
  "eligible": 0,
  "suggested": 0,
  "skipped": 0,
  "failed": 0,
  "skipped_reasons": {}
}
```

## E-mail

### `email-dispatcher`

Gate:
- Nao implementar envio real sem aprovacao de custo/credenciais.

Input:
- `mode`
- `professional_id`
- `client_id`
- `template_id` ou `subject/body`
- `dry_run`

Regras:
- valida consentimento
- valida opt-out
- registra auditoria
- registra dispatch

## Chat Publico

### `public-chat-handler`

Modos:
- `start`
- `message`
- `handoff`
- `close`

Regras:
- rate limit
- honeypot/token anti-spam
- conversa rastreavel
- cria lead/oportunidade quando aplicavel
