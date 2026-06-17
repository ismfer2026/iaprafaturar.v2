# PRD — Edge Functions v2

_Todas as Edge Functions com responsabilidade, autenticação, inputs/outputs e dependências._

## Implementação Fase 26 — Fechamento de Edge Functions

- Diretórios locais e funções ativas foram reconciliados.
- `invite-team-member` foi endurecida com contrato Zod, erros curados e publicada no remoto.
- `public-booking-handler` foi corrigida e publicada para retornar `404` curado em slug inexistente.
- O diretório vazio legado `platform-create-checkout-session` foi removido; `platform-checkout` é o owner canônico.
- As 41 funções locais e remotas foram reconciliadas sem diferença.
- O audit executável impede handlers públicos sem rate limit/configuração explícita e diretórios incompletos.

---

## Convenções

- Runtime: Deno (Supabase Edge Functions)
- Autenticação interna: header `x-nerissa-internal-token` com timing-safe compare
- Todos os agentes reservam créditos ANTES de chamar IA, commit após resposta
- `verify_jwt` no `config.toml` só `true` para funções chamadas pelo frontend autenticado
- Todas as funções retornam `{ error }` com HTTP 4xx/5xx em caso de falha

---

## 1. Pipeline WhatsApp — Profissional

### webhook-whatsapp
```
verify_jwt: false
Proteção: HMAC EVOLUTION_WEBHOOK_SECRET (timing-safe)
Trigger: Evolution Go → POST a cada mensagem recebida na instância do profissional

Responsabilidade:
  1. Validar assinatura HMAC
  2. Extrair payload canônico (tipo, phone, instanceName, messageId, mediaType)
  3. Ignorar: fromMe=true, grupos, broadcasts, status
  4. Resolver rota: getPhoneRouting(phone, instanceName)
     → por instância (professional) → por telefone global → unknown
  5. Registrar em message_events (direction='inbound')
  6. Se mídia: chamar audio-processor / image-processor / document-processor
  7. Debounce Redis (4s): acumular mensagens simultâneas
  8. Publicar no QStash para message-processor
  9. Fallback direto se QStash indisponível

Input: Evolution Go webhook payload
Output: { received: true }
Deps: _shared/evolution-payload.ts, _shared/redis.ts, QStash
```

### message-processor
```
verify_jwt: false
Proteção: x-nerissa-internal-token OU QStash signature
Trigger: QStash (publicado pelo webhook-whatsapp)

Responsabilidade:
  1. Validar QStash ou token interno
  2. Drenar buffer Redis (combinar mensagens do debounce)
  3. Identificar cliente por phone dentro do professional_id
  4. Detectar resposta de confirmação/cancelamento ANTES do orquestrador
     → Sim/Ok/Confirmo → appointments.status='confirmado'
     → Não/Cancelar → appointments.status='cancelado' + notificação profissional
  5. Classificar: business / support / appointment / private / unknown
  6. Se private sem contexto ativo → ignorar (registrar ignored_private)
  7. Criar/retomar conversation em conversations
  8. Se shadow_mode ativo → gerar sugestão em shadow_suggestions, não enviar
  9. Chamar orchestrator-agent
  10. Se shadow_mode inativo → enviar resposta via evolution-go

Input: { professional_id, phone, messages[], conversation_id? }
Output: { processed: true, shadow?: true }
Deps: orchestrator-agent, _shared/evolution-go.ts, _shared/redis.ts
```

### orchestrator-agent
```
verify_jwt: false
Proteção: x-nerissa-internal-token
Trigger: message-processor

Responsabilidade:
  1. Carregar perfil do cliente, histórico de sessões, contexto ativo
  2. Carregar persona do profissional (personas.system_prompt)
  3. Detectar intenção com claude-haiku (fast tier):
     agendamento / duvida / feedback / lembrete_resposta / indicacao / conversa_casual / objecao / outro
  4. Retomar sessão de agente ativa (conversation_contexts) se existir
  5. Guardar: conversa_casual fora de contexto relationship → ignorar
  6. Delegar para subagente:
     agendamento → agendamento-agent
     duvida/outro → duvidas-agent
     feedback → pos-atendimento-agent
     lembrete_resposta → lembrete-agent
     indicacao → indicacao-agent
     conversa_casual → relacionamento-agent (se contexto ativo)
     objecao → objecoes-agent
  7. Salvar memórias relevantes
  8. Escalar insatisfação detectada (3+ consecutivos) → notificação urgente

Input: { professional_id, client_id, messages[], conversation_id, channel }
Output: { response_text, agent_slug, tokens_used }
Deps: todos os agentes, _shared/ai-client.ts, _shared/conversation-context.ts
```

