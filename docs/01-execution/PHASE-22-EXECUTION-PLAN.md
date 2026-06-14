# FASE 22 — Plano de Execução

## Agentes IA Profissional e Operação da Rosane

**Status:** concluída — PR 22.0 a 22.5 entregues, validados (typecheck/lint/build/diff-check) e registrados  
**Decision Owner:** Ismael  
**Aplicação principal:** `apps/professional`  
**Fonte contratual:** banco v2, migrations v2, RPCs v2 e frontend profissional v2  
**Estimativa:** 3 a 4 semanas, após os gates de preflight e validação de ambiente  
**Preflight de referência:** `docs/01-execution/PHASE-22-PREFLIGHT.md`

---

## 1. Objetivo

Consolidar a configuração profissional da Rosane em uma rota canônica, sem alterar o prompt global da plataforma, sem duplicar configuração em `/configuracoes/assistente` e sem misturar operação inline de conversa com tela de setup.

A fase deve entregar:

- `/agentes` como única fonte de configuração profissional da Rosane;
- chat de teste com contexto real, sem envio externo automático;
- aprovação, edição e rejeição de shadow suggestions;
- logs e métricas operacionais visíveis ao profissional;
- decisão formal sobre `personas` e `rlhf_rules` antes de qualquer schema novo;
- realocação de regras operacionais da clínica para `/configuracoes/agenda`.

---

## 2. Condição de Entrada

A Fase 21 está concluída e a fronteira de Rosane já está descrita no PRD. Porém, a implementação atual ainda mistura configuração profissional com regras operacionais e roteia `/agentes` para a tela legada.

Antes do PR 22.1:

- [x] `personas` e `rlhf_rules` permanecem como decisão de produto, sem schema novo;
- [x] `/configuracoes/assistente` continua apenas como redirect de compatibilidade;
- [x] os campos operacionais `cancel_window_hours`, `reschedule_window_hours` e `relationship_checkins_*` têm destino explícito em `/configuracoes/agenda`;
- [x] shadow suggestions existentes permanecem reutilizáveis com auditoria;
- [x] `professional_agents`, `shadow_suggestions`, `agent_executions` e `message_events` estão confirmados como contratos canônicos de reutilização;
- [x] nenhum PR funcional cria uma segunda fonte de configuração profissional.

**Gate:** nenhuma implementação da Fase 22 começa sem a decisão formal da fronteira entre Rosane e regras operacionais da clínica.

---

## 3. Estado Atual Confirmado

### Frontend

- `routes.ts` já possui ` /configuracoes/assistente ` como redirect para ` /agentes `;
- `routes.ts` ainda faz ` /agentes ` renderizar `ConfiguracoesPage`;
- `useAssistantSettings.ts` mistura leitura/escrita da Rosane com regras operacionais da clínica;
- `ConversasPage.tsx` concentra operação inline, takeover e aprovação de shadow suggestion, como deveria;
- não existe página própria de ` /agentes ` ainda.

### Configuração da Rosane

- `professional_agents` existe e guarda nome, shadow mode, auto respond, agentes ativos e configs anexos;
- `shadow_suggestions` existe e possui auditoria na fundação da Fase 5;
- `agent_executions` e `message_events` já suportam observabilidade e histórico de execução;
- a UI atual não expõe isso como uma experiência canônica.

### Regras operacionais da clínica

- `professionals.settings.appointment_rules` já existe;
- cancelamento, reagendamento e check-ins não devem continuar acoplados à tela da Rosane;
- a fronteira correta desta fase é mover a responsabilidade para `/configuracoes/agenda`.

### Decisão de produto pendente

- `personas` e `rlhf_rules` da v1 continuam sem migração;
- a Fase 22 não cria schema novo para isso sem aprovação explícita de Ismael;
- se a decisão for reaproveitar, o contrato precisa aparecer no preflight antes da implementação.

---

## 4. Decisões e Contratos Obrigatórios

### C22-01 — Owner único da Rosane profissional

- `/agentes` é a única tela profissional de configuração da Rosane;
- `/configuracoes/assistente` não terá estado próprio nem persistência própria;
- `/conversas` continua apenas com operação inline, takeover e shadow actions;
- nenhuma configuração da Rosane pode permanecer duplicada entre rota, hook ou estado local.

**Gate:** nenhuma tela paralela pode continuar sendo owner de `professional_agents`.

### C22-02 — Configuração da Rosane

