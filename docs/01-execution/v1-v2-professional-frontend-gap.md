# Comparativo frontend profissional: v1 vs v2

Data: 2026-06-12

Escopo: comparar somente o app profissional. A parte admin fica fora desta rodada. Rotas publicas usadas por clientes foram consideradas apenas quando dependem de uma acao do profissional, como pacote, orcamento, anamnese, agendamento e chat.

## Resumo executivo

A v2 resolveu o principal problema estrutural da v1: separou `professional`, `client` e `admin` em apps distintos dentro do monorepo. Isso deve ser preservado. A v1 misturava rotas profissionais, publicas e `ADM` no mesmo `src/App.tsx`, o que explica parte dos conflitos de rota.

A v2 ja cobre o nucleo operacional: dashboard, agenda, clientes, perfil do cliente, servicos, financeiro, funil, relatorios, conversas, configuracoes, planos e um hub de documentos/pacotes. As maiores lacunas em relacao a v1 estao em estoque, configuracoes completas, growth/recompensas, RFM/campanhas, agentes IA e rotas detalhadas para documentos.

## Arquitetura de rotas recomendada

Manter tres apps separados:

- `apps/professional`: area logada do profissional e equipe.
- `apps/client`: paginas publicas e portal do cliente.
- `apps/admin`: administracao SaaS/plataforma.

Dentro do app profissional, evitar criar varias rotas soltas sem dono. Cada dominio deve ter um prefixo e, se precisar de abas, a aba deve ser controlada por sub-rota ou query param estavel.

Padrao recomendado:

- `/clientes`, `/clientes/:id`, `/clientes/:id/anamnese`
- `/agenda`, `/agenda/sessoes`
- `/servicos`
- `/financeiro`, `/financeiro/conciliacao`, `/financeiro/configuracoes`
- `/documentos`, `/documentos/pacotes`, `/documentos/orcamentos`, `/documentos/contratos`, `/documentos/anamnese`
- `/growth`, `/growth/rfm`, `/growth/campanhas`, `/growth/recompensas`, `/growth/aniversariantes`
- `/agentes`
- `/estoque`
- `/configuracoes`, `/configuracoes/equipe`, `/configuracoes/empresa`, `/configuracoes/agenda`, `/configuracoes/integracoes`, `/configuracoes/notificacoes`, `/configuracoes/plano`

## Mapa de cobertura

| Area/recurso v1 | Evidencia v1 | Situacao na v2 | Gap principal |
|---|---|---|---|
| Dashboard | `/dashboard`, widgets de metricas, IA agindo, leads quentes, clientes em risco | `/dashboard` existe | v2 parece mais enxuta; validar se widgets de IA, leads quentes e risco aparecem |
| Agenda | `/agenda`, abas agenda/historico, agendamento, tarefas, status, recorrencia, sessoes | `/agenda` existe, com agendamento, recorrencia e registro de sessao | falta separar historico/sessoes por rota ou aba navegavel; validar tarefas |
| Clientes | `/clientes`, lista/kanban, filtros, drawer, historico, estagios | `/clientes` e `/clientes/:id` existem | v2 tem perfil melhor estruturado, mas pode faltar kanban/lista completa, filtros avancados e acoes rapidas |
| Perfil/anamnese do cliente | `/clientes/:clientId/anamnese`, respostas, notas, enviar/copiar link, marcar revisado | aba `anamnese` em `/clientes/:id` e hook `useAnamnese` | falta rota dedicada e builder/configuracao completa de templates |
| Servicos | catalogo, categorias, visao geral, novo/editar/excluir | `/servicos` existe | v2 cobre CRUD basico; falta paridade de categorias/visao geral se nao estiver completa |
| Estoque/produtos | `/estoque`, produtos, estoque, gestao, reservas, manutencao, baixo estoque, importacao IA | nao ha rota profissional `/estoque` | lacuna grande |
| Financeiro | caixa, comanda, entrada/saida, conta cliente, fluxo, profissional, caixinha, conciliacao, PDV, importacao | `/financeiro` existe e contem PDV/conciliacao na pagina | falta rota/sub-rota dedicada para conciliacao/configuracoes e validar abas equivalentes |
| Configuracoes financeiras/NFSe | `/financeiro/configuracoes`, `/financeiro/nfse` | parcialmente absorvido por configuracoes/financeiro | falta mapa claro de configuracoes financeiras e fiscal |
| Relatorios | `/relatorios` | `/relatorios` existe com resumo, clientes, servicos, ocupacao | parece parcialmente coberto |
| Funil de vendas | `/funil`, kanban/tabela, templates, etapas, novo lead, tarefas, WhatsApp, orcamento, anotacao | `/funil` existe | falta validar paridade: templates, configuracao de etapas, tarefas, anotacoes, WhatsApp e criacao de orcamento |
| Orcamentos | `/orcamentos`, `/orcamentos/novo`, editar, PDF/viewer | hub `/documentos-pacotes` com aba quotes | funcionalidade consolidada, mas URLs antigas nao existem; falta sub-rotas ou query params |
| Contratos | `/contratos`, `/contratos/novo`, modelos/PDF | hub `/documentos-pacotes` com documentos/contratos | falta rota/sub-rota dedicada e paridade de PDF/assinatura |
| Pacotes | `/pacotes`, catalogo, venda, uso de sessoes, transferencia, historico | hub `/documentos-pacotes` com packages | falta rota/sub-rota dedicada e validar transferencia/historico |
| Anamnese builder | `/configuracoes/anamnese` | templates em `/documentos-pacotes` e tab no perfil | falta experiencia completa de builder como configuracao |
| Agentes IA | `/agentes`, persona/tom, canais, chat de teste, sugestoes aguardando aprovacao, creditos | nao ha `/agentes`; parte da identidade esta em `/configuracoes` e conversas tem shadow suggestions | lacuna grande de UI operacional de agentes |
| Conversas/WhatsApp | dialogs e historico de conversa na v1; v2 tem `/conversas` | `/conversas` existe | v2 provavelmente avanca aqui; validar takeover, aprovar/rejeitar sugestoes e envio manual |
| Campanhas | `/campanhas`, calendarios, fila, historico, segmentos | consolidado parcialmente em `/growth` | falta rota ou subarea robusta para campanhas |
| RFM | `/rfm` | aba `rfm` em `/growth` | falta tela dedicada ou sub-rota com matriz e acoes |
| Indicacoes/fidelidade/recompensas | `/indicacoes`, `/fidelidade`, `/recompensas`, ranking, programa, templates, resgates | partes em `/growth` e talvez sem `/recompensas` | lacuna media/grande |
| Aniversariantes | `/aniversariantes` | pode ser consolidado em growth, mas sem rota clara | falta UI de consulta/configuracao |
| Parceiros | `/parceiros` | nao encontrado no professional v2 | lacuna, se ainda for recurso profissional |
| Onboarding profissional | `/onboarding` | `/onboarding` existe | coberto, validar passos equivalentes |
| Planos/upgrade | `/upgrade`, plano em configuracoes | `/planos` existe | coberto com rota diferente |
| Login/cadastro/recuperacao | login, cadastro, recuperar senha, reset password | login/cadastro/criar-conta existem | faltam `/recuperar-senha` e `/reset-password` no professional |