---

## 2. Agentes do Profissional (Rosane)

### duvidas-agent
```
verify_jwt: false
Proteção: x-nerissa-internal-token
Trigger: orchestrator-agent

Responsabilidade:
  Responder dúvidas sobre serviços, preços, localização, horários, procedimentos.
  Consulta: services, professionals.settings.business_hours, professionals.full_address
  NÃO inventa informações — só responde com dados do banco.
  Se não souber → oferece contato direto com profissional.
  
  Tier IA: smart (Sonnet)
  
Input: { professional_id, client_id, messages[], context }
Output: { response_text, tokens_used }
```

### agendamento-agent
```
verify_jwt: false
Proteção: x-nerissa-internal-token
Trigger: orchestrator-agent

Responsabilidade:
  1. Verificar disponibilidade (appointments livres no horário)
  2. Perguntar serviço desejado se não especificado
  3. Apresentar slots disponíveis
  4. Confirmar e criar appointment
  5. Atualizar clients.journey_stage = 'agendado'
  6. Criar professional_notification de novo agendamento
  7. Criar anamnese_ficha e enviar link se template configurado
  8. Criar proactive_trigger para lembrete (D-2 e D-1)
  
  Verificação de conflito: nenhum appointment no mesmo horário + duração
  
  Tier IA: smart (Sonnet)

Input: { professional_id, client_id, messages[], context }
Output: { response_text, appointment_id?, tokens_used }
```

### lembrete-agent
```
verify_jwt: false
Proteção: x-nerissa-internal-token
Trigger: cron (diário 08:00) via proactive-triggers

Responsabilidade:
  1. Buscar appointments de amanhã (D-1) com reminder_sent=false
  2. Para cada appointment:
     a. Gerar mensagem personalizada (nome, hora, serviço, local)
     b. Enviar via evolution-go
     c. Marcar reminder_sent=true
     d. Registrar agent_executions com appointment_id no metadata
     e. Criar conversation_context tipo 'reminder'
  3. Registrar em proactive_trigger_logs

  Tier IA: fast (Haiku) — para personalizar texto

Input: { professional_id } OU broadcast de todos os profissionais
Output: { sent_count, failed_count }
```

### pos-atendimento-agent
```
verify_jwt: false
Proteção: x-nerissa-internal-token
Trigger: proactive-triggers (D+1 após sessão concluída)

Responsabilidade:
  1. Enviar mensagem de acompanhamento pós-sessão
  2. Coletar NPS (escala 1-5 via WhatsApp)
  3. Salvar sessions.nps_score e sessions.nps_comment
  4. Se NPS 4-5: ativar indicacao-agent após cooldown de 24h (J9)
  5. Se NPS 1-2: criar notification urgente para profissional
  6. Não oferecer agendamento imediatamente — deixar cliente digerir
  
  Tier IA: smart (Sonnet)

Input: { professional_id, client_id, session_id }
Output: { response_text, nps_captured?: boolean }
```

### indicacao-agent
```
verify_jwt: false
Proteção: x-nerissa-internal-token
Trigger: pos-atendimento-agent (NPS 4-5) OU proactive-triggers

Pré-condições:
  - NPS >= 4
  - sessions_count >= config.min_sessions (default: 3)
  - cooldown >= 30 dias desde última indicação
  - Não é período de aniversário (±3 dias)

Responsabilidade:
  1. Extrair nome+telefone do indicado via conversa (modelo Wiseup)
  2. Criar referral_link para o indicador
  3. Criar clients (lead) com source='indicacao', referral_client_id
  4. Iniciar fluxo de outreach para o indicado
  5. Registrar referral_event
  6. Conceder pontos de fidelidade ao indicador (loyalty_transactions)
  7. Criar funnel_opportunity no funil do profissional

  Tier IA: smart (Sonnet)

Input: { professional_id, client_id, session_id, nps_score }
Output: { response_text, referral_link_id?, tokens_used }
```

