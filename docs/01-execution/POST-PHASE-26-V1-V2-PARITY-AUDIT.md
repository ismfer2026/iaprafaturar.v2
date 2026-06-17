# Auditoria Pós-Fase 26 - Paridade v1 -> v2

**Data:** 2026-06-16  
**Decision Owner:** Ismael  
**Escopo:** recursos visíveis, rotas e fluxos de frontend da v1 profissional/admin contra v2 profissional/admin/client.  
**Restrição:** nenhuma implementação feita nesta auditoria. Backend/functions da v1 não são padrão; a análise usa a v1 apenas como referência de jornada e recurso percebido.

## Veredito

A preocupação é válida. As 26 fases fecharam tecnicamente a v2 planejada, mas a paridade percebida com a v1 ainda precisa de um gate próprio antes do Go comercial.

O mapa de rotas mostra que muitos recursos da v1 existem na v2 como rotas canônicas, aliases ou consolidações. Porém há áreas em que a v2 parece mais enxuta que a v1, principalmente em financeiro, conexão WhatsApp, URLs públicas/convites, NFS-e, estoque operacional avançado e algumas telas admin.

## Recursos Claramente Preservados ou Evoluídos

| Área v1 | Estado v2 | Evidência v2 |
|---|---|---|
| Dashboard profissional | preservado/evoluído | `/dashboard` |
| Agenda | preservada/evoluída | `/agenda`, recorrência e registro de sessão |
| Clientes | preservado/evoluído | `/clientes`, `/clientes/:id`, kanban e perfil |
| Anamnese do cliente | preservada/consolidada | `/clientes/:id/anamnese`, `/documentos/anamnese` |
| Funil | preservado | `/funil` |
| Serviços | preservado | `/servicos`, `/servicos/novo` |
| Pacotes, orçamentos, contratos | consolidado | `/documentos/pacotes`, `/documentos/orcamentos`, `/documentos/contratos` |
| RFM/campanhas/recompensas/aniversariantes/parceiros | preservado/evoluído | `/growth`, `/rfm`, `/campanhas`, `/recompensas`, `/aniversariantes`, `/parceiros` |
| Agentes IA profissional | preservado/evoluído | `/agentes` |
| Equipe, permissões, agenda e notificações | preservado/evoluído | `/configuracoes/equipe`, `/configuracoes/agenda`, `/configuracoes/notificacoes` |
| Admin dashboard/profissionais/planos/agentes/melhorias/configurações | preservado/evoluído | app admin v2 |
| Cliente final | novo na v2 | app client v2 |

## Gaps ou Suspeitas Reais de Perda de Recurso

### P0 - Resolver antes do Go comercial

| Gap | v1 | v2 atual | Risco |
|---|---|---|---|
| Financeiro avançado por abas | `/financeiro` tinha Caixa, Comanda, Entrada/Saída, Conta Cliente, Fluxo de Caixa, Conta Profissional, Caixinha, Conciliação e PDV | `/financeiro` tem Extrato e PDV; Conciliação e Configurações existem como rotas dedicadas | usuário da v1 pode sentir perda forte de operação financeira |
| NFS-e | `/financeiro/nfse` existia | não há rota v2; NFS-e foi deixada fora do escopo técnico | perda explícita de recurso visível |
| Conexão WhatsApp self-service | v1 tinha QR, código de pareamento, Meta Cloud, desconectar, refresh/status | v2 mostra status do WhatsApp em `/agentes`, mas não expõe fluxo completo de conexão | profissional pode não conseguir configurar sozinho o canal principal |
| URLs públicas e convites legados | `/convite/:codigo`, `/indicacao/:codigo`, `/cadastro/:codigo`, `/entrar`, `/chat` | v2 client cobre jornadas novas, mas não há todos os aliases legados | links antigos, campanhas e materiais podem quebrar |

### P1 - Planejar como Fase 27

| Gap | v1 | v2 atual | Decisão necessária |
|---|---|---|---|
| Estoque operacional avançado | config/estoque com resumo, movimentar, consumo, histórico, expedição, reservas/manutenção | `/estoque` tem produto, ajuste, lotes e vencimento | decidir se consumo, expedição, reserva e manutenção voltam |
| Exportar pacote para contador | v1 financeiro gerava pacote/zip para contabilidade | não encontrado equivalente direto na v2 | decidir se entra em Financeiro ou Relatórios |
| Conta cliente/profissional | abas financeiras dedicadas na v1 | v2 concentra em extrato/transações e perfil | decidir se volta como filtros/visões, não como tabelas paralelas |
| Portal financeiro/plano na configuração profissional | v1 tinha área de plano/portal financeiro dentro de configurações | v2 tem `/planos` e `/financeiro/configuracoes` | validar se todos os controles do plano/portal foram migrados |
| Centro de notificações/PWA/offline | v1 tinha componentes de notificações, PWA, status offline e sync local | v2 tem preferências de notificação, mas centro/overlay/offline não aparecem como experiência equivalente | decidir se isso era recurso real ou infraestrutura problemática da v1 |

