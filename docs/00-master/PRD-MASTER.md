# PRD-MASTER — iaprafaturar v2

> Este é o documento soberano. Quando houver conflito entre PRDs, este manda.
> Não contém DDL completo — referencia os PRDs de detalhe para isso.
> Agentes e desenvolvedores só implementam com base em documento aprovado e versionado.
> Rascunhos, inventários e comparações v1/v2 são contexto histórico — não regra de produto.

---

## 1. Visão do Produto

O iaprafaturar é o braço operacional de profissionais de saúde e beleza que trabalham sozinhos ou com equipes pequenas. Não tem secretária. Não tem equipe de marketing. Não tem horas sobrando.

O produto existe para que esses profissionais terminem o dia sem ter pensado no app — apenas percebido que a agenda estava cheia, os clientes responderam, e o financeiro fechou. A IA (Rosane, crons, agentes) trabalha nos bastidores. A UI existe para as exceções.

**O que o produto faz:**
- Recebe, classifica e responde mensagens de WhatsApp pelo profissional (Rosane)
- Gerencia agenda, sessões, clientes e financeiro num app mobile-first
- Onboard novos profissionais via WhatsApp (Nerissa)
- Automatiza lembretes, confirmações, follow-ups, indicações e reativações
- Fornece contexto de negócio para o profissional agir com precisão

**O que o produto não é:**
- Prontuário eletrônico clínico completo
- ERP financeiro
- Sistema de BI com dezenas de dashboards
- Plataforma de e-commerce

---

## 2. Personas

### Profissional (usuário principal)
Fisioterapeuta, massoterapeuta, dentista, nutricionista, esteticista — trabalha em clínica própria ou consultório. Atende 6 a 20 clientes por dia. Usa o app pelo celular entre atendimentos. Não tem tolerância para interface confusa.

### Membro de Equipe (usuário secundário interno)
Secretária, recepcionista ou assistente contratado pelo profissional. Acessa o CRM com role `operacional` — gerencia agenda e clientes, mas não acessa financeiro nem configurações avançadas. Não tem conta própria de profissional.

### Cliente do Profissional (usuário externo)
Paciente que agenda, recebe confirmações e lembretes via WhatsApp, preenche anamnese pelo link público. Não baixa nenhum app. Não tem conta no sistema.

### Admin (interno — Ismael)
Gerencia a plataforma: onboard profissionais via WhatsApp (Nerissa), monitora saúde da plataforma, resolve problemas, dispara campanhas da plataforma.

---

## 3. Invariantes — Regras que Nunca Podem Ser Quebradas

### 3.1 WhatsApp

1. **Dois canais, dois universos.** Instância admin (Nerissa) nunca fala com clientes de profissionais. Instância do profissional (Rosane) nunca fala com outros profissionais. Separação enforced por HMAC secrets distintos.
2. **Webhook sempre retorna 200.** Se houver erro interno, logar e retornar 200. Evolution Go interpreta não-200 como falha e reenvia — causando processamento duplicado.
3. **Idempotência por chave composta.** Claim atômico em idempotency_log com chave `source_webhook + instance_name + external_message_id` antes de processar. Mesmo webhook pode chegar 2x (Evolution Go reenvia em não-200).
4. **Logar antes de processar.** message_events registra o inbound ANTES de qualquer lógica de agente. Se o agente falhar, a mensagem ainda está registrada.
5. **Processamento assíncrono.** Webhook faz mínimo (validar, logar, debounce, enfileirar). Agente roda via QStash — nunca dentro do webhook handler.
6. **WhatsApp pessoal e Business são ambos suportados.** Evolution Go conecta os dois via QR code. WhatsApp Business é recomendado (mais estável, menor risco de ban pela Meta), mas nunca é bloqueador de onboarding. Durante a FASE 2, Nerissa informa os riscos do número pessoal e oferece guia de migração para Business. A escolha é do profissional.

### 3.2 Segurança — 9 Regras Absolutas

1. **RLS:** `professional_id = auth_professional_id()` — nunca `auth.uid() IS NOT NULL`
2. **Secrets e tokens:** sempre no Supabase Vault (API keys, HMAC secrets, tokens Evolution Go). PII operacional (telefone, email) pode existir em colunas protegidas por RLS — precisa ser buscável para WhatsApp, login, suporte e deduplicação. CPF e dados sensíveis de saúde: masking obrigatório + acesso restrito. Audit logs: nunca PII crua — usar `mask_pii()`.
3. **RPCs:** validar ownership antes de agir (IDOR) — `IF NOT EXISTS (...AND professional_id = auth_professional_id()) THEN RAISE EXCEPTION 'Unauthorized'`
4. **RLS sem subqueries** — usar `auth_professional_id()` STABLE (lê JWT, 0ms). Nunca `IN (SELECT ...)`.
5. **Logs imutáveis** — trigger `fn_log_immutable()` em toda tabela de log. `REVOKE UPDATE, DELETE FROM authenticated`.
6. **Views** com filtro de clínica: `WITH (security_invoker = on)`
7. **Dados financeiros:** `ON DELETE RESTRICT` — nunca CASCADE
8. **Permissões:** `REVOKE ALL` + GRANT específico — nunca GRANT ALL
9. **Client-side:** `professional_id` sempre do AuthContext como `professionalId` explícito — nunca `user.id` ambíguo e nunca do payload do cliente

### 3.3 Produto, IA e Créditos

- Agentes de IA (Rosane) disponíveis no plano básico (Solo). Nunca bloquear Rosane por plano.
- Diferenciar planos por escala (volume de clientes, canais, equipe) — não por corte de IA.
- Todo app começa em 390px. Se não funciona no mobile, não está pronto.
- **Degradação graceful de créditos:** quando créditos chegam a zero, Rosane envia uma mensagem única de fallback ao cliente ("Estou indisponível agora, o profissional entrará em contato em breve") e registra para o profissional resolver. Nunca silencia. Nunca cobra crédito negativo. Profissional recebe alerta no app quando créditos atingem 20% do saldo.

### 3.4 Dados e LGPD

- **Soft delete** em dados operacionais — nunca DELETE físico em clientes, sessões, transações.
- **Dados financeiros:** retenção mínima 5 anos (compliance fiscal brasileiro).
- **Audit logs:** imutáveis — violação é crime contábil/jurídico.
- **LGPD — Papéis:** iaprafaturar é **operador de dados** (processa em nome dos profissionais). O profissional é o **controlador de dados** dos seus clientes. Um DPA deve existir nos Termos de Uso aceitos pelo profissional.
- **LGPD — Direitos dos titulares:**
  - Direito de acesso: profissional pode exportar dados de qualquer cliente a qualquer momento.
  - Direito de esquecimento: soft delete não é suficiente — dado deve ser anonimizado (nome → "Cliente Removido", telefone → hash, email → null) quando solicitado.
  - Direito de portabilidade: exportação em JSON/CSV disponível por API.
  - Incidente de vazamento: notificação à ANPD em até 72h para incidentes graves.
- **Dados de saúde** (anotações clínicas, anamnese): dado sensível na LGPD. Base legal: execução de contrato (Art. 7, V) + consentimento explícito (Art. 11, I). O profissional é responsável por obter o consentimento; o app facilita o registro.
- **Base legal para WhatsApp:** interesse legítimo (Art. 7, IX) para comunicação sobre serviços contratados (lembretes, confirmações, pós-atendimento). Mensagens promocionais (campanhas, indicação) exigem base legal aplicável ao contexto, opt-out respeitado e preferência registrada. Quando a base for consentimento, registrar consentimento explícito. Nunca enviar mensagem promocional sem base legal documentada no sistema.

### 3.5 Desenvolvimento

- **O PRD consolidado é a fonte de verdade.** Rascunhos, inventários e comparações v1/v2 são contexto histórico — não regra de produto. Quando houver conflito, este documento manda.
- **v1 é inventário de problemas a evitar.** Se v1 e PRD divergirem, o PRD vence.
- **Validação com fixtures sintéticas obrigatória.** Nenhuma fase é aprovada sem seeds reproduzíveis:
  - `adminUser` — usuário admin da plataforma
  - `professionalA` — profissional com instância WhatsApp conectada
  - `professionalB` — profissional sem WhatsApp (testa isolamento de tenant)
  - `teamMemberA` — colaborador de professionalA (role operacional)
  - `clienteA` — cliente cadastrado de professionalA
  - `clienteB` — cliente de professionalB (nunca visível para professionalA)
  - `leadSintetico` — número sem cadastro completo (entra pelo WhatsApp)
  - `agendamentoSintetico` — agendamento no estado `agendado`
  - `conversaInbound` — message_event simulado (inbound)
  - `instanciaSimulada` — Evolution Go em modo dry_run