## Prioridade de implementacao

### Fase 1: estabilizar rotas e navegacao

1. Criar um arquivo unico de declaracao de rotas do `apps/professional`, com `path`, `label`, `domain`, `roles`, `component` e `nav`.
2. Fazer `App.tsx`, `AppShell.tsx` e `MorePage.tsx` consumirem essa declaracao, evitando menu e rotas duplicados.
3. Definir aliases de compatibilidade para rotas da v1 quando fizer sentido, por exemplo `/pacotes` redirecionar para `/documentos/pacotes`.
4. Padronizar hubs com sub-rotas ou query param, sem misturar tudo em um unico componente sem URL.

### Fase 2: fechar lacunas operacionais

1. Estoque: criar `/estoque` com produtos, itens, reservas, manutencao e alertas.
2. Financeiro: separar `/financeiro/conciliacao` e `/financeiro/configuracoes`, mantendo `/financeiro` como visao principal.
3. Documentos: dividir o hub atual em sub-rotas para pacotes, orcamentos, contratos e anamnese.
4. Clientes: garantir paridade de filtros, kanban/lista, estagios e acoes rapidas.

### Fase 3: fechar growth e IA

1. Agentes IA: criar `/agentes` para persona, canais, chat de teste, aprovar/rejeitar sugestoes e creditos.
2. Growth: transformar `/growth` em hub com sub-rotas para campanhas, RFM, recompensas, aniversariantes, risco/churn, upsell, email e chat.
3. Recompensas: portar indicacoes, fidelidade, ranking, programa, templates e resgates.
4. Campanhas/RFM: garantir acoes diretas entre segmentacao, campanhas e WhatsApp/email.

### Fase 4: configuracoes completas

1. Quebrar `/configuracoes` em sub-rotas por dominio.
2. Portar empresa, equipe, agenda, anamnese builder, integracoes, notificacoes, acesso, plano e fiscal.
3. Remover qualquer configuracao admin/SaaS do app professional; isso deve ficar em `apps/admin`.

## Regras para evitar os conflitos da v1

1. Toda rota nova deve pertencer a um dominio antes de ser criada.
2. Nao criar duas rotas para a mesma feature sem redirect explicito.
3. Hubs devem ter estado navegavel: sub-rota ou query param.
4. Rotas publicas de cliente ficam em `apps/client`, nao em `apps/professional`.
5. Rotas admin ficam em `apps/admin`, nao escondidas em configuracoes profissionais.
6. Componentes grandes devem ser quebrados por dominio antes de crescerem como `Configuracoes.tsx` da v1.
7. A navegacao desktop, mobile e "Mais" deve vir da mesma fonte de dados.
8. Cada feature migrada deve ter checklist: rota, menu, permissao, empty state, loading, erro, mobile, i18n e teste basico.

## Proxima acao recomendada

Comecar pela Fase 1 antes de portar mais telas. A v2 ja esta em uma arquitetura melhor, mas se as novas lacunas forem adicionadas diretamente em `App.tsx` e menus separados, o mesmo problema da v1 volta. Depois da declaracao unica de rotas, a ordem mais segura e: `estoque`, `financeiro/conciliacao`, sub-rotas de `documentos`, `agentes`, e entao `growth/recompensas`.