### P1 Admin

| Gap | v1 admin | v2 admin | Decisão necessária |
|---|---|---|---|
| `/metricas` | rota dedicada com growth, financeiro, engajamento, agentes e saúde | v2 usa `/analytics`, sem alias `/metricas` | adicionar alias ou registrar descarte |
| `/onboarding-profissional` | rota dedicada | v2 tem profissionais/detalhe/onboarding manual, mas sem rota equivalente | validar paridade funcional |
| campanhas admin | v1 tinha categorias, templates, gatilhos e audiências detalhadas | v2 consolida `/campanhas` e `/notificacoes` em `/broadcast` | comparar se templates/gatilhos foram preservados ou reduzidos |
| teste premium/debug | rotas v1 de teste | v2 não mantém como produto | provável descarte correto, sem ação |

## Mapa de URLs Legadas a Validar

| URL v1 | Estado v2 sugerido |
|---|---|
| `/pacotes` | alias para `/documentos/pacotes` já existe |
| `/orcamentos` | alias para `/documentos/orcamentos` já existe |
| `/contratos` | alias para `/documentos/contratos` já existe |
| `/indicacoes` | falta alias para `/recompensas` com estado de indicação ou decisão |
| `/fidelidade` | falta alias para `/recompensas` com estado de fidelidade ou decisão |
| `/financeiro/nfse` | falta rota/recurso ou decisão explícita de fase futura |
| `/convite/:codigo` | falta decisão de redirect para app client/professional |
| `/indicacao/:codigo` | falta decisão de redirect para app client/professional |
| `/cadastro/:codigo` | falta decisão de redirect para app client/professional |
| `/entrar` | falta decisão de redirect |
| `/chat` | falta decisão; v2 usa `/chat/:slug` |
| admin `/metricas` | falta alias para `/analytics` ou decisão |
| admin `/campanhas` | alias para `/broadcast` existe |
| admin `/notificacoes` | alias para `/broadcast` existe |

## Recomendação

Criar a **Fase 27 - Paridade Percebida v1 -> v2 e Recovery de Recursos**, antes do Go comercial.

Objetivo: garantir que nenhum recurso útil da v1 desapareça sem decisão explícita de Ismael. A fase deve focar em frontend/UX e contratos v2 existentes. Quando faltar contrato no DB v2, abrir tarefa de schema guard; não copiar functions da v1.

### PR 27.0 - Inventário navegável e evidência visual

- rodar v1 e v2 localmente;
- capturar screenshots de cada rota/tela principal em desktop e 390px;
- montar matriz recurso -> tela -> ação -> contrato v2;
- classificar cada item como `preservar`, `consolidar`, `redirecionar`, `recriar com contrato v2`, `descartar aprovado`.

### PR 27.1 - Rotas e aliases de compatibilidade

- decidir e implementar redirects para URLs legadas aprovadas;
- priorizar `/indicacoes`, `/fidelidade`, `/metricas`, convites e links públicos;
- manter aliases sem estado paralelo.

### PR 27.2 - Financeiro avançado

- comparar abas v1 com o modelo v2;
- recriar como visões/filtros sobre contratos v2, não tabelas paralelas;
- incluir Caixa, Comanda, Entrada/Saída, Conta Cliente, Conta Profissional, Fluxo de Caixa, Caixinha e export contador conforme decisão.

### PR 27.3 - WhatsApp self-service

- validar contrato v2 para conexão WhatsApp;
- se existir contrato seguro, criar UI de QR/código/status/desconexão;
- se não existir, abrir schema/function contract novo com revisão de segurança.

### PR 27.4 - NFS-e

- Ismael decide se volta agora ou fica fora do Go comercial;
- se voltar, criar contrato explícito com provedor/município/credenciais/ambiente/homologação antes de UI.

### PR 27.5 - Estoque e operações avançadas

- validar consumo, expedição, reservas/manutenção e histórico;
- reaproveitar produtos/lotes/movimentos v2;
- não criar segunda fonte de saldo.

### PR 27.6 - Admin parity

- comparar `/metricas`, onboarding profissional, campanhas/templates/gatilhos e embaixadores;
- implementar aliases e telas faltantes somente se houver contrato v2.

### PR 27.7 - QA final de paridade percebida

- checklist visual v1 x v2;
- rotas legadas testadas;
- nenhum link antigo crítico quebra;
- PRDs atualizados com decisões finais.

## Conclusão

As 26 fases continuam tecnicamente concluídas, mas isso não deve ser usado como autorização de Go comercial enquanto a Fase 27 não fechar a paridade percebida. A v2 está mais segura e organizada, mas ainda pode estar menos completa na percepção de quem usava a v1.