- **WhatsApp e IA nunca enviam em testes automatizados.** Toda chamada a Evolution Go e a LLMs deve verificar `DRY_RUN=true`. Em dry_run: logar payload, retornar `{ dry_run: true, would_send: {...} }`, registrar em message_events com `status='dry_run'`.
- **Toda entrada externa é validada em runtime** antes de qualquer lógica de negócio: webhooks, Edge Functions, jobs QStash, payloads de eventos, formulários públicos, callbacks Stripe, callbacks Evolution Go. A ferramenta é escolha da stack (squad-dev-code define); a regra é do Master.
- **Schema nunca é tarefa simples.** Qualquer alteração no banco passa pelo squad-schema-guard: nova coluna, nova tabela, nova FK, nova policy RLS, nova RPC, novo índice, alteração em enum. Toda migration exige: motivo, rollback documentado, seed correspondente, confirmação de não-duplicidade com PRD-CONSOLIDATION.md.
- **JSONB não é lixeira.** Usar JSONB apenas para preferências flexíveis e pouco consultadas. Nunca para dados que precisam de: filtro frequente, relatório, relacionamento, auditoria, histórico ou índice.

### 3.6 Performance

| Métrica | Budget |
|---|---|
| Primeiro carregamento mobile (PWA) | < 2s em 4G |
| Tela principal do CRM | máx 2 queries críticas |
| Listas (clientes, agenda, financeiro) | paginação ou cursor obrigatório — nunca buscar tudo |
| Realtime | apenas onde houver necessidade real e justificada |
| Crons de tenant | sempre filtrar por `professional_id` — nunca query global |
| Crons de plataforma | processar em batches paginados por `professional_id` — nunca query global sem limite (ex: `WHERE id > $last_id LIMIT 100`) |
| Bundle | apps separados: professional / client / admin — nunca bundle único |
| RLS queries | sem subquery — EXPLAIN ANALYZE deve mostrar 0 `Subquery Scan` |

### 3.7 Privacidade em Conversas

- Toda mensagem inbound deve ser registrada, classificada e só depois processada.
- Se classificada como `private_ignore`: registrar apenas metadados mínimos (external_message_id, timestamp, phone hash), não salvar conteúdo da mensagem.
- **Rosane** nunca faz busca global fora do escopo do `professional_id` da instância.
- **Nerissa** busca profissionais da plataforma, mas nunca acessa dados de clientes de clínicas.
- Mensagem de instância cruzada: registrar ocorrência, não processar como cliente, notificar admin.

---

## 4. Glossário e Vocabulário de Identidade

### 4.1 Termos do Produto

| Termo | Definição |
|---|---|
| **Nerissa** | IA da plataforma. Onboard profissionais via WhatsApp admin. Nunca confundir com Rosane. |
| **Rosane** | IA do profissional. Atende clientes via WhatsApp da clínica. Cada clínica tem sua Rosane. |
| **Shadow mode** | Rosane sugere resposta mas aguarda aprovação do profissional antes de enviar. |
| **journey_stage** | Estágio do cliente: `lead → agendado → em_tratamento → pos_tratamento → cliente_fiel → inativo` |
| **message_events** | Toda mensagem (inbound + outbound, qualquer canal). Imutável. |
| **agent_executions** | Toda execução de agente. Separado de mensagem — agente pode executar sem enviar. |
| **QStash** | Fila assíncrona (Upstash). Garante entrega mesmo se função falhar. |
| **Evolution Go** | API de WhatsApp Business. Gerencia instâncias. Envia webhooks para nossos endpoints. |
| **DRY_RUN** | Flag (`DRY_RUN=true`) que desativa envios reais de WhatsApp e IA. Obrigatório em testes. |
| **auth_professional_id()** | Função SQL STABLE que lê JWT e retorna `professionals.id`. Base de toda RLS. |

### 4.2 Vocabulário de Identidade — Nomes Canônicos

Nunca usar `user.id` de forma ambígua. Sempre nomear o que é:

| Nome canônico | Representa | SQL | TypeScript |
|---|---|---|---|
| `professionalId` | `professionals.id` — identidade da clínica/tenant | `auth_professional_id()` | `professionalId` do AuthContext (campo explícito) |
| `authUserId` | `auth.users.id` — identidade de autenticação | `auth.uid()` | `authUserId` do AuthContext (campo explícito) |
| `clientId` | `clients.id` — cliente/paciente da clínica | `clients.id` | query result |
| `tenantId` | sinônimo de `professionalId` — o mesmo valor | — | — |
| `actorType` | quem está agindo na operação | CHECK constraint | tipo literal |
| `role` | permissão do usuário autenticado | `user_roles.role` | `user.role` |

**Valores canônicos de `actorType`:**
```
'professional' | 'team_member' | 'client' | 'admin' | 'ai' | 'system' | 'cron' | 'integration'
```

| Valor | Quando usar |
|---|---|
| `professional` | Profissional autenticado agindo no CRM |
| `team_member` | Colaborador autenticado |
| `client` | Cliente (ex: respondeu confirmação via WhatsApp) |
| `admin` | Admin da plataforma (Ismael) |
| `ai` | Qualquer agente de IA. Identificar qual agente via `agent_slug` |
| `system` | Triggers SQL, hooks automáticos sem ação humana direta |
| `cron` | Jobs agendados (lembretes, RFM, health score) |
| `integration` | Callbacks externos: Stripe, Evolution Go (conexão/desconexão) |

> **Nerissa vs Rosane no actorType:** ambos usam `actor_type: 'ai'`. Para distingui-los em auditoria, use o campo `agent_slug` presente em `agent_executions` (ex: `'nerissa-setup-agent'`, `'rosane-duvidas-agent'`, `'lembrete-agent'`). Não enumerar agentes no tipo — novos agentes não devem exigir mudança de schema.

```typescript
// AuthContext v2 deve expor professionalId explicitamente
const { professionalId, authUserId, role } = useAuth();

// ✅ Correto — professionalId nomeado semanticamente
.eq("professional_id", professionalId)

// ❌ Ambíguo — user.id pode significar coisas diferentes dependendo do contexto
.eq("professional_id", user.id)

// ❌ Errado — authUserId ≠ professionalId
.eq("professional_id", authUserId)

// ❌ IDOR — nunca do payload do cliente
.eq("professional_id", body.professional_id)
```

```sql
-- ✅ Correto no SQL
USING (professional_id = auth_professional_id())

-- ❌ Errado — auth.uid() ≠ professional_id
USING (professional_id = auth.uid())
```

---

## 5. Arquitetura do Sistema

### 5.1 Módulos (visão completa — o prédio inteiro)

| Módulo | O que faz | Fase |
|---|---|---|
| **Auth & Tenancy** | Login, profissional, equipe, roles | 0 |
| **WhatsApp Dual-Channel** | Nerissa (admin) + Rosane (profissional) | 1 |
| **Admin Técnico Mínimo** | webhook-admin, logs, troubleshooting, Nerissa operacional | 1 |
| **Onboarding** | Cadastro e configuração guiada por Nerissa | 2 |
| **CRM Core** | Clientes, agenda, sessões | 3 |
| **Financeiro Básico** | Transações, extrato, DRE simples | 4 |
| **Agentes Completos** | Lembretes, confirmações, pós-atendimento, shadow mode | 5 |
| **PWA Cliente** | Agendamento público, anamnese | 6 |
| **Documentos & Pacotes** | Orçamentos, contratos, pacotes | 7 |
| **Growth** | Campanhas, indicação, reativação, RFM | 8 |
| **Admin Analytics Completo** | Dashboard MRR, churn, Nexus, health scores | 9 |
| **Relatórios do Profissional** | Analytics operacional do profissional | 10 |
| **Onboardings Comerciais e Operacionais** | Profissional, cliente, lead e setup mínimo para vender | 11 |
| **Receita Operacional Cliente** | Rotas cliente, comunicação, agenda, Rosane operadora | 12 |
| **Pacotes, Orçamentos e Cobrança** | Fluxos que convertem atendimento em receita | 13 |
| **PWA Cliente Completo e Recorrência** | Portal cliente, pacotes ativos, recorrência e remarcação | 14 |
| **Financeiro Operacional Avançado** | PDV, conciliação, gateways e configurações financeiras | 15 |
| **Growth Comercial Completo** | Funil, upsell, e-mail, fidelidade e indicação avançada | 16 |
| **Billing SaaS e Plataforma** | Planos, trial, créditos, afiliados, admin operacional avançado | 17 |
| **Advanced** | Knowledge Brain, Partner API | Futuro |

