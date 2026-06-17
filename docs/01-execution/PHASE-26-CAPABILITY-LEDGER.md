# FASE 26 - Ledger Final de Capacidades

**Decision Owner:** Ismael  
**Fonte de verdade:** codigo, migrations e deploys ativos da v2  
**Decisao sobre v1:** referencia de jornadas somente; nenhum contrato/backend da v1 foi preservado como padrao.

## Matriz de Capacidades

| Dominio | App/rota proprietaria | Ator | Contrato v2 | Evidencia | Decisao |
|---|---|---|---|---|---|
| Operacao profissional | professional: dashboard, clientes, agenda, servicos, funil, documentos | gestor/operacional conforme Fase 19 | RPCs/RLS profissionais canonicas | Fases 18/19 + audit/live/UI 26 | manter |
| Financeiro e estoque | professional: `/financeiro/*`, `/estoque` | gestor; operacao permitida no PDV | contratos das Fases 15/20 | role/tenant, conciliacao, lotes, build | manter |
| Growth e retencao | professional: `/growth`, `/rfm`, `/campanhas`, `/recompensas`, `/aniversariantes`, `/parceiros` | gestor; aniversariantes tambem operacional | wrappers `phase21_*` | role, cooldown, resultados, reconciliacao | manter |
| Agentes profissionais | professional: `/agentes`; configuracao assistente e alias | gestor | `professional_agents`, shadow/audit, Fase 22 | configuracao, shadow, chat de teste | manter |
| Administracao da plataforma | admin: rotas em `apps/admin/src/routes.ts` | admin master | RPCs `phase23_*`/`phase24_*` | admin/nao-admin, auditoria, reason | manter |
| Broadcast administrativo | admin: `/broadcast` | admin master | `admin-broadcast` + worker + filas | dry-run, retry, estado terminal | manter |
| Portal e jornadas publicas | client: rotas em `apps/client/src/routes.ts` | anon/client | sete handlers publicos curados | valido/invalido, rate limit, sessao | manter |
| Convite de equipe | professional: `/configuracoes/equipe` | gestor | `invite-team-member` + `create_team_member` | contrato Zod, role, erro curado | manter |
| Autenticacao e recuperacao | professional/admin | usuario da superficie | Supabase Auth + contexto canonico | recuperacao, redirect, unauthorized | manter |

## Matriz de Identidade

| Ator | Permitido | Negado |
|---|---|---|
| gestor professionalA | contratos gestor e operacao do tenant A | tenant B e contratos admin |
| operacional professionalA | acoes operacionais aprovadas | gestao, segredos, billing e tenant B |
| professionalB | somente tenant B | qualquer leitura/mutacao do tenant A |
| externo autenticado | fluxo explicitamente concedido | herdar tenant/role profissional |
| admin master | contratos admin auditaveis | contratos tenant sem contrato explicito |
| autenticado nao-admin | contratos do proprio contexto | RPCs admin |
| anon/client | handlers publicos curados | tabelas, RPCs privadas e payload amplo |

## Matrizes Tecnicas

| Matriz | Resultado final |
|---|---|
| Rotas | professional/admin possuem rotas e aliases centrais; client possui rotas centrais; audit valida duplicidade e destinos |
| Publica | sete handlers usam rate limit canonico e `verify_jwt=false`; client nao acessa tabelas diretamente |
| Assincrona | mensagens, campanhas, agentes e broadcast permanecem nos contratos v2; broadcast usa worker distribuido |
| Schema | migrations local/remoto alinhadas ate `20260614120000`; nenhuma migration destrutiva criada |
| Performance | chunks manuais por fornecedor; maior chunk minificado abaixo de 210 kB; nenhum warning acima de 500 kB |
| Descarte | diretorio vazio `platform-create-checkout-session` removido; owner canonico e `platform-checkout` |
| Jornadas | matriz por rota/ator/owner/estado/teste em `PHASE-26-JOURNEY-MATRIX.md` |

## Evidencia Executavel

- `npm test`: 38 verificacoes estruturais.
- `npm run phase26:live`: 22 verificacoes remotas de identidade, IDOR, publico e assíncrono.
- `npm run phase26:ui`: 24 verificacoes Chromium em 390px e desktop.
- `npm run typecheck`, `npm run lint`, `npm run build`.
- `supabase db lint --linked --level error`.
- `supabase migration list --linked`.
- `supabase functions list --project-ref hqjghltqnbhbfoybtrgq`.
- Relatorios e matrizes das Fases 18 a 25 em `docs/01-execution`.
