# FASE 22 — Preflight Contratual

## Agentes IA Profissional e Operação da Rosane

**Status:** documentação preparada para execução  
**Data da auditoria:** 2026-06-14  
**Decision Owner:** Ismael  
**Parecer técnico:** escopo aprovado com duas decisões de fronteira já fixadas neste preflight  
**Fonte de verdade:** PRD-MASTER, PRD-FRONTEND, banco v2, migrations v2 e frontend profissional da v2

---

## 1. Parecer de Aprovação

A Fase 22 fecha a fronteira da Rosane profissional. O produto já tem a fundação necessária em `professional_agents`, `shadow_suggestions`, `agent_executions` e contratos de conversa; o que falta aqui é consolidar a configuração profissional em uma rota canônica, separar isso da operação inline de `/conversas` e remover a mistura com regras operacionais da clínica.

**Decisões fechadas neste preflight:**

- `/agentes` é a única tela profissional de configuração da Rosane;
- `/configuracoes/assistente` já é redirect e permanece apenas como compatibilidade;
- `cancel_window_hours`, `reschedule_window_hours` e `relationship_checkins_*` saem da config da Rosane e passam a ter lar em `/configuracoes/agenda`;
- `personas`, `rlhf_rules` e possíveis diffs de RLHF continuam como decisão de produto antes de qualquer schema novo.

**Gate de aprovação:**

- PR 22.0 documental: **GO**;
- PR 22.1 funcional: **NO-GO** até a nova página `/agentes` estar criada e o monólito antigo desmontado;
- nenhuma capacidade pode criar uma segunda fonte de configuração profissional.

---

## 2. Contratos e Fronteiras

| Área | Parecer | Condição obrigatória |
|---|---|---|
| Configuração da Rosane | Aprovado | mover para `/agentes` como fonte única |
| Shadow suggestions | Aprovado | reutilizar contratos e auditoria existentes |
| Chat de teste | Aprovado | sem envio externo automático |
| Logs e métricas | Aprovado | visíveis ao profissional, com tenant isolation |
| Decisão personas/RLHF | Aprovado como pendência de produto | registrar antes de schema novo |
| Regras operacionais da clínica | Aprovado com realocação | `cancel_window_hours`, `reschedule_window_hours` e check-ins vão para `/configuracoes/agenda` |

Nenhum contrato precisa ser redesenhado. A Fase 22 trabalha com reaproveitamento e consolidação, não com duplicação de schema.

---

## 3. Inventário de Frontend

| Capacidade | Estado atual | Gap confirmado | Owner futuro |
|---|---|---|---|
| `/agentes` | aponta para `ConfiguracoesPage` | não existe página própria | `/agentes` |
| `/configuracoes/assistente` | redirect já existe | só compatibilidade | redirect |
| Operação inline de conversa | existe em `ConversasPage` | não deve ganhar formulário paralelo | `/conversas` |
| Configuração Rosane | embutida em `useAssistantSettings` | mistura config da IA com regras operacionais | `/agentes` + `/configuracoes/agenda` |
| Shadow log | existe como contratos e ações | precisa UI dedicada em `/agentes` | `/agentes` |
| Chat de teste | não existe como experiência canônica | precisa página/área dedicada | `/agentes` |

### Decisão de fronteira operacional

- `cancel_window_hours`, `reschedule_window_hours` e `relationship_checkins_*` deixam de ser tratados como parte da configuração da Rosane;
- esses campos passam a ser responsabilidade de `/configuracoes/agenda`;
- `useAssistantSettings` não deve continuar como owner único desses campos depois da Fase 22.

---

## 4. Inventário de Contratos v2

| Área | Contratos canônicos existentes | Estado auditado |
|---|---|---|
| Configuração Rosane | `professional_agents`, `shadow_suggestions`, `agent_executions`, `message_events` | existentes; devem ser expostos em `/agentes` |
| Conversas | contratos de inbox, takeover, aprovação e rejeição | existentes; permanecem em `/conversas` |
| Operação da clínica | `professionals.settings.appointment_rules` e regras de agenda | existentes; devem sair da configuração da Rosane |
| Shadow auditing | `log_audit_event` em aprovar/editar/rejeitar | já coberto na fundação da Fase 5 |

### Pontos sem schema novo nesta fase

- `personas` e `rlhf_rules` da v1;
- qualquer derivado novo para prompt global;
- qualquer configuração paralela em `/configuracoes/assistente`.

Se um novo schema aparecer, precisa de lacuna provada e aprovação explícita de Ismael antes da execução.

---

## 5. Gaps Bloqueantes e Owners

| ID | Gap | Risco | Owner de execução | Bloqueia |
|---|---|---|---|---|
| G22-01 | `/agentes` ainda aponta para a tela legada | a Fase 22 não tem owner real | PR 22.1 | estrutura |
| G22-02 | `useAssistantSettings` mistura Rosane com regras operacionais | configuração duplicada e confusa | PR 22.1 / PR 22.2 | consolidação da UI |
| G22-03 | `cancel_window_hours`, `reschedule_window_hours` e check-ins não têm destino explícito na nova fronteira | limbo contratual | PR 22.0 + PR 22.1 | fechamento de escopo |
| G22-04 | `personas` / `rlhf_rules` ainda não têm decisão formal | schema especulativo | PR 22.0 | schema novo |
| G22-05 | chat de teste e observabilidade ainda não estão expostos como experiência canônica | operação incompleta | PR 22.3 / PR 22.4 | encerramento da fase |
| G22-06 | `/conversas` não pode herdar config duplicada | regressão de UX e de responsabilidade | PR 22.1 | separação de responsabilidades |

---

## 6. Evidências Confirmadas

- `routes.ts` já possui redirect de compatibilidade em `/configuracoes/assistente` para `/agentes`.
- `routes.ts` ainda aponta `/agentes` para a tela legada.
- `useAssistantSettings.ts` lê `professional_agents` e também grava regras operacionais em `professionals.settings`.
- `PRD-MASTER` já trata `/agentes` como fonte única da Rosane e proíbe uma segunda configuração em `/configuracoes/assistente`.
- `PRD-FRONTEND` já define `ConfigRosane`, `ListaAgentes` e drawer por agente.

---

## 7. Gates Antes do PR 22.1

- [ ] `personas` / `rlhf_rules` mantidos como decisão de produto até aprovação explícita;
- [ ] destino das regras operacionais definido em `/configuracoes/agenda`;
- [ ] inventário de `professional_agents`, `shadow_suggestions`, `agent_executions` e `message_events` confirmado para reutilização;
- [ ] `/agentes` reconhecido como única fonte de configuração profissional;
- [ ] `/configuracoes/assistente` reconhecido como redirect somente;
- [ ] nenhum novo schema criado sem lacuna provada.

---

## 8. Resultado do PR 22.0

O preflight da Fase 22 está pronto. O escopo foi fechado com duas decisões obrigatórias: a nova página `/agentes` e a realocação dos campos operacionais para `/configuracoes/agenda`.

O estado correto agora é: **planejada, com PR 22.1 bloqueado até a página própria existir**.