> **Admin mínimo técnico (FASE 1) ≠ Admin analytics completo (FASE 9).** Na FASE 1 o admin opera Nerissa e monitora webhooks via Supabase Dashboard. Dashboard de MRR e analytics vem na FASE 9.

### 5.2 Camadas do Backend

```
CAMADA 0: ENTRADA
  webhook-whatsapp     → instâncias dos profissionais (Rosane)
  webhook-admin        → instância admin (Nerissa)
  webhooks de billing  → Stripe
  formulários públicos → /agendar/:slug, /anamnese/:token

CAMADA 1: CLASSIFICAÇÃO
  Determina o tipo da mensagem:
  platform_setup | platform_support | platform_sales
  client_business | appointment_confirmation
  private_ignore | unknown_process | human_review

CAMADA 2: ROTEAMENTO
  Escolhe o agente/fila com base na classificação

CAMADA 3: EXECUÇÃO
  Agente age: responder, criar lead, agendar, registrar contexto

CAMADA 4: SAÍDA
  send-message → Evolution Go → WhatsApp
  (sempre pela instância correta do remetente)

CAMADA 5: OBSERVABILIDADE
  message_events + agent_executions + audit_log
  Todo fluxo gera log. Sem log = não está pronto.
```

### 5.3 Apps (Frontend)

```
apps/professional  → CRM do profissional (mobile-first PWA)
apps/client        → PWA público do cliente (agendar, anamnese)
apps/admin         → Painel interno (Nexus, plataforma)
```

---

## 6. Canais de Comunicação WhatsApp

> Esta é a seção mais crítica do PRD. WhatsApp deve funcionar sem erro desde o primeiro deploy.

### 6.1 Dois Canais, Dois Universos

```
CANAL ADMIN (Nerissa)                    CANAL PROFISSIONAL (Rosane)
────────────────────────────────         ────────────────────────────────
Instância: admin/nerissa                 Instância: slug do profissional
HMAC: ADMIN_EVOLUTION_SECRET             HMAC: PROFESSIONAL_EVOLUTION_SECRET
Endpoint: webhook-admin                  Endpoint: webhook-whatsapp
Processor: admin-message-processor      Processor: message-processor
Fala com: profissionais                  Fala com: clientes da clínica
Agentes: nerissa-*, sales-*, support-*   Agentes: rosane (9 sub-agentes)
```

**Nunca misturar.** Se um cliente de profissional mandar mensagem para o número admin, não processar como cliente de profissional. Se um profissional mandar mensagem para seu próprio número de clínica, `fromMe=true` — ignorar.

### 6.2 Fluxo: Mensagem Entra (Cliente → Rosane)

```
1. Cliente envia mensagem via WhatsApp
   ↓
2. Evolution Go dispara webhook POST /webhook-whatsapp
   ↓
3. webhook-whatsapp (< 300ms, retorna 200 imediatamente):
   a. Validar HMAC (se falhar → 401, logar)
   b. Filtrar: fromMe=true, grupo, broadcast, status → ignorar (200 mesmo assim)
   c. Claim atômico de idempotência:
      → idempotency_key = source_webhook + instance_name + external_message_id
      → INSERT INTO idempotency_log (idempotency_key) ON CONFLICT DO NOTHING RETURNING idempotency_key
      → Se RETURNING vazio: já processado — retornar 200 imediatamente, sem continuar
      → Se RETURNING com valor: claim garantido — sem race condition
   d. Resolver professional_id pelo instance_name
   e. INSERT em message_events (direction='inbound', status='queued') ← após claim
   f. Se mídia → chamar audio/image/document-processor (async)
   g. Redis SETEX debounce:{instance}:{phone} 4s → acumular mensagens rápidas
   h. Publicar no QStash → message-processor
   i. Retornar { received: true }
   ↓
4. message-processor (via QStash, com retry automático):
   a. Buscar conversation (ou criar nova)
   b. Buscar conversation_context ativo
   c. Buscar últimas 10 message_events da conversa
   d. Classificar mensagem:
      - contexto ativo → continuar fluxo do contexto
      - agendamento/remarcação → appointment-agent
      - dúvida/saudação → rosane (duvidas-agent)
      - objeção → objecoes-agent
      - privado (número sem professional_id) → private_ignore
      - desconhecido → human_review
   e. INSERT em agent_executions (status='running')
   f. Chamar agente
   g. UPDATE agent_executions (status=success/failed)
   h. UPDATE message_events (status='processed')
   i. Se agente responde → send-message
   ↓
5. send-message:
   a. Verificar DRY_RUN → se true, logar payload e retornar sem enviar
   b. Chamar Evolution Go API → enviar mensagem
   c. INSERT em message_events (direction='outbound', sent_by='ai')
   d. Retornar { message_id }
```

### 6.3 Fluxo: Mensagem Entra (Profissional → Nerissa)

```
1. Profissional envia mensagem para número admin
   ↓
2. Evolution Go dispara webhook POST /webhook-admin
   ↓
3. webhook-admin (< 300ms, retorna 200 imediatamente):
   a. Validar HMAC admin (secret diferente do profissional)
   b. Filtrar: fromMe=true, grupo, broadcast → ignorar
   c. Claim atômico de idempotência:
      → idempotency_key = source_webhook + instance_name + external_message_id
      → INSERT INTO idempotency_log (idempotency_key) ON CONFLICT DO NOTHING RETURNING idempotency_key
      → Se RETURNING vazio: já processado — retornar 200 imediatamente
      → Se RETURNING com valor: continuar
   d. Resolver professional_id pelo phone (busca em professionals.phone_whatsapp)
   e. INSERT em message_events (direction='inbound', source_webhook='admin')
   f. Redis debounce
   g. Publicar QStash → admin-message-processor
   h. Retornar { received: true }
   ↓
4. admin-message-processor:
   a. Identificar contexto: setup? suporte? vendas?
   b. Se profissional em onboarding → nerissa-setup-agent
   c. Se profissional existente com problema → support-agent
   d. Se lead novo → sales-agent (Nerissa como vendedora)
   e. Executar agente, registrar em agent_executions
   ↓
5. send-message (instância admin):
   a. Verificar DRY_RUN → se true, logar payload e retornar sem enviar
   b. Enviar pelo número admin (nunca pelo número do profissional)
   c. INSERT em message_events (direction='outbound', source_webhook='admin')
```

### 6.4 Classificação de Mensagens (message-processor)

```
INPUT: message_event_id, professional_id, phone, content, conversation_id

STEP 1: Existe conversation_context ativo?
  SIM → usar context_type para rotear:
    'appointment_confirmation' → appointment-confirmation-agent
    'reminder'                → se resposta → atualizar status
    'lead_followup'           → lead-followup-agent
    'post_care'               → pós-atendimento agent
    'reactivation'            → reativacao-agent
    default                   → rosane (duvidas)
  
  NÃO → STEP 2

STEP 2: Phone tem professional_id associado (cliente conhecido)?
  NÃO → criar lead + lead-initial-contact-agent
  SIM → STEP 3

STEP 3: Analisar conteúdo com regras:
  Palavra-chave de agendamento → agendamento-agent
  Palavra-chave de cancelamento → appointment-agent (cancelar)
  Pergunta genérica / saudação  → rosane (duvidas)
  Mensagem privada (sem contexto profissional) → private_ignore
  default → rosane (duvidas)
```

### 6.5 Garantias de Confiabilidade

