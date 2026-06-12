# 17a Schema Inventory

## Decisoes

- `free_internal` sera representado em `professionals.plan_type`, ampliando o `CHECK` existente. Motivo: o PRD define literalmente `plan_type = 'free_internal'`, e as consultas admin ja agregam por `plan_type`.
- `professional_access_states` sera camada derivada de acesso/read-only, nao substituto do plano comercial.
- J49 reutiliza `professional_platform_health_scores` da Fase 9 como fonte canonical.
- `admin-ai-gateway` ja existe no repo e sera estendido; nao criar gateway paralelo.

## Objetos Novos

- `platform_plans`, `platform_billing_products`
- `professional_subscriptions`, `subscription_events`, `processed_stripe_events`
- `professional_access_states`, `entitlement_snapshots`
- `ai_credit_wallets`, `ai_credit_transactions`, `ai_credit_reservations`, `ai_usage_events`
- `admin_action_requests`, `admin_action_results`
- `platform_affiliate_partners`, `platform_affiliate_referrals`, `platform_affiliate_commissions`, `platform_affiliate_payments`
- `nexus_conversations`, `nexus_messages`, `nexus_action_proposals`, `nexus_action_executions`
- `agent_registry`, `agent_prompt_versions`, `agent_pause_windows`
- `feature_requests`, `feature_request_votes`, `feature_request_comments`

## Reuso

- `admin_assert_master()`, `admin_is_master()`
- `audit_log`, `fn_log_immutable()`, `log_audit_event()`
- `professional_platform_health_scores`
- `platform_metrics_daily`
- `agent_executions`
