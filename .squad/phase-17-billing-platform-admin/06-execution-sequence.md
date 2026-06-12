# Sequencia de Execucao - Fase 17

## Regra de Trabalho

Nao executar a Fase 17 em lote unico. Cada subfase passa por:

1. inventario/diff;
2. schema guard;
3. migration pequena;
4. RPC/edge contract;
5. frontend se aplicavel;
6. typecheck/build;
7. `supabase db push` e deploy de functions;
8. commit e push GitHub;
9. QA especifico.

## Ordem Go/No-Go

### 17a - Billing Inventory Contracts

Go quando:

- objetos v1/v2 estiverem mapeados como reuse/extend/create/reject;
- nomes finais das tabelas billing/credit/affiliate estiverem definidos;
- decisoes de preco/planos minimas estiverem documentadas.
- persistencia do `free_internal` estiver decidida frente ao `CHECK` atual de `professionals.plan_type`;
- J49 estiver marcado como reutilizacao de `professional_platform_health_scores` da Fase 9, sem nova tabela paralela.

Entregas:

- inventario factual;
- collision map;
- contrato canonical de planos/status/creditos.
- decisao `free_internal`: ampliar `plan_type` ou usar access state/entitlement separado.
- decisao J49: fonte canonical e pontos de consumo admin/Nexus.

### 17b - Plans, Subscriptions, Stripe

Go quando:

- usuario aprovar uso de Stripe e credenciais/custo;
- fonte de verdade de assinatura estiver fechada.

Entregas:

- catalogo de planos/produtos;
- checkout;
- webhook idempotente;
- pagina `/planos` inicial.

### 17c - Trial, Read-only, Entitlements

Go quando:

- estrategia de bloquear escrita estiver definida sem quebrar leitura;
- lista de mutacoes bloqueadas por read-only estiver mapeada.

Entregas:

- entitlements;
- read-only state;
- banners e guards no profissional.

### 17d - AI Credits

Go quando:

- edge functions consumidoras de IA estiverem inventariadas;
- contrato reserve/commit/release estiver aprovado.

Entregas:

- wallets/ledger/reservas;
- integracao inicial nos agentes de maior custo;
- alertas 80%/0%.

### 17e - Admin Operations + free_internal

Go quando:

- admin_assert_master e audit_log estiverem confirmados;
- regra do `free_internal` estiver fechada.

Entregas:

- admin concede free_internal;
- admin adiciona creditos;
- admin ajusta status/plano com motivo;
- historico auditavel.

### 17f - Affiliates / Ambassadors

Go quando:

- janela de atribuicao e regra de comissao estiverem decididas;
- status forem normalizados.

Entregas:

- solicitacao/aprovacao;
- tracking de indicacoes;
- calculo de comissoes pendentes;
- painel admin/profissional.

### 17g - Nexus Actions

Go quando:

- lista de acoes permitidas estiver fechada;
- fluxo de confirmacao estiver definido.

Entregas:

- Nexus responde metricas;
- Nexus propoe acao;
- admin confirma;
- acao executa com audit_log.

### 17h - Agents, Prompts, Feature Requests

Go quando:

- agentes versionaveis estiverem inventariados;
- policy de staging/rollback estiver definida.

Entregas:

- painel de agentes;
- prompt versions e rollback;
- feature requests/votos/status;
- i18n e QA.

## Criterio de Fechamento

A Fase 17 so pode ser marcada como completa quando os 5 DoD do PRD estiverem verificados em codigo, banco remoto, edge functions, frontend e GitHub. Declaracoes de deploy precisam de evidencia objetiva: migration remota listada, functions deployadas e app respondendo 200.
