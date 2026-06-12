# Phase 17 Final QA

## Implementado

- Billing SaaS: `platform_plans`, `platform_billing_products`, `professional_subscriptions`, `subscription_events`, `processed_stripe_events`.
- Stripe: `platform-checkout` e `platform-stripe-webhook` com bloqueio de `free_internal` publico e idempotencia por evento Stripe.
- Trial/read-only: `professional_access_states`, `entitlement_snapshots`, `platform_can_write` e triggers de bloqueio em tabelas principais.
- Creditos IA: wallets, transacoes, reservas, usage events e RPCs `reserve_ai_credits`, `commit_ai_credits`, `release_ai_credits`.
- Admin: concessao `free_internal`, adicao de creditos e paginas `/planos`, `/embaixadores`, `/agentes`, `/melhorias`.
- Afiliados/embaixadores: parceiros, referrals, comissoes e pagamentos.
- Nexus: `/nexus` conectado ao `admin-ai-gateway`; proposta, confirmacao e execucao auditada para acoes sensiveis.
- Agentes/melhorias: registry, prompt versions, pause windows, feature requests, votes e status admin.
- J49: reutilizado via `professional_platform_health_scores` da Fase 9.

## Guardrails

- `free_internal` persiste em `professionals.plan_type` conforme PRD, com CHECK ampliado.
- `free_internal` nao aparece em `get_platform_plans()` nem em checkout publico.
- Eventos/ledgers/webhooks/results principais sao append-only via `fn_log_immutable`.
- Admin RPCs usam `admin_assert_master()`.
- Read-only preserva SELECT e bloqueia escrita nas tabelas principais com `professional_id`.
- Stripe real depende de `STRIPE_SECRET_KEY` e `STRIPE_WEBHOOK_SECRET`; sem `STRIPE_SECRET_KEY`, checkout retorna dry-run/config missing.

## Validacoes

- `npm run typecheck --workspace @iaprafaturar/professional`
- `npm run typecheck --workspace @iaprafaturar/admin`
- `npm run build --workspace @iaprafaturar/professional`
- `npm run build --workspace @iaprafaturar/admin`
- `deno check supabase\functions\platform-checkout\index.ts`
- `deno check supabase\functions\platform-stripe-webhook\index.ts`
- `npx supabase db push`
- `npx supabase functions deploy platform-checkout --import-map supabase\functions\deno.json`
- `npx supabase functions deploy platform-stripe-webhook --import-map supabase\functions\deno.json`
- `npx supabase functions deploy admin-ai-gateway --import-map supabase\functions\deno.json`

## Observacoes

- O checkout real exige configurar price IDs Stripe em `platform_billing_products.stripe_price_id`.
- O webhook real exige configurar `STRIPE_WEBHOOK_SECRET`.
- Os quatro arquivos antigos da Fase 13 continuam fora do escopo desta fase.
