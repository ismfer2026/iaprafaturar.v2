# Fase 19 — Plano de Execução

Status: `em andamento`  
Decision Owner: Ismael  
App responsável: `apps/professional`  
Estimativa: 3-4 semanas

## Objetivo

Fechar a operação diária do profissional reutilizando as rotas, componentes, hooks e contratos DB v2 existentes, sem reconstruções paralelas. A v1 pode justificar somente comportamento de frontend; nenhum contrato backend da v1 é referência técnica.

## Gates anteriores ao primeiro PR de implementação

O PR 19.0 é documental e contratual. Ele aprova os contratos, permissões, inventário e bloqueios abaixo. Não implementa migrations, RPCs ou telas.

Nenhum PR 19.1-19.8 pode começar enquanto:

- os quatro contratos críticos não estiverem aprovados;
- a matriz de permissões não estiver aprovada;
- cada funcionalidade estiver classificada como `reutilizar`, `ampliar`, `criar` ou `bloquear`;
- cada escrita estiver ligada a RPC v2 existente ou tarefa contratual explícita;
- Ismael registrar a decisão final.

## PR 19.0 — Preflight, contratos e segurança

### Contrato C19-01 — Versionamento de anamnese

**Evidência v2 atual**

- `anamnese_templates` possui `id`, `professional_id`, `name`, `fields`, `is_default` e soft delete.
- `anamnese_fichas.template_id` já referencia diretamente o template utilizado.
- `update_anamnese_template` atualmente sobrescreve o registro existente.

**Desenho contratual aprovado para implementação no PR 19.5**

- Manter `anamnese_templates` como tabela canônica; não criar tabela paralela de templates.
- Adicionar:
  - `version integer NOT NULL DEFAULT 1`;
  - `previous_version_id uuid NULL REFERENCES anamnese_templates(id) ON DELETE RESTRICT`;
  - `published_at timestamptz NULL`;
  - `is_current boolean NOT NULL DEFAULT true`.
- Criar índice único parcial para uma única versão atual por linhagem/profissional.
- Nova RPC `create_anamnese_template_version(p_template_id uuid, p_name text, p_fields jsonb, p_is_default boolean)`.
- A RPC cria novo registro, marca a versão anterior como não atual e preserva fichas existentes apontando para a versão original.
- Templates sem fichas associadas podem ser alterados somente por RPC explicitamente validada; após uso, alteração sempre cria versão.
- Auditoria obrigatória: versão anterior, nova versão, ator e alteração de default.
- `update_anamnese_template` deve ser descontinuada para edições de templates utilizados.

**Gate:** nenhuma UI de edição/versionamento antes desse contrato estar aplicado e testado.

### Contrato C19-02 — Roles e gestão de equipe

**Evidência v2 atual**

- `user_roles` contém `gestor` e `operacional`.
- `team_members.nivel_acesso` contém `gestor` e `operacional`.
- A RLS atual de `team_members` isola tenant, mas `authenticated` possui `INSERT` e `UPDATE` diretos.
- O frontend professional ainda não expõe `role`.

**Desenho contratual aprovado para implementação no PR 19.1**

- Criar função canônica `auth_professional_role()` retornando `gestor` ou `operacional` para o usuário autenticado.
- Resolver role a partir de `user_roles`; vínculo ativo em `team_members` deve ser validado para membros da equipe.
- Revogar `INSERT` e `UPDATE` diretos de `authenticated` em `team_members`; preservar `SELECT` isolado.
- Criar RPCs:
  - `create_team_member(...)`;
  - `update_team_member(...)`;
  - `deactivate_team_member(p_team_member_id uuid)`;
  - `update_team_member_permissions(p_team_member_id uuid, p_nivel_acesso text, p_possui_agenda boolean)`.
- Todas as RPCs exigem `gestor`, validam tenant/IDOR, impedem remoção do último gestor e registram auditoria.
- A role deve ser exposta no `AuthContext` e aplicada em rota, ação e RPC. Ocultar botão não é autorização.

**Gate:** PRs 19.1, 19.4 e 19.7 bloqueados até contrato aplicado e testado.

### Contrato C19-03 — Preferências de notificações

**Evidência v2 atual**

- `team_members.notifications jsonb` existe para preferências individuais.
- Não há contrato v2 comprovado para uma tabela geral de notificações profissionais.

**Desenho contratual aprovado para implementação no PR 19.7**

- Reutilizar `team_members.notifications` para preferências individuais.
- Usar `professionals.settings.notifications` somente para defaults da clínica.
- Não criar tabela nova na Fase 19.
- Definir schema JSONB versionado:
  - `schema_version`;
  - canais permitidos;
  - eventos permitidos;
  - quiet hours;
  - fallback para defaults da clínica.
- Criar RPCs:
  - `get_professional_notification_settings()`;
  - `upsert_professional_notification_settings(p_settings jsonb)`;
  - `upsert_my_notification_preferences(p_preferences jsonb)`.
