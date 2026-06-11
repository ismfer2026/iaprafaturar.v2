# Plano de Schema - Fase 16

## Regras Globais

- Toda tabela nova no schema `public` deve seguir:
  - `ALTER TABLE ... ENABLE ROW LEVEL SECURITY`
  - `REVOKE ALL ON ... FROM anon, authenticated`
  - `GRANT SELECT ON ... TO authenticated` quando leitura direta for necessaria
  - mutacoes somente via RPC/Edge Function auditada
- Eventos historicos devem ser append-only.
- PII em audit log deve ser mascarada ou omitida.
- Nao criar tabela com nome ja existente.

## 16a - Funil RevOps

Criar:
- `sales_funnels`
- `funnel_stages`
- `funnel_opportunities`
- `funnel_events`

RPCs:
- `get_funnel_board()`
- `create_funnel_opportunity(...)`
- `move_funnel_opportunity(uuid, uuid, text)`
- `close_funnel_opportunity(uuid, text, text)`
- `log_funnel_activity(uuid, text, jsonb)`

Notas:
- `funnel_opportunities.stage_id` e separado de `clients.journey_stage`.
- Ganho/perdido gera evento no funil.
- `clients.journey_stage` so muda em eventos de negocio definidos, nao em todo drag-and-drop.

## 16b - Campanhas Avancadas

Estender:
- `campaigns`
- `campaign_recipients`
- `campaign_dispatches`

Adicionar somente se necessario:
- `campaign_cooldowns` para controle por profissional/cliente/canal/campaign_type.
- `campaign_result_snapshots` se agregacao em tempo real ficar cara.

Nao criar:
- `campaign_runs` paralelo.
- `campaign_results` duplicando `campaign_dispatches` sem necessidade.

Regras:
- Segmentacao deve materializar recipients antes do envio.
- Recipient bloqueado por opt-out/cooldown fica registrado com motivo.
- Resultado deve diferenciar: eligible, blocked_opt_out, blocked_cooldown, sent, failed, replied, converted.

## 16c - Indicacao e Fidelidade

Estender:
- `referral_links`
- `referral_events`

Criar:
- `referral_configs`
- `loyalty_accounts`
- `loyalty_transactions`
- `loyalty_rewards`
- `loyalty_redemptions`

Regras:
- `referral_events` permanece append-only.
- Recompensa so e concedida por RPC apos conversao validada.
- `loyalty_transactions` e ledger imutavel.

## 16d - Health Score e Reativacao

Estender:
- `client_health_scores`
- `calculate_client_health_for_professional`
- `reativacao-agent`

Possiveis colunas:
- `score_explanation jsonb`
- `next_best_action text`
- `formula_version text` ja existe? Se existir, atualizar valor; se nao, adicionar.

Regras:
- Formula `phase16_v1`.
- Nao sobrescrever cooldown/tentativas de reativacao.
- Reativacao respeita `whatsapp_opt_out`, futuro `email_opt_out`, cooldown e status do cliente.

## 16e - Upsell Metrics

Estender:
- `upsell-agent`
- `shadow_suggestions`
- `mark_upsell_attempt`

Criar somente se necessario:
- `upsell_metrics_daily`
- `upsell_suggestion_events`

Regras:
- Upsell nao envia direto por padrao.
- Elegibilidade deve considerar pacotes perto do fim, RFM/frequencia, pagamentos pendentes, opt-out e cooldown.
- Medir: eligible, suggested, approved, sent, converted, skipped_reason.

## 16f - E-mail

Criar:
- `professional_email_settings`
- `client_channel_preferences` ou extensao equivalente para opt-out por canal
- `email_dispatches`
- `email_templates` se necessario para campanhas

Gate:
- Envio real via Resend/SMTP depende de aprovacao explicita do usuario por custo/API externa.

Regras:
- E-mail promocional exige consentimento/base legal registrada.
- Opt-out e auditoria obrigatorios.
- `dry_run` nao envia externamente, mas registra persistencia interna quando aplicavel.

## 16g - Chat Publico

Criar:
- `public_chat_sessions`
- `public_chat_rate_limits` ou usar tabela/evento existente se houver padrao local
- `chat_handoffs`

Reusar:
- `conversations`
- `conversation_contexts`
- `message_events`
- `clients`
- `funnel_opportunities`

Regras:
- Anti-spam por IP, telefone/e-mail e janela de tempo.
- Toda mensagem vira `message_events`.
- Handoff desativa resposta automatica ou muda Rosane para shadow mode.
