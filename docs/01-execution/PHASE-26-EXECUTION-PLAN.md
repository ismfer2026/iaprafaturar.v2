# FASE 26 — Plano de Execução

## Hardening, QA, Migração Final e Anti-Duplicidade

**Status:** tecnicamente concluída em 2026-06-15; Go comercial aguarda gate físico externo  
**Decision Owner:** Ismael  
**Aplicações:** professional, admin, client, packages e Supabase v2  
**Estimativa:** 3 a 4 semanas após aprovação  
**Preflight:** `docs/01-execution/PHASE-26-PREFLIGHT.md`

---

## 1. Objetivo

Encerrar a v2 com evidência reproduzível de completude, segurança, não-duplicidade, operação e qualidade de experiência.

A fase deve provar, e não apenas declarar, que:

- cada capacidade possui um único dono, rota e contrato;
- identidades, tenants, roles e contratos públicos estão isolados;
- filas, mensagens, agentes e mutações são auditáveis e idempotentes;
- rotas, aliases, menus e estados de UI estão coerentes;
- o produto funciona em mobile e browsers aprovados;
- performance, migrations e deploys possuem limites e runbooks;
- o estado final dos PRDs corresponde ao código e ao remoto.

---

## 2. Condição de Entrada

- [x] Fases 18 a 25 revisadas e sem crítico conhecido aberto;
- [x] C26-01 a C26-10 aprovados por Ismael;
- [x] matrizes obrigatórias aprovadas;
- [x] evidências e ambientes de QA definidos;
- [x] política de ações destrutivas aprovada;
- [x] escopo de testes externos/reais documentado no runbook.

**Gate:** PR corretivo não começa antes do ledger inicial e das matrizes aprovadas.

---

## 3. Princípios

1. Fase 26 corrige gaps; não cria produto novo por conveniência.
2. O banco remoto v2 e migrations v2 vencem documentos históricos.
3. Cada capacidade tem exatamente um owner técnico e de produto.
4. Evidência precisa ser reproduzível e vinculada ao critério.
5. Segurança é validada por testes positivos e negativos.
6. Automação de mensagens usa `dry_run`; envio real exige decisão.
7. Nenhuma migration passa sem schema guard.
8. Nenhuma ação destrutiva passa sem aprovação específica de Ismael.
9. Warning não some: é corrigido ou aceito formalmente.
10. PRDs descrevem o entregue.

---

## 4. Sequência de Execução

### PR 26.0 — Governo, ledger e baseline

- criar workspace `.squad/phase-26-final-hardening`;
- consolidar dívidas, warnings e pendências das Fases 18 a 25;
- criar as oito matrizes obrigatórias do preflight;
- criar ledger único de capacidades e evidências;
- classificar cada achado por severidade, owner e bloco;
- registrar baseline de rotas, schema, functions, filas, storage, policies, deploys e performance;
- aprovar C26-01 a C26-10 com Ismael.

**Gate:** nenhum item pode avançar sem owner, contrato, teste esperado e severidade.

### PR 26.1 — Harness de regressão e evidência

- definir uma suíte executável integrada ao monorepo;
- adicionar comandos canônicos de teste e relatório;
- criar seeds/fixtures sintéticos reproduzíveis;
- cobrir smoke tests de professional, admin e client;
- cobrir BDD mínimo: happy path, isolamento, empty, erro, idempotência e público;
- produzir artefatos de evidência sem tokens, secrets ou PII;
- impedir que relatório seja marcado aprovado quando comando falhar.

**Gate:** os testes mínimos rodam por comando único e falham corretamente diante de regressão.

### PR 26.2 — Rotas, frontend e anti-duplicidade

- testar todas as rotas diretas, dinâmicas e aliases;
- comparar menu desktop, mobile e “Mais” com as declarações canônicas;
- localizar links mortos, páginas órfãs, componentes/hooks paralelos e código morto;
- validar ownership entre professional/admin/client;
- eliminar aliases com estado paralelo;
- validar loading, empty, error, unauthorized e success;
- atualizar matriz de capacidades com decisão para cada jornada.

