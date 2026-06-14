# FASE 23 — Preflight Contratual

## Admin SaaS Core e Configurações da Plataforma

**Status:** concluído; contratos C23-01 a C23-08 aprovados por Ismael e executados  
**Data da auditoria:** 2026-06-14  
**Decision Owner:** Ismael  
**Aplicação principal:** `apps/admin`  
**Fonte de verdade:** PRD-MASTER, PRDs v2, migrations v2, RPCs v2 e frontend admin v2  
**Referência v1:** somente inventário de jornadas e recursos; nenhum contrato, function ou schema da v1 é padrão

---

## 1. Parecer de Preflight

A Fase 23 deve ampliar a fundação administrativa criada nas Fases 9, 11 e 17, sem criar dashboards, métricas ou ações paralelas.

O admin v2 já possui:

- `/dashboard` com `get_admin_dashboard_rpc`;
- `/profissionais` com `get_admin_professionals_rpc` e onboarding manual auditável;
- `/planos`, `/agentes` e `/melhorias` consumindo `get_admin_phase17_dashboard`;
- ações auditáveis para concessão `free_internal`, créditos de IA, prompts globais, pausa de agentes e status de melhorias;
- autenticação global por `admin_assert_master()` / `is_master_admin()`.

Os gaps centrais são:

- `/analytics`, `/profissionais/:id` e `/configuracoes` ainda não existem;
- `get_admin_phase17_dashboard` agrega domínios demais e retorna linhas completas via `to_jsonb`, o que precisa ser recortado antes de ampliar a UI;
- profissionais ainda não têm detalhe operacional, assinatura, wallet, status e filtros completos;
- planos ainda não têm decisão final de governança;
- configurações globais não possuem contrato v2 seguro;
- agentes globais não expõem versões, métricas, logs e rollback como fluxo completo;
- o dashboard ainda não apresenta alertas e resumo acionável completo.

**Gate geral:** nenhum PR funcional começa antes da aprovação explícita de Ismael para C23-01 a C23-08.

---

## 2. Decisões Recomendadas para Aprovação

### C23-01 — Identidade administrativa e auditoria

**Recomendação:** manter `master_admin` como único ator administrativo nesta fase.

- toda RPC administrativa começa com `admin_assert_master()`;
- toda mutação exige motivo quando afeta profissional, plano, agente ou configuração;
- toda mutação gera `log_audit_event`;
- nenhuma autorização depende apenas de esconder botão na UI;
- múltiplos níveis de admin ficam fora do escopo até existir requisito aprovado.

### C23-02 — Fonte única de métricas

**Recomendação:** manter `platform_metrics_daily` e `get_admin_dashboard_rpc` como fontes canônicas.

- `/dashboard` mostra resumo acionável e alertas;
- `/analytics` usa a mesma fonte histórica e contratos derivados, sem recalcular MRR, churn ou saúde em queries paralelas;
- cada métrica deve ter definição, período, unidade, fonte e owner registrados;
- `get_admin_phase17_dashboard` não será usado como contrato genérico para analytics;
- qualquer nova métrica exige lacuna documentada e schema guard.

### C23-03 — Profissionais e suporte administrativo

**Recomendação:** `/profissionais` é a única entrada para busca, detalhe, onboarding e ações administrativas.

- `/profissionais/:id` usa payload curado e nunca expõe credenciais, tokens, dados clínicos ou settings completos;
- ações existentes de onboarding, `free_internal` e créditos são reutilizadas;
- suspensão, reativação, ajuste de plano e revogação de acesso exigem RPC específica, motivo e auditoria;
- impersonação não será implementada nesta fase sem contrato separado de sessão read-only, expiração e auditoria;
- nenhum wizard administrativo paralelo de onboarding será criado.

### C23-04 — Governança de planos

**Recomendação:** catálogo de planos controlado por migration/RPC especializada, sem CRUD genérico direto.

- `/planos` consulta planos, features, assinaturas e créditos por payload curado;
- alterações de preço, limites, features e publicação só podem ocorrer por contrato especializado e auditável;
- sincronização com Stripe é gate obrigatório antes de permitir alteração que afete billing externo;
- calculadora financeira pode ser UI derivada e read-only; não persiste projeções;
- ausência de contrato Stripe aprovado mantém alterações de preço bloqueadas.

### C23-05 — Configurações globais e segredos

**Recomendação:** criar contrato v2 somente após schema guard.

