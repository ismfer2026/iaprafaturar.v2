# Comparativo frontend admin: v1 admin vs v2 admin

Data: 2026-06-12

Escopo: comparar o app admin v1 em `iaprafaturar-admin` com o app admin v2 em `iaprafaturar.v2/apps/admin`. A parte profissional e a parte cliente ficam fora deste documento.

## Resumo executivo

A v2 admin ja esta corretamente separada em `apps/admin`, o que e melhor do que misturar administracao da plataforma dentro do app profissional. A v1 admin era um app separado e tinha um conjunto maior de telas operacionais. A v2 admin possui o nucleo, mas varias telas foram simplificadas ou ainda nao aparecem como rotas.

O ponto de atencao principal e nao confundir dois tipos de agente:

- `apps/admin /agentes`: configuracao global/plataforma dos agentes e versoes de prompt.
- `apps/professional /agentes`: operacao do profissional, persona, canais, sugestoes e chat de teste.

Esses recursos nao devem ser duplicados nem compartilhar telas sem contrato claro.

## Rotas v1 admin

Rotas encontradas em `iaprafaturar-admin/src/App.tsx`:

- `/login`
- `/teste-premium`
- `/debug` apenas em desenvolvimento
- `/dashboard`
- `/onboarding-profissional`
- `/profissionais`
- `/planos`
- `/embaixadores`
- `/agentes`
- `/campanhas`
- `/notificacoes`
- `/metricas`
- `/nexus`
- `/melhorias`
- `/configuracoes`

## Rotas v2 admin

Rotas encontradas em `iaprafaturar.v2/apps/admin/src/App.tsx`:

- `/login`
- `/dashboard`
- `/profissionais`
- `/planos`
- `/embaixadores`
- `/agentes`
- `/melhorias`
- `/broadcast`
- `/nexus`

## Mapa de cobertura

| Area/recurso v1 admin | Evidencia v1 | Situacao na v2 | Gap principal |
|---|---|---|---|
| Login admin | `/login` | `/login` existe | coberto, v2 mais enxuta |
| Dashboard | KPIs financeiros, usuarios, planos, logs de agentes, profissionais recentes, link de cadastro | `/dashboard` usa `get_admin_dashboard_rpc` | v2 parece mais limpa, mas validar se cobre logs de agentes e profissionais recentes |
| Profissionais | busca, filtros por plano/status, detalhes, saldo/wallet, assinatura | `/profissionais` usa `get_admin_professionals_rpc` e acao de completar onboarding | v2 parece parcial; validar filtros, detalhe, saldo, assinatura, status |
| Planos | CRUD de planos, ativar/desativar, assinantes, calculadora financeira, features | `/planos` mostra dashboard phase17 e acoes admin de free/creditos | grande lacuna: CRUD de planos e calculadora da v1 nao aparecem na v2 |
| Embaixadores | lista, filtros, aprovar/suspender, criar parceiro, link, indicacoes, PIX pago, badges | `/embaixadores` aprova/suspende requests via RPC | v2 parcial; falta criacao, pagamentos, detalhes, filtros e historico completo |
| Agentes globais | lista de agentes, ativar/desativar, master prompt, logs/stats | `/agentes` lista agentes e registra prompt version | v2 parcial; falta toggle global, stats/logs e experiencia completa de prompt |
| Campanhas admin | `/campanhas`, categorias, templates, segmentos, status, stats, profissionais selecionados | substituido por `/broadcast` | v2 cobre broadcast simples, mas nao campanhas/templates/metricas da v1 |
| Notificacoes admin | broadcast push/WhatsApp/app, audiencia todos/selecionados, historico, limpeza, taxa de leitura | parte pode estar em `/broadcast` | v2 nao tem rota `/notificacoes`; validar se historico e canais existem |
| Metricas admin | growth, MRR, churn, conversao, planos, embaixadores, health scores, recalculo/trigger | nao ha `/metricas` | lacuna grande; parte pode estar no dashboard, mas nao equivalente |
| Nexus | chat admin AI, leads, gateway, proposta/confirmacao na v2 | `/nexus` existe e v2 tem fluxo com proposal/confirm/execute | v2 parece mais avancada em acao confirmada; validar se lista/leads da v1 ainda importa |
| Melhorias | historico/evolucao | `/melhorias` existe com feature requests e status | v2 mudou de historico estatico para workflow; validar se precisa manter changelog |
| Configuracoes plataforma | config global, API key, dados SMTP/WhatsApp, troca de senha, status de servicos | nao ha `/configuracoes` | lacuna grande para operacao da plataforma |
| Onboarding profissional admin | `/onboarding-profissional` | nao ha rota dedicada | v2 tem acao de completar onboarding em profissionais; validar se wizard admin ainda e necessario |
| Debug | `/debug` dev only | nao ha rota | manter fora de produto; pode virar runbook/devtool se necessario |
| Teste premium | `/teste-premium` publico | nao ha rota | provavelmente legado; validar antes de portar |

## Regra de backend/Supabase

Este comparativo cobre somente frontend, comportamento e jornadas. Functions, tabelas, RPCs, policies, filas e contratos da v1 admin são deliberadamente ignorados.

Toda tarefa deve comprovar seu contrato exclusivamente no banco/migrations da v2, seguindo `supabase-contract-map-v2.md`. Se não houver contrato v2, a lacuna deve ser aprovada no PRD-SCHEMA antes da implementação.

## Prioridade de mapeamento antes do PRD MASTER

### Admin A: indispensavel para operar o SaaS

1. Dashboard admin completo: KPIs, saude, MRR, planos, profissionais recentes e logs relevantes.
2. Profissionais: busca, filtros, detalhe, assinatura, wallet/saldo, status e onboarding.
3. Planos: decidir se a v2 precisa CRUD de planos, calculadora financeira e gestao de features ou se isso fica congelado por DB/RPC.
4. Configuracoes da plataforma: API keys, integracoes globais, credenciais, status e troca de senha.

### Admin B: crescimento, comunicacao e suporte

1. Broadcast/notificacoes: unificar `/broadcast`, antigo `/notificacoes` e antigo `/campanhas` sem duplicar canais.
2. Embaixadores: completar funil de afiliados, aprovacao, pagamentos PIX, links e historico.
3. Metricas: recuperar dashboards de growth/MRR/churn/conversao e health scores.
4. Melhorias: alinhar historico de melhorias com feature request workflow.

### Admin C: IA e operacao avancada

1. Agentes globais: prompt versioning, ativacao global, logs/stats e rollback.
2. Nexus: confirmar escopo final como console de IA admin com proposta/confirmacao/execucao.
3. Onboarding profissional admin: decidir se wizard continua necessario ou se a acao em `/profissionais` substitui.
4. Debug/teste premium: manter como ferramenta interna/documentada, nao rota de produto sem justificativa.

## Regras para evitar duplicidade entre admin, professional e client

1. Recurso de plataforma fica em `apps/admin`.
2. Recurso usado pelo profissional no dia a dia fica em `apps/professional`.
3. Experiencia do cliente final fica em `apps/client`.
4. Campanhas admin e campanhas do profissional devem ter nomes e contratos separados.
5. Agentes admin e agentes do profissional devem ter escopos separados.
6. Toda acao sensivel admin deve passar por RPC/Edge Function revisada, nao por acesso direto improvisado a tabela.
7. Antes de portar tela da v1, confirmar o contrato exclusivamente no DB/migrations da v2.

## Proxima acao recomendada

Antes de executar qualquer lacuna, preencher o preflight e validar o contrato no DB/migrations da v2. Não realizar mapeamento cruzado de backend com a v1.
