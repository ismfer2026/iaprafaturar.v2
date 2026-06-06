# Master Architecture Redesign

## 1. Objetivo

Redesenhar a arquitetura do iaprafaturar de forma planejada, documentada e incremental, reduzindo remendos e protegendo os fluxos críticos do produto.

Este documento separa:

- como o sistema funciona hoje;
- quais gargalos foram observados;
- quais regras não podem ser violadas;
- qual deve ser a arquitetura alvo;
- como migrar sem quebrar produção.

## 2. Princípio Central

O iaprafaturar não deve ser tratado como um conjunto de telas e Edge Functions soltas. Ele é uma plataforma multi-tenant com IA, WhatsApp, CRM, onboarding, billing e automações. Cada fluxo precisa ter contrato explícito.

O backend existe para cumprir jornadas de produto. A arquitetura deve partir do que o usuário experimenta no frontend/canal e seguir para trás até contratos, eventos, dados e infraestrutura.

Invariantes vêm antes dos fluxos. Se uma implementação viola uma invariante, ela deve parar, mesmo que pareça resolver um bug local.

## 3. Sistemas Envolvidos

- CRM do profissional.
- Admin da plataforma.
- Supabase Auth.
- Supabase Database.
- Supabase Edge Functions.
- Evolution Go.
- Nerissa, IA da plataforma.
- Assistentes/agents dos profissionais.
- Stripe/billing.
- PWA/frontend.
- Logs e observabilidade.

## 4. Fluxos Críticos

- Onboarding público de profissional.
- Criação de conta e ativação Auth.
- Cadastro público de cliente.
- WhatsApp da Nerissa.
- WhatsApp da instância do profissional.
- Agenda e confirmação de atendimento.
- Lembretes, campanhas e follow-ups.
- Planos, trial, créditos e billing.
- Admin interagindo com CRM.

## 5. Problemas Observados

- Roteamento WhatsApp dependia de formatos de payload não documentados.
- Logs de entrada não eram estruturados.
- Alguns diagnósticos exigiam buscar telefone dentro de JSON, o que é caro e instável.
- Mistura potencial entre contexto da plataforma/Nerissa e contexto do profissional.
- Fluxos públicos sensíveis estavam vulneráveis a mudanças incidentais.
- Cadastro de profissional e cadastro de cliente já foram confundidos em pontos de discussão/código.
- Identidade `auth.users.id`, `professionals.id` e `professionals.user_id` precisa de regra explícita.
- Correções urgentes estavam sendo feitas sem um mapa completo antes.

## 6. Ordem Normativa Do Redesenho

1. Invariantes.
2. Catálogo de eventos.
3. Fluxos canônicos de produto.
4. Contratos de componentes.
5. Tabelas de estado e transições.
6. Observabilidade.
7. Arquitetura alvo.
8. Plano de migração.
9. Implementação por portões.

## 7. Reverse Engineering

O reverse engineering não deve canonizar bugs.

Todo fluxo atual deve ser documentado com três colunas:

```txt
Como está hoje | Como deveria ser | Por que divergiu
```

## 8. Arquitetura Atual

Ver `CURRENT_ARCHITECTURE_MAP.md`.

## 9. Regras Invioláveis

Ver `INVIOLABLE_RULES.md` e `../00-principles/invariants.md`.

## 10. Arquitetura Alvo

Ver `TARGET_ARCHITECTURE.md`.

## 11. Decisions E Contracts

Decisões estruturais devem ser registradas em `../decisions/`.

Contratos TypeScript devem viver em `../../contracts/`.

`packages/domain` deve ser TypeScript puro, sem dependência de React, Supabase ou serviços externos.

## 12. Migração

Ver `MIGRATION_PLAN.md`.

## 13. Critério De Pronto

Uma área só deve ser considerada pronta quando tiver:

- fluxo documentado;
- entrada e saída documentadas;
- payloads documentados;
- logs consultáveis;
- isolamento por tenant/profissional;
- testes mínimos definidos;
- regra de rollback ou fallback.

Além disso, todo fluxo deve ter Definition of Done verificável conforme `../00-principles/definition-of-done.md`.