### reativacao-agent
```
verify_jwt: false
Proteção: x-nerissa-internal-token
Trigger: proactive-triggers (cliente inativo > threshold configurado)

Responsabilidade:
  1. Verificar inatividade (última sessão > threshold dias)
  2. Personalizar mensagem com referência à última sessão
  3. Máximo 3 tentativas (D0, D+14, D+30)
  4. Se responder com interesse → agendamento-agent
  5. Se não responder após 3 tentativas → marcar journey_stage='inativo'
  6. Registrar proactive_trigger_log

  Tier IA: smart (Sonnet)

Input: { professional_id, client_id, inactivity_days, attempt_number }
Output: { response_text, tokens_used }
```

### relacionamento-agent
```
verify_jwt: false
Proteção: x-nerissa-internal-token
Trigger: proactive-triggers (check-in proativo)

Pré-condições:
  - Máximo 1 check-in por cliente por mês
  - Sem mensagem nos últimos 14 dias
  - Sem pagamento em aberto
  - Sem campanha no período de aniversário

Responsabilidade:
  Tom 100% pessoal — sem CTA comercial.
  Gatilhos: intervalo configurado, evento mencionado, marco pessoal, cliente frequente parado.
  Se cliente mencionar serviço espontaneamente → pode oferecer agendamento.
  Caso contrário → encerrar naturalmente sem CTA.

  Tier IA: smart (Sonnet)

Input: { professional_id, client_id, trigger_reason, context? }
Output: { response_text, tokens_used }
```

### objecoes-agent
```
verify_jwt: false
Proteção: x-nerissa-internal-token
Trigger: orchestrator-agent (intenção 'objecao')

Responsabilidade:
  Tratar objeções comuns: preço, tempo, "vou pensar", "não é para mim".
  Não pressionar — ouvir, validar, apresentar perspectiva.
  Máximo 2 tentativas de superar a objeção por conversa.
  Se objeção persistir → agradecer e registrar como lost no funil.

  Tier IA: smart (Sonnet)

Input: { professional_id, client_id, objection_text, context }
Output: { response_text, tokens_used }
```

### cadastro-agent
```
verify_jwt: false
Proteção: x-nerissa-internal-token
Trigger: webhook-whatsapp (rota unknown com intenção de cadastro)

Responsabilidade:
  Atender prospect via WhatsApp Nerissa que quer criar conta.
  Coletar: nome, profissão, cidade.
  Criar/atualizar professionals (onboarding_source='whatsapp_direct').
  Encaminhar para nerissa-setup-agent após coleta básica.

Input: { phone, message, existing_professional? }
Output: { response_text }
```

### aniversariantes-agent
```
verify_jwt: false
Proteção: x-nerissa-internal-token
Trigger: cron (diário 09:00)

Responsabilidade:
  1. Buscar clientes com aniversário hoje por profissional
  2. Verificar cooldown (não enviou mensagem de aniversário este ano)
  3. Gerar mensagem baseada na configuração:
     - Com oferta: incluir oferta configurada + validade
     - Sem oferta: mensagem social pura
  4. Enviar via evolution-go (instância do profissional)
  5. Registrar proactive_trigger_log com type='aniversario'
  6. Bloquear Motor Orgânico de indicação por ±3 dias no proactive_triggers

  Tier IA: fast (Haiku) — personalização da mensagem

Input: { professional_id? } — broadcast ou específico
Output: { sent_count }
```

### upsell-agent
```
verify_jwt: false
Proteção: x-nerissa-internal-token
Trigger: proactive-triggers (type='upsell')

Pré-condições:
  - Regra configurada pelo profissional em professional_agents.agent_configs.upsell
  - Máximo 1 upsell por cliente por mês
  - Sem pagamento em aberto
  - Fora do período de aniversário

Responsabilidade:
  1. Verificar qual regra disparou (sessions_count, time_without_package, etc.)
  2. Se shadow_mode para upsell: criar shadow_suggestion + notificar profissional
  3. Se automático: gerar e enviar mensagem de oferta
  4. Registrar proactive_trigger_log com type='upsell'
  5. Acompanhar resposta via conversation_context

  Tier IA: smart (Sonnet)

Input: { professional_id, client_id, rule_config, trigger_id }
Output: { response_text, tokens_used }
```

