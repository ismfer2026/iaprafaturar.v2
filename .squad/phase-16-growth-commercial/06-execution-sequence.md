# Sequencia de Execucao - Fase 16

## Regra de Trabalho

Nao executar implementacao em lote unico. Cada subfase deve passar por:

1. diff contra schema existente;
2. migration pequena;
3. review de grants/RLS;
4. typecheck/build;
5. deploy isolado quando aplicavel;
6. atualizacao do QA checklist.

## Ordem Go/No-Go

### 16a - Funil RevOps

Go quando:
- schema guard aprovar tabelas novas;
- regra `funnel_opportunities.stage_id` vs `clients.journey_stage` estiver documentada;
- UX mobile 390px estiver definida.

Entregas:
- migration funil;
- RPCs de board/movimentacao/historico;
- `/funil` mobile list + desktop kanban.

### 16b - Campaigns Extension

Go quando:
- diff contra `campaigns`, `campaign_recipients`, `campaign_dispatches` estiver aprovado;
- estiver claro se resultados serao agregados via query ou snapshot.

Entregas:
- segmentacao avancada;
- cooldown por canal;
- resultado por motivo de bloqueio/envio/conversao.

### 16c - Referral + Loyalty

Go quando:
- plano confirmar que `referral_events` sera reusada, nunca recriada;
- evento de conversao validada estiver definido.

Entregas:
- configuracao do programa;
- ledger de pontos;
- recompensa por conversao validada.

### 16d - Health + Reactivation

Go quando:
- formula `phase16_v1` estiver especificada;
- campos de reativacao da Fase 8 estiverem preservados.

Entregas:
- health score explicavel;
- reativacao com cooldown, tentativas e opt-out.

### 16e - Upsell Metrics

Go quando:
- reversao anterior do `upsell-agent` estiver documentada;
- criterios de pacote perto do fim/RFM/frequencia estiverem fechados.

Entregas:
- elegibilidade melhorada;
- metricas por estado;
- shadow suggestion continua default.

### 16f - E-mail Channel

Go tecnico:
- schema de opt-out/auditoria aprovado.

Go para envio real:
- usuario aprovar Resend/SMTP, credenciais e custo.

Entregas:
- preferencias por canal;
- dispatch/auditoria;
- Edge Function em dry-run ate aprovacao.

### 16g - Public Chat

Go quando:
- funil estiver pronto para receber lead do chat;
- anti-spam/rate limit definido.

Entregas:
- public chat handler;
- conversa rastreavel;
- handoff para profissional;
- criacao de lead/oportunidade.

## Criterio de Fechamento da Fase 16

A Fase 16 so pode ser marcada como concluida quando todos os itens do DoD do PRD estiverem verificados em codigo, banco remoto, functions deployadas quando houver, frontend publicado e checklist de seguranca sem pendencias bloqueantes.
