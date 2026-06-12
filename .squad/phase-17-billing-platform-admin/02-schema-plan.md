# Schema Plan - Fase 17

## Regras Globais

- Toda tabela nova no schema `public` deve ter `REVOKE ALL ON ... FROM anon, authenticated` antes de grants especificos.
- RLS habilitado em todas as tabelas com dados de profissional.
- Escrita sensivel somente por RPC `SECURITY DEFINER` ou service_role edge function.
- Operacoes financeiras/assinatura usam `ON DELETE RESTRICT`; historico nao pode sumir por cascata.
- Eventos, ledgers, webhooks e auditoria sao append-only com trigger `fn_log_immutable`.
- `free_internal` nao pode ser atribuido por frontend publico nem pelo profissional autenticado.
- Stripe event id deve ser idempotente.

## 17a - Inventory Contracts

Sem schema de negocio. Entrega documentos de diff:

- `17a-schema-inventory.md`
- `17a-collision-map.md`
- `17a-go-nogo.md`

## 17b - Plans, Subscriptions, Stripe

Objetos candidatos, sujeitos ao diff 17a:

- `platform_plans`: catalogo canonical da v2, sem expor `free_internal` em checkout publico.
- `platform_billing_products`: mapeamento Stripe product/price -> plano/credit pack.
- `professional_subscriptions`: estado atual de assinatura por profissional.
- `subscription_events`: historico append-only de status, plano, periodo, origem.
- `processed_stripe_events`: idempotencia de webhook por `stripe_event_id`.

Decisao pendente: reutilizar nomes v1 (`plans`, `billing_products`) ou criar nomes `platform_*`. Preferencia inicial: `platform_*` se nomes v1 nao existirem localmente, para evitar colisao conceitual com catalogos operacionais.

Decisao obrigatoria antes de migration:

- `free_internal` nao e aceito pelo `CHECK` atual de `professionals.plan_type`.
- Escolher entre ampliar o `CHECK` de `professionals.plan_type` ou persistir `free_internal` em camada separada de access state/entitlement.
- A escolha deve manter Stripe como fonte de verdade dos planos pagos sem permitir checkout publico para `free_internal`.

## 17c - Trial, Read-only, Entitlements

Objetos candidatos:

- colunas em `professionals` ou tabela separada `professional_access_states` para `access_status`, `readonly_since`, `trial_ends_at`, `read_only_reason`.
- `entitlement_snapshots` append-only para explicar por que algo esta permitido/bloqueado.

Regra: read-only bloqueia INSERT/UPDATE/DELETE de fluxos profissionais, mas SELECT continua permitido ao dono.

## 17d - AI Credits

Objetos candidatos:

- `ai_credit_wallets`
- `ai_credit_transactions`
- `ai_credit_reservations`
- `ai_usage_events`

Ledger append-only. Reserva/commit/release devem ser idempotentes por `idempotency_key`/`correlation_id`.

Regra: creditos zerados bloqueiam execucao de automacoes IA, nao acesso aos dados.

## 17e - Admin Operations + free_internal

Objetos candidatos:

- `admin_action_requests`: proposed/confirmed/executed/cancelled/expired.
- `admin_action_results`: append-only.
- possivel extensao de `audit_log` para action metadata.

RPCs devem chamar `admin_assert_master()` e registrar `actor_type = 'admin'`.

`admin_grant_free_internal` so pode ser especificada depois da decisao de persistencia do `free_internal` tomada em 17a/17b.

## 17f - Affiliates / Ambassadors

Objetos candidatos:

- `platform_affiliate_partners`
- `platform_affiliate_referrals`
- `platform_affiliate_commissions`
- `platform_affiliate_payments`

Se tabelas v1 equivalentes existirem na v2, extender em vez de recriar. Normalizar status em portugues/ingles para enum/check unico: `pending`, `active`, `rejected`, `suspended`.

## 17g - Nexus Actions

Objetos candidatos:

- `nexus_conversations`
- `nexus_messages`
- `nexus_action_proposals`
- `nexus_action_executions`

Toda acao sensivel exige proposta persistida, confirmacao explicita e execucao idempotente.

## 17h - Agents, Prompts, Feature Requests

Objetos candidatos:

- `agent_registry`
- `agent_prompt_versions`
- `agent_pause_windows`
- `feature_requests`
- `feature_request_votes`
- `feature_request_comments`

Prompts: status `draft`, `staging`, `active`, `rolled_back`, `archived`.

Feature requests: votos unicos por profissional, rejeicao sempre com motivo.

J49 health profissional: usar `professional_platform_health_scores` da Fase 9 como fonte canonical para admin/Nexus. Nao criar `professional_health_scores` ou tabela paralela salvo se o schema guard provar necessidade de migracao controlada.