Reutilizar exclusivamente:

- `professional_agents`;
- `shadow_suggestions`;
- `agent_executions`;
- `message_events`;
- contratos de conversa já existentes.

O contrato deve confirmar:

- tom, persona operacional, canais, horários, regras, shadow mode e agentes ativos;
- chat de teste com contexto real;
- aprovação/edição/rejeição de sugestões;
- logs e métricas operacionais;
- isolamento de tenant e auditoria em todas as ações sensíveis;
- nenhuma dependência de prompt global ou schema admin.

### C22-03 — Fronteira operacional da clínica

- `cancel_window_hours`, `reschedule_window_hours` e `relationship_checkins_*` saem da configuração da Rosane;
- esses campos passam a ser tratados como regra operacional da clínica em `/configuracoes/agenda`;
- a Fase 22 não deve reintroduzir esse grupo de campos em `/agentes`;
- `useAssistantSettings` deve ser reduzido até que essa fronteira deixe de estar misturada.

### C22-04 — Personas e RLHF

- `personas`, `rlhf_rules` e quaisquer diffs da v1 continuam sem schema novo;
- o destino desses artefatos precisa de decisão explícita antes de qualquer migration;
- se a decisão for migrar, isso precisa entrar como tarefa contratual aprovada por Ismael;
- sem essa decisão, a Fase 22 não cria tabela, RPC ou UI para esses itens.

### C22-05 — Permissões, LGPD e auditoria

- configuração da Rosane é gestor-only no banco/RPC;
- shadow suggestions e teste de chat têm auditoria obrigatória;
- dados sensíveis não entram em logs, snapshots ou payloads além do necessário;
- consultas validam tenant e impedem IDOR;
- a UI nunca substitui autorização no banco.

---

## 5. Matriz de Permissões

| Ação | Operacional | Gestor |
|---|---:|---:|
| Consultar a tela `/agentes` | Não | Sim |
| Alterar tom, canal, shadow mode e agentes ativos | Não | Sim |
| Executar chat de teste | Não | Sim |
| Aprovar, editar ou rejeitar shadow suggestion | Não | Sim |
| Consultar logs e métricas da Rosane | Não | Sim |
| Alterar regras operacionais da clínica em `/configuracoes/agenda` | Não | Sim |
| Ver a operação inline em `/conversas` | Sim | Sim |
| Tomar takeover manual em conversa | Sim | Sim |
| Alterar prompt global da plataforma | Não | Não |

Todos os bloqueios devem existir no banco/RPC. A UI é defesa adicional.

---

## 6. Inventário Planejado de Ownership

| Área | Rota | Owner de UI | Contrato principal |
|---|---|---|---|
| Configuração Rosane | `/agentes` | página própria | C22-01 / C22-02 |
| Compatibilidade | `/configuracoes/assistente` | redirect | compatibilidade |
| Operação inline | `/conversas` | `ConversasPage` | takeover e shadow actions |
| Agenda da clínica | `/configuracoes/agenda` | página própria | C22-03 |

---

## 7. Sequência de Execução

### PR 22.0 — Preflight documental

- [x] registrar a decisão sobre `personas` e `rlhf_rules`;
- [x] registrar a realocação de `cancel_window_hours`, `reschedule_window_hours` e `relationship_checkins_*` para `/configuracoes/agenda`;
- [x] inventariar `professional_agents`, `shadow_suggestions`, `agent_executions` e `message_events`;
- [x] confirmar que `/configuracoes/assistente` já é redirect e não precisa de segundo owner;
- [x] classificar cada lacuna como front, contrato reutilizável ou decisão de produto;
- [x] congelar matriz de permissões e ownership;
- [x] registrar os gaps G22-01 a G22-06 em `PHASE-22-PREFLIGHT.md`.

**Gate:** preflight documental concluído; PR 22.1 continua bloqueado até a fronteira de `/agentes` ser formalizada.

### PR 22.1 — Estrutura da Rosane profissional

- criar a página própria de `/agentes`;
- mover a experiência canônica de configuração para essa rota;
- manter `/configuracoes/assistente` apenas como redirect;
- retirar do hub e da tela legada qualquer configuração duplicada;
- preservar operação inline em `/conversas`.

**Gate:** existe um único owner de configuração profissional e nenhum fluxo paralelo em `/configuracoes/assistente`.

### PR 22.2 — Configuração da Rosane

