# Inventario e Diff Contra Fase 8

## Migration Base

Arquivo: `supabase/migrations/20260607140000_phase8_growth_core.sql`

## Objetos Existentes

### Opt-out e Reativacao no Cliente

Existente:
- `clients.whatsapp_opt_out`
- `clients.whatsapp_opt_out_at`
- `clients.whatsapp_opt_out_reason`
- `clients.reactivation_status`
- `clients.reactivation_status_reason`
- `set_client_whatsapp_opt_out(uuid, boolean, text)`
- `set_client_reactivation_status(uuid, text, text)`

Diretriz Fase 16:
- Estender para opt-out por canal quando e-mail e web chat entrarem.
- Nao substituir `whatsapp_opt_out`; manter compatibilidade.
- Reativacao deve usar `reactivation_status` existente.

### RFM

Existente:
- `rfm_scores`
- `calculate_rfm_for_professional(uuid, integer, uuid)`

Diretriz Fase 16:
- Reusar `rfm_scores` como sinal de segmentacao e elegibilidade.
- Nao criar nova tabela RFM.

### Health Score

Existente:
- `client_health_scores`
- `calculate_client_health_for_professional(uuid, integer, uuid)`
- Campos reservados para reativacao:
  - `reactivation_cooldown_until`
  - `reactivation_attempts_in_cycle`
  - `last_reactivation_attempt_at`
  - `last_reactivation_reason`

Diretriz Fase 16:
- Evoluir formula para `phase16_v1`.
- Adicionar explicabilidade somente se o schema atual nao suportar detalhe suficiente.
- Nao sobrescrever campos de reativacao no recalculo de health score.

### Campanhas

Existente:
- `campaigns`
- `campaign_recipients`
- `campaign_dispatches`
- `create_campaign(text, text, text, timestamptz)`
- `schedule_campaign(uuid, timestamptz)`
- `cancel_campaign(uuid, text)`
- `campaign_dispatches` e imutavel por trigger.

Diretriz Fase 16:
- Estender o modelo atual para segmentacao avancada, cooldown e resultados.
- Evitar tabelas paralelas como `campaign_runs` sem justificativa.
- Resultados devem ser agregados a partir de `campaign_recipients`, `campaign_dispatches`, `message_events` e eventos de conversao.

### Indicacao

Existente:
- `referral_links`
- `referral_events`
- `create_or_get_referral_link(uuid, timestamptz)`
- `register_referral_event(text, text, uuid, jsonb)`
- `referral_events` ja possui eventos e deve continuar imutavel.

Diretriz Fase 16:
- Nao recriar `referral_events`.
- Adicionar configuracao e fidelidade ao redor dos objetos existentes.
- Recompensa deve depender de conversao validada, nao de clique ou envio.

### Agents Existentes

Existente:
- `reativacao-agent`
- `indicacao-agent`
- `upsell-agent`
- `campaign-dispatcher`
- `calculate-rfm`
- `calculate-client-health-scores`

Diretriz Fase 16:
- Reativacao: evoluir regras, nao criar agente paralelo.
- Indicacao: integrar recompensas/fidelidade, nao duplicar envio.
- Upsell: diagnosticar estado atual antes de endurecer.

## Objetos Ausentes ou Incompletos

### Funil Comercial

Ausente:
- `sales_funnels`
- `funnel_stages`
- `funnel_opportunities`
- `funnel_events`
- `/funil`

Decisao:
- Criar como subfase 16a.

### Fidelidade/Recompensas

Ausente:
- Configuracao de recompensas.
- Conta de pontos por cliente.
- Ledger imutavel de pontos.
- Resgate/recompensa.

Decisao:
- Criar tabelas novas sem conflitar com `referral_events`.

### E-mail como Canal

Ausente:
- opt-out de e-mail por canal.
- `email_dispatches` ou registro equivalente.
- Edge Function de envio via Resend/SMTP.
- inbound e-mail.

Decisao:
- Modelar consentimento/auditoria primeiro.
- Envio real via Resend depende de checkpoint de API externa/custo.

### Chat Publico

Ausente:
- widget/pagina publica de chat.
- anti-spam dedicado.
- handoff explicito.
- ligacao automatica com funil.

Decisao:
- Criar apos funil comercial estar pronto.