- `/configuracoes` administra apenas chaves globais allowlisted;
- segredos ficam no Supabase Vault ou provedor equivalente, nunca em payload de leitura;
- UI recebe somente estado sanitizado, como `configured`, `last_checked_at` e status;
- credenciais nunca retornam em claro depois de gravadas;
- troca de senha usa o fluxo de auth, não uma tabela de configuração;
- nenhuma escrita direta em `settings_entries`, `platform_settings` ou tabelas sensíveis.

### C23-06 — Agentes globais

**Recomendação:** `agent_registry`, `agent_prompt_versions`, `agent_pause_windows` e logs v2 são canônicos.

- `/agentes` admin controla somente configuração global;
- promover versão existente é o mecanismo de rollback;
- métricas e logs usam payload curado e paginado;
- nenhuma ação global altera `professional_agents` de um tenant;
- ativação, pausa, promoção e rollback exigem motivo e auditoria.

### C23-07 — Melhorias

**Recomendação:** `feature_requests`, votos e comentários formam o workflow canônico.

- `/melhorias` amplia o fluxo existente com filtros, detalhe e histórico;
- não será criado changelog estático paralelo;
- mudanças de status usam a RPC auditável existente ou uma extensão compatível;
- dados de profissionais no payload permanecem mínimos.

### C23-08 — Rotas e ownership

**Recomendação:** usar exclusivamente as rotas canônicas do PRD.

| Rota | Owner | Responsabilidade |
|---|---|---|
| `/dashboard` | Dashboard admin | resumo acionável e alertas |
| `/analytics` | Analytics da plataforma | métricas históricas e detalhadas |
| `/profissionais` | Lista de profissionais | busca, filtros e ações em lote permitidas |
| `/profissionais/:id` | Perfil administrativo | detalhe curado e ações auditáveis |
| `/planos` | Planos e billing | catálogo, assinaturas, créditos e governança |
| `/agentes` | Agentes globais | versões, pausa, métricas, logs e rollback |
| `/melhorias` | Feature requests | workflow e histórico |
| `/configuracoes` | Configuração global | integrações, estado, segurança e allowlist |

`/leads`, `/broadcast` e `/embaixadores` pertencem à Fase 24. `/nexus` permanece na fundação da Fase 17.

---

## 3. Inventário de Contratos v2

| Domínio | Contrato existente | Estado para Fase 23 |
|---|---|---|
| Identidade admin | `admin_assert_master()`, `is_master_admin()` | reutilizar e testar negativamente |
| Dashboard | `platform_metrics_daily`, `professional_platform_health_scores`, `get_admin_dashboard_rpc()` | ampliar sem fonte paralela |
| Profissionais | `get_admin_professionals_rpc()` | estender filtros; criar detalhe curado se necessário |
| Onboarding manual | `admin_complete_professional_onboarding()` | reutilizar |
| Planos e billing | `platform_plans`, `professional_subscriptions`, `professional_access_states` | reutilizar; governança pendente |
| Créditos de IA | `ai_credit_wallets`, `ai_credit_transactions`, `admin_add_ai_credits()` | reutilizar; leitura curada pendente |
| Concessão interna | `admin_grant_free_internal()` | reutilizar |
| Agentes globais | `agent_registry`, `agent_prompt_versions`, `agent_pause_windows` e RPCs admin | reutilizar e completar leitura |
| Melhorias | `feature_requests`, votos, comentários e `admin_update_feature_request_status()` | reutilizar e completar workflow |
| Dashboard Fase 17 | `get_admin_phase17_dashboard()` | dividir/recortar; não ampliar como payload monolítico |
| Configuração global | sem contrato v2 confirmado | bloqueado por schema guard |

---

## 4. Gaps Bloqueantes

