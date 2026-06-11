# Phase 16a Schema Guard - Funil RevOps

## Escopo aprovado

- Criar o funil comercial operacional que a Fase 8 deixou explicitamente fora de escopo.
- Nao recriar nem alterar objetos de campanhas, referral, RFM ou health score da Fase 8.
- Manter `clients.journey_stage` como eixo de jornada do cliente; `funnel_opportunities.stage_id` representa apenas o estagio da oportunidade comercial.

## Diff contra Fase 8

| Subdominio | Estado atual | Decisao 16a |
| --- | --- | --- |
| Campanhas | `campaigns`, `campaign_recipients`, `campaign_dispatches` | Sem mudanca nesta subfase |
| Referral | `referral_links`, `referral_events` | Sem mudanca nesta subfase |
| Health/RFM | `client_health_scores`, `rfm_scores` | Sem mudanca nesta subfase |
| Reativacao | `clients.reactivation_status`, cooldowns em health score | Sem mudanca nesta subfase |
| Funil comercial | Fase 8 declarou Kanban/opportunities fora do escopo | Criar tabelas novas de funil |

## Tabelas novas

- `sales_funnels`
- `funnel_stages`
- `funnel_opportunities`
- `funnel_events`

## Regras obrigatorias

- Todas as tabelas novas com RLS habilitado.
- `REVOKE ALL ON ... FROM anon, authenticated` antes de qualquer `GRANT SELECT`.
- Escrita somente via RPC `SECURITY DEFINER`.
- FKs de dominio com `ON DELETE RESTRICT`.
- `funnel_events` imutavel via trigger.
- Toda mutacao de negocio chama `log_audit_event`.
- `funnel_opportunities.stage_id` nao sincroniza automaticamente `clients.journey_stage`.

## Go/no-go

Go para implementar a migration 16a. Nao ha colisao de nomes com objetos existentes da Fase 8.
