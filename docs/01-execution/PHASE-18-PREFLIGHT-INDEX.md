# Fase 18 — Índice de Preflight das Fases 19-25

Cada item abaixo deve gerar uma ficha baseada em `PHASE-PREFLIGHT-CONTRACT.md` antes do primeiro PR de implementação.

| Fase | Capacidade | App/rotas | Contrato v2 inicial | Estado de preflight |
|---|---|---|---|---|
| 19 | Operação profissional | dashboard, clientes, agenda, serviços, funil, documentos, configurações | CRM, agenda, serviços, documentos e anamnese do mapa v2 | plano criado em `PHASE-19-EXECUTION-PLAN.md`; PR 19.0 obrigatório antes da implementação |
| 20 | Estoque, fiscal e financeiro | `/estoque`, `/financeiro/*` | produtos, movimentos, transações e conciliação; fiscal é lacuna | obrigatório antes do PR |
| 21 | Growth e retenção | `/growth`, `/campanhas`, `/rfm`, `/recompensas`, `/aniversariantes`, `/parceiros` | RFM, health, campaigns, referrals; parceiros profissional é lacuna | obrigatório antes do PR |
| 22 | Agentes IA profissional | `/agentes` | `professional_agents`, `agent_executions`, regras operacionais | obrigatório antes do PR |
| 23 | Admin analytics/configurações | `/dashboard`, `/analytics`, `/configuracoes`, `/agentes`, `/planos` | RPCs admin existentes; settings/analytics detalhado são lacunas | obrigatório antes do PR |
| 24 | Admin growth/afiliados | `/broadcast`, `/embaixadores`, `/leads` | `platform_affiliate_*`; broadcast/leads exigem prova adicional | obrigatório antes do PR |
| 25 | Experiência client | rotas em `apps/client/src/routes.ts` | handlers públicos v2 por token/slug | obrigatório antes do PR |

## Aprovação mínima de cada ficha

- Ismael aprova ownership, rota canônica e incremento exato.
- Evidência contratual cita migrations/DB v2, RLS, RPC/Function e isolamento.
- Lacunas atualizam PRD-SCHEMA antes de qualquer migration.
- Componentes e hooks existentes são inventariados para impedir reconstrução.
- Segurança, estados de UX, mobile, i18n e performance entram no DoD da tarefa.