- Alteração de defaults da clínica exige `gestor`; usuário pode alterar apenas as próprias preferências.
- Validar payload, chaves permitidas e auditoria; proibir update JSONB livre pelo frontend.

**Gate:** `/configuracoes/notificacoes` bloqueada até contrato aplicado e testado.

### Contrato C19-04 — Business hours

**Evidência v2 atual**

- `professionals.settings.business_hours` existe como horário padrão.
- `team_members.business_hours` existe para exceções individuais.

**Desenho contratual aprovado para implementação no PR 19.7**

- Não criar tabela ou campo paralelo.
- Definir schema JSONB canônico com `schema_version`, timezone, dias da semana, intervalos e exceções.
- Horário efetivo: exceção ativa do membro; caso ausente, fallback para horário da clínica.
- Criar RPCs:
  - `get_professional_schedule_settings()`;
  - `upsert_professional_business_hours(p_business_hours jsonb)`;
  - `upsert_team_member_business_hours(p_team_member_id uuid, p_business_hours jsonb)`.
- Alterações exigem `gestor`, validação de intervalos, tenant/IDOR e auditoria.
- Agenda e handlers públicos devem consumir o mesmo contrato canônico.

**Gate:** `/configuracoes/agenda` e filtros por agenda de membro bloqueados até contrato aplicado e testado.

## Matriz de permissões aprovada

`gestor` inclui todas as permissões de `operacional`. Toda restrição deve existir em UI, rota quando aplicável e DB/RPC.

| Ação | Operacional | Gestor | Proteção DB/RPC |
|---|---|---|---|
| Visualizar dashboard, clientes e agenda | sim | sim | RLS tenant |
| Criar cliente | sim | sim | `create_client_manual` |
| Mover jornada do cliente | sim | sim | `move_client_stage` |
| Criar/cancelar agendamento | sim | sim | RPCs de agenda |
| Registrar sessão e resultado | sim | sim | RPCs de sessão/resultado |
| Revisar ficha de anamnese | sim | sim | `review_anamnese_ficha` + auditoria |
| Criar/mover/fechar oportunidade | sim | sim | RPCs do funil |
| Criar/editar/desativar serviço | não | sim | RPC deve validar `gestor` |
| Criar/editar pacote | não | sim | RPC deve validar `gestor` |
| Criar modelos, contratos e orçamentos | não | sim | RPC deve validar `gestor` |
| Criar/versionar template de anamnese | não | sim | C19-01 |
| Alterar configurações de agenda/clínica | não | sim | C19-04/RPC específica |
| Alterar defaults de notificações | não | sim | C19-03 |
| Alterar próprias notificações | sim | sim | C19-03, somente próprio usuário |
| Criar/editar/desativar membro da equipe | não | sim | C19-02 |
| Alterar roles/permissões | não | sim | C19-02 |
| Acessar configurações financeiras | não | sim | contratos financeiros v2 |
| Acessar configurações admin da plataforma | não | não | proibido no professional |

## Inventário componente, hook e contrato

| Funcionalidade | Componente atual | Hook atual | Contrato v2 atual | Decisão |
|---|---|---|---|---|
| Dashboard operacional | `DashboardPage` | `useDashboard` | `get_dashboard_rpc` | ampliar RPC e página; não criar paralelo |
| Lista de clientes | `ClientsPage` | `useClients` | leitura RLS, `create_client_manual`, `move_client_stage` | ampliar |
| Kanban de clientes | não identificado | `useClients` pode reutilizar movimento | `move_client_stage` | criar somente componente; validar acessibilidade/mobile |
| Perfil do cliente | `ClientProfilePage` | hooks de cliente, agenda, sessão, pacotes, contratos e anamnese | contratos existentes | ampliar |
| Rota direta de anamnese do cliente | conteúdo já existe no perfil | `useClientAnamneseFichas`, `useReviewAnamneseFicha` | leitura RLS, `review_anamnese_ficha` | rotear/reutilizar |
| Agenda dia | `AgendaPage` | `useAppointments` | RPCs de agenda/recorrência/sessão | ampliar |
| Agenda semana/mês | não identificado | hook atual filtra por dia | contrato de leitura por intervalo não comprovado | bloquear até preflight de performance/consulta |
| Agenda por membro | não identificado | não identificado | business hours existe; appointments sem `team_member_id` comprovado | bloquear até contrato aprovado |
| CRUD de serviços | sheet existente em `ServicesPage` | `useServices` | RPCs de serviço | reutilizar e endurecer role |
| `/servicos/novo` | mesmo sheet de `ServicesPage` | `useServices` | `create_service` | rota acionável, sem segundo formulário |
| Categorias de serviço | UI não identificada | leitura parcial em `useServices` | tabela existe; RPC de escrita não comprovada | bloquear escrita até contrato |
| Funil | `FunilPage` | `useFunnelBoard` | RPCs do funil e `funnel_events` | ampliar |
| Tarefas do funil | não identificado | não identificado | contrato não comprovado | fora do escopo até contrato aprovado |
| Documentos/pacotes | `DocumentsPackagesPage` | `useDocumentsPackages` | tabelas/RPCs existentes | ampliar e aplicar role |
| Builder de anamnese | edição JSON no hub documental | `useAnamneseTemplates` | RPC sobrescreve template | bloquear até C19-01 |
| Configurações raiz | `ConfiguracoesPage` monolítica | `useAssistantSettings` | contratos distribuídos | transformar em índice; `/agentes` permanece separado |
| Configurações de equipe | não identificado | não identificado | tabela existe; escrita direta insegura | bloquear até C19-02 |
| Configurações de notificações | não identificado | não identificado | JSONB parcial | bloquear até C19-03 |
| Configurações de agenda | não identificado | não identificado | JSONB existente | bloquear até C19-04 |