---

## 3. Processadores de Mídia

### audio-processor
```
verify_jwt: false
Proteção: x-nerissa-internal-token
Trigger: webhook-whatsapp (mediaType='audio')

Responsabilidade:
  1. Ler payload de áudio do Redis (queue:audio_conversion:{message_id})
  2. Transcrever via Whisper/Anthropic (limite: 10 MB, 5 min)
  3. Retornar texto transcrito para message-processor ou admin-message-processor
  4. Se falha: retornar "[Áudio não pôde ser transcrito]"

Input: { message_id, audio_url, professional_id }
Output: { transcription }
```

### image-processor
```
verify_jwt: false
Proteção: x-nerissa-internal-token
Trigger: webhook-whatsapp (mediaType='image')

Responsabilidade:
  1. Baixar imagem
  2. Descrever via Claude Vision (claude-sonnet-4-6 com vision)
  3. Retornar descrição textual
  4. Marcar: "NUNCA fazer diagnóstico clínico — apenas descrever"

Input: { message_id, image_url, professional_id }
Output: { description }
```

### document-processor
```
verify_jwt: false
Proteção: x-nerissa-internal-token
Trigger: webhook-whatsapp (mediaType='document')

Responsabilidade:
  1. Baixar documento (PDF, Word)
  2. Extrair texto (limite: 20 MB)
  3. Retornar texto extraído + metadados
  4. Marcar como exame/documento médico se detectado

Input: { message_id, document_url, professional_id }
Output: { text, document_type? }
```

---

## 4. Pipeline Admin / Nerissa

### webhook-admin
```
verify_jwt: false
Proteção: HMAC ADMIN_EVOLUTION_WEBHOOK_SECRET
Trigger: Evolution Go → instância admin/Nerissa

Responsabilidade:
  1. Validar assinatura admin
  2. Ignorar: fromMe, grupos, broadcasts
  3. Registrar message_events (direction='inbound', channel='whatsapp') com source_webhook='admin'
  4. Detectar mídia
  5. Debounce Redis (chave admin:conv:{phone})
  6. Publicar para admin-message-processor

Input: Evolution Go webhook payload
Output: { received: true }
```

### admin-message-processor
```
verify_jwt: false
Proteção: x-nerissa-internal-token OU QStash
Trigger: QStash (publicado pelo webhook-admin)

Roteamento:
  1. Se ISMAEL_PHONE → admin-ai-gateway (Nexus)
  2. Se lead conhecido OU intenção de venda → sales-agent
  3. Se profissional registrado:
     - Setup pendente → nerissa-setup-agent
     - Suporte → support-agent
  4. Desconhecido → sales-agent

Input: { phone, messages[], route_hint? }
Output: { processed: true }
```

### admin-ai-gateway
```
verify_jwt: false
Proteção: x-nerissa-internal-token
Trigger: admin-message-processor (Ismael)

Responsabilidade:
  Interface conversacional do Nexus para Ismael via WhatsApp.
  Capacidades:
  - Consultar dados da plataforma (profissionais, leads, métricas)
  - Executar ações com confirmação (aprovar afiliado, enviar broadcast)
  - Alertas proativos da plataforma
  
  Tier IA: deep (Opus)

Input: { phone, messages[], admin_context }
Output: { response_text }
```

### sales-agent (Nerissa)
```
verify_jwt: false
Proteção: x-nerissa-internal-token
Trigger: admin-message-processor

Responsabilidade:
  Qualificar leads interessados no iaprafaturar.
  Fluxo: interesse → qualificação → demo → proposta → conversão.
  Criar/atualizar sales_leads.
  Se convertido → criar professional + iniciar nerissa-setup-agent.
  Sequência de follow-up: D+1, D+3, D+7.

  Tier IA: smart (Sonnet)

Input: { phone, messages[], lead_id? }
Output: { response_text }
```

### nerissa-setup-agent
```
verify_jwt: false
Proteção: x-nerissa-internal-token
Trigger: admin-message-processor, nerissa-lifecycle cron

Modos:
  - account_created: boas-vindas e início do checklist
  - reply: resposta a mensagem do profissional durante setup
  - status: verificar status e próximos passos
  - lifecycle_sweep: varredura de setups atrasados
  - resume_due_followups: retomar setups pausados

Responsabilidade:
  Guiar profissional pelo setup: WhatsApp, serviços, agenda, agentes, financeiro, plano.
  Atualizar nerissa_setup_sessions e nerissa_setup_items.
  Quando setup completo → marcar professionals.onboarding_completed=true.
  
  Tier IA: smart (Sonnet)

Input: { professional_id, mode, message? }
Output: { response_text }
```

