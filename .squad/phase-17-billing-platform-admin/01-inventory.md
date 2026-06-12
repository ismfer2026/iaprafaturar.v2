# Inventario Inicial - Fase 17

## PRD Master

Fase 17 exige:

- Stripe checkout/webhook.
- Trial, modo leitura, upgrade/downgrade e creditos IA.
- Plano `free_internal` apenas via admin/service_role.
- Afiliados/embaixadores profissional -> profissional.
- Admin actions com auditoria.
- Nexus executa acoes com confirmacao e escopo permitido.
- Gestao de agentes, versoes, prompts e rollback.
- Frontend: `/planos`, admin planos/status, afiliados/embaixadores, Nexus auditavel, feature requests/melhorias.

## Estado Local v2 Observado

- `apps/admin` tem rotas atuais para `/dashboard`, `/profissionais`, `/broadcast` e `/nexus`.
- `apps/admin/src/pages/NexusPage.tsx` e placeholder: informa que Nexus sera conectado ao gateway admin.
- Busca local nao encontrou paginas v2 atuais para `/planos`, `/embaixadores`, `/agentes` ou `/melhorias`.
- `professionals` ja possui `stripe_customer_id` e protecao de update em `plan_type`, `acesso_vitalicio`, `stripe_customer_id`.
- `professionals.plan_type` tem `CHECK` limitado a `trial`, `individual`, `equipe`, `team`, `enterprise`; `free_internal` ainda nao e valor aceito no schema atual.
- J49 ja esta coberto na Fase 9 por `professional_platform_health_scores`; a Fase 17 deve consumir esse score, nao criar outro paralelo.
- Fase 15 separou explicitamente financeiro operacional de billing SaaS.
- Fase 8 deixou claro que growth nao criou billing/Stripe/credit wallets/affiliate profissional -> profissional.

## Inventarios v1 Relevantes

Arquivos de inventario indicam que a v1 tinha ou observava:

- tabelas: `plans`, `billing_products`, `professional_subscriptions`, `subscription_history`, `credit_wallets`, `credit_transactions`, `credit_reservations`, `processed_billing_events`, `affiliate_partners`, `affiliate_payments`;
- functions: `create-checkout-session`, `stripe-webhook`, `manage-stripe-catalog`, `affiliate-commission-cron`, `affiliate-notify`;
- RPCs: `reserve_credits`, `commit_credits`, `release_credits`, `consume_platform_credits`, `create_trial_subscription`, `upgrade_plan`, `get_affiliate_by_code`;
- admin v1: `/planos`, `/embaixadores`, `/agentes`, `/melhorias`, `/nexus`.

## Riscos De Colisao

- Tabelas e functions citadas nos inventarios podem existir apenas na v1/producao antiga, nao nas migrations v2 atuais.
- `plans.trial_days` na v1 parecia inconsistente com trial real.
- `create_trial_subscription` tinha mais de uma assinatura em inventario v1; evitar nomes ambiguos.
- Status de afiliado v1 tinha mistura de `ativo`, `aprovado`, `approved`; Fase 17 precisa normalizar.
- Billing SaaS nao pode reutilizar `financial_transactions` da Fase 15 como fonte de assinatura da plataforma.

## Inventario Obrigatorio Antes Da 17b

Para cada objeto candidato, marcar:

- `reuse`: existe e esta correto na v2.
- `extend`: existe mas precisa colunas/RPC/indices.
- `replace`: existe legado e deve ser migrado com compatibilidade.
- `create`: nao existe na v2.
- `reject`: pertence a v1 ou a outra fase e nao deve entrar.

Objetos minimos: planos, produtos Stripe, assinaturas, eventos Stripe processados, wallets, transacoes de creditos, reservas de creditos, afiliados, pagamentos de afiliados, nexus action proposals, agent versions, feature requests.

Decisao obrigatoria para `free_internal`:

- opcao A: ampliar o `CHECK` de `professionals.plan_type` para incluir `free_internal`, preservando `plan_type` como fonte direta do estado;
- opcao B: manter `plan_type` apenas para planos comerciais/trial e representar `free_internal` em `professional_access_states`/entitlements, com precedencia sobre o plano comercial;
- opcao escolhida deve explicar impacto em Stripe, admin, read-only, creditos IA e queries legadas que agregam por `plan_type`.

Decisao obrigatoria para J49:

- confirmar que `professional_platform_health_scores` e a fonte canonical de health profissional;
- mapear onde admin/Nexus vao ler esse dado;
- bloquear criacao de nova tabela paralela de health score profissional.