| Risco | Mitigação |
|---|---|
| Evolution Go envia mesmo webhook 2x | idempotency_log por external_message_id |
| Agente demora / timeout | QStash retry automático (3x, backoff) |
| Redis fora do ar | Debounce falha graciosamente — mensagem processada sem debounce |
| QStash fora do ar | Fallback: chamar message-processor diretamente (síncrono) |
| Evolution Go não recebe 200 | Webhook SEMPRE retorna 200 após validação de HMAC |
| Mensagem processada mas não enviada | message_events com status='queued' → cron de retry a cada 5min |
| Instâncias se cruzam | HMAC secrets distintos por canal — webhook rejeita secret errado |

### 6.6 Contratos Técnicos das Edge Functions de WhatsApp

#### webhook-whatsapp
```
verify_jwt: false
auth: HMAC-SHA256 header x-evolution-hmac
retorna: sempre 200 (exceto 401 para HMAC inválido)
escreve: message_events, idempotency_log
enfileira: QStash → message-processor
NÃO executa: lógica de agente, queries pesadas, chamadas de IA
```

#### webhook-admin
```
verify_jwt: false
auth: HMAC-SHA256 header x-evolution-hmac (secret ADMIN diferente)
retorna: sempre 200 (exceto 401 para HMAC inválido)
escreve: message_events, idempotency_log
enfileira: QStash → admin-message-processor
NÃO executa: lógica de agente
```

#### message-processor
```
verify_jwt: false (chamado pelo QStash)
auth: QStash signature
escreve: agent_executions, conversation_contexts, conversations
chama: agentes específicos, send-message
lê: message_events, professional_agents, clients, appointments
```

#### send-message
```
verify_jwt: true (chamado por agentes, não diretamente)
escreve: message_events (direction='outbound')
chama: Evolution Go API (verifica DRY_RUN antes de qualquer envio)
NÃO assume: qual instância usar → recebe instance_name no payload
```

---

## 7. Fluxos Públicos Protegidos

Rotas que funcionam sem autenticação. Toda rota pública deve:
- Não exigir Auth
- Não cobrar créditos antes da conta existir
- Preservar parâmetros de contexto: `ref`, `lang`, `slug`, `token`, `conversation_id`
- Responder sempre no formato esperado pelo frontend (nunca 500 nu)
- Ter fallback legível (slug não encontrado → 404 com mensagem amigável)
- Ser testada ponta a ponta com fixture sintética

| Rota | Propósito | Auth | Parâmetros críticos |
|---|---|---|---|
| `/agendar/:slug` | Agendamento público do cliente | Não | `slug` (professionals.slug) |
| `/anamnese/:token` | Ficha de anamnese pré-consulta | Não | `token` (registration_sessions.token) |
| `/convite/:codigo` | Onboarding via convite de profissional | Não | `codigo` (referral_links.code) |
| `/entrar` | Login/cadastro com contexto de referral | Não | `ref`, `lang` |
| `/pacote/:slug` | Apresentação de pacote de serviços | Não | `slug` |
| Webhook Evolution Go | Receber mensagens WhatsApp | HMAC | `x-evolution-hmac` |
| Webhook Stripe | Receber eventos de billing | Stripe signature | `stripe-signature` |

**Invariante — cadastro separado:**
> Cadastro de profissional e cadastro de cliente são fluxos distintos. Nunca podem compartilhar rota, agente, payload, billing, créditos ou contexto de Auth.
>
> - `/cadastro` e `/onboarding` → exclusivos do profissional
> - `/agendar/:slug` → exclusivo do cliente da clínica
> - Um cliente não pode criar conta de profissional pelo fluxo público.
> - Um profissional não passa pelo fluxo de agendamento público da própria clínica como cliente.

---

## 8. Eventos Canônicos

> Contrato completo (payload, emissor, consumidor, idempotency key, schema de validação) em `docs/02-contracts/EVENTS.md`.
> Esta seção lista os eventos obrigatórios e serve como referência rápida.

Eventos são a linguagem do sistema. Toda feature relevante declara os eventos que emite e consome. Um evento não registrado = operação não auditável.

| Evento | Emitido quando | Fase |
|---|---|---|
| `professional.created` | Profissional completa cadastro | 0 |
| `professional.onboarding.started` | Inicia configuração via Nerissa | 2 |
| `professional.onboarding.completed` | Rosane ativada na instância | 2 |
| `professional.whatsapp.connected` | Instância Evolution Go conectada | 2 |
| `professional.whatsapp.disconnected` | Instância desconectada | 2 |
| `whatsapp.message.received` | Mensagem inbound registrada | 1 |
| `whatsapp.message.sent` | Mensagem outbound enviada | 1 |
| `ai.interaction.started` | Agente inicia processamento | 1 |
| `ai.interaction.completed` | Agente finaliza (success ou failed) | 1 |
| `client.created` | Cliente cadastrado na clínica | 3 |
| `client.updated` | Dados do cliente atualizados | 3 |
| `client.journey_stage.changed` | Stage do cliente mudou no funil | 3 |
| `appointment.created` | Agendamento criado | 3 |
| `appointment.confirmed` | Cliente confirmou | 5 |
| `appointment.cancelled` | Cancelado por qualquer parte | 3 |
| `appointment.rescheduled` | Remarcado (cria novo, cancela o anterior) | 3 |
| `appointment.completed` | Sessão realizada e registrada | 3 |
| `appointment.no_show` | Falta registrada pelo profissional | 5 |
| `payment.created` | Lançamento financeiro criado | 4 |
| `payment.received` | Pagamento confirmado | 4 |
| `campaign.created` | Campanha criada | 8 |
| `campaign.dispatched` | Campanha enviada | 8 |

---

## 9. Máquina de Estados: Appointments

Todo `appointment.status` segue esta máquina. Desvio = bug.

```
[criado]
    │
    ▼
agendado ──────────────────────────────────► cancelado
    │                                            ▲
    ├──► confirmado ──────────────────────────────┤
    │         │
    │         ├──► realizado
    │         └──► falta
    │
    └──► reagendado (cria novo agendamento)
```

### Estados válidos

| Status | Descrição | Evento emitido |
|---|---|---|
| `agendado` | Criado, aguardando confirmação | `appointment.created` |
| `confirmado` | Cliente confirmou via WhatsApp ou profissional confirmou no CRM | `appointment.confirmed` |
| `cancelado` | Cancelado antes de ocorrer | `appointment.cancelled` |
| `reagendado` | Substituído por outro agendamento | `appointment.rescheduled` |
| `realizado` | Sessão ocorreu e foi registrada | `appointment.completed` |
| `falta` | Cliente não compareceu | `appointment.no_show` |

### Transições válidas e atores

| De → Para | Quem pode fazer | Como |
|---|---|---|
| `agendado → confirmado` | Cliente (WhatsApp), Profissional (CRM) | Resposta afirmativa / botão |
| `agendado → cancelado` | Cliente (WhatsApp), Profissional (CRM), Rosane | Pedido de cancelamento |
| `confirmado → cancelado` | Cliente (WhatsApp), Profissional (CRM) | Pedido de cancelamento |
| `agendado → reagendado` | Profissional (CRM), Cliente (WhatsApp) | Cria novo appointment, marca este como reagendado |
| `confirmado → reagendado` | Profissional (CRM), Cliente (WhatsApp) | Idem |
| `confirmado → realizado` | **Profissional apenas** (CRM) | Registro de sessão |
| `confirmado → falta` | **Profissional apenas** (CRM) | Marcar ausência |

> **Invariante:** nenhum agente de IA pode marcar `realizado` ou `falta`. Essas transições são exclusivamente do profissional.

---

## 10. Billing e Planos

> Stripe é a fonte de verdade para preços e estados de assinatura. Este PRD define a política de produto.

### 10.1 Planos

| Plano | Preço | Trial | Clientes | Profissionais |
|---|---|---|---|---|
| **Solo** | R$ 97/mês | 14 dias | até 300 | 1 |
| **Pro** | R$ 297/mês | 14 dias | até 2.000 | até 3 |
| **Clínica** | R$ 697/mês | — | até 10.000 | até 10 |
| **Enterprise** | Sob consulta | — | Ilimitado | Ilimitado |

- Trial disponível apenas em Solo e Pro.
- **Plano gratuito interno (`plan_type = 'free_internal'`):** não disponível em checkout público. Concedido manualmente pelo admin para influencers, beta testadores, equipe interna e parceiros estratégicos. Créditos de IA: equivalente a 1/3 do plano Solo. Limites de clientes: equivalente ao plano Solo. Não aparece em nenhuma página de pricing. Só pode ser atribuído via service_role.
- Stripe é a fonte de verdade para `plan_type` e `trial_ends_at`. O banco armazena referências aos price IDs do Stripe, não preços.

