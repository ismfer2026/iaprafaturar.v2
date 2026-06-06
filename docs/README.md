# Documentação — iaprafaturar v2

## Hierarquia de Autoridade

```
docs/00-master/PRD-MASTER.md        ← SOBERANO: invariantes, arquitetura, regras absolutas
docs/03-product/PRD-SCHEMA.md       ← DDL autoritativo: schema, índices, RLS, triggers
docs/02-contracts/EVENTS.md         ← Contratos de eventos: payloads, idempotência
docs/03-product/PRD-FRONTEND.md     ← Convenções de frontend (subordinado ao Master)
docs/03-product/PRD-EDGE-FUNCTIONS.md ← Convenções de Edge Functions
docs/01-execution/EXECUTION-PRD.md  ← Roteiro de execução (subordinado ao Master)
docs/01-execution/SETUP-CHECKLIST.md ← Infraestrutura e portões de fase
docs/05-runbook/*                   ← Diagnóstico operacional
```

**Regra de conflito:** quando dois documentos divergirem, a hierarquia acima decide qual vence.
PRD-MASTER.md > PRD-SCHEMA.md > EVENTS.md > demais documentos.
Documentos de execução (EXECUTION-PRD, SETUP-CHECKLIST) nunca sobrepõem definições do Master.

---

## Estrutura

### 00-master/ — Fundação
| Arquivo | Conteúdo |
|---|---|
| `PRD-MASTER.md` | Visão, invariantes, glossário, arquitetura WhatsApp, 10 fases de build |
| `INVARIANTES.md` | Regras que nunca mudam — referência rápida |

### 01-execution/ — Como Construir
| Arquivo | Conteúdo |
|---|---|
| `EXECUTION-PRD.md` | Detalhamento dos 65 fluxos (J1-J65) com stack e schema |
| `SETUP-CHECKLIST.md` | Checklist de infraestrutura (GitHub, Supabase, contas, credenciais) |
| `DEFINITION-OF-DONE.md` | DoD por fase — critérios de aprovação |

### 02-contracts/ — O Que Construir
| Arquivo | Conteúdo |
|---|---|
| `EVENTS.md` | Catálogo completo de eventos do sistema |

### 03-product/ — Especificações de Produto
| Arquivo | Conteúdo |
|---|---|
| `PRD-UX.md` | Design system, padrões mobile, componentes |
| `PRD-SCHEMA.md` | DDL completo com RLS, índices, triggers |
| `PRD-FRONTEND.md` | Componentes por tela, hooks existentes |
| `PRD-EDGE-FUNCTIONS.md` | Funções Supabase/Deno existentes |
| `PRD-CONSOLIDATION.md` | Tabelas consolidadas — o que NÃO criar |

### 02-product-flows/ — Fluxos Detalhados por Feature
60+ arquivos descrevendo cada jornada (J1-J65) em detalhe.
`CURRENT_V1_*.md` = inventário do v1 (referência histórica).

### 03-architecture/ — Arquitetura Técnica
Decisões de arquitetura, mapa atual, regras invioláveis.

### 05-runbook/ — Operacional
Guias de diagnóstico para problemas comuns em produção.

### decisions/ — ADRs
Architecture Decision Records (ADR-0001 a ADR-000N).

---

## Para Implementar uma Feature

```
1. Ler docs/00-master/PRD-MASTER.md (seção da fase relevante)
2. Usar /squad [descrição da feature]
3. O squad orquestra: PM → Arquiteto → Dev → QA
```
