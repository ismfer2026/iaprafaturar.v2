# FASE 26 - Matriz de Jornadas e Evidencias

**Fonte:** rotas canônicas v2, contratos implantados e suites `phase26:audit`, `phase26:live` e `phase26:ui`.

## Professional

| Jornada/rotas | Permissão | Owner contratual | Estados/evidência |
|---|---|---|---|
| onboarding e auth | público/autenticado | Supabase Auth + contexto profissional | direto, erro e redirect; audit/UI |
| `/dashboard`, `/relatorios` | gestor/operacional | RPCs agregadas canônicas | loading/error/success; live role/tenant + UI |
| `/agenda` | gestor/operacional | appointments/sessions/RPCs | tenant/role; Fases 19/20 + live |
| `/clientes`, `/clientes/:id`, `/clientes/:id/anamnese` | gestor/operacional | clients/anamnese/RPCs | A/B/externo/IDOR live |
| `/servicos`, `/servicos/novo` | gestor para escrita | services/RPCs | role e rota canônica; audit/live |
| `/financeiro/*`, `/estoque` | gestor; PDV operacional aprovado | contratos Fases 15/20 | role/tenant e invariantes; db lint/Fase 20 |
| `/conversas` | gestor/operacional | conversations/shadow/message contracts | tenant, auditoria e envio controlado; Fases 5/22 |
| `/funil` | gestor/operacional | funnel contracts | owner único e rota canônica; audit/Fase 19 |
| `/growth`, `/campanhas`, `/rfm`, `/recompensas`, `/aniversariantes`, `/parceiros` | gestor; exceções documentadas | wrappers `phase21_*` | gestor permitido/operacional negado live |
| `/documentos/*` | leitura operacional; escrita gestor | contratos documentos/pacotes | aliases e owner único; audit/Fases 13/19 |
| `/agentes` | gestor | professional_agents/shadow/audit | alias único, role e auditoria; audit/Fase 22 |
| `/configuracoes/*`, `/planos`, `/mais` | conforme subárea | contratos canônicos por domínio | aliases/menus/destinos; audit/UI |

## Admin

| Jornada/rotas | Permissão | Owner contratual | Estados/evidência |
|---|---|---|---|
| dashboard/analytics/profissionais | admin master | RPCs admin `phase23_*` | admin permitido/não-admin negado live |
| planos/agentes/melhorias/configurações | admin master | contratos globais Fase 23 | grants, reason e auditoria; db lint/Fase 23 |
| embaixadores/leads | admin master | contratos `phase24_*` | owner único e aliases; audit/Fase 24 |
| broadcast | admin master | admin-broadcast + worker + recipients | dry-run, idempotência, lock, retry e dead-letter live |
| nexus | admin master | contratos Fase 17 | owner admin único; audit |

## Client/Public

| Jornada/rotas | Acesso | Owner contratual | Estados/evidência |
|---|---|---|---|
| `/agendar/:slug`, `/cliente/:slug` | slug público | public-booking-handler | válido 200, inválido 404 e rate-limit 429 live |
| `/agendamento/:token`, `/anamnese/:token`, `/orcamento/:token` | token público | handlers públicos dedicados | contrato curado/rate limit; audit/Fases 14/25 |
| `/pacote/:slug`, `/chat/:slug` | slug público | handlers dedicados | owner único/rate limit; audit/UI |
| `/portal/*` | sessão derivada de token | client-portal-handler | sessionStorage/logout/expiração; audit/Fase 25 |
| not-found | público | PublicNotFoundPage | sem tenant demo e sem overflow; audit/UI |

## Evidências Transversais

| Critério | Evidência |
|---|---|
| rotas, aliases e owners | `npm test` - 38 checks |
| RLS/IDOR/roles/admin | `npm run phase26:live` - 22 checks |
| público e rate limit | `npm run phase26:live` |
| fila/idempotência/retry/dead-letter | `npm run phase26:live`, sempre sem envio real |
| 390px/desktop/runtime/overflow/nome acessível | `npm run phase26:ui` - 24 checks |
| funções local/remoto | 41/41, zero diferença |
| schema/migrations | db lint sem erro; local/remoto alinhado |
| Safari iOS/Android Chrome físicos | gate externo obrigatório no runbook |