### 10.2 Créditos de IA

- 1 crédito = 1 unidade de consumo de IA (calibrado por custo de tokens).
- Cada plano inclui créditos mensais. Pacotes avulsos disponíveis.
- Créditos não acumulam entre meses — reset no início do ciclo.
- Alerta no app quando créditos atingem 20% do saldo.
- Profissional nunca entra em saldo negativo (ver degradação graceful em 3.3).

### 10.3 Regras de Proteção

- `plan_type` e `acesso_vitalicio` são atualizáveis apenas por service_role (nunca por authenticated).
- Limite de clientes enforced no INSERT via trigger — nunca só no frontend.
- Trial expirado: acesso mantido em modo read-only por 7 dias antes de bloquear.

---

## 11. Internacionalização

```typescript
type Locale = 'pt-BR' | 'en-US' | 'es-419';
// es-419 = Espanhol para América Latina (IANA BCP 47 correto — nunca 'es-AL')
```

**Regras:**
- Toda string visível ao usuário passa por i18n. Exceções: marca, nomes próprios, códigos técnicos, logs internos, dados vindos do banco.
- Nenhum agente escolhe idioma livremente quando o locale já existe no contexto da conversa ou do profissional.
- Agente herda locale de: `conversations.locale` → `professionals.preferred_locale` → `pt-BR` (fallback).

**Campos de locale:**
```sql
professionals.preferred_locale  text DEFAULT 'pt-BR'
clients.preferred_locale        text DEFAULT 'pt-BR'
conversations.locale            text
```

---

## 12. Schema Fundação

> DDL completo em `docs/03-product/PRD-SCHEMA.md`. Aqui estão as tabelas críticas e a ordem em que precisam existir.

### 12.1 Fase 0 — Deve existir antes de qualquer código

```
auth_professional_id()  ← função SQL STABLE, base de toda RLS
professionals           ← identidade da clínica
team_members            ← colaboradores
user_roles              ← admin_master, gestor, operacional
master_admins           ← admins da plataforma
idempotency_log         ← deduplica webhooks desde o primeiro dia
```

### 12.2 Fase 1 — Deve existir antes do primeiro deploy de WhatsApp

```
conversations           ← thread de conversa (profissional + cliente)
conversation_contexts   ← contexto ativo da conversa
message_events          ← TODA mensagem (inbound + outbound) — imutável
agent_executions        ← TODA execução de agente — imutável
professional_agents     ← configuração de Rosane por profissional
nerissa_setup_sessions  ← sessões de onboarding via Nerissa
```

### 12.3 Fase 3+ — Tabelas do CRM Core

```
clients                 ← pacientes/clientes
service_categories      ← agrupadores de serviços
services                ← catálogo de serviços da clínica
appointments            ← agendamentos (ver máquina de estados: seção 9)
sessions                ← sessões realizadas
financial_transactions  ← movimentações financeiras
```

### 12.4 Regras de FK entre tabelas críticas

```
message_events.professional_id   → professionals.id  ON DELETE RESTRICT
message_events.conversation_id   → conversations.id  (nullable)
message_events.client_id         → clients.id        (nullable — lead pode não ter client_id)
agent_executions.professional_id → professionals.id  ON DELETE RESTRICT
conversations.professional_id    → professionals.id  ON DELETE RESTRICT
appointments.professional_id     → professionals.id  ON DELETE RESTRICT
appointments.client_id           → clients.id        ON DELETE RESTRICT
```

### 12.5 Política de Migration

Toda migration exige, antes de ser executada:
1. **Motivo:** qual PRD ou feature justifica a mudança
2. **Rollback documentado:** como reverter (comentário no arquivo ou arquivo `_rollback.sql`)
3. **Seed correspondente:** seed sintético atualizado junto com a migration
4. **Confirmação de não-duplicidade:** squad-schema-guard valida que não existe tabela/coluna equivalente no PRD-CONSOLIDATION.md

---

## 13. Runbooks — Política

> Runbooks detalhados em `docs/05-runbook/`. Esta seção define a política.

Todo fluxo crítico precisa ter runbook antes de ir para produção. Runbook mínimo inclui: sintoma observável, causa provável, passos de diagnóstico, solução e prevenção.

**Runbooks obrigatórios para FASE 1:**

| Sintoma | Arquivo |
|---|---|
| Mensagem WhatsApp não chegou | `whatsapp-message-not-received.md` |
| Webhook processado 2x | `webhook-duplicate.md` |
| QStash job travado ou falhando | `qstash-jobs-stuck.md` |
| Evolution Go desconectou instância | `evolution-disconnected.md` |
| Agente não respondeu (timeout) | `agent-timeout.md` |
| RLS bloqueou usuário legítimo | `rls-false-positive.md` |
| Onboarding não finalizou | `onboarding-stuck.md` |
| Confirmação de agendamento não mudou status | `appointment-confirmation-failed.md` |

---

## 14. Fases de Construção

> EXECUTION-PRD.md (`docs/01-execution/`) segue a ordem definida aqui. Em caso de conflito de sequência, este PRD-MASTER manda.
> Cada fase entrega algo utilizável. Nenhuma fase é "infraestrutura que só serve para a próxima".
>
> **Reordenação pós-FASE 9:** a partir da FASE 11, a prioridade oficial é fechar primeiro as rotas e fluxos que falam com profissionais e clientes, organizam agenda/comunicação e geram receita operacional. Billing SaaS, afiliados, admin avançado e plataforma continuam obrigatórios, mas não devem passar na frente dos onboardings, comunicação, agenda e receita do profissional.

---

### FASE 0 — Fundação Técnica
**Duração estimada:** 1-2 semanas
**Entrega:** app abre, auth funciona, estrutura base está de pé.

**Backend:**
- `auth_professional_id()` + RLS foundation
- Tabelas: professionals, team_members, user_roles, master_admins, idempotency_log
- `set_updated_at()` trigger global

**Frontend:**
- Tailwind config com paleta (teal operacional, violet para IA, slate base)
- PWA manifest (display: standalone, theme_color: teal-600 padrão)
- Bottom nav 5 áreas: Hoje | Agenda | Clientes | Financeiro | Mais
- /login + /cadastro funcionando
- ProtectedRoute + AuthContext

**DoD Fase 0:**
- [ ] Seed de professionalA e professionalB executado
- [ ] `auth_professional_id()` retorna UUID correto do JWT
- [ ] RLS em professionals bloqueia acesso cruzado (professionalB não vê professionalA)
- [ ] Login, logout, cadastro funcionam no mobile (390px)
- [ ] Bottom nav renderiza e navega sem reload
- [ ] Manifest PWA instalável no iOS Safari e Android Chrome

---

### FASE 1 — WhatsApp Dual-Channel + Admin Técnico Mínimo
**Duração estimada:** 2-3 semanas
**Entrega:** Nerissa responde profissionais. Rosane recebe mensagens de clientes (mesmo que só diga "olá"). Admin consegue monitorar e diagnosticar.

> Admin técnico mínimo nesta fase = acesso a logs, status de instâncias e troubleshooting básico via Supabase Dashboard + webhook-admin funcional. Admin analytics completo (dashboard MRR, churn) vem na FASE 9.

**Backend (1A — Canal Admin/Nerissa):**
- Tables: nerissa_setup_sessions, nerissa_inbound_queue
- Edge Functions: webhook-admin, admin-message-processor, nerissa-setup-agent
- Rosane (admin side) responde mensagens de texto de profissionais
- send-message pela instância admin

**Backend (1B — Canal Profissional/Rosane):**
- Tables: conversations, conversation_contexts, message_events, agent_executions, professional_agents
- Edge Functions: webhook-whatsapp, message-processor, send-message
- Rosane básica: duvidas-agent responde perguntas simples
- shadow_suggestions para modo de treinamento

**Configuração Evolution Go:**
- Instância admin conectada e testada
- Webhook admin apontado para /webhook-admin
- Webhook profissional apontado para /webhook-whatsapp
- HMAC secrets configurados no Supabase Vault