### support-agent
```
verify_jwt: false
Proteção: x-nerissa-internal-token
Trigger: admin-message-processor

Responsabilidade:
  Atender profissionais com problemas/dúvidas sobre a plataforma.
  FAQs comuns: configuração WhatsApp, créditos, Rosane não responde, exportar dados.
  Escalar para Ismael se não resolver.

  Tier IA: smart (Sonnet)

Input: { professional_id, phone, messages[] }
Output: { response_text }
```

---

## 5. Agentes Proativos e Crons

### proactive-triggers
```
verify_jwt: false
Proteção: x-nerissa-internal-token
Trigger: pg_cron (a cada 6h)

Responsabilidade:
  Varrer proactive_triggers com status='pending' e scheduled_for <= now().
  Para cada trigger:
    - Verificar cooldowns (aniversário, mensagem recente, pagamento aberto)
    - Verificar créditos disponíveis
    - Chamar o agente correspondente
    - Atualizar proactive_trigger_log

  Também cria novos triggers baseado em condições:
    - Cliente inativo (falta_sessao, inatividade)
    - RFM em risco (rfm_churn)
    - Regras de upsell configuradas pelo profissional

Input: {} (cron sem parâmetros)
Output: { processed_count, failed_count }
```

### calculate-rfm
```
verify_jwt: false
Proteção: x-nerissa-internal-token
Trigger: pg_cron (segunda-feira 03:00)

Responsabilidade:
  Para cada professional_id ativo:
    Para cada client_id:
      Calcular recency (dias desde última sessão → score 1-5)
      Calcular frequency (sessões nos últimos 90 dias → score 1-5)
      Calcular monetary (receita nos últimos 90 dias → score 1-5)
      Mapear para segmento (champions, at_risk, etc.)
      Upsert em rfm_scores

Input: {} (cron)
Output: { updated_count }
```

### calculate-health-scores
```
verify_jwt: false
Proteção: x-nerissa-internal-token
Trigger: pg_cron (diário 04:00)

Responsabilidade:
  CLIENT HEALTH (por cliente):
    recency_score (0-35): baseado em dias desde última sessão
    frequency_score (0-25): frequência relativa vs histórico pessoal
    nps_score (0-25): média NPS últimas 3 sessões
    financial_score (0-15): pagamentos em dia vs total
    package_bonus (0 ou +10): tem pacote ativo
    → Upsert em client_health_scores
    → Se total_score < 30 → criar proactive_trigger reativação

  PLATFORM HEALTH (por profissional):
    Calcular 6 fatores → upsert professional_platform_health_scores
    Se health_level mudou para 'critico' → notificação Nerissa

Input: {} (cron)
Output: { clients_updated, professionals_updated }
```

### calculate-lead-scores
```
verify_jwt: false
Proteção: x-nerissa-internal-token
Trigger: pg_cron (diário 07:00)

Responsabilidade:
  Para clientes com journey_stage='lead':
    message_frequency: mensagens nos últimos 7 dias
    price_inquiry: perguntou preço ou disponibilidade (NLP simples)
    recency: dias desde primeiro contato
    Calcular score 0-100 → upsert lead_scores
    Se score > 90 → criar professional_notification tipo 'lead_hot'

Input: {} (cron)
Output: { updated_count }
```

### insight-analyzer
```
verify_jwt: false
Proteção: x-nerissa-internal-token
Trigger: pg_cron (diário 11:00)

Responsabilidade:
  Para cada profissional ativo:
    Analisar dados das últimas 4 semanas:
      - Concentração de receita (top 3 clientes)
      - Horários vagos recorrentes
      - Taxa de retorno vs mês anterior
      - Pacotes terminados sem renovação
    Gerar insight textual via claude-opus-4-7
    Inserir em professional_insights (máx 1 insight por tipo por semana)

  Tier IA: deep (Opus) — análise profunda

Input: {} (cron)
Output: { insights_generated }
```