- expor tom, persona operacional, canais, horários, regras, shadow mode e agentes ativos;
- renderizar grid de agentes;
- criar drawers ou painéis por agente;
- expor o log de shadow suggestions com auditoria;
- aplicar gates de role no banco e na UI.

**Gate:** alterar a Rosane não altera regra operacional da clínica nem prompt global.

### PR 22.3 — Chat de teste e observabilidade

- entregar chat de teste com contexto real;
- impedir envio externo automático sem confirmação;
- mostrar logs e métricas operacionais;
- manter tenant isolation nas consultas;
- preservar a capacidade de aprovar/editar/rejeitar sugestões.

**Gate:** a experiência canônica de operação da Rosane está visível e auditável.

### PR 22.4 — Contratos e hardening

- revisar contracts de `professional_agents`, `shadow_suggestions`, `agent_executions` e `message_events`;
- confirmar ausência de dependência em prompt global;
- reforçar auditoria, RLS e validação de tenant;
- garantir que `personas` / `rlhf_rules` não entram por schema não aprovado;
- consolidar a fronteira com `/configuracoes/agenda`.

**Gate:** não existe segunda fonte de verdade para configuração da Rosane ou para regras operacionais da clínica.

### PR 22.5 — QA e encerramento

- executar typecheck, lint, build e `git diff --check`;
- revisar loading, empty, error e redirect states;
- validar `/agentes`, `/conversas` e `/configuracoes/assistente`;
- sincronizar PRD-MASTER, PRD-FRONTEND e PRD-SCHEMA se algum ajuste tiver sido necessário;
- registrar dívidas remanescentes sem misturar escopo.

**Gate:** a fase só fecha quando a Rosane profissional estiver separada da configuração operacional da clínica.

---

## 8. Critérios de Encerramento

- [x] `/agentes` é a única fonte profissional de configuração da Rosane;
- [x] `/configuracoes/assistente` é só redirect;
- [x] `/conversas` continua operacional, sem formulário paralelo;
- [x] `cancel_window_hours`, `reschedule_window_hours` e `relationship_checkins_*` têm destino explícito em `/configuracoes/agenda`;
- [x] shadow suggestions e chat de teste estão expostos com auditoria;
- [x] `personas` / `rlhf_rules` não viraram schema novo sem decisão aprovada;
- [x] typecheck, lint, build e diff-check passam.

---

## 9. Resultado Esperado

Quando a Fase 22 terminar, o profissional controla a Rosane em uma única tela canônica, sem misturar configuração com operação e sem duplicar regras que pertencem à agenda da clínica.

---

## 10. Encerramento — Resultado Entregue

- `/agentes` (`AgentesPage.tsx`) concentra identidade/tom da Rosane, status do WhatsApp, grid de 9 agentes (`indicacao`, `reativacao`, `upsell`, `aniversariantes`, `campaign-dispatcher`, `calculate-rfm`, `calculate-client-health-scores`, `lead-followup-agent`, `relationship-agent`) com drawer de configuração por agente, fila de shadow suggestions (aprovar/editar/rejeitar) e chat de teste com contexto real (últimas mensagens da conversa selecionada), sem envio externo automático.
- `ConfiguracoesPage.tsx` (órfão desde a migração de `/agentes`) foi removido; `/configuracoes/assistente → /agentes` continua via `professionalAliases`.
- Regras operacionais (`cancel_window_hours`, `reschedule_window_hours`, `relationship_checkins_*`) vivem em `/configuracoes/agenda` via `useOperationalRules` (RPC `update_operational_rules`, sem schema novo).
- Configuração dos 9 agentes persiste em `professional_agents.agent_configs.agents_v2` (sem migration nova).
- `personas` / `rlhf_rules` permanecem decisão de produto em aberto, sem schema novo.

**Dívida registrada para fase futura (não bloqueia o encerramento):** o toggle on/off dos 9 agentes em `/agentes` grava em `professional_agents.enabled_agents`, mas nenhuma Edge Function (`campaign-dispatcher`, `calculate-rfm`, `calculate-client-health-scores`, `lead-followup-agent`, `relationship-agent`, `indicacao-agent`, `reativacao-agent`, `upsell-agent`, `aniversariantes-agent`, `message-processor`) lê essa coluna hoje — o controle é só de UI. Avaliar enforcement no backend quando os crons desses agentes forem ligados (Fase 23+).

O estado correto é: **planejada, com PR 22.0 pronto e PR 22.1 bloqueado até a página própria existir**.