**DoD Fase 1:**
- [ ] Seed `conversaInbound` processado sem erro
- [ ] Enviar mensagem para número admin → Nerissa responde em < 10s
- [ ] Enviar mensagem para instância de profissional → Rosane registra em message_events
- [ ] Mesmo webhook enviado 2x → processado 1x (idempotência verificada com seed duplicado)
- [ ] HMAC inválido → retorna 401, não processa
- [ ] Falha do agente → message_events registrado, agent_executions com status='failed'
- [ ] DRY_RUN=true → nenhuma mensagem real enviada, payload logado
- [ ] Nenhuma mensagem de cliente chega pelo canal admin (e vice-versa)
- [ ] 100 mensagens simultâneas com seed → nenhuma perdida (carga básica com dry_run)
- [ ] Runbooks de FASE 1 criados

---

### FASE 2 — Onboarding & Auth Completo
**Duração estimada:** 1-2 semanas
**Entrega:** Profissional novo cria conta, configura Rosane via Nerissa, está pronto para atender.

**Backend:**
- Fluxo completo de onboarding (via Nerissa por WhatsApp)
- nerissa_setup_items — checklist de setup
- /onboarding route + wizard (essentials first)
- Evolution Go: conectar instância do profissional via Nerissa

**Frontend:**
- /cadastro → cria professionals + auth.users
- /onboarding → configuração guiada (5 passos essenciais)
- Configurações → grupo "Assistente (Rosane)" funcional

**DoD Fase 2:**
- [ ] professionalA completa onboarding ponta a ponta com seed
- [ ] Novo profissional cria conta pelo /cadastro
- [ ] Nerissa guia setup pelo WhatsApp (nome, serviço, horário)
- [ ] Profissional conecta instância Evolution Go via Nerissa
- [ ] Rosane está ativa na instância do profissional ao final do onboarding
- [ ] Nerissa informa riscos do WhatsApp pessoal e oferece guia do Business (não bloqueia)
- [ ] /onboarding não rende sem estar completo (rota guardada)

---

### FASE 3 — CRM Core
**Duração estimada:** 2-3 semanas
**Entrega:** Profissional gerencia clientes, agenda e sessões pelo app.

**Backend:**
- Tables: clients, service_categories, services, appointments, sessions
- RPC: `move_client_stage()` com IDOR protection
- RPC: `get_dashboard_rpc()` — agrega dados do dashboard em 1 query

**Frontend:**
- Dashboard: 3 zonas (Hoje, Atenção, Pulso)
- Agenda: semana compacta (barras de ocupação) + lista do dia
- Clientes: lista com filtro por journey_stage + swipe actions
- Perfil do cliente: tabs (Resumo, Histórico, Financeiro)
- Registro de sessão: 3 momentos (durante, ao encerrar, automático)
- Novo agendamento: 5 campos, status inicial `agendado`, emite `appointment.created`

**DoD Fase 3:**
- [ ] Seed `agendamentoSintetico` criado com status `agendado`
- [ ] Criar cliente (full_name obrigatório) funciona
- [ ] Criar agendamento → status `agendado` → evento `appointment.created` registrado
- [ ] Cancelar agendamento → status `cancelado` → evento `appointment.cancelled`
- [ ] Registrar sessão → status `realizado` → evento `appointment.completed`
- [ ] Dashboard carrega em < 2s com dados reais
- [ ] Mover cliente de stage (swipe) funciona sem erro, evento `client.journey_stage.changed` registrado
- [ ] Sessão registrada atualiza histórico do cliente
- [ ] professionalB não vê dados de professionalA (isolamento de tenant validado)
- [ ] Todas as telas funcionam em 390px sem scroll horizontal

> **Nota:** confirmação automática via WhatsApp vem na FASE 5 com `appointment-confirmation-agent`.

---

### FASE 4 — Financeiro Básico
**Duração estimada:** 1-2 semanas
**Entrega:** Profissional sabe o que entrou, o que está pendente, e fecha o caixa.

**Backend:**
- Tables: financial_transactions
- Lançamento manual + PIX (sem gateway neste momento)
- Vincular transação a sessão/agendamento

**Frontend:**
- Financeiro: extrato com filtros básicos (período, status, tipo)
- DRE simplificado: receitas vs despesas do mês
- Lançamento rápido (bottom sheet, 4 campos)
- Dashboard Zona 3 com dado real de receita

**DoD Fase 4:**
- [ ] Lançar receita/despesa manual funciona
- [ ] Extrato mostra transações filtradas por período
- [ ] Dashboard Zona 3 mostra receita real do mês
- [ ] Vincular pagamento a sessão atualiza status da sessão
- [ ] professionalB não vê transações de professionalA (RLS validado)

---

### FASE 5 — Agentes Rosane Completos
**Duração estimada:** 2-3 semanas
**Entrega:** Rosane automatiza o ciclo completo: confirmar, lembrar, pós-atendimento, NPS.

**Backend:**
- Edge Functions: lembrete-agent, appointment-confirmation-agent, relacionamento-agent
- Crons: D-1 lembretes, D+1 pós-atendimento, D+3 NPS (se habilitado)
- shadow_suggestions com interface de aprovação
- professional_agents: configuração completa (tom, horário, agentes ativos)

**Frontend:**
- Inbox omnichannel: hierarquia (urgente, shadow pendente, normal)
- Shadow mode UI: aprovar/editar/ignorar inline
- Configurações → Assistente (Rosane): shadow mode toggle, agentes ativos, horário

**DoD Fase 5:**
- [ ] Agendamento criado (FASE 3) → confirmação enviada automaticamente pela Rosane
- [ ] Appointment status muda de `agendado` para `confirmado` ao confirmar via WhatsApp
- [ ] Evento `appointment.confirmed` registrado com `actor_type='client'`, `source='whatsapp'`, `processed_by='rosane'` (Rosane interpretou, o cliente agiu)
- [ ] D-1: lembrete enviado para todos os agendamentos do dia seguinte
- [ ] Shadow mode: sugestão aparece no inbox para aprovação
- [ ] Profissional aprova shadow → mensagem enviada pela instância correta
- [ ] D+1: follow-up de pós-atendimento enviado
- [ ] Inbox mostra urgente em destaque (rose), shadow em amber, normal sem cor
- [ ] DRY_RUN=true em todos os testes automatizados — nenhuma mensagem real

---

### FASE 6 — PWA Cliente
**Duração estimada:** 2-3 semanas
**Entrega:** Cliente agenda, preenche anamnese e recebe confirmações sem instalar nada.

**Backend:**
- Tables: registration_links, registration_sessions, anamnese_templates, anamnese_fichas
- Public endpoints: GET /agendar/:slug, POST /appointments/public
- Edge Function: anamnese-public-handler

**Frontend (apps/client):**
- /agendar/:slug: brand color da clínica, serviços, horários disponíveis
- Cadastro público: full_name + phone_whatsapp obrigatórios
- Confirmação: "Agendamento feito! Você receberá confirmação via WhatsApp"
- /anamnese/:token: formulário de anamnese pré-consulta

**DoD Fase 6:**
- [ ] Seed `leadSintetico` agenda pelo link público sem login
- [ ] Agendamento público dispara evento `appointment.created`
- [ ] Agendamento público dispara confirmação via Rosane (com FASE 5 ativa)
- [ ] Anamnese preenchida pelo cliente aparece no perfil no CRM
- [ ] Slug não encontrado → 404 com mensagem amigável (não 500)
- [ ] Página de agendamento renderiza brand color da clínica corretamente
- [ ] Funciona no Safari iOS (sem PWA — só link direto)
- [ ] Parâmetros `lang`, `ref`, `slug`, `token` sobrevivem a redirects e chamadas de agente
- [ ] Toggle de idioma no app sobrescreve `lang` da URL (não o contrário)

---

### FASE 7 — Documentos & Pacotes
**Duração estimada:** 2-3 semanas
**Entrega:** Orçamentos enviados via WhatsApp, anamnese estruturada, pacotes de sessões gerenciados.

**Backend:**
- Tables: quotes, contracts, packages, client_packages, package_session_usage
- Edge Function: referral-whatsapp (envia orçamento por link)

**Frontend:**
- Orçamentos: criar, enviar por WhatsApp, assinar digitalmente (link)
- Pacotes: criar, vincular a cliente, controlar uso por sessão
- Anamnese Builder: criar templates de ficha por profissão

