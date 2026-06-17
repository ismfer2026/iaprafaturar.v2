# FASE 26 — Preflight

## Hardening, QA, Migração Final e Anti-Duplicidade

**Status:** aprovado por Ismael e executado em 2026-06-15  
**Decision Owner:** Ismael  
**Aplicações:** `apps/professional`, `apps/admin`, `apps/client`, packages e Supabase v2  
**Fonte de verdade:** PRD-MASTER aprovado + código v2 + banco remoto v2 + deploys ativos v2  
**Regra:** v1 é somente inventário de jornadas; backend/functions da v1 não são referência.

---

## 1. Classificação

**Complexidade:** crítica e transversal.

A fase afeta todas as superfícies do produto e pode tocar rotas, contratos, permissões, migrations, Edge Functions, filas, performance, UX e documentação. Deve ser executada em blocos isolados, com QA independente e gates bloqueantes.

Não é uma fase para adicionar funcionalidades. Qualquer capacidade ausente descoberta deve ser classificada como:

1. bug ou quebra de DoD anterior: corrigir dentro da Fase 26;
2. dívida aprovada e não bloqueante: registrar com owner e fase futura;
3. recurso novo: não implementar na Fase 26 sem decisão explícita de Ismael.

---

## 2. Achados de Entrada

### Confirmados

- professional, admin e client possuem declarações centrais de rotas;
- aliases profissionais e administrativos existem, mas ainda precisam de teste executável;
- Fases 18 a 25 possuem planos e decisões documentais;
- o banco v2 e as migrations v2 são a única referência técnica;
- `typecheck`, `lint` e `build` existem no monorepo;
- não existe script raiz de testes de regressão integrado ao pipeline;
- há QA físico de 390px/Safari iOS/Android Chrome ainda externo em fases anteriores;
- existem avisos de bundle acima de 500 kB em admin/professional;
- `PRD-CONSOLIDATION.md` contém decisões históricas que precisam ser reconciliadas com o schema realmente implantado;
- evidências de segurança, deploy e QA estão espalhadas entre planos, relatórios e workspaces `.squad`.

### Consequência

A fase não pode ser encerrada apenas com builds verdes ou busca textual. Cada critério precisa de evidência reproduzível ligada a uma capacidade, ator, rota, contrato e cenário.

---

## 3. Contratos Obrigatórios

### C26-01 — Ledger de capacidades e evidências

Cada capacidade do produto deve possuir exatamente:

- domínio e aplicação proprietária;
- ator permitido;
- rota canônica e aliases;
- componente/hook proprietário;
- contrato v2: tabela, RPC, Edge Function, fila, storage ou serviço;
- fonte de verdade;
- estados de loading, empty, error, unauthorized e success;
- cenários de teste e evidência;
- decisão final: manter, consolidar, remover ou deferir.

Nenhum item pode ser marcado concluído somente por existir no PRD.

### C26-02 — Não-duplicidade e fonte de verdade

- comparar código, migrations, banco remoto, functions ativas, filas, storage e policies;
- identificar responsabilidades paralelas, não apenas nomes iguais;
- distinguir progressão legítima de duplicação;
- proibir contrato novo quando equivalente v2 já existir;
- reconciliar PRD-CONSOLIDATION com o estado real;
- toda remoção física exige zero consumidores comprovado.

### C26-03 — Rotas, navegação e aliases

- toda rota direta renderiza a tela aprovada;
- menu desktop, mobile e “Mais” usam a declaração canônica;
- aliases somente redirecionam;
- nenhuma rota consolidada depende exclusivamente de aba local;
- rotas dinâmicas não aparecem incorretamente na navegação;
- nenhum link aponta para tela inexistente ou não aprovada.

### C26-04 — Identidade, RLS, IDOR e permissões

Matriz mínima:

| Ator | Cenário obrigatório |
|---|---|
| gestor professionalA | acessa e muta somente capacidades permitidas do tenant A |
| operacional professionalA | executa somente ações operacionais permitidas |
| gestor/operacional professionalB | não lê nem altera tenant A |
| externo autenticado | não herda tenant ou role indevida |
| admin master | executa somente contratos admin auditáveis |
| autenticado não-admin | não executa contratos admin |
| anon/client | acessa somente payload público permitido |

Validar as 9 regras do `CLAUDE.md`, grants mínimos, auditoria, imutabilidade e ausência de credenciais/PII em payloads.

### C26-05 — Fluxos públicos e sessão cliente

- testar token/slug válido, inválido, expirado e já utilizado;
- testar isolamento entre clientes e profissionais;
- validar rate limit e recuperação após janela;
- validar payload mínimo e erros curados;
- validar sessão/cache/logout/expiração;
- comprovar ausência de auth profissional e acesso direto amplo.

### C26-06 — Mensagens, agentes, filas e idempotência

- `dry_run` obrigatório em automação;
- nenhum teste automatizado envia mensagem real;
- mensagem, agente, cron, worker e webhook usam contratos canônicos;
- claims de idempotência precedem efeitos;
- retries, locks expirados, falhas parciais e `dead_letter` são testados;
- logs usam `actor_type` canônico e `agent_slug` quando aplicável;
- nenhuma fila ou function paralela possui a mesma responsabilidade.

### C26-07 — Integridade, performance e operação

- paginação/cursor em listas de alto volume;
- payloads curados e limites definidos;
- ausência de query ampla sem necessidade;
- timeouts, retries e concorrência testados;
- bundles admin/professional/client possuem orçamento aprovado;
- warnings de chunk são corrigidos ou aceitos com justificativa mensurável;
- índices somente após query concreta e schema guard.

### C26-08 — UX, mobile, browsers e i18n

- validar 390px real ou em browser automatizado reproduzível;
- validar Safari iOS e Android Chrome;
- sem scroll horizontal, sobreposição ou texto cortado;
- loading inline, empty state acionável e erro controlado;
- uma ação primária por tela;
- pt-BR, en-US e es-419 completos;
- navegação por teclado, foco e contraste básicos.

### C26-09 — Migração final, rollback e runbooks

- migrations local/remoto sincronizadas;
- migrations finais são aditivas ou de hardening por padrão;
- `DROP`, remoção de alias, revogação ampla ou cutover destrutivo exigem:
  - prova de zero consumidores;
  - backup;
  - plano de rollback;
  - janela de execução;
  - aprovação explícita de Ismael;
- runbooks cobrem deploy, rollback, incidentes, filas, secrets e restauração.

### C26-10 — Go/No-Go e documentação final

- todo critério possui evidência vinculada;
- críticos e altos ficam zerados;
- warnings possuem owner, prazo e decisão;
- PRDs refletem o estado entregue, não a intenção;
- Ismael aprova o relatório final e a matriz de decisões.

---

## 4. Gaps de Entrada

| ID | Gap | Severidade inicial | Tratamento |
|---|---|---:|---|
| G26-01 | ausência de suíte de regressão integrada ao monorepo | crítico | PR 26.1 |
| G26-02 | evidências das fases anteriores estão dispersas | alto | PR 26.1 |
| G26-03 | aliases, menus e rotas sem teste executável completo | alto | PR 26.2 |
| G26-04 | não-duplicidade real do código/schema/deploy ainda não comprovada | crítico | PR 26.2/26.3 |
| G26-05 | PRD-CONSOLIDATION pode divergir do schema implantado | crítico | PR 26.3 |
| G26-06 | matriz completa de RLS/IDOR/roles ainda não executada ponta a ponta | crítico | PR 26.3 |
| G26-07 | fluxos públicos válidos/inválidos não formam suíte contínua | alto | PR 26.4 |
| G26-08 | filas, retries, idempotência e dry-run precisam prova transversal | alto | PR 26.4 |
| G26-09 | avisos de bundle e orçamento de performance não fechados | médio | PR 26.5 |
| G26-10 | QA físico/browser mobile permanece externo | alto | PR 26.6 |
| G26-11 | recursos legados descartados não possuem registro final único | médio | PR 26.7 |
| G26-12 | runbooks finais e gate formal de release ainda não existem | alto | PR 26.7/26.8 |

---

## 5. Matrizes Obrigatórias

Antes do primeiro PR corretivo, criar e aprovar:

1. **Matriz de capacidades:** capacidade → app → rota → permissão → contrato → estados → teste → decisão.
2. **Matriz de identidade:** ator → role → tenant → ações permitidas/negadas.
3. **Matriz pública:** rota → parâmetro → handler → payload permitido → rate limit → testes.
4. **Matriz assíncrona:** evento → produtor → fila → consumidor → idempotência → retry → estado terminal.
5. **Matriz de schema:** domínio → fonte de verdade → tabelas/RPCs/functions/policies → candidatos paralelos.
6. **Matriz de rotas:** rota canônica → aliases → menus → componente → teste direto/redirect.
7. **Matriz de performance:** jornada → orçamento → medição → resultado → decisão.
8. **Matriz de descarte:** recurso legado → decisão → justificativa → remoções necessárias → aprovação.

---

## 6. Gates Bloqueantes

### Gate 26.0 — Aprovação

- [x] C26-01 a C26-10 aprovados por Ismael;
- [x] matrizes e severidades aprovadas;
- [x] ambientes e evidências sintéticas definidos;
- [x] política para testes externos/reais registrada no runbook.

### Gate de schema

Nenhuma migration, policy, RPC, índice ou remoção é criada antes do `/squad-schema-guard`.

### Gate destrutivo

Nenhuma ação destrutiva ocorre por inferência documental. Exige aprovação específica de Ismael após evidência de zero consumidores e rollback testado.

### Gate de encerramento

A fase não fecha com:

- teste manual sem evidência;
- “não encontrado por busca” como única prova;
- warning sem decisão;
- dívida bloqueante transferida para fase futura;
- documentação afirmando algo não validado no remoto.

---

## 7. Decisões Necessárias de Ismael

1. Aprovar C26-01 a C26-10.
2. Aprovar que ações destrutivas exigem autorização separada.
3. Definir se envio WhatsApp real controlado fará parte do go-live ou permanecerá validação externa.
4. Definir dispositivos/browsers aceitos para o gate mobile.
5. Aprovar o orçamento inicial de performance ou autorizar que ele seja proposto no PR 26.0.

---

## 8. Parecer Inicial das Skills

### Squad Orquestrador

- Fase PRD: FASE 26 — Hardening, QA, Migração Final e Anti-Duplicidade
- Status: crítico e transversal
- Workspace recomendado: `.squad/phase-26-final-hardening/`
- Schema change: possível, sempre sujeito ao schema guard
- Risco de segurança: alto

### Squad QA

O encerramento exige BDD reproduzível, isolamento professionalA/professionalB/admin, dry-run, mobile 390px, estados de UI e evidência de erro controlado.

### Squad Schema Guard

Nenhuma consolidação histórica autoriza migration. O banco v2 real precisa ser inventariado antes de qualquer alteração, e todo cutover destrutivo precisa de rollback e aprovação explícita.