### Complexidade obrigatória do Kanban

- Não criar segundo modelo de jornada; usar `clients.journey_stage`.
- Reutilizar `move_client_stage` com atualização otimista e rollback em erro.
- Suportar teclado e ações explícitas além de drag-and-drop.
- No mobile, priorizar mover por menu/ação; drag horizontal não pode bloquear scroll.
- Definir paginação ou limite por coluna antes de carregar base grande.
- Não adicionar biblioteca antes de avaliar dependências já instaladas.

## Sequência de PRs

| PR | Entrega | Bloqueios de entrada |
|---|---|---|
| 19.0 | preflight, quatro contratos, permissões, inventário e decisões | nenhum |
| 19.1 | contrato de roles/equipe, `AuthContext`, gates e rotas | C19-02 aprovado |
| 19.2 | clientes, kanban e perfil operacional | 19.1; consultas/performance aprovadas |
| 19.3 | agenda operacional | 19.1; C19-04 para equipe/horários |
| 19.4 | serviços e `/servicos/novo` | 19.1; RPCs com role gestor |
| 19.5 | documentos, pacotes e anamnese versionada | 19.1; C19-01 |
| 19.6 | funil e dashboard | inventário aprovado; sem tarefas não contratadas |
| 19.7 | configurações profissionais | C19-02, C19-03 e C19-04 |
| 19.8 | QA, segurança, PRDs e encerramento | PRs anteriores concluídos |

## Gates por PR

### PR 19.1

- Role carregada sem confiar apenas em metadata do cliente.
- Acesso direto por URL bloqueado quando necessário.
- RPCs sensíveis rejeitam `operacional`.
- Testes professional A/B e gestor/operacional.

### PR 19.2

- Perfil agrega histórico permitido sem consultas duplicadas desnecessárias.
- `/clientes/:id/anamnese` reutiliza a área existente.
- Kanban possui alternativa acessível e rollback.

### PR 19.3

- Recorrência e registro de sessão continuam usando RPCs existentes.
- Semana/mês não carregam toda a tabela sem janela temporal.
- Agenda por membro somente após contrato comprovado.

### PR 19.4

- `/servicos/novo` abre o mesmo formulário/sheet.
- Nenhum segundo CRUD de serviços.
- Operacional não consegue escrever via UI ou RPC.

### PR 19.5

- Fichas respondidas permanecem ligadas à versão original.
- Nova versão não sobrescreve histórico.
- Escritas sensíveis exigem gestor e auditoria.

### PR 19.6

- Dashboard amplia `get_dashboard_rpc`; não cria RPC concorrente.
- Funil reutiliza board, stages, opportunities e events existentes.
- Tarefas permanecem fora do escopo sem contrato.

### PR 19.7

- Cada sub-rota usa contrato específico.
- Nenhuma tabela genérica ou configuração admin é criada no professional.
- Redirects definidos na Fase 18 permanecem funcionando.

### PR 19.8

- Testes de role, tenant, IDOR, URL direta, redirects, mobile 390px, i18n e estados de UX.
- Typecheck, lint, build e diff check aprovados.
- PRD-MASTER, PRD-FRONTEND, PRD-SCHEMA e mapa de contratos sincronizados.

## Fora do escopo explícito

- Tarefas operacionais/funil sem contrato DB v2 aprovado.
- Estoque, fiscal e conciliação, pertencentes à Fase 20.
- Growth, campanhas, RFM, recompensas e parceiros, pertencentes à Fase 21.
- Configuração completa de agentes, pertencente à Fase 22.
- Qualquer configuração administrativa da plataforma.

## Aprovação para iniciar

- [x] Contratos críticos detalhados no plano
- [x] Matriz de permissões detalhada
- [x] Componentes, hooks e RPCs mapeados
- [x] Complexidade do Kanban registrada
- [x] Decision Owner autoriza início do PR 19.0

