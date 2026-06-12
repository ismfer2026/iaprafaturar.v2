# Fase 17 - Billing SaaS, Plataforma e Admin Operacional Avancado

## Fonte

PRD: `docs/00-master/PRD-MASTER.md`, Fase 17, linhas 1178-1205.

Fluxos de apoio:

- `docs/02-product-flows/11-plano-billing.md` - J11 Plano e Billing.
- `docs/02-product-flows/33-38-admin-ismael.md` - J34, J35, J37, J38 Admin da Plataforma.
- `docs/02-product-flows/47-nexus-ia-admin.md` - J47 Nexus.
- `docs/02-product-flows/48-embaixadores-afiliados.md` - J48 Embaixadores/Afiliados.
- `docs/02-product-flows/49-health-score-profissional.md` - J49 Health score profissional.
- `docs/02-product-flows/51-53-admin-misc.md` - J52 Agentes e J53 Melhorias.

## Objetivo

Transformar a plataforma em operacao SaaS completa: Stripe como fonte de verdade de assinatura, trial/read-only, creditos IA, free_internal apenas por admin/service_role, afiliados/embaixadores, acoes admin auditaveis, Nexus com confirmacao e gestao operacional de agentes/prompts.

## DoD Obrigatorio

- [ ] Stripe e fonte de verdade de assinatura.
- [ ] Trial expira e entra em modo leitura sem perder dados.
- [ ] Creditos IA limitam automacoes sem bloquear acesso aos dados.
- [ ] Admin consegue conceder `free_internal` sem checkout publico.
- [ ] Nexus nao executa acao sensivel sem confirmacao e auditoria.

## Skills Aplicadas

- `pricing`: planos, packaging, trial, anual/mensal, creditos avulsos e regra do `free_internal`.
- `revops`: operacao admin, lifecycle trial -> pago -> inadimplente -> read-only, handoff Nexus/admin e SLAs de acoes sensiveis.

## Decisao Central

A Fase 17 nao deve copiar a v1 nem partir do zero. Os inventarios v1 citam `plans`, `billing_products`, `professional_subscriptions`, wallets de creditos, afiliados, Stripe functions e paginas admin. O schema local v2, porem, ainda nao expõe essas tabelas como migrations atuais completas. Portanto a primeira subfase e obrigatoriamente um diff factual entre:

1. migrations v2 atuais;
2. dumps/inventarios v1 em `docs/02-product-flows`;
3. frontend admin/professional atual;
4. edge functions ja existentes.

## Escopo Ja Coberto

J49 aparece como jornada-alvo da Fase 17 no PRD, mas ja foi implementado na Fase 9 por `professional_platform_health_scores` e `calculate_platform_health_scores_batch` em `20260607150000_phase9_admin_analytics.sql`. A Fase 17 deve reaproveitar esse dado em admin/Nexus, nao recriar outro health score profissional.

## Decisao Aberta Critica

O PRD define `plan_type = 'free_internal'`, mas `professionals.plan_type` hoje so aceita `trial`, `individual`, `equipe`, `team`, `enterprise`. A 17a deve decidir explicitamente se amplia o `CHECK` de `professionals.plan_type` ou se representa `free_internal` em uma camada de acesso/entitlement separada. Sem essa decisao, `admin_grant_free_internal` nao tem persistencia valida.

## Gates Antes de Codigo

1. `squad-schema-guard` deve aprovar cada subfase antes de migration.
2. Stripe e API externa paga exigem checkpoint explicito antes de checkout/webhook real.
3. `free_internal` nunca aparece em pricing publico e so pode ser concedido por RPC admin/service_role.
4. Read-only deve bloquear escrita sem esconder dados ja cadastrados.
5. Creditos IA bloqueiam automacoes/agents, nao leitura do CRM.
6. Nexus so executa acao sensivel em fluxo `proposed -> confirmed -> executed`, com audit_log.
7. Nada deve tocar financeiro operacional da Fase 15 como se fosse billing SaaS.

## Subfases Propostas

1. `phase17a_billing_inventory_contracts`
2. `phase17b_plans_subscriptions_stripe`
3. `phase17c_trial_readonly_entitlements`
4. `phase17d_ai_credits_wallets`
5. `phase17e_admin_operations_free_internal`
6. `phase17f_affiliates_ambassadors`
7. `phase17g_nexus_actions`
8. `phase17h_agents_prompts_feature_requests`

Cada subfase deve ter migration pequena, QA proprio e deploy isolado quando houver edge function.