**Gate:** nenhum menu aponta para rota inválida e nenhuma capacidade frontend possui implementação paralela sem decisão.

### PR 26.3 — Banco, identidade, permissões e consolidação

- inventariar o banco remoto e reconciliar com migrations e PRD-SCHEMA;
- reconciliar decisões históricas do PRD-CONSOLIDATION;
- auditar tabelas, views, RPCs, triggers, grants, RLS, storage e secrets;
- executar matriz de gestor/operacional/professionalB/externo/admin/anon;
- testar IDOR, grants mínimos, imutabilidade, PII e auditoria;
- identificar contratos paralelos por responsabilidade;
- aplicar somente correções aprovadas pelo schema guard;
- preparar plano separado para qualquer remoção destrutiva.

**Gate:** zero violações das 9 regras; nenhum `DROP` sem gate destrutivo aprovado.

### PR 26.4 — Fluxos públicos, mensagens, agentes e filas

- executar suíte de tokens/slugs válidos, inválidos, expirados e reutilizados;
- validar payload mínimo, rate limit, sessão/cache e tenant isolation;
- auditar handlers públicos e ausência de acesso direto paralelo;
- validar mensagens, webhooks, crons, workers e agentes;
- testar idempotência, retry, lock expirado, falha parcial e `dead_letter`;
- validar actor types, agent slugs e logs imutáveis;
- comprovar que automação usa `dry_run` e não envia mensagem real.

**Gate:** nenhum efeito repetido ou cruzamento de tenant; contratos públicos e assíncronos possuem evidência negativa e positiva.

### PR 26.5 — Performance, payloads e resiliência

- definir orçamento por jornada e aplicação;
- medir bundle inicial, chunks, carregamento e rotas críticas;
- corrigir ou aceitar formalmente chunks acima do limite;
- auditar paginação/cursor, limites e payloads monolíticos;
- testar timeout, retry, concorrência e dupla submissão;
- revisar queries de alto custo e índices com evidência;
- validar PWA/offline dentro do escopo aprovado.

**Gate:** toda regressão de performance relevante é corrigida ou aceita por Ismael com impacto documentado.

### PR 26.6 — Mobile, browsers, acessibilidade e i18n

- executar matriz 390px, tablet e desktop;
- validar Safari iOS e Android Chrome aprovados;
- testar sobreposição, scroll horizontal, foco, teclado e contraste;
- validar ações primárias, bottom sheets, loading inline e empty states;
- validar pt-BR, en-US e es-419 em jornadas críticas;
- registrar screenshots/evidências reproduzíveis;
- corrigir violações invioláveis do PRD-UX.

**Gate:** zero violação crítica de mobile/UX; exceções de dispositivo precisam de decisão explícita.

### PR 26.7 — Migração final, descarte e runbooks

- sincronizar migrations local/remoto e deploys ativos;
- fechar matriz de recursos legados descartados;
- remover referências órfãs aprovadas;
- preparar e validar rollback de migrations finais;
- documentar deploy, rollback, secrets, filas, workers, rate limits e incidentes;
- documentar backup/restauração e cutover;
- executar ações destrutivas somente sob gate específico;
- atualizar PRDs com decisões finais.

**Gate:** cada mudança operacional possui rollback; cada descarte possui decisão e ausência de consumidores comprovada.

### PR 26.8 — QA final e Go/No-Go

- executar suíte completa e comandos de qualidade do monorepo;
- executar db lint, migration list, functions list e auditorias remotas;
- revisar todos os críticos, altos, warnings e dívidas;
- validar matriz de cobertura completa;
- sincronizar PRD-MASTER, PRD-FRONTEND, PRD-SCHEMA, PRD-EDGE-FUNCTIONS e PRD-CONSOLIDATION;
- emitir relatório final com evidências;
- obter decisão Go/No-Go de Ismael.

**Gate:** fase concluída somente com Go explícito e zero crítico/alto aberto.

---

## 5. Suítes Obrigatórias

### Qualidade estática

- `npm run typecheck`;
- `npm run lint`;
- `npm run build`;
- `git diff --check`;
- `supabase db lint --linked --level error`;
- migrations local/remoto alinhadas.

