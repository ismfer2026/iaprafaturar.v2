# UX Plan - Fase 17

## Principios

- SaaS/admin deve ser utilitario, denso e escaneavel.
- Mobile 390px sem tabela horizontal; listas verticais e sheets bottom.
- Desktop/tablet podem usar grids/tabelas compactas.
- Maximo de um CTA primario por tela/aba.
- Todos os textos novos em i18n `pt-BR`, `en-US`, `es-419`.

## Professional App

### `/planos`

Mobile:

- lista vertical de planos;
- toggle mensal/anual no topo;
- um CTA primario por plano visivel, mas apenas a area de comparacao ativa deve estar em foco;
- `free_internal` nunca aparece.

Desktop:

- comparativo em colunas;
- destaque do plano recomendado por perfil;
- creditos avulsos como secao separada.

Estados:

- trial ativo;
- trial expirando;
- read-only;
- assinatura ativa;
- cancelado ate fim do periodo;
- creditos IA baixos/zerados.

## Admin App

### Planos / Status

- lista de profissionais com plano, status, trial, periodo, creditos e origem.
- drawer/sheet de detalhes com historico de assinatura, Stripe events e audit_log.
- acao primaria contextual: `Salvar ajuste` ou `Conceder free_internal`, nunca ambas simultaneas.

### Embaixadores

Tabs:

- Solicitacoes.
- Ativos.
- Indicacoes.
- Pagamentos.

Mobile: cards por embaixador/pagamento.
Desktop: tabela com filtros.

### Nexus

- chat com historico persistente.
- quando Nexus propor acao, renderizar card de confirmacao com diff da acao.
- execucao so aparece apos clique/confirmacao explicita.
- consultas de metricas podem responder inline sem confirmacao.

### Agentes

- lista de agentes com status, erro 24h, latencia p95, tokens/custo.
- detalhe do agente com versoes de prompt e pausa temporaria.
- promocao de prompt deve deixar claro `draft -> staging -> active`.

### Melhorias

Professional app:

- enviar sugestao;
- votar em sugestoes existentes;
- acompanhar status.

Admin app:

- triagem por votos/status/categoria;
- rejeicao exige motivo;
- entregue pode acionar broadcast posterior.

## Empty/Error States

Toda tela deve ter:

- estado vazio com proxima acao concreta;
- erro especifico;
- loading inline, sem tela branca;
- bloqueio read-only visivel e link para `/planos`.
