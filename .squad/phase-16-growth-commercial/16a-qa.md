# Phase 16a QA - Funil RevOps

## Implementado

- Migration `20260611120000_phase16a_funil_revops.sql`.
- Tabelas: `sales_funnels`, `funnel_stages`, `funnel_opportunities`, `funnel_events`.
- RPCs: `get_funnel_board`, `create_funnel_opportunity`, `move_funnel_opportunity`, `close_funnel_opportunity`, `log_funnel_activity`.
- Frontend `/funil` com lista vertical em mobile e Kanban em tablet/desktop.

## Guardrails verificados

- Nao recria objetos da Fase 8 (`campaigns`, `campaign_recipients`, `campaign_dispatches`, `referral_links`, `referral_events`, `client_health_scores`, `rfm_scores`).
- Tabelas novas usam RLS + `REVOKE ALL ON ... FROM anon, authenticated` + `GRANT SELECT`.
- Escrita direta bloqueada; mutacoes passam por RPC auditada.
- `funnel_events` e imutavel por trigger.
- `clients.journey_stage` nao e alterado por movimentacao de oportunidade.

## Validacoes

- `npm run build --workspace @iaprafaturar/domain`
- `npm run typecheck --workspace @iaprafaturar/domain`
- `npm run typecheck --workspace @iaprafaturar/professional`
- `npm run build --workspace @iaprafaturar/professional`
- `npx supabase db push`