### weekly-metrics
```
verify_jwt: false
Proteção: x-nerissa-internal-token
Trigger: pg_cron (sábado 08:00)

Responsabilidade:
  Para cada profissional com notificação weekly_metrics habilitada:
    Calcular semana anterior: sessões, faturamento, novos clientes, NPS médio
    Comparar com semana anterior (-1)
    Gerar resumo textual
    Enviar por push (professional_notifications)
    Se whatsapp_enabled para financeiro → enviar via evolution-go

Input: {} (cron)
Output: { sent_count }
```

### briefing-matinal
```
verify_jwt: false
Proteção: x-nerissa-internal-token
Trigger: pg_cron (diário 07:30)

Responsabilidade:
  Para cada profissional com briefing habilitado:
    Buscar appointments de hoje
    Buscar faturamento do mês até hoje vs meta
    Buscar alertas pendentes
    Montar mensagem de briefing
    Enviar push + WhatsApp pessoal (instância de gestão se configurada)

Input: {} (cron)
Output: { sent_count }
```

### rlhf-extraction
```
verify_jwt: false
Proteção: x-nerissa-internal-token
Trigger: pg_cron (a cada 2h)

Responsabilidade:
  1. Buscar shadow_suggestions com rlhf_processed=false
  2. Para cada diff (suggested vs actual):
     Chamar claude-haiku para extrair padrão comportamental
     Inserir em rlhf_diffs com pattern_detected
  3. Agregar em rlhf_rules se padrão aparece > 3x
  4. Marcar shadow_suggestions.rlhf_processed=true

  Tier IA: fast (Haiku)

Input: {} (cron)
Output: { processed_count }
```

### persona-synthesis
```
verify_jwt: false
Proteção: x-nerissa-internal-token
Trigger: pg_cron (a cada 3h)

Responsabilidade:
  Para profissionais com rlhf_rules novos desde última síntese:
    Consolidar rules ativas
    Gerar system_prompt via claude-opus-4-7
    Upsert personas
    Incrementar personas.version

  Tier IA: deep (Opus)

Input: {} (cron)
Output: { updated_count }
```

---

## 6. Financeiro e Billing

### stripe-webhook
```
verify_jwt: false
Proteção: stripe-signature header + STRIPE_WEBHOOK_SECRET
Trigger: Stripe POST (eventos de billing SaaS)

Eventos tratados:
  checkout.session.completed → criar/atualizar professional_subscriptions
  customer.subscription.updated → atualizar status/plano
  customer.subscription.deleted → cancelar subscription + rebaixar plano
  invoice.paid → adicionar créditos mensais do plano (credit_wallets)
  invoice.payment_failed → notificar profissional

Input: Stripe event payload
Output: { received: true }
```

### create-checkout
```
verify_jwt: true  (chamado pelo frontend autenticado)
Proteção: JWT Supabase

Responsabilidade:
  1. Identificar professional_id do JWT
  2. Criar/recuperar Stripe customer
  3. Criar Stripe checkout session para plano ou créditos
  4. Retornar URL do checkout

Input: { price_id, success_url, cancel_url }
Output: { checkout_url }
```

### payment-webhook
```
verify_jwt: false
Proteção: ?provider={provider} + webhook_secret do gateway
Trigger: Asaas / Mercado Pago / EfiBank POST

Responsabilidade:
  1. Identificar provider do query param
  2. Validar assinatura do provider
  3. Extrair financial_transaction correspondente por gateway_transaction_id
  4. Atualizar status (pago, cancelado, estornado)
  5. Criar professional_notification (payment_received)
  6. Se parcela → criar próximas parcelas se necessário

Input: gateway event payload
Output: { received: true }
```

### admin-broadcast

```
verify_jwt: true
Proteção: master admin ou token interno
```

Responsabilidade:
- selecionar audiência administrativa sem consultar campanhas profissionais;
- persistir broadcast e destinatários antes do envio;
- manter `dry_run` seguro, idempotência por destinatário e falha parcial consultável;
- usar somente a instância WhatsApp admin;
- não simular entrega ou leitura sem evento confiável do provedor.

**Implementação Fase 24:** `admin-broadcast` é o orquestrador idempotente e assíncrono. Ele publica `admin-broadcast-worker` via QStash; o worker usa claim atômico, lotes, rate limit, retry/backoff, recuperação de locks e `dead_letter`. Histórico canônico permanece em `platform_broadcasts` e `platform_broadcast_recipients`.