**DoD Fase 7:**
- [ ] Criar orçamento e enviar link por WhatsApp funciona
- [ ] Pacote vinculado a cliente desconta sessões corretamente
- [ ] Template de anamnese salvo e vinculado a agendamento funciona
- [ ] professionalB não vê orçamentos ou pacotes de professionalA

---

### FASE 8 — Growth
**Duração estimada:** 3-4 semanas
**Entrega:** Automações de crescimento: indicação, reativação, campanhas, RFM.

**Backend:**
- Tables: campaigns, campaign_recipients, campaign_dispatches, referral_links, referral_events
- Tables: rfm_scores, client_health_scores
- Edge Functions: reativacao-agent, indicacao-agent, upsell-agent, lead-followup-agent
- Crons: RFM semanal, health score diário, reativação D+30/60/90

**Frontend:**
- Campanhas: criar broadcast, agendar envio, ver resultados
- Indicação: link de indicação por cliente, painel de resultados
- Funil de leads: kanban de oportunidades

**DoD Fase 8:**
- [ ] Cliente inativo 30 dias → reativacao-agent enviado automaticamente (dry_run em testes)
- [ ] RFM score calculado semanalmente para todos os clientes do professionalA
- [ ] Campanha de broadcast criada, agendada e enviada (dry_run em testes)
- [ ] Link de indicação funciona e rastreia conversão

---

### FASE 9 — Admin Analytics Completo
**Duração estimada:** 2-3 semanas
**Entrega:** Plataforma monitorada, admin gerencia profissionais com dados reais.

**Backend:**
- Tables: professional_platform_health_scores, platform_metrics_daily
- Edge Functions: platform-health-agent, admin-broadcast

**Frontend (apps/admin):**
- Dashboard admin: MRR, churn, profissionais ativos, alertas críticos
- Nexus: chat com Nerissa para gerenciar plataforma
- Lista de profissionais com health score e status da instância

**DoD Fase 9:**
- [ ] Admin vê MRR real no dashboard
- [ ] Health score de plataforma calculado diariamente
- [ ] Nexus funciona (admin chata Nerissa por WhatsApp e pelo painel)

---

### FASE 10 — Relatórios do Profissional
**Status:** entregue antes desta revisão de roadmap.
**Entrega:** profissional enxerga desempenho operacional e financeiro básico com dados reais.

**Backend:**
- RPC `get_professional_reports_rpc()` com isolamento por `auth_professional_id()`
- Métricas de receita, agenda, clientes, serviços e ocupação
- Exportação CSV client-side

**Frontend:**
- Página `/relatorios`
- Entrada em `/mais` no mobile para manter bottom nav com 5 itens

**DoD Fase 10:**
- [ ] Relatórios carregam sem enviar `professional_id` por payload
- [ ] Receita realizada/projetada respeita timezone `America/Sao_Paulo`
- [ ] Exportação CSV funciona no mobile
- [ ] RPC não possui grant residual para `anon`/`PUBLIC`

---

### FASE 11 — Onboardings Comerciais e Operacionais
**Duração estimada:** 2-3 semanas
**Entrega:** profissional, cliente e lead entram na plataforma com dados suficientes para atendimento, comunicação, agenda e venda.

> Esta fase existe porque agenda, comunicação, PWA cliente, Rosane e receita operacional dependem de dados coletados no onboarding. Não construir automação comercial sobre perfil incompleto.

**Jornadas-alvo:** J1, J2, J10 mínimo, J14 mínimo, J33, J51, J60.

**Backend:**
- Handoff público pré-conta protegido: `/entrar`, `/criar-conta`, `ref`, `lang`, `pid`, `conversation`, `collected_data`
- Criação Auth controlada por backend/RPC, preservando `auth.users.id = professionals.id = professionals.user_id`
- A Fase 11 deve portar/evoluir o padrão validado na v1: `/criar-conta` chama backend/RPC, valida `pid + email`, cria Auth com o UUID canônico de `professionals.id` e nunca usa `supabase.auth.signUp` direto no frontend. Se o `handle_new_user` atual da v2 criar `professionals.id` diferente de `auth.users.id`, a fase deve corrigir o trigger antes de liberar o fluxo.
- Nerissa completa dados mínimos do profissional: nome público, especialidade, serviços, horários, endereço/região, WhatsApp, regras de atendimento, nome/persona da Rosane
- Onboarding do cliente no PWA: identificação, aceite LGPD, vínculo ao profissional por slug/token/telefone, preferências básicas
- Admin/manual onboarding para casos de suporte sem quebrar auditoria

**Frontend:**
- Fluxo público de entrada do profissional sem Auth precoce
- `/criar-conta` validando `pid + email`
- `/onboarding` deixa claro o que falta para operar
- Apps client/professional preservam `ref`, `lang`, slug, token e código durante redirects

**DoD Fase 11:**
- [ ] `handle_new_user` comum cria profissional autenticado com `professionals.id = professionals.user_id = auth.users.id`
- [ ] `/criar-conta` protegido usa backend/RPC, preserva `pid + email + ref + lang + conversation + collected_data` e não chama `signUp` no frontend
- [ ] Lead profissional entra por rota pública sem Auth, conversa com Nerissa e recebe URL de criação de conta
- [ ] Conta criada preserva o mesmo UUID em `auth.users`, `professionals.id` e `professionals.user_id`
- [ ] Profissional termina setup mínimo com serviço, horário e WhatsApp configurados
- [ ] Rosane só fica ativa quando os dados mínimos existem
- [ ] Cliente novo entra por link público, aceita LGPD, é vinculado ao profissional correto e fica pronto para agendar/comprar
- [ ] `ref`, `lang`, `conversation`, slug, token e código sobrevivem ao fluxo completo
- [ ] Nenhum fluxo pré-conta usa billing/créditos

---

### FASE 12 — Receita Operacional Cliente: Comunicação, Agenda e Rosane Operadora
**Duração estimada:** 3-4 semanas
**Entrega:** cliente chama, Rosane responde, agenda, confirma, remarca, transfere para humano quando necessário e mantém o histórico operacional.

**Jornadas-alvo:** J3, J4, J8, J16, J24, J30, J39, J56, J59.

**Backend:**
- Rosane consulta dados reais antes de responder: serviços, preços, horários, regras, cliente, agendamentos e contexto ativo
- Agendamento por conversa natural com confirmação antes de executar
- Cancelamento/remarcação por WhatsApp e PWA cliente com regras de janela
- Handoff humano: profissional assume/devolve conversa com auditoria
- Agendamento recorrente com série, exceções e cancelamento individual/série
- Contextos de conversa para follow-up, relacionamento e check-ins proativos

**Frontend:**
- Inbox com tomada/devolução de conversa
- Agenda mostra origem e estado de automações
- UI para regras de atendimento, janela de remarcação e recorrência

**DoD Fase 12:**
- [ ] Cliente novo manda mensagem e Rosane responde com informação real do banco, sem inventar serviço/preço/horário
- [ ] Cliente agenda por WhatsApp e o appointment aparece na agenda
- [ ] Cliente remarca/cancela por WhatsApp/PWA dentro das regras configuradas
- [ ] Profissional assume uma conversa e Rosane para de responder até devolução explícita
- [ ] Recorrência cria série correta e permite exceção
- [ ] Follow-up/check-in respeita opt-out, horário permitido e instância do profissional

---

### FASE 13 — Pacotes, Orçamentos, Documentos e Cobrança Que Geram Receita
**Duração estimada:** 3-4 semanas
**Entrega:** profissional transforma interesse em pacote, orçamento, contrato, cobrança aprovada e registro financeiro.

**Jornadas-alvo:** J5, J7, J12, J21, J54, J61.

**Backend:**
- `/pacote/:slug` público com CTA para Rosane/WhatsApp
- Alertas de pacote acabando/expirando para cliente e profissional
- Orçamento com PDF, validade, follow-up D+2 e expiração automática
- Aprovação pública de orçamento com assinatura digital ou decisão documentada de assinatura própria
- Contratos/termos enviados por Rosane, com webhook/status de assinatura quando houver provedor externo
- Cobrança por WhatsApp somente com aprovação prévia do profissional
- Upsell-agent baseado em elegibilidade, pacote/orçamento e opt-out

**Frontend:**
- Página pública de pacote
- Fluxo de orçamento com envio, acompanhamento e conversão em contrato/pacote
- Perfil do cliente mostra pacotes, documentos, cobranças e pendências

