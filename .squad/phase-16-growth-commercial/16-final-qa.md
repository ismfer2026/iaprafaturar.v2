# Phase 16 Final QA

## Implementado

- 16a Funil RevOps: `sales_funnels`, `funnel_stages`, `funnel_opportunities`, `funnel_events`, RPCs e tela `/funil`.
- 16b Campanhas avancadas: `campaign_cooldowns`, `campaign_result_snapshots`, `run_segmented_campaign`, `get_campaign_results`.
- 16c Referral/fidelidade: ledger `loyalty_transactions`, `loyalty_redemptions`, recompensa de indicacao e resgate.
- 16d Health/reactivation: formula `phase16_v2` em `calculate_client_health_for_professional` e `get_reactivation_queue`.
- 16e Upsell: `upsell_metrics`, criterio de pacote perto do fim/alta frequencia, canal permitido, cooldown e shadow suggestion.
- 16f E-mail: `email_channel_settings`, `email_outbox`, opt-out por cliente, auditoria e `email-dispatcher`.
- 16g Chat publico: `public_chat_configs`, rate limit, `public-chat-handler`, rota client `/chat/:slug`, conversa rastreavel e oportunidade no funil.

## Guardrails

- Objetos da Fase 8 foram estendidos, nao recriados.
- `referral_events` nao foi recriada; continua append-only.
- Tabelas novas usam RLS, `REVOKE ALL` e `GRANT SELECT`.
- Escrita de negocio passa por RPC ou service-role function.
- E-mail real depende de `RESEND_API_KEY` e config habilitada; sem isso fica em dry-run/skipped.

## Validacoes

- `npm run typecheck --workspace @iaprafaturar/professional`
- `npm run typecheck --workspace @iaprafaturar/client`
- `npm run build --workspace @iaprafaturar/professional`
- `npm run build --workspace @iaprafaturar/client`
- `deno check supabase\functions\public-chat-handler\index.ts`
- `deno check supabase\functions\email-dispatcher\index.ts`
- `deno check supabase\functions\upsell-agent\index.ts`
- `npx supabase db push`
- `npx supabase functions deploy public-chat-handler --import-map supabase\functions\deno.json`
- `npx supabase functions deploy email-dispatcher --import-map supabase\functions\deno.json`
- `npx supabase functions deploy upsell-agent --import-map supabase\functions\deno.json`

## Revisao corretiva

- `20260611124500_fix_phase16_loyalty_upsell_integrity.sql` torna `record_referral_reward_delivered` idempotente por `referral_event_id`, evitando credito duplicado de pontos em chamadas repetidas ou concorrentes.
- `upsell_metrics` agora tem trigger append-only (`prevent_upsell_metrics_change`) alinhada ao padrao de eventos/auditoria da fase.
- `GrowthPage.tsx` renderiza apenas o painel de acao da aba ativa, evitando multiplos CTAs primarios simultaneos em mobile.
- Strings novas da GrowthPage foram movidas para i18n em `pt-BR`, `en-US` e `es-419`.

Validacoes da revisao:

- `npm run typecheck --workspace @iaprafaturar/professional`
- `npm run build --workspace @iaprafaturar/professional`
- `npx supabase db push`
- `npx supabase migration list` confirmou `20260611124500` local/remoto.