### admin-broadcast-worker

```
verify_jwt: false
Proteção: INTERNAL_FUNCTION_TOKEN encaminhado pelo QStash
```

Responsabilidade:
- obter lote por `phase24_claim_broadcast_batch` com `FOR UPDATE SKIP LOCKED`;
- enviar no máximo 10 destinatários por execução com espaçamento;
- registrar sucesso ou falha por `phase24_complete_broadcast_recipient`;
- reagendar trabalho pendente e retries pelo QStash;
- registrar publicação, consumo, falha e `dead_letter` em `qstash_job_log`.

### affiliate-commission-cron
```
verify_jwt: false
Proteção: x-nerissa-internal-token
Trigger: pg_cron (dia 5 de cada mês)

Responsabilidade:
  Para cada affiliate_partner approved:
    Calcular receita dos referidos no mês anterior
    Calcular comissão (commission_rate %)
    Inserir affiliate_commissions (status='calculated')

Input: {} (cron)
Output: { calculated_count }
```

---

## 7. Documentos

### enviar-orcamento
```
verify_jwt: true
Proteção: JWT Supabase

Responsabilidade:
  1. Gerar PDF do orçamento (html-pdf ou puppeteer)
  2. Upload para bucket orcamentos-pdf
  3. Se via WhatsApp → enviar link via evolution-go (instância do profissional)
  4. Se via email → enviar via Resend + SMTP do profissional
  5. Atualizar quotes.status='enviado', quotes.sent_at, quotes.pdf_url
  6. Criar proactive_trigger para follow-up D+2

Input: { quote_id, channel: 'whatsapp'|'email' }
Output: { pdf_url, sent: true }
```

### processar-contrato-docx
```
verify_jwt: true
Proteção: JWT Supabase

Responsabilidade:
  1. Carregar template DOCX do Storage
  2. Substituir variáveis (docxtemplater)
  3. Gerar PDF
  4. Upload para orcamentos-pdf
  5. Criar solicitação de assinatura (ClickSign/DocuSign)
  6. Atualizar contracts com signature_request_id

Input: { contract_id }
Output: { pdf_url, signature_url }
```

### email-inbound
```
verify_jwt: false
Proteção: Resend webhook signature
Trigger: Resend POST (email recebido no endereço {slug}@mail.iaprafaturar.com)

Responsabilidade:
  1. Validar assinatura Resend
  2. Identificar slug → professional_id
  3. Identificar cliente por email remetente (clients.email)
  4. Criar/retomar conversation com channel='email'
  5. Chamar orchestrator-agent com source_channel='email'
  6. Resposta da Rosane enviada via SMTP do profissional (Resend)

Input: Resend inbound email payload
Output: { processed: true }
```

---

## 8. Notificações e PWA

### push-notifications
```
verify_jwt: false
Proteção: x-nerissa-internal-token
Trigger: chamado por outros agentes/workers quando necessário

Responsabilidade:
  1. Inserir em professional_notifications
  2. Se push_enabled para a categoria → enviar via OneSignal OU Web Push nativo
  3. Verificar quiet_hours antes de enviar (exceto priority='critical')
  4. Retornar {sent: true/false, reason}

Input: { professional_id, type, category, title, body, data, priority }
Output: { sent: boolean }
```

### send-message
```
verify_jwt: false
Proteção: Service Role key APENAS
Trigger: interno (admin tools, testes)

Responsabilidade:
  Enviar mensagem WhatsApp para qualquer instância.
  Restrito a service_role — nunca chamado por usuário final.

Input: { instanceId, number, text }
Output: { ok: boolean }
```

---

## 9. Infraestrutura

### redis-sweeper
```
verify_jwt: false
Proteção: x-nerissa-internal-token
Trigger: pg_cron (diário 02:00)

Responsabilidade:
  Limpar chaves Redis expiradas de debounce, locks e cache de roteamento.

Input: {} (cron)
Output: { cleaned_count }
```