**DoD Fase 13:**
- [ ] Cliente acessa `/pacote/:slug`, entende oferta e inicia conversa/compra assistida
- [ ] Registrar sessão pode consumir pacote com confirmação do profissional
- [ ] Pacote com ≤2 sessões gera alerta para cliente e profissional
- [ ] Orçamento enviado gera link/PDF e follow-up automático se sem resposta
- [ ] Orçamento aprovado pode virar contrato ou pacote sem digitação duplicada
- [ ] Cobrança nunca é enviada automaticamente sem aprovação do profissional

---

### FASE 14 — PWA Cliente Completo
**Duração estimada:** 2-3 semanas
**Entrega:** cliente tem portal próprio para acompanhar agenda, histórico, pacotes e ações permitidas sem instalar app nativo.

**Jornadas-alvo:** J15, J28, J29, J31, J32, J60.

**Backend:**
- Sessão pública/identificação segura do cliente
- RPCs públicas escopadas por token/slug/telefone, sem `professional_id` vindo do payload
- Histórico visível ao cliente com regras de privacidade
- Pacote ativo e saldo visível

**Frontend (apps/client):**
- Home do cliente
- Próximo agendamento
- Histórico de sessões permitido
- Pacote ativo e CTA de renovação
- Idioma e brand por profissional
- Estado offline mínimo para dados já carregados

**DoD Fase 14:**
- [ ] Cliente acessa portal e vê próximo agendamento
- [ ] Cliente vê histórico permitido sem dados clínicos privados
- [ ] Cliente vê pacote ativo, saldo e validade
- [ ] Autoagendamento dentro do portal funciona sem Auth de profissional
- [ ] Safari iOS e Android Chrome funcionam em 390px

---

### FASE 15 — Financeiro Operacional Avançado
**Duração estimada:** 3-4 semanas
**Entrega:** profissional controla venda presencial, cobrança, conciliação e configurações financeiras sem misturar com billing SaaS da plataforma.

**Jornadas-alvo:** J7, J62, J63, J65, J19 parcial.

**Backend:**
- Configurações financeiras: bancos, categorias, centros de custo, PIX/manual, gateways
- PDV para venda de serviços/produtos/pacotes
- Recibo/comprovante via instância do profissional
- Conciliação por CSV/OFX com matching auditável
- Baixa de estoque quando houver produto envolvido

**Frontend:**
- PDV mobile-first
- Tela de conciliação
- Configurações financeiras
- Extrato com origem PDV/cobrança/pacote

**DoD Fase 15:**
- [x] Venda no PDV cria transação financeira auditável
- [x] Comprovante pode ser enviado pela instância do profissional
- [x] Importação CSV/OFX sugere matches sem aplicar automaticamente sem confirmação
- [x] Configurações financeiras afetam lançamentos futuros sem reescrever histórico

---

### FASE 16 — Growth Comercial Completo
**Duração estimada:** 3-4 semanas
**Entrega:** crescimento deixa de ser apenas campanha e vira sistema comercial: funil, indicação, reativação, upsell, fidelidade, e-mail e chat público.

**Jornadas-alvo:** J9, J13, J17, J18, J23, J50, J55, J57, J58, J61, J64.

**Backend:**
- Funil de vendas do profissional: stages, opportunities, histórico e automações
- Chat público com anti-spam, contexto e handoff
- E-mail como canal com Resend/SMTP e opt-out
- Fidelidade e recompensas
- Upsell-agent com aprovação e métricas
- Health score cliente explicável e acionável

**Frontend:**
- `/funil`
- Campanhas avançadas
- Fidelidade/recompensas
- Chat público configurável
- Métricas de conversão por canal

**DoD Fase 16:**
- [x] Lead entra no funil e evolui por estágios com histórico
- [x] Campanha segmentada respeita opt-out/cooldown e mostra resultado
- [x] Upsell só dispara quando elegível e com canal permitido
- [x] Chat público cria conversa rastreável e permite handoff
- [x] E-mail respeita consentimento/opt-out e registra auditoria

---

### FASE 17 — Billing SaaS, Plataforma e Admin Operacional Avançado
**Duração estimada:** 3-4 semanas
**Entrega:** plataforma monetiza, controla planos/créditos e opera profissionais com segurança.

**Jornadas-alvo:** J11, J34, J35, J37, J38, J47, J48, J49, J52, J53.

**Backend:**
- Stripe checkout/webhook
- Trial, modo leitura, upgrade/downgrade e créditos IA
- Plano `free_internal` somente via admin/service_role
- Afiliados/embaixadores profissional→profissional
- Admin actions com auditoria
- Nexus executa ações com confirmação e escopo permitido
- Gestão de agentes, versões, prompts e rollback

**Frontend:**
- `/planos`
- Admin de planos/status
- Painel de afiliados/embaixadores
- Nexus com ações auditáveis
- Feature requests/melhorias

**DoD Fase 17:**
- [x] Stripe é fonte de verdade de assinatura
- [x] Trial expira e entra em modo leitura sem perder dados
- [x] Créditos IA limitam automações sem bloquear acesso aos dados
- [x] Admin consegue conceder `free_internal` sem checkout público
- [x] Nexus não executa ação sensível sem confirmação e auditoria

---

### FASE FUTURA — Advanced
Sem data. Não bloqueia nenhuma fase anterior.
- Knowledge Brain (pgvector, GraphRAG, knowledge_nodes)
- Partner API (api_keys, webhooks, rate limiting)
- Automações avançadas além das FASES 11-17
- NFS-e integrado

---

## 15. Definition of Done — Critérios Gerais

Todo item de qualquer fase só está pronto quando:

| Critério | Descrição |
|---|---|
| **Seed executado** | Seed sintético reproduzível executado antes do teste |
| **Happy path validado** | Funciona com professionalA + seeds corretos |
| **Isolamento validado** | professionalB não vê dados de professionalA |
| **Evento registrado** | Evento esperado registrado em message_events ou agent_executions |
| **Idempotência testada** | Operação repetida 2x tem resultado correto (sem duplicata) |
| **Fluxo público sem auth** | Se aplicável: funciona sem token de autenticação |
| **Mobile 390px** | Sem scroll horizontal. Bottom sheet onde deve ser. Loading inline. |
| **Backend seguro** | RLS com auth_professional_id(). Ownership validado nas RPCs. |
| **Log gerado** | Toda operação gera entrada em message_events ou agent_executions ou audit_log |
| **Estado vazio testado** | Tela sem dados tem empty state com próxima ação concreta |
| **Erro controlado testado** | Falha de rede, timeout, dado inválido → toast de erro específico, sem tela branca |
| **Performance OK** | Carregamento: máx 2 queries críticas. Listas: paginadas/cursor (nunca tudo). |
| **Sem dado hardcoded** | Nenhum professional_id no frontend. Nenhuma chave de API no código. |
| **DRY_RUN respeitado** | Testes automatizados não enviaram WhatsApp real nem chamaram IA real |
| **Build e lint passam** | `npm run lint` e `npm run build` sem erros |

---

## 16. Hierarquia de Documentos

| Documento | Autoridade sobre |
|---|---|
| **PRD-MASTER.md** (este) | Visão, invariantes, fases, DoD — manda sobre todos |
| **PRD-SCHEMA.md** | DDL completo, RLS, triggers, índices |
| **PRD-UX.md** | Design system, padrões de tela, checklist de UX |
| **PRD-FRONTEND.md** | Componentes, rotas, hooks |
| **PRD-EDGE-FUNCTIONS.md** | Contratos de Edge Functions |
| **PRD-CONSOLIDATION.md** | Tabelas consolidadas (o que foi fundido — o que NÃO criar) |
| **EXECUTION-PRD.md** | Stack, crons, integrações, deploy — segue a ordem de fases deste PRD |
| **EVENTS.md** | Contratos completos dos eventos canônicos |

**Em caso de conflito:** PRD-MASTER > PRD-UX (para UX) = PRD-CONSOLIDATION (para schema) > demais.

**Regra de autoridade para implementação:**
> Agentes e desenvolvedores só implementam com base em documento aprovado e versionado em `docs/`.
> Rascunhos, análises e inventários são contexto histórico — nunca spec de implementação.
> Se um documento não está em `docs/` versionado e aprovado, não é autoridade.