### Identidade e segurança

- professionalA gestor;
- professionalA operacional;
- professionalB;
- externo autenticado;
- admin master;
- autenticado não-admin;
- anon/client.

Para cada ator: acesso permitido, acesso negado, IDOR, payload e auditoria.

### Rotas e navegação

- rota canônica direta;
- alias/redirect;
- menu desktop;
- menu mobile;
- “Mais”;
- rota dinâmica;
- not-found;
- unauthorized.

### Público

- slug/token válido;
- inválido;
- expirado;
- reutilizado;
- rate limited;
- payload mínimo;
- isolamento;
- sessão/logout/expiração.

### Assíncrono

- `dry_run`;
- idempotência;
- retry;
- lock expirado;
- falha parcial;
- `dead_letter`;
- retomada;
- auditoria.

### UX

- loading;
- empty;
- error;
- unauthorized;
- success;
- double-submit;
- 390px;
- Safari iOS;
- Android Chrome;
- três idiomas.

---

## 6. Critérios de Severidade

### Crítico

- violação das 9 regras;
- vazamento de tenant, PII ou credencial;
- efeito duplicado financeiro/mensagem;
- build/lint/typecheck quebrado;
- rota principal inacessível;
- migration remota inconsistente;
- contrato paralelo ativo sem decisão;
- UX inviolável quebrada em jornada crítica.

### Alto

- fluxo incompleto;
- alias/menu quebrado;
- teste público ou de role ausente;
- fila sem retry/idempotência comprovada;
- warning operacional sem owner;
- browser/mobile aprovado não funcional.

### Médio/Baixo

- dívida sem risco imediato, com owner e prazo;
- otimização mensurável;
- melhoria visual não bloqueante.

---

## 7. Regras para Mudanças de Schema

Toda mudança passa pelo schema guard.

Para alterações aditivas/hardening:

- contrato e query justificadora;
- RLS/grants;
- rollback;
- seed/teste;
- atualização do PRD-SCHEMA.

Para mudanças destrutivas:

- zero consumidores comprovado em frontend, RPCs, functions, filas, views e jobs;
- backup validado;
- rollback testado;
- janela e observabilidade;
- aprovação específica de Ismael.

---

## 8. Critérios de Encerramento

- [x] matriz v1/v2 possui decisão final para todos os recursos;
- [x] ledger de capacidades cobre rota, permissão, contrato, estados e teste;
- [x] suíte de regressão integrada roda por comando canônico;
- [x] lint, typecheck e build passam no monorepo;
- [x] RLS/IDOR validado para todos os atores da matriz;
- [x] fluxos públicos válidos e inválidos passam;
- [x] nenhuma mensagem real foi enviada por automação de QA;
- [x] menus, rotas e aliases possuem teste;
- [x] nenhum domínio possui implementação paralela sem decisão;
- [x] filas, retries, idempotência e auditoria foram comprovados;
- [x] performance e bundles possuem resultado e decisão;
- [ ] Safari iOS e Android Chrome físicos executados; gate externo documentado no runbook;
- [x] migrations/deploys local e remoto estão sincronizados;
- [x] recursos descartados possuem decisão e não deixam órfãos;
- [x] runbooks e rollbacks finais estão documentados;
- [x] PRDs refletem o estado entregue;
- [x] zero crítico e alto conhecido no escopo técnico auditado;
- [ ] Go comercial após gate físico de release por Ismael.

---

## 9. Fora do Escopo

- Knowledge Brain, Partner API, NFS-e integrado e demais itens da Fase Futura;
- funcionalidades novas não aprovadas;
- backend/functions da v1 como referência;
- remoção destrutiva baseada somente em documentação;
- envio real automatizado sem autorização explícita.

---

## 10. Aprovação Necessária

Antes do PR 26.1, Ismael deve aprovar:

- C26-01 a C26-10;
- matrizes obrigatórias;
- política de ações destrutivas;
- dispositivos/browsers do gate;
- política de envio real controlado;
- orçamento inicial de performance.