### reservation-recovery
```
verify_jwt: false
Proteção: x-nerissa-internal-token
Trigger: pg_cron (a cada 30 min)

Responsabilidade:
  Buscar credit_transactions do tipo 'reservation' com mais de 10 minutos sem commit.
  Liberar créditos reservados (release_credits RPC).
  Registrar em credit_transactions tipo 'release'.

Input: {} (cron)
Output: { released_count }
```

### key-rotation-fanout
```
verify_jwt: false
Proteção: x-nerissa-internal-token
Trigger: manual ou cron

Responsabilidade:
  Distribuir rotação de chave interna (x-nerissa-internal-token) para todas as functions.
  Usa fanout pattern para não deixar janela de invalidade.

Input: { new_token_hash }
Output: { updated_count }
```

### platform-health-agent
```
verify_jwt: false
Proteção: x-nerissa-internal-token
Trigger: cron diário + chamada manual

Responsabilidade:
  Verificar saúde da plataforma:
    - Funções com erro rate > threshold
    - Redis down
    - QStash com filas acumuladas
    - Créditos da plataforma baixos
  Enviar alerta para Ismael via admin-ai-gateway

Input: {} (cron)
Output: { alerts_sent }
```

---

## Resumo de Todas as Functions (47 total)

| Função | Proteção | Fase |
|---|---|---|
| webhook-whatsapp | HMAC | 2 |
| message-processor | Internal token / QStash | 2 |
| orchestrator-agent | Internal token | 2 |
| duvidas-agent | Internal token | 2 |
| agendamento-agent | Internal token | 2 |
| lembrete-agent | Internal token | 2 |
| pos-atendimento-agent | Internal token | 3 |
| indicacao-agent | Internal token | 3 |
| reativacao-agent | Internal token | 3 |
| relacionamento-agent | Internal token | 3 |
| objecoes-agent | Internal token | 3 |
| cadastro-agent | Internal token | 3 |
| aniversariantes-agent | Internal token | 9 |
| upsell-agent | Internal token | 9 |
| audio-processor | Internal token | 2 |
| image-processor | Internal token | 2 |
| document-processor | Internal token | 2 |
| webhook-admin | HMAC admin | 11 |
| admin-message-processor | Internal token / QStash | 11 |
| admin-ai-gateway | Internal token | 11 |
| sales-agent | Internal token | 11 |
| nerissa-setup-agent | Internal token | 3 |
| support-agent | Internal token | 11 |
| proactive-triggers | Internal token | 9 |
| calculate-rfm | Internal token | 10 |
| calculate-health-scores | Internal token | 10 |
| calculate-lead-scores | Internal token | 10 |
| insight-analyzer | Internal token | 10 |
| weekly-metrics | Internal token | 10 |
| briefing-matinal | Internal token | 12 |
| rlhf-extraction | Internal token | 3 |
| persona-synthesis | Internal token | 3 |
| stripe-webhook | Stripe signature | 8 |
| create-checkout | JWT Supabase | 8 |
| payment-webhook | Gateway signature | 6 |
| affiliate-commission-cron | Internal token | 8 |
| enviar-orcamento | JWT Supabase | 5 |
| processar-contrato-docx | JWT Supabase | 5 |
| email-inbound | Resend signature | 9 |
| push-notifications | Internal token | 12 |
| send-message | Service Role | 2 |
| redis-sweeper | Internal token | 0 |
| reservation-recovery | Internal token | 8 |
| key-rotation-fanout | Internal token | 0 |
| platform-health-agent | Internal token | 11 |
| nerissa-lifecycle | Internal token | 11 |
| smtp-config | JWT Supabase | 1 |
# Implementação Fase 25 — Handlers públicos

Em 2026-06-14, os handlers públicos foram consolidados sob o mesmo padrão:

- `public-booking-handler`, `client-portal-handler`, `anamnese-public-handler`, `public-appointment-actions`, `public-package-handler`, `public-quote-handler` e `public-chat-handler`;
- todos usam contrato runtime compartilhado em `@iaprafaturar/contracts`;
- todos aplicam `claim_public_request_rate_limit()` antes da operação;
- chave antiabuso usa IP + sujeito com SHA-256; tokens e PII não são persistidos em texto;
- erros públicos usam envelope mínimo e não retornam mensagens SQL;
- todos são publicados com `verify_jwt = false`, mas usam somente RPCs `service_role` curadas;
- `public-chat-handler` continua sendo o único chat público e não envia WhatsApp automaticamente.
