# RPC e Edge Contracts - Fase 17

## Stripe / Billing

Edge Functions:

- `platform-checkout`
  - auth: profissional autenticado.
  - input: `plan_slug | credit_pack_slug`, billing cycle, success/cancel URL.
  - regra: nao aceita `free_internal`.
  - output: Stripe checkout URL.

- `platform-stripe-webhook`
  - auth: Stripe signature.
  - input: raw body + `stripe-signature`.
  - idempotencia: `processed_stripe_events.stripe_event_id`.
  - escreve assinatura, eventos e creditos via service_role.

RPCs:

- `get_platform_plans()`
- `get_my_subscription_state()`
- `admin_set_professional_plan(p_professional_id, p_plan_slug, p_reason)`
- `admin_grant_free_internal(p_professional_id, p_reason, p_expires_at default null)`

## Trial / Read-only

RPCs:

- `get_my_entitlements()`
- `platform_refresh_access_state(p_professional_id)`
- `admin_override_access_state(p_professional_id, p_status, p_reason)`

Middleware/frontend deve consultar entitlement e bloquear mutacoes no cliente, mas a seguranca real deve estar nas RPCs/tabelas.

## Creditos IA

RPCs:

- `reserve_ai_credits(p_professional_id, p_amount, p_idempotency_key, p_reason)`
- `commit_ai_credits(p_reservation_id, p_usage_event_id)`
- `release_ai_credits(p_reservation_id, p_reason)`
- `get_my_ai_credit_balance()`
- `admin_add_ai_credits(p_professional_id, p_amount, p_reason)`

Toda edge function de IA que consome custo deve usar reserva/commit/release ou declarar explicitamente `bypassBilling` service-role/admin.

## Afiliados

RPCs:

- `request_ambassador_program()`
- `get_my_ambassador_dashboard()`
- `admin_review_ambassador_request(p_partner_id, p_decision, p_reason)`
- `admin_confirm_affiliate_payment(p_payment_id, p_reference)`

Edge Functions:

- `affiliate-commission-cron`
- `affiliate-notify`

## Nexus

Edge Function:

- `admin-ai-gateway`
  - auth: admin session ou canal WhatsApp admin validado.
  - leitura: metricas permitidas.
  - escrita: cria `nexus_action_proposals`, nao executa direto.

RPCs:

- `nexus_create_action_proposal(p_action_type, p_payload)`
- `nexus_confirm_action(p_proposal_id, p_confirmation_token)`
- `nexus_execute_confirmed_action(p_proposal_id)`

Regra: confirmacao por texto livre so e aceita se casar com proposal id/token e admin autenticado.

## Agents / Feature Requests

RPCs:

- `admin_register_agent_prompt_version(...)`
- `admin_promote_agent_prompt_version(p_version_id)`
- `admin_rollback_agent_prompt(p_agent_slug, p_reason)`
- `admin_pause_agent(p_agent_slug, p_until, p_reason)`
- `submit_feature_request(p_title, p_description, p_category, p_priority)`
- `vote_feature_request(p_feature_request_id)`
- `admin_update_feature_request_status(p_feature_request_id, p_status, p_reason)`

Promocao para producao exige versao em `staging`.
