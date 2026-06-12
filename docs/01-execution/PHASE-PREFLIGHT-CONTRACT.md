# Contrato de Preflight por Fase

Este template é obrigatório antes de implementar qualquer tarefa das Fases 18-26. Seu objetivo é impedir duplicação de rotas, componentes, contratos Supabase e regras de negócio.

## Identificação

- Fase:
- Capacidade/domínio:
- Resultado utilizável:
- App responsável: `professional` | `admin` | `client`
- Atores e roles permitidos:
- Jornadas afetadas:

## Ownership e progressão

- Fase dona do fechamento:
- Fases anteriores ampliadas:
- Implementação existente que será preservada:
- Incremento exato desta tarefa:
- Itens explicitamente fora do escopo:
- Itens proibidos de reconstruir:

## Rotas e navegação

- Rota canônica:
- Aliases/redirects:
- Entrada no menu desktop/mobile/Mais:
- Breadcrumb e navegação direta:
- Rotas removidas ou consolidadas:
- Testes de URL direta e redirect:

## Contratos existentes

- Evidência no banco/migrations da v2:
- Componentes e hooks reutilizados:
- Tabelas lidas:
- Tabelas escritas:
- RPCs reutilizadas:
- Edge Functions reutilizadas:
- Storage/buckets:
- Filas/crons:
- Policies RLS verificadas:

> Functions, tabelas, RPCs, policies e filas da v1 são proibidas como referência técnica. A v1 pode justificar somente o comportamento de produto/frontend desejado.

## Lacunas contratuais

- Por que os contratos existentes não atendem:
- Migration/RPC/Edge Function nova necessária:
- Evidência de que não existe equivalente:
- Impacto em schema, RLS, índices e auditoria:
- Rollback e seed:
- PRDs técnicos que precisam ser atualizados:

## Segurança e confiabilidade

- Teste `professionalA` versus `professionalB`:
- Teste de role operacional versus gestor:
- Teste admin versus professional:
- IDOR:
- Idempotência:
- Auditoria:
- `DRY_RUN`:
- Token/slug/rate limit, quando público:

## UX e qualidade

- Loading:
- Empty state:
- Erro:
- Sucesso:
- Mobile 390px:
- Safari iOS/Android Chrome:
- i18n:
- Paginação/cursor:
- Métrica de performance:

## Definition of Done da tarefa

- [ ] Ownership e progressão aprovados
- [ ] Rota canônica e redirects aprovados
- [ ] Contratos existentes inventariados
- [ ] Todos os contratos backend foram comprovados no DB/migrations da v2, sem referência técnica à v1
- [ ] Não-duplicidade comprovada
- [ ] Lacunas técnicas aprovadas antes de migration
- [ ] Segurança e isolamento testados
- [ ] Estados de UX e mobile testados
- [ ] PRD-MASTER e PRDs técnicos sincronizados

## Decisão final

- Status: `aprovada` | `bloqueada` | `descartada`
- Responsável pela aprovação:
- Data:
- Evidências/links:
