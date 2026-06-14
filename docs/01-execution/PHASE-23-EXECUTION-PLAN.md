# FASE 23 — Plano de Execução

## Admin SaaS Core e Configurações da Plataforma

**Status:** concluída; implementação e migrations aplicadas, com QA runtime externo registrado  
**Decision Owner:** Ismael  
**Aplicação principal:** `apps/admin`  
**Fonte contratual:** banco v2, migrations v2, RPCs v2 e frontend admin v2  
**Estimativa:** 3 a 4 semanas após aprovação do preflight  
**Preflight de referência:** `docs/01-execution/PHASE-23-PREFLIGHT.md`

---

## 1. Objetivo

Completar o núcleo operacional do admin v2 para que Ismael consiga acompanhar o SaaS, operar profissionais, planos, agentes globais, melhorias e configurações da plataforma sem acesso direto improvisado, sem duplicar métricas e sem expor segredos ou dados clínicos.

A fase deve entregar:

- `/dashboard` como único resumo executivo acionável;
- `/analytics` como detalhe histórico que reutiliza a mesma fonte contratual;
- `/profissionais` e `/profissionais/:id` com busca, filtros, detalhe e ações auditáveis;
- `/planos` com governança explícita, assinaturas e créditos;
- `/agentes` global com versões, métricas, logs, pausa e rollback;
- `/melhorias` com workflow e histórico consolidados;
- `/configuracoes` com integrações e estado sanitizado;
- contratos admin curados, seguros, paginados e auditáveis.

---

## 2. Condição de Entrada

- [x] Fase 22 concluída documentalmente;
- [x] fundações admin das Fases 9, 11 e 17 existem;
- [x] rotas atuais e contratos v2 foram inventariados;
- [x] gaps da v1 foram usados somente como inventário de recursos;
- [x] C23-01 a C23-08 aprovados por Ismael;
- [x] matriz de métricas v1 → v2 classificada;
- [x] governança de planos aprovada;
- [x] contrato de configurações globais aprovado pelo schema guard;
- [x] contratos aplicados no ambiente alvo; teste runtime não-admin registrado como QA externo.

**Gate:** nenhuma implementação funcional começa enquanto qualquer decisão acima estiver aberta.

---

## 3. Princípios de Execução

1. `get_admin_dashboard_rpc()` e `platform_metrics_daily` são a base única de métricas.
2. `/analytics` detalha; não recalcula nem cria segunda fonte.
3. `get_admin_phase17_dashboard()` deve ser recortado em contratos por domínio antes de crescer.
4. Toda mutação admin usa RPC/Edge Function específica e auditável.
5. Nenhum payload administrativo expõe segredo, settings completo ou dado clínico.
6. Configuração global usa allowlist; segredos ficam fora do payload de leitura.
7. Planos não terão CRUD genérico direto.
8. Agentes globais nunca alteram `professional_agents` sem ação explícita futura e aprovada.
9. Onboarding administrativo permanece dentro de `/profissionais`.
10. Funcionalidades da Fase 24 não serão antecipadas.

---

## 4. Contratos Obrigatórios

### C23-01 — Autorização e auditoria admin

- `admin_assert_master()` em toda RPC administrativa;
- teste negativo para autenticado não-admin;
- motivo obrigatório em mutações sensíveis;
- auditoria com ator, alvo, ação e motivo;
- `REVOKE ALL` e `GRANT EXECUTE` específico.

### C23-02 — Dashboard e analytics

- dashboard e analytics usam uma definição única por métrica;
- histórico vem de `platform_metrics_daily` ou extensão aprovada;
- alertas usam contrato curado, sem consultas diretas paralelas no frontend;
- intervalos, timezone e período de comparação são explícitos.

### C23-03 — Profissionais

- lista paginada com busca e filtros;
- detalhe curado por `professional_id`;
- assinatura, acesso, wallet, saúde, onboarding e estado operacional;
- ações de suspensão, reativação, plano, onboarding e créditos por RPC;
- sem dados clínicos, tokens ou settings completos.

### C23-04 — Planos, assinaturas e créditos

- catálogo e features vêm de contratos v2;
- assinaturas e créditos são payloads paginados/curados;
- mudanças de billing externo exigem sincronização aprovada;
- calculadora financeira é derivada e não persiste projeções;
- nenhuma alteração direta de tabela.

### C23-05 — Agentes globais

- inventário, versões, versão ativa, pausas, métricas e logs;
- criar versão em staging, promover e reverter com confirmação;
- toda ação auditável;
- nenhum acesso implícito a configuração de tenant.

### C23-06 — Melhorias

- workflow único baseado em `feature_requests`;
- filtros, detalhe, votos, comentários e histórico;
- alteração de status auditável;
- sem changelog paralelo.

### C23-07 — Configurações globais

- contrato aprovado pelo schema guard;
- allowlist por chave e tipo;
- estado sanitizado para integrações;
- segredos gravados sem retorno em claro;
- health check separado da credencial;
- escrita direta proibida.

### C23-08 — Rotas, UX e estados

- rotas canônicas registradas no admin router;
- loading, empty, error, unauthorized e success state;
- experiência responsiva validada em 390px;
- i18n completo em pt-BR, en-US e es-419;
- ações perigosas exigem confirmação e motivo.

---

## 5. Ownership de Rotas e Contratos

| Rota | Responsabilidade | Contrato principal |
|---|---|---|
| `/dashboard` | resumo e alertas acionáveis | C23-02 |
| `/analytics` | histórico e detalhamento | C23-02 |
| `/profissionais` | busca, filtros e lista | C23-03 |
| `/profissionais/:id` | perfil e ações auditáveis | C23-03 / C23-04 |
| `/planos` | planos, assinaturas, créditos e calculadora | C23-04 |
| `/agentes` | agentes globais | C23-05 |
| `/melhorias` | workflow de feature requests | C23-06 |
| `/configuracoes` | configuração global segura | C23-07 |

---

## 6. Sequência de Execução

### PR 23.0 — Preflight documental e decisões

- [x] inventariar telas, rotas, RPCs e migrations admin v2;
- [x] registrar C23-01 a C23-08;
- [x] registrar gaps G23-01 a G23-10;
- [x] propor governança de planos controlada por migration/RPC;
- [x] separar escopo da Fase 23 da Fase 24;
- [x] obter aprovação explícita de Ismael;
- [x] classificar matriz de métricas v1 → v2;
- [x] registrar decisões finais no preflight.

**Gate:** PR 23.1 só começa com contratos e decisões aprovados.

### PR 23.1 — Contratos curados e hardening

- auditar `get_admin_dashboard_rpc()`, `get_admin_professionals_rpc()` e `get_admin_phase17_dashboard()`;
- substituir o payload monolítico da Fase 17 por contratos de leitura por domínio, quando necessário;
- criar ou estender contratos de analytics histórico, detalhe profissional, planos, agentes, melhorias e configurações;
- garantir paginação, filtros, payload mínimo e nomes estáveis;
- criar contratos de suspensão/reativação/ajuste de plano somente se aprovados;
- aplicar autorização, auditoria, grants e testes negativos;
- executar schema guard para qualquer migration.

**Gate:** nenhuma página nova consome tabela sensível diretamente ou depende do payload monolítico sem revisão.

### PR 23.2 — Dashboard e `/analytics`

- ampliar `/dashboard` com MRR, crescimento, churn, profissionais, saúde e alertas acionáveis;
- manter o dashboard resumido, sem transformar a rota em painel detalhado;
- criar `/analytics` com histórico e breakdowns aprovados;
- reutilizar contratos e definições de C23-02;
- exibir origem/período das métricas e estados sem dados;
- não implementar métricas sem fonte v2 confiável.

**Gate:** dashboard e analytics apresentam os mesmos valores para a mesma métrica e período.

### PR 23.3 — Profissionais e perfil administrativo

- completar busca, filtros e paginação em `/profissionais`;
- criar `/profissionais/:id`;
- exibir perfil, saúde, onboarding, assinatura, acesso, wallet e estado operacional por payload curado;
- reutilizar onboarding, `free_internal` e créditos existentes;
- implementar somente ações com RPC auditável aprovada;
- incluir confirmação, motivo, loading, erro e invalidação de cache;
- manter onboarding administrativo dentro deste domínio.

**Gate:** Ismael opera profissional sem acesso direto à tabela e sem receber dados clínicos ou segredos.

### PR 23.4 — Planos, assinaturas e créditos

- aplicar a decisão final de governança de planos;
- exibir catálogo, features, publicação, assinaturas e créditos;
- implementar calculadora financeira read-only, se aprovada;
- permitir mutações somente por contratos especializados;
- bloquear alteração de preço sem sincronização Stripe aprovada;
- registrar auditoria e confirmação de todas as ações.

**Gate:** nenhuma divergência pode ser criada entre plano interno, assinatura, acesso e billing externo.

### PR 23.5 — Agentes globais

- completar inventário e detalhe de agentes globais;
- exibir versão ativa, histórico de versões, pausas, métricas e logs;
- reutilizar staging, promoção e pausa existentes;
- tratar promoção de versão anterior como rollback;
- exigir confirmação, motivo e auditoria;
- provar que nenhuma ação altera `professional_agents`.

**Gate:** configuração global e configuração profissional permanecem domínios separados.

### PR 23.6 — Melhorias

- completar filtros, detalhe, votos, comentários e histórico;
- reutilizar `feature_requests` como workflow único;
- consolidar mudança de status e motivo;
- remover dependência do payload genérico da Fase 17;
- manter histórico auditável sem changelog paralelo.

**Gate:** existe uma única fonte de verdade para solicitação e evolução de melhorias.

### PR 23.7 — Configurações globais

- criar `/configuracoes`;
- implementar somente grupos aprovados pelo schema guard;
- mostrar integrações, status, última verificação e segurança por payload sanitizado;
- gravar segredos sem retorno em claro;
- usar fluxo de auth para troca de senha;
- incluir confirmações e auditoria;
- documentar qualquer integração deferida.

**Gate:** nenhuma credencial ou segredo é legível pelo frontend, banco direto ou logs.

### PR 23.8 — QA, segurança e encerramento

- executar typecheck, lint, build e `git diff --check`;
- executar `supabase db lint` e testes negativos de autorização;
- validar payloads contra vazamento de segredos e dados clínicos;
- validar consistência dashboard ↔ analytics;
- validar ações administrativas e audit logs;
- validar loading, empty, error, unauthorized e confirmações;
- validar rotas em 390px e desktop;
- validar i18n pt-BR, en-US e es-419;
- sincronizar PRD-MASTER, PRD-FRONTEND e PRD-SCHEMA;
- registrar dívidas remanescentes sem marcar como concluídas.

**Gate:** a fase só fecha quando todos os critérios de encerramento estiverem comprovados.

---

## 7. Ordem de Prioridade dos Contratos

1. autorização e payload mínimo;
2. fonte única de métricas;
3. detalhe e ações de profissionais;
4. planos, assinaturas e créditos;
5. configurações globais e proteção de segredos;
6. agentes globais;
7. melhorias.

Essa ordem evita construir UI sobre contratos excessivos ou ainda não aprovados.

---

## 8. Testes Obrigatórios

### Segurança

- usuário não-admin não executa nenhuma RPC admin;
- admin não recebe token Evolution, segredo Stripe, credencial de webhook ou settings completo;
- admin não recebe dados clínicos;
- ação com `professional_id` inexistente não altera dados;
- toda mutação sensível gera audit log;
- escrita direta em configuração sensível permanece bloqueada.

### Métricas

- mesma métrica e período têm valor idêntico em dashboard e analytics;
- ausência de snapshot produz estado controlado;
- intervalos inválidos são rejeitados;
- métricas deferidas não aparecem como zero enganoso.

### Operação

- filtros e paginação preservam estado;
- ações de profissional invalidam somente caches relacionados;
- rollback de prompt usa versão existente;
- plano sem sincronização externa não permite alteração perigosa;
- configuração com segredo nunca reexibe o valor.

### Frontend

- rotas canônicas navegam sem implementação paralela;
- loading, empty, error e unauthorized são visíveis;
- textos existem nos três idiomas;
- telas são utilizáveis em 390px sem sobreposição.

---

## 9. Riscos e Mitigações

| Risco | Mitigação |
|---|---|
| métricas divergentes entre rotas | fonte única e matriz de definição |
| payload admin excessivo | contratos curados e paginados |
| vazamento de credenciais | Vault, estado sanitizado e testes negativos |
| alteração inconsistente de plano | RPC especializada e gate Stripe |
| ação admin não auditada | motivo + `log_audit_event` obrigatório |
| conflito admin/professional em agentes | contratos e rotas separados |
| antecipação de Fase 24 | ownership de rotas congelado |
| UI construída antes do contrato | PR 23.1 bloqueante |

---

## 10. Critérios de Encerramento

- [x] C23-01 a C23-08 aprovados e implementados;
- [x] `/dashboard` é a única visão principal e usa fonte contratual única;
- [x] `/analytics` reutiliza as mesmas definições sem consultas paralelas;
- [x] métricas v1 foram portadas, consolidadas ou deferidas com decisão registrada;
- [x] `/profissionais` e `/profissionais/:id` operam por contratos auditáveis;
- [x] onboarding manual permanece dentro de `/profissionais`;
- [x] planos, assinaturas e créditos possuem governança final e contratos auditáveis;
- [x] configurações globais possuem contrato seguro e não expõem segredos;
- [x] agentes globais não alteram configuração profissional de tenant;
- [x] melhorias usam workflow único;
- [x] nenhuma ação sensível depende de acesso direto improvisado;
- [x] typecheck, lint, build, migration push e diff-check passam; `db lint --linked` concluiu sem erros de nível `error`;
- [x] layout responsivo, estados de UI e i18n pt-BR/en-US/es-419 foram implementados; QA físico permanece externo;
- [x] PRDs foram sincronizados.

---

## 11. Fora do Escopo

- `/broadcast`, `/embaixadores`, `/afiliados`, `/campanhas`, `/notificacoes` e `/leads` funcionais, pertencentes à Fase 24;
- dados, functions e schema da v1;
- impersonação sem contrato read-only aprovado;
- deleção de profissional;
- múltiplos níveis de admin;
- CRUD genérico de planos;
- métricas sem fonte v2 confiável;
- exposição ou edição direta de segredos.

---

## 12. Resultado Esperado

Quando a Fase 23 terminar, Ismael terá um admin v2 seguro e operacional para acompanhar o SaaS e executar ações administrativas essenciais. Métricas, profissionais, planos, agentes, melhorias e configurações terão owners claros, contratos v2 auditáveis e nenhuma implementação paralela.

---

## 13. Encerramento — Resultado Entregue

- migrations `20260614100000_phase23_admin_saas_core.sql`, `20260614101000_phase23_admin_contract_fixes.sql` e `20260614102000_phase23_fix_admin_agents_runtime.sql` aplicadas no remoto;
- contratos curados por domínio substituem o uso da UI do payload monolítico da Fase 17;
- `/analytics`, `/profissionais/:id` e `/configuracoes` adicionadas;
- dashboard ampliado com alertas e profissionais recentes;
- planos definidos como `migration_rpc_controlled`, sem CRUD genérico;
- agentes globais possuem staging, promoção, rollback auditável, pausa e métricas;
- configurações globais expõem apenas status sanitizado, sem segredos;
- `platform_admin_audit_log` registra ações globais imutáveis;
- typecheck, lint, build e diff-check passaram;
- `phase23_get_admin_agents()` usa o timestamp canônico `agent_executions.started_at`, removendo a falha runtime de `/agentes`;
- auditoria de staging de prompt aponta para o `agent_prompt_version` criado;
- `supabase migration list --linked` confirma alinhamento local/remoto;
- `supabase db lint --linked --level warning` concluiu sem erros de nível `error`; restam warnings preexistentes nas Fases 17, 19 e 21.