| ID | Gap | Risco | Owner planejado | Bloqueia |
|---|---|---|---|---|
| G23-01 | contratos C23-01 a C23-08 sem aprovação final | implementação com decisões implícitas | PR 23.0 | todos os PRs funcionais |
| G23-02 | `get_admin_phase17_dashboard()` retorna domínios e linhas completas | payload excessivo e acoplamento | PR 23.1 | planos, agentes e melhorias |
| G23-03 | não existe contrato histórico dedicado para `/analytics` | métricas paralelas ou divergentes | PR 23.1 | PR 23.2 |
| G23-04 | `/profissionais/:id` não possui payload curado | exposição de PII, settings ou credenciais | PR 23.1 | PR 23.3 |
| G23-05 | suspensão, reativação e ajuste manual de plano não têm contrato confirmado | ação improvisada e não auditada | PR 23.1 | PR 23.3 / 23.4 |
| G23-06 | governança de planos não está decidida | conflito entre DB, UI e Stripe | PR 23.0 | PR 23.4 |
| G23-07 | configurações globais não têm contrato v2 seguro | vazamento de segredos | PR 23.1 / schema guard | PR 23.7 |
| G23-08 | agentes globais não têm leitura detalhada curada | logs e prompts excessivos ou incompletos | PR 23.1 | PR 23.5 |
| G23-09 | métricas v1 ainda não têm matriz de consolidação | gaps ou duplicidade de métricas | PR 23.0 | encerramento |
| G23-10 | rotas `/analytics` e `/configuracoes` não existem | experiência admin incompleta | PR 23.2 / 23.7 | encerramento |

---

## 5. Matriz de Métricas Obrigatória

Antes do PR 23.2, cada linha precisa ser classificada como **existente**, **extensão do contrato canônico** ou **deferida com motivo**.

| Grupo | Métricas mínimas | Fonte canônica esperada |
|---|---|---|
| Receita | MRR, crescimento mensal, receita por plano | `platform_metrics_daily` + billing v2 |
| Churn | churn mensal, profissionais perdidos, risco | métricas diárias + health scores |
| Profissionais | ativos, trial, novos, distribuição por plano | métricas diárias + contrato admin |
| Conversão | trial para pago | billing/subscription events v2 |
| Saúde | distribuição e alertas críticos | `professional_platform_health_scores` |
| IA | uso, créditos e custo disponível no v2 | contratos de crédito/uso v2 |
| Operação | WhatsApp offline, créditos zerados, onboarding pendente | contrato admin curado |

Métricas de Nerissa, motor orgânico ou margem de IA sem fonte v2 confiável devem ser deferidas; não serão simuladas.

---

## 6. Matriz de Ações Administrativas

| Ação | Contrato atual | Decisão/Gate |
|---|---|---|
| Completar onboarding | existente e auditável | reutilizar em `/profissionais/:id` |
| Conceder `free_internal` | existente e auditável | reutilizar com confirmação e motivo |
| Adicionar créditos | existente e auditável | reutilizar com confirmação e motivo |
| Suspender/reativar acesso | lacuna | RPC específica antes da UI |
| Ajustar plano | parcial | contrato específico; nunca update direto |
| Alterar preço/feature de plano | lacuna/decisão | bloqueado por C23-04 e Stripe |
| Criar/promover prompt global | existente | reutilizar com histórico e confirmação |
| Pausar/reativar agente global | parcial | reutilizar/estender com auditoria |
| Alterar status de melhoria | existente | reutilizar |
| Alterar configuração global | lacuna | allowlist + schema guard + segredo protegido |
| Impersonar profissional | não aprovado | fora do escopo até contrato read-only formal |

---

## 7. Segurança e Privacidade

- admin nunca recebe dados clínicos de clientes;
- payloads administrativos são curados, paginados e mínimos;
- nenhum token Evolution, segredo Stripe, segredo de webhook ou settings completo é retornado;
- nenhuma ação sensível usa acesso direto a tabela;
- RPCs usam `SECURITY DEFINER`, `SET search_path = ''`, `REVOKE ALL` e `GRANT` específico;
- ações com impacto em tenant exigem alvo, motivo, ator e evento de auditoria;
- testes negativos incluem usuário autenticado não-admin, tenant externo e IDs inexistentes;
- ações destrutivas ou irreversíveis ficam fora da fase sem confirmação reforçada.

---

## 8. Gates Antes do PR 23.1

- [x] Ismael aprovou C23-01 a C23-08;
- [x] decisão de governança de planos C23-04 registrada;
- [x] matriz de métricas v1 → v2 classificada;
- [x] payload de `get_admin_phase17_dashboard()` auditado campo a campo;
- [x] lista de ações administrativas e seus contratos confirmada;
- [x] configurações globais passaram por schema guard;
- [x] contratos admin possuem `admin_assert_master`, `REVOKE ALL` e grants específicos; teste runtime não-admin permanece no QA de ambiente;
- [x] nenhuma tarefa funcional depende de function ou schema da v1.

---

## 9. Resultado do PR 23.0

O preflight foi aprovado por Ismael e executado. Os contratos curados e o fix runtime de agentes foram aplicados no ambiente remoto pelas migrations `20260614100000`, `20260614101000` e `20260614102000`.
