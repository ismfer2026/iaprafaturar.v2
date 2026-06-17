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
- **Backend v1 não é referência técnica.** Functions, tabelas, RPCs, policies, filas e nomes de contratos da v1 não podem fundamentar implementação. A v1 serve somente para descobrir comportamento/telas. Todo contrato backend deve ser comprovado no banco e migrations da v2; Functions consolidadas da v2 apenas consomem esses contratos oficiais.
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
- **Uma capacidade, um dono e um contrato canônico.** Fases posteriores podem ampliar uma capacidade existente, mas não podem criar rota, tabela, RPC, Edge Function, fila ou componente paralelo para o mesmo objetivo.
- **Progressão precisa ser explícita.** Toda tarefa que amplia fase anterior declara artefatos reutilizados, incremento entregue, contratos preservados e itens proibidos de reconstruir.
- **Rota consolidada continua navegável.** Quando uma rota esperada for consolidada em um hub, a decisão deve definir URL canônica, alias/redirect, permissão, breadcrumb/menu e teste de navegação direta.
- **Decisão de não implementar fecha o gap formalmente.** Um recurso só pode sair da paridade com justificativa de produto aprovada, impacto nas jornadas e atualização dos PRDs e mapas de rotas relacionados.

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
| **Consolidação de Rotas e Contratos** | Ownership, rotas canônicas, redirects e preflight | 18 |
| **Paridade Profissional Operacional** | Operação diária, configurações, documentos e funil consolidados | 19 |
| **Estoque, Fiscal e Financeiro Avançado** | Estoque mínimo, rotas financeiras e decisão fiscal | 20 |
| **Growth Profissional Completo** | Campanhas, RFM, recompensas, retenção e parceiros | 21 |
| **Agentes IA Profissional** | Configuração, teste, observabilidade e operação da Rosane | 22 |
| **Admin SaaS Core** | Dashboard, profissionais, planos e configurações da plataforma | 23 |
| **Admin Growth e Afiliados** | Broadcast, notificações e operação administrativa de afiliados | 24 |
| **Client App Completo** | Portal e fluxos públicos seguros | 25 |
| **Hardening e Anti-Duplicidade** | QA, segurança, migração final e sincronização dos PRDs | 26 |
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

### Gate obrigatório antes de executar qualquer fase

Nenhuma tarefa entra em implementação sem uma ficha baseada em `docs/01-execution/PHASE-PREFLIGHT-CONTRACT.md` aprovada contendo:

1. app responsável, ator e permissões;
2. rota canônica, aliases/redirects e entrada de navegação;
3. fase dona da capacidade e fases anteriores que serão ampliadas;
4. componentes, hooks, tabelas, RPCs, Edge Functions, storage e filas existentes que serão reutilizados;
5. lacuna contratual real, caso seja necessária migration ou função nova;
6. estados loading, vazio, erro, sucesso, mobile 390px e i18n;
7. testes de RLS/IDOR, auditoria, idempotência e `DRY_RUN` aplicáveis;
8. atualização necessária em PRD-FRONTEND, PRD-SCHEMA e PRD-EDGE-FUNCTIONS.

Se já existir artefato equivalente, a tarefa deve ampliá-lo ou substituí-lo com migração documentada. Criar implementação paralela é bloqueado.

### Donos canônicos das capacidades sobrepostas

| Capacidade | Fundação existente | Fase dona do fechamento | Regra anti-conflito |
|---|---|---|---|
| Rosane e shadow mode | Fases 1 e 5 | Fase 22 | `/agentes` concentra configuração; `/conversas` concentra operação inline; `/configuracoes/assistente` redireciona para `/agentes` |
| Funil profissional | Fases 8 e 16 | Fase 19 | ampliar o mesmo `/funil`, contratos e componentes; não criar segundo kanban |
| Campanhas profissionais | Fases 8 e 16 | Fase 21 | ampliar `campaigns` e contratos v2; não recriar calendários/filas v1 |
| Fidelidade e recompensas | Fase 16 | Fase 21 | uma única capacidade e rota canônica; Fase 21 fecha UI e operação |
| Conciliação financeira | Fase 15 | Fase 20 | reutilizar contratos da Fase 15; Fase 20 fecha rota e paridade |
| Dashboard admin | Fases 9 e 17 | Fase 23 | ampliar dashboard e RPCs existentes; não criar dashboard paralelo |
| Afiliados da plataforma | Fase 17 | Fase 24 | `/embaixadores` é canônica no admin; não confundir com parceiros profissionais |
| Parceiros profissionais | contratos a validar | Fase 21 | professional vê apenas seu escopo; pagamentos administrativos ficam na Fase 24 |

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
- [x] `auth_professional_id()` retorna UUID correto do JWT
- [x] RLS em professionals bloqueia acesso cruzado (professionalB não vê professionalA)
- [ ] Login, logout, cadastro funcionam no mobile (390px)
- [x] Bottom nav renderiza e navega sem reload
- [x] Manifest PWA instalável no iOS Safari e Android Chrome

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
- [x] Seed `conversaInbound` processado sem erro
- [ ] Enviar mensagem para número admin → Nerissa responde em < 10s
- [x] Enviar mensagem para instância de profissional → Rosane registra em message_events
- [x] Mesmo webhook enviado 2x → processado 1x (idempotência verificada com seed duplicado)
- [x] HMAC inválido → retorna 401, não processa
- [x] Falha do agente → message_events registrado, agent_executions com status='failed'
- [x] DRY_RUN=true → nenhuma mensagem real enviada, payload logado
- [x] Nenhuma mensagem de cliente chega pelo canal admin (e vice-versa)
- [ ] 100 mensagens simultâneas com seed → nenhuma perdida (carga básica com dry_run)
- [x] Runbooks de FASE 1 criados

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
- [x] professionalA completa onboarding ponta a ponta com seed
- [x] Novo profissional cria conta pelo /cadastro
- [x] Nerissa guia setup pelo WhatsApp (nome, serviço, horário)
- [x] Profissional conecta instância Evolution Go via Nerissa
- [x] Rosane está ativa na instância do profissional ao final do onboarding
- [x] Nerissa informa riscos do WhatsApp pessoal e oferece guia do Business (não bloqueia)
- [x] /onboarding não rende sem estar completo (rota guardada)

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
- [x] Seed `agendamentoSintetico` criado com status `agendado`
- [x] Criar cliente (full_name obrigatório) funciona
- [x] Criar agendamento → status `agendado` → evento `appointment.created` registrado
- [x] Cancelar agendamento → status `cancelado` → evento `appointment.cancelled`
- [x] Registrar sessão → status `realizado` → evento `appointment.completed`
- [ ] Dashboard carrega em < 2s com dados reais
- [x] Mover cliente de stage (swipe) funciona sem erro, evento `client.journey_stage.changed` registrado
- [x] Sessão registrada atualiza histórico do cliente
- [x] professionalB não vê dados de professionalA (isolamento de tenant validado)
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
- [x] Lançar receita/despesa manual funciona
- [x] Extrato mostra transações filtradas por período
- [x] Dashboard Zona 3 mostra receita real do mês
- [x] Vincular pagamento a sessão atualiza status da sessão
- [x] professionalB não vê transações de professionalA (RLS validado)

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
- Configuração mínima necessária à automação; a rota canônica e a UI completa pertencem à Fase 22

**DoD Fase 5:**
- [x] Agendamento criado (FASE 3) → confirmação enviada automaticamente pela Rosane
- [x] Appointment status muda de `agendado` para `confirmado` ao confirmar via WhatsApp
- [x] Evento `appointment.confirmed` registrado com `actor_type='client'`, `source='whatsapp'`, `processed_by='rosane'` (Rosane interpretou, o cliente agiu)
- [x] D-1: lembrete enviado para todos os agendamentos do dia seguinte
- [x] Shadow mode: sugestão aparece no inbox para aprovação
- [x] Profissional aprova shadow → mensagem enviada pela instância correta
- [x] D+1: follow-up de pós-atendimento enviado
- [x] Inbox mostra urgente em destaque (rose), shadow em amber, normal sem cor
- [x] DRY_RUN=true em todos os testes automatizados — nenhuma mensagem real

**Fronteira com a Fase 22:**
- A Fase 5 funda `professional_agents`, automações e operação shadow em `/conversas`
- A Fase 22 amplia esses mesmos contratos e concentra configuração e observabilidade em `/agentes`
- É proibido criar uma segunda fonte de configuração em `/configuracoes/assistente`

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
- [x] Seed `leadSintetico` agenda pelo link público sem login
- [x] Agendamento público dispara evento `appointment.created`
- [x] Agendamento público dispara confirmação via Rosane (com FASE 5 ativa)
- [x] Anamnese preenchida pelo cliente aparece no perfil no CRM
- [x] Slug não encontrado → 404 com mensagem amigável (não 500)
- [x] Página de agendamento renderiza brand color da clínica corretamente
- [ ] Funciona no Safari iOS (sem PWA — só link direto)
- [x] Parâmetros `lang`, `ref`, `slug`, `token` sobrevivem a redirects e chamadas de agente
- [x] Toggle de idioma no app sobrescreve `lang` da URL (não o contrário)

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
- [x] Criar orçamento e enviar link por WhatsApp funciona
- [x] Pacote vinculado a cliente desconta sessões corretamente
- [x] Template de anamnese salvo e vinculado a agendamento funciona
- [x] professionalB não vê orçamentos ou pacotes de professionalA

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

**Fronteira com as Fases 16, 19 e 21:**
- Esta fase funda contratos e fluxos mínimos de growth
- Fase 16 amplia funil, canais e automações comerciais
- Fase 19 fecha a paridade operacional do mesmo `/funil`
- Fase 21 fecha campanhas, RFM, recompensas e retenção sem recriar contratos da Fase 8

**DoD Fase 8:**
- [x] Cliente inativo 30 dias → reativacao-agent enviado automaticamente (dry_run em testes)
- [x] RFM score calculado semanalmente para todos os clientes do professionalA
- [x] Campanha de broadcast criada, agendada e enviada (dry_run em testes)
- [x] Link de indicação funciona e rastreia conversão

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

**Fronteira com as Fases 17 e 23:**
- Esta fase funda o dashboard e suas métricas
- Fases 17 e 23 ampliam o mesmo dashboard e os RPCs existentes
- É proibido criar uma segunda visão principal ou contratos equivalentes para MRR, churn e saúde

**DoD Fase 9:**
- [x] Admin vê MRR real no dashboard
- [x] Health score de plataforma calculado diariamente
- [x] Nexus funciona (admin chata Nerissa por WhatsApp e pelo painel)

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
- [x] Relatórios carregam sem enviar `professional_id` por payload
- [x] Receita realizada/projetada respeita timezone `America/Sao_Paulo`
- [x] Exportação CSV funciona no mobile
- [x] RPC não possui grant residual para `anon`/`PUBLIC`

---

### FASE 11 — Onboardings Comerciais e Operacionais
**Duração estimada:** 2-3 semanas
**Entrega:** profissional, cliente e lead entram na plataforma com dados suficientes para atendimento, comunicação, agenda e venda.

> Esta fase existe porque agenda, comunicação, PWA cliente, Rosane e receita operacional dependem de dados coletados no onboarding. Não construir automação comercial sobre perfil incompleto.

**Jornadas-alvo:** J1, J2, J10 mínimo, J14 mínimo, J33, J51, J60.

**Backend:**
- Handoff público pré-conta protegido: `/entrar`, `/criar-conta`, `ref`, `lang`, `pid`, `conversation`, `collected_data`
- Criação Auth controlada por backend/RPC, preservando `auth.users.id = professionals.id = professionals.user_id`
- A Fase 11 deve preservar o invariante `auth.users.id = professionals.id = professionals.user_id` usando exclusivamente contratos comprovados no banco/migrations da v2. `/criar-conta` chama backend/RPC v2, valida `pid + email` e nunca usa `supabase.auth.signUp` direto no frontend. Se o `handle_new_user` atual da v2 quebrar o invariante, a fase deve corrigir o trigger v2 antes de liberar o fluxo.
- Nerissa completa dados mínimos do profissional: nome público, especialidade, serviços, horários, endereço/região, WhatsApp, regras de atendimento, nome/persona da Rosane
- Onboarding do cliente no PWA: identificação, aceite LGPD, vínculo ao profissional por slug/token/telefone, preferências básicas
- Admin/manual onboarding para casos de suporte sem quebrar auditoria

**Frontend:**
- Fluxo público de entrada do profissional sem Auth precoce
- `/criar-conta` validando `pid + email`
- `/onboarding` deixa claro o que falta para operar
- Apps client/professional preservam `ref`, `lang`, slug, token e código durante redirects

**DoD Fase 11:**
- [x] `handle_new_user` comum cria profissional autenticado com `professionals.id = professionals.user_id = auth.users.id`
- [x] `/criar-conta` protegido usa backend/RPC, preserva `pid + email + ref + lang + conversation + collected_data` e não chama `signUp` no frontend
- [x] Lead profissional entra por rota pública sem Auth, conversa com Nerissa e recebe URL de criação de conta
- [x] Conta criada preserva o mesmo UUID em `auth.users`, `professionals.id` e `professionals.user_id`
- [x] Profissional termina setup mínimo com serviço, horário e WhatsApp configurados
- [x] Rosane só fica ativa quando os dados mínimos existem
- [x] Cliente novo entra por link público, aceita LGPD, é vinculado ao profissional correto e fica pronto para agendar/comprar
- [x] `ref`, `lang`, `conversation`, slug, token e código sobrevivem ao fluxo completo
- [x] Nenhum fluxo pré-conta usa billing/créditos

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
- [x] Cliente novo manda mensagem e Rosane responde com informação real do banco, sem inventar serviço/preço/horário
- [x] Cliente agenda por WhatsApp e o appointment aparece na agenda
- [x] Cliente remarca/cancela por WhatsApp/PWA dentro das regras configuradas
- [x] Profissional assume uma conversa e Rosane para de responder até devolução explícita
- [x] Recorrência cria série correta e permite exceção
- [x] Follow-up/check-in respeita opt-out, horário permitido e instância do profissional

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
- [x] Cliente acessa `/pacote/:slug`, entende oferta e inicia conversa/compra assistida
- [x] Registrar sessão pode consumir pacote com confirmação do profissional
- [x] Pacote com ≤2 sessões gera alerta para cliente e profissional
- [x] Orçamento enviado gera link/PDF e follow-up automático se sem resposta
- [x] Orçamento aprovado pode virar contrato ou pacote sem digitação duplicada
- [x] Cobrança nunca é enviada automaticamente sem aprovação do profissional

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
- [x] Cliente acessa portal e vê próximo agendamento
- [x] Cliente vê histórico permitido sem dados clínicos privados
- [x] Cliente vê pacote ativo, saldo e validade
- [x] Autoagendamento dentro do portal funciona sem Auth de profissional
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

**Fronteira com a Fase 20:**
- Esta fase é dona da regra de negócio, matching e contratos de conciliação
- A Fase 20 reutiliza esses contratos para fechar a rota, a navegação e a integração opcional com estoque/fiscal
- É proibido criar segundo modelo de itens, importação ou confirmação de match

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
- Fundação de fidelidade e recompensas: regras, saldo/eventos e contratos necessários
- Upsell-agent com aprovação e métricas
- Health score cliente explicável e acionável

**Frontend:**
- `/funil`
- Campanhas avançadas
- Integração mínima de fidelidade/recompensas, sem criar rota ou programa paralelo
- Chat público configurável
- Métricas de conversão por canal

**Fronteira com as Fases 19 e 21:**
- Fase 19 fecha a operação do mesmo `/funil`
- Fase 21 fecha a UI e a operação de campanhas, RFM, fidelidade, recompensas, retenção e parceiros profissionais
- `/recompensas` é a única rota canônica da capacidade; Fase 21 deve reutilizar a fundação desta fase

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

### FASE 18 — Consolidação de Rotas, Navegação e Contratos
**Duração estimada:** 2-3 semanas, podendo estender se lacunas contratuais bloqueantes forem descobertas
**Entrega:** mapa canônico de rotas e contratos aprovado antes de desenvolver novas telas.

> Nenhuma feature de paridade entra em implementação antes de declarar app responsável, rota canônica e contrato Supabase.

**Governança e decisão:**
- Decision Owner final: Ismael, proprietário do produto
- Conflitos de rota, ownership, consolidação, descarte ou prioridade são escalados ao Decision Owner; consenso não é requisito para encerrar a decisão
- Registrar decisões e justificativas em `docs/01-execution/PHASE-18-DECISIONS.md`
- Nenhuma decisão crítica permanece como “a decidir depois” ao encerrar a matriz canônica

**Planejamento e contratos:**
- Usar os comparativos v1 somente para frontend/produto: `v1-v2-professional-frontend-gap.md` e `v1-v2-admin-frontend-gap.md`; usar `supabase-contract-map-v2.md` exclusivamente para contratos backend
- Classificar cada recurso v1 como: portar, substituir pelo modelo v2, descartar como legado ou bloquear até existir contrato
- Definir tabelas, RPCs, storage e RLS oficiais exclusivamente a partir do banco/migrations da v2
- Confirmar fronteiras: profissional em `apps/professional`, plataforma em `apps/admin`, cliente/público em `apps/client`
- Produzir ficha de contrato para cada capacidade das Fases 19-25 antes de sua implementação
- Mapear componentes, hooks, migrations, RPCs e Edge Functions já existentes; o inventário textual de fases não substitui auditoria técnica
- Proibir consulta a Functions, schema, RPCs ou policies da v1 para desenhar backend; Functions v2 consolidadas devem ser validadas contra os contratos oficiais do DB v2
- Priorizar auditoria contratual por risco bloqueante: auth recovery, parceiros profissional, estoque, financeiro/conciliação, documentos, configurações e analytics admin
- Toda lacuna contratual descoberta recebe imediatamente owner, fase responsável, prioridade, bloqueios causados e tarefa contratual

**Frontend:**
- Definir rotas canônicas, aliases e redirects
- Definir uma fonte planejada única para menu desktop, mobile e página “Mais”
- Exigir sub-rota ou query param estável para hubs com áreas importantes
- Completar auth profissional com `/recuperar-senha` e `/reset-password`
- Separar explicitamente `/parceiros` profissional de `/embaixadores` admin
- Mapear cada rota para jornadas, componentes, hooks, permissões e fase responsável

**Decisões canônicas obrigatórias desta fase:**
- `/agentes` é a única tela de configuração profissional da Rosane; `/configuracoes/assistente` redireciona para ela
- `/conversas` mantém apenas operação inline, takeover e aprovação/rejeição shadow
- `/recompensas`, `/rfm`, `/campanhas`, `/aniversariantes` e `/parceiros` são rotas profissionais; `/growth` é hub, não implementação paralela
- `/embaixadores` e `/broadcast` pertencem exclusivamente ao admin; `/afiliados` redireciona para `/embaixadores`
- `/configuracoes/admin` não existe no app profissional
- `/upgrade` redireciona para `/planos`
- `/teste-premium` e `/debug` não são rotas de produto; necessidades internas viram teste automatizado, runbook ou devtool protegido

**DoD Fase 18:**
- [x] Matriz de rotas dos três apps aprovada pelo Decision Owner
- [x] Cada rota aponta para jornadas, componentes/hooks existentes ou fase responsável pela entrega
- [x] Conflitos de rota, ownership e consolidação estão resolvidos e registrados em `PHASE-18-DECISIONS.md`
- [x] PRD-FRONTEND está sincronizado com a matriz aprovada antes de encerrar a definição de rotas
- [x] Cada lacuna aponta para contrato v2 existente ou tarefa contratual com owner, fase, prioridade e bloqueio explícito
- [x] Nenhuma rota pública de cliente permanece no app profissional; rotas públicas de autenticação profissional são exceção explícita
- [x] Nenhuma rota admin permanece no app profissional
- [x] Nenhuma tarefa de tela segue sem checklist Supabase
- [x] `/recuperar-senha` solicita link sem revelar existência da conta
- [x] `/reset-password` valida sessão/token, altera senha e retorna ao login
- [x] Cada rota consolidada possui URL canônica, alias/redirect e validação estrutural de navegação direta
- [x] Matriz separa `/parceiros` profissional de `/embaixadores` admin
- [x] Navegação consolidada preserva lazy loading; avisos de chunks existentes ficam registrados para a Fase 26
- [x] Nenhum conflito crítico de rota ou ownership permanece aberto ao encerrar a fase

**Evidências de encerramento:** `PHASE-18-ROUTE-MATRIX.md`, `PHASE-18-DECISIONS.md`, `PHASE-18-CONTRACT-GAPS.md`, `PHASE-18-PREFLIGHT-INDEX.md` e `PHASE-18-VALIDATION.md`.

---

### FASE 19 — Paridade Profissional Operacional
**Status:** concluída — PR 19.0 a 19.8 executados conforme `docs/01-execution/PHASE-19-EXECUTION-PLAN.md`
**Duração estimada:** 3-4 semanas
**Entrega:** fechar a operação diária do profissional sem duplicar contratos ou rotas.

**Escopo:**
- Dashboard: hoje, atenção, receita, leads quentes, clientes em risco e atividade da IA
- Clientes: lista/kanban aprovado, filtros, jornada, perfil, histórico, ações rápidas e anamnese
- Agenda: agenda, histórico/sessões, recorrência, status, detalhes e tarefas aprovadas
- Serviços: catálogo, categorias, CRUD e visão geral
- Funil: etapas, oportunidades, histórico, notas, tarefas e ações comerciais
- Documentos: subáreas navegáveis para pacotes, orçamentos, contratos e anamnese
- Configurações profissionais navegáveis, sem conteúdo administrativo da plataforma

**Rotas e aliases obrigatórios:**
- `/clientes/:id/anamnese`: visão e histórico de fichas do cliente
- `/servicos/novo`: rota acionável que abre o mesmo formulário/sheet do catálogo; não criar segundo formulário
- Versionamento de templates de anamnese ampliado em `/documentos/pacotes` (não criar `/configuracoes/anamnese` paralelo)
- `/documentos/pacotes`, `/documentos/orcamentos`, `/documentos/contratos`, `/documentos/anamnese`; aliases legados só por redirect
- `/configuracoes` é índice de sub-rotas; `/configuracoes/agenda`, `/configuracoes/notificacoes`, `/configuracoes/equipe` e `/configuracoes/clinica` existem; `/configuracoes/servicos` e `/configuracoes/anamnese` redirecionam para os owners canônicos
- `/configuracoes/assistente` redireciona para `/agentes`
- `/configuracoes/pagamento` redireciona para `/financeiro/configuracoes`
- `/configuracoes/plano` redireciona para `/planos`
- `/configuracoes/admin` é proibida no app profissional

**Backend/contratos:**
- Reutilizar RPCs v2 de clientes, agenda, serviços, funil, documentos e pacotes
- Validar RLS das leituras diretas
- Proibir recriação de tabelas legadas quando houver equivalente v2
- Ampliar o `/funil` existente das Fases 8 e 16; não criar segundo board, stages ou opportunities
- Fichas de anamnese respondidas são imutáveis/versionadas; revisão gera auditoria, não sobrescrita silenciosa
- Antes do primeiro PR de implementação, executar o PR 19.0 documental conforme `docs/01-execution/PHASE-19-EXECUTION-PLAN.md`
- O PR 19.0 deve aprovar contratos específicos para anamnese versionada, gestão segura de equipe/roles, notificações e business hours
- O PR 19.0 deve aprovar matriz de permissões `operacional` versus `gestor` e inventário de componentes/hooks/RPCs
- Agenda por membro, tarefas do funil, escrita de categorias e telas de configurações permanecem bloqueadas até contrato DB v2 comprovado
- Ocultar ação no frontend não substitui autorização no DB/RPC

**DoD Fase 19:**
- [x] Fluxos operacionais principais funcionam sem rotas duplicadas
- [x] Toda escrita multi-tabela usa RPC/Edge Function aprovada
- [x] Perfil do cliente reúne histórico, financeiro, pacotes, documentos e anamnese permitida
- [x] Documentos/pacotes possuem URLs navegáveis
- [x] Mapa profissional atualizado com decisão final de cada recurso
- [x] Todas as rotas e redirects de configurações definidos acima funcionam por URL direta
- [x] Versionamento de templates de anamnese (`/documentos/pacotes`) cria nova versão sem alterar fichas já respondidas
- [x] `/clientes/:id/anamnese` mostra histórico permitido e ações auditáveis
- [x] Criação/edição de serviços e configurações respeitam roles; `operacional` não executa ação de `gestor`
- [x] `/servicos/novo` reutiliza o formulário do catálogo e bloqueia acesso sem role `gestor`
- [x] `/funil` reutiliza os contratos e componentes existentes, sem implementação paralela

**Dívidas registradas no encerramento:**
- Exceções de horário de funcionamento (`business_hours.exceptions`, datas com horário especial/feriados) têm schema, validação e persistência completos, mas `/configuracoes/agenda` ainda não oferece UI de edição — apenas preserva o array existente ao salvar.
- Bundle `index-*.js` do `apps/professional` ultrapassa 500kB após minificação (aviso do Vite); code-splitting adicional fica para a Fase 26 (conforme já registrado no encerramento da Fase 18).
- QA manual em dispositivos físicos (390px reais, gestos, performance) segue deferida até ambiente de staging + dispositivos (Grupo B registrado no encerramento dos gaps das Fases 5/12/17).

**Correções da validação independente:**
- Tenant e role de membros da equipe resolvidos por `auth_professional_id()` + `get_professional_auth_context()`.
- Criação de membro usa `invite-team-member`, vinculando identidade Supabase Auth antes do primeiro acesso.
- Versionamento de anamnese troca a versão atual antes de inserir a sucessora na mesma transação.
- Escritas de documentos/pacotes exigem gestor no banco; preferências pessoais do dono não sobrescrevem defaults da clínica.
- Dashboard inclui leads quentes, clientes em risco e atividade da IA no contrato único `get_dashboard_rpc`.
- `/configuracoes/clinica` possui contrato e tela próprios; `/configuracoes/servicos` e `/configuracoes/anamnese` são aliases.

---

### FASE 20 — Estoque, Fiscal e Financeiro Avançado
**Duração estimada:** 3-4 semanas
**Entrega:** fechar as lacunas financeiras, fiscais e de estoque sem conflitar com o modelo v2.

**Escopo:**
- Entregar `/estoque` mínimo operacional ligado ao PDV: produtos, saldo, movimentações, baixo estoque e vencimentos
- Reservas, manutenção e importação assistida entram somente após contrato aprovado, sem bloquear o estoque mínimo
- `/financeiro/conciliacao` com importação CSV/OFX e confirmação auditável
- `/financeiro/configuracoes` para bancos, categorias, centros de custo, PIX, gateways e recibos
- Avaliar NFSe/fiscal da v1 antes de criar tela ou schema

**Backend/contratos:**
- Usar `finance_reconciliation_items`, `import_reconciliation_items` e `confirm_reconciliation_match`
- Validar integração entre `upsert_product`, PDV e baixa de estoque
- Reutilizar integralmente matching e regras de conciliação da Fase 15
- NFSe só entra com contrato oficial no PRD-SCHEMA

**DoD Fase 20:**
- [x] `/estoque` mínimo operacional existe e reconcilia movimentações com vendas do PDV
- [x] professionalA não vê ou altera estoque de professionalB
- [x] Conciliação nunca aplica match sem confirmação
- [x] Configurações financeiras não reescrevem histórico
- [x] NFSe possui contrato aprovado ou permanece explicitamente fora do escopo
- [x] Nenhuma tabela legada fiscal/estoque foi recriada sem validação
- [x] Fase 20 não criou segundo modelo de conciliação, importação ou confirmação de match

---

### FASE 21 — Growth Profissional, Recompensas e Retenção
**Duração estimada:** 3-4 semanas
**Entrega:** growth profissional completo, acionável e separado da comunicação admin.

**Escopo:**
- Manter `/growth` como hub navegável para as rotas canônicas do domínio
- Campanhas profissionais: segmento, agendamento, envio, resultados, opt-out e cooldown
- RFM: matriz, segmentos, recalcular e iniciar ação
- Recompensas: indicações, fidelidade, ranking, programa, templates e resgates
- Aniversariantes, clientes em risco, reativação e upsell
- Parceiros profissionais: vínculo/links próprios, indicações atribuídas, desempenho e comissões visíveis; aprovação e pagamento permanecem no admin

**Rotas canônicas profissionais:**
- `/campanhas`, `/rfm`, `/recompensas`, `/aniversariantes` e `/parceiros`
- `/growth` agrega atalhos e indicadores, mas não mantém uma segunda implementação dessas áreas

**Backend/contratos:**
- Usar `campaigns`, `campaign_recipients`, `campaign_dispatches`, `rfm_scores`, `client_health_scores`, `referral_links`, `referral_events` e RPCs v2
- Não recriar filas/calendários de campanha da v1 sem decisão explícita
- Toda comunicação respeita opt-out, cooldown, horário e instância correta
- Reutilizar a fundação de campanhas da Fase 8 e os contratos comerciais/recompensas da Fase 16
- Definir contrato profissional de parceiros separado dos contratos administrativos de aprovação e pagamento

**DoD Fase 21:**
- [ ] Campanhas profissionais mostram resultados e respeitam consentimento
- [ ] RFM gera segmentos acionáveis
- [ ] Recompensas cobre indicação, fidelidade, ranking e resgate
- [ ] `/aniversariantes` possui UI navegável, lista/filtros e ações permitidas; qualquer consolidação mantém redirect para essa URL canônica
- [ ] `/parceiros` mostra somente relações e métricas permitidas ao profissional autenticado
- [ ] Growth profissional não usa contratos de broadcast admin
- [ ] Campanhas e recompensas ampliam os contratos existentes sem filas, programas ou saldos paralelos
- [ ] `/growth` não duplica regras, formulários ou fontes de dados das rotas canônicas

---

### FASE 22 — Agentes IA Profissional e Operação da Rosane
**Duração estimada:** 3-4 semanas
**Entrega:** profissional controla a Rosane sem alterar configurações globais da plataforma.

**Escopo:**
- `/agentes` profissional: tom, persona operacional, canais, horários, regras, shadow mode e agentes ativos
- Chat de teste com contexto real e sem envio externo automático
- Aprovar, editar e rejeitar sugestões
- Logs e métricas operacionais visíveis ao profissional
- Decidir destino de `personas` e `rlhf_rules` da v1
- `/configuracoes/assistente` funciona apenas como redirect para `/agentes`
- `/conversas` mantém aprovação/rejeição inline e takeover, sem formulário paralelo de configuração

**Backend/contratos:**
- Usar `professional_agents`, `shadow_suggestions`, `message_events`, `agent_executions` e contratos de conversa
- Prompt global e versionamento continuam sob responsabilidade do admin
- Ampliar contratos fundados nas Fases 1 e 5; nova tabela ou função exige prova de lacuna

**DoD Fase 22:**
- [x] Configuração profissional não altera prompt global
- [x] Shadow suggestions possuem auditoria completa
- [x] Chat de teste não envia mensagem real sem confirmação
- [x] Logs respeitam isolamento de tenant
- [x] Decisão sobre personas/RLHF registrada antes de schema novo
- [x] `/agentes` é a única fonte de configuração profissional da Rosane
- [x] `/configuracoes/assistente` redireciona sem manter estado ou persistência paralela
- [x] Fase 22 reutiliza `professional_agents` e o fluxo shadow existente

---

### FASE 23 — Admin SaaS Core e Configurações da Plataforma
**Duração estimada:** 3-4 semanas
**Entrega:** admin v2 opera profissionais, planos, métricas e configurações com segurança.

**Escopo:**
- Ampliar o dashboard das Fases 9 e 17 com MRR, churn, profissionais, alertas, saúde e logs relevantes
- Profissionais: busca, filtros, detalhes, assinatura, wallet/saldo, status e onboarding manual
- Planos: decidir CRUD, features e calculadora financeira ou modelo controlado por migration/RPC
- `/analytics`: métricas detalhadas; dashboard mantém apenas resumo acionável
- Configurações globais: integrações, credenciais, status e segurança
- Agentes globais: completar ativação, versões de prompt, métricas/logs e rollback sem tocar configurações profissionais
- Melhorias: consolidar workflow de feature requests e histórico relevante
- Onboarding administrativo acontece dentro de `/profissionais`; não criar wizard paralelo sem gap aprovado

**Rotas canônicas admin desta fase:**
- `/dashboard`, `/analytics`, `/profissionais`, `/planos`, `/agentes`, `/melhorias` e `/configuracoes`

**Backend/contratos:**
- Reutilizar `get_admin_dashboard_rpc`, `get_admin_phase17_dashboard` e demais RPCs admin existentes; criar contrato somente quando a lacuna estiver documentada
- Proibir CRUD direto de configurações sensíveis
- Toda ação admin gera auditoria

**DoD Fase 23:**
- [x] Profissionais, planos, assinaturas e créditos são operáveis por contratos auditáveis
- [x] Configurações globais possuem RPC/Edge Function segura
- [x] Métricas v1 foram portadas ou consolidadas com decisão registrada
- [x] CRUD/calculadora de planos possui decisão final
- [x] Nenhuma ação sensível depende de acesso direto improvisado
- [x] Existe uma única visão principal de dashboard admin e uma única fonte contratual por métrica
- [x] Nenhum card de MRR, churn, saúde ou profissionais foi reimplementado com consulta paralela
- [x] `/analytics` reutiliza os contratos do dashboard sem recalcular métricas em consultas paralelas
- [x] Agentes globais não alteram `professional_agents` de um tenant sem ação explícita, autorizada e auditada
- [x] Onboarding manual reutiliza `/profissionais` e contrato auditável, sem fluxo administrativo paralelo

> **Implementação Fase 23 (2026-06-14):** planos permanecem controlados por migration/RPC especializada, sem CRUD genérico. `/dashboard` e `/analytics` usam `platform_metrics_daily` e contratos curados `phase23_*`. Configurações globais expõem somente estado sanitizado em `platform_admin_settings`; segredos não são armazenados nem retornados pelo frontend. Ações globais são registradas no log imutável `platform_admin_audit_log`.

---

### FASE 24 — Admin Growth, Broadcast, Notificações e Afiliados
**Duração estimada:** 3-4 semanas
**Entrega:** comunicação de plataforma e operação de afiliados completas, sem conflitar com growth profissional.

**Escopo:**
- Usar `/broadcast` como rota canônica da comunicação admin; `/campanhas` e `/notificacoes` admin são aliases ou subáreas, nunca domínios paralelos
- Audiência, canais, dry-run, envio, histórico, leitura e limpeza
- Embaixadores: aprovação, suspensão, criação, links, indicações, comissões, PIX e histórico
- Métricas de afiliados e comunicação admin
- `/embaixadores` é a rota administrativa canônica; `/afiliados` redireciona para ela; `/parceiros` pertence exclusivamente ao profissional
- `/leads` administra apenas leads comerciais da plataforma/Nerissa; nunca oportunidades do funil profissional

**Backend/contratos:**
- Usar `admin-broadcast` e contratos específicos para histórico/canais
- Usar contratos da fase 17 e `affiliate-commission-cron`
- Pagamentos e comissões exigem auditoria
- Não reutilizar campanhas profissionais para broadcast admin sem separação explícita
- Não expor ações de aprovação, suspensão ou pagamento no app profissional

**DoD Fase 24:**
- [x] Broadcast/notificações possui contrato único e histórico
- [x] Campanhas admin foram portadas ou consolidadas com decisão registrada
- [x] Embaixadores cobre operação e pagamentos auditáveis
- [x] UI identifica claramente o público de cada comunicação
- [x] Growth admin não conflita com growth profissional
- [x] `/embaixadores` admin e `/parceiros` profissional usam permissões e experiências distintas
- [x] `/afiliados` redireciona para `/embaixadores` sem implementação paralela
- [x] `/broadcast` é a única implementação de comunicação admin
- [x] `/leads` usa contratos da plataforma e não lê ou altera o `/funil` de profissionais

---

### FASE 25 — Client App e Portal do Cliente
**Duração estimada:** 2-3 semanas
**Entrega:** parte cliente da v2 inventariada, estabilizada e segura.

> Esta fase não busca paridade com v1, pois o app cliente não existia nela.

**Escopo:**
- Inventariar agendamento, ações de agendamento, anamnese, pacote, orçamento, chat e portal
- Portal: home, histórico permitido, pacotes, agendar e onboarding
- Validar token/slug, rate limit, privacidade, idioma, marca e mensagens de erro
- Preservar `lang`, `ref`, `slug` e `token` em redirects
- Reutilizar o chat público e contratos fundados na Fase 16; esta fase valida a experiência cliente, não cria segundo chat

**Backend/contratos:**
- Usar somente handlers públicos aprovados
- Proibir acesso direto amplo a tabelas pelo app client
- Garantir que respostas públicas não vazam dados
- Cada handler público possui validação runtime, rate limit, resposta mínima e teste de token/slug inválido

**DoD Fase 25:**
- [x] Todas as rotas client foram inventariadas e testadas em 390px
- [x] Nenhum fluxo depende de auth profissional
- [x] Token inválido, expirado e slug inexistente geram erros amigáveis
- [x] Cliente vê somente dados permitidos
- [x] Idioma, marca e parâmetros sobrevivem ao fluxo
- [x] Chat, agendamento, anamnese, pacote e orçamento reutilizam handlers canônicos sem acesso direto paralelo

**Implementação Fase 25 (2026-06-14):**
- sete handlers públicos possuem contrato runtime compartilhado, rate limit canônico e resposta mínima;
- `public_request_rate_limits` armazena somente fingerprint SHA-256 e é acessível apenas por `service_role`;
- portal usa `sessionStorage`, limpa sessão/cache em logout ou expiração e não cria segundo auth;
- `/portal/*` cobre home, histórico paginado, pacotes, agendamento, onboarding/perfil, cancelamento e reagendamento;
- `/chat/:slug` continua sendo a implementação única fundada na Fase 16;
- app client não usa acesso direto amplo a tabelas e não possui fallback para tenant `demo`.

---

### FASE 26 — Hardening, QA, Migração Final e Anti-Duplicidade
**Status:** tecnicamente concluída em 2026-06-15; Go comercial aguarda gate físico externo
**Duração estimada:** 3-4 semanas
**Entrega:** v2 completa, testada, documentada e sem recursos conflitantes.

**Escopo:**
- Auditoria final professional/admin/client contra os mapas v1/v2/Supabase
- Testes de RLS, IDOR, permissão, dry-run, idempotência e auditoria
- Performance, paginação/cursor, payloads públicos e timeouts
- Mobile 390px, Safari iOS, Android Chrome e i18n
- Remover links mortos, aliases sem destino e menus duplicados
- Registrar recursos legados descartados e runbooks finais
- Auditar conflitos reais no código: rotas, componentes, hooks, migrations, tabelas, RPCs, Edge Functions, storage, filas e policies
- Validar que cada capacidade possui exatamente um dono, uma rota canônica e uma fonte contratual

**DoD Fase 26:**
- [x] Matriz v1/v2 possui decisão final para todos os recursos
- [x] Lint, typecheck e build passam no monorepo
- [x] RLS/IDOR validado para professionalA, professionalB e admin
- [x] Fluxos públicos testados com tokens válidos e inválidos
- [x] Nenhum menu aponta para rota sem tela aprovada
- [x] Nenhum recurso está duplicado entre admin, professional e client
- [x] PRD-MASTER, PRD-FRONTEND, PRD-SCHEMA e PRD-EDGE-FUNCTIONS estão sincronizados
- [x] Nenhum domínio possui tabelas, RPCs, Edge Functions, filas ou componentes paralelos com a mesma responsabilidade
- [x] Aliases e redirects possuem teste; nenhuma rota consolidada depende apenas de estado local de aba
- [x] Matriz de cobertura comprova rota + permissão + contrato + estados + teste para cada jornada
- [x] Recursos descartados possuem decisão de produto aprovada e não permanecem em menus, mapas ou contratos órfãos

**Evidências finais:** `PHASE-26-CAPABILITY-LEDGER.md`, `PHASE-26-JOURNEY-MATRIX.md`, `PHASE-26-QA-REPORT.md`, `PHASE-26-RUNBOOK.md`, `npm test`, `npm run phase26:live` e `npm run phase26:ui`.

**Gate externo de release:** Safari iOS e Android Chrome físicos permanecem obrigatórios antes do Go comercial; não são apresentados como executados nesta estação Windows.

---

### FASE 27 — Paridade Percebida v1 -> v2 e Recovery de Recursos
**Status:** concluída (PRs 27.1, 27.2, 27.3, 27.6, 27.7); PR 27.5 deferido por Ismael; Go/No-Go comercial: decisão de Ismael pendente
**Duração estimada:** 2-4 semanas
**Entrega:** v2 preserva ou supera os recursos úteis da v1, sem ressuscitar bugs, rotas conflitantes ou backend duplicado.

**Escopo:**
- Auditar visualmente v1 profissional, v1 admin, v2 profissional, v2 admin e v2 client
- Classificar cada recurso v1 como preservado, evoluído, consolidado, redirecionado, recriado com contrato v2 ou descartado por decisão de Ismael
- Recuperar recursos úteis percebidos como ausentes sem copiar functions/backend da v1
- Implementar aliases/redirects legados críticos sem estado paralelo
- Reconstruir experiências financeiras avançadas sobre contratos v2
- Validar WhatsApp self-service com contrato seguro v2
- Decidir NFS-e como retorno controlado ou fase futura explicitamente aceita
- Validar estoque operacional avançado sem segunda fonte de saldo
- Validar paridade admin em métricas, onboarding profissional, campanhas/templates/gatilhos e embaixadores

**Invariantes:**
- v1 é referência de jornada e experiência, nunca padrão técnico de DB/functions.
- DB, migrations, RLS, RPCs e Edge Functions da v2 são fonte técnica de verdade.
- Nenhum recurso volta criando tabela, RPC, fila, hook ou rota paralela com a mesma responsabilidade.
- Toda lacuna sem contrato v2 vira tarefa de schema guard antes de UI.
- Go comercial só pode ocorrer após matriz v1 -> v2 fechada e aprovada por Ismael.

**DoD Fase 27:**
- [x] Matriz v1 -> v2 cobre todas as rotas/telas profissionais e admin da v1
- [x] Cada recurso possui decisão explícita: preservar, consolidar, redirecionar, recriar com contrato v2 ou descartar aprovado
- [x] Financeiro avançado possui paridade aprovada — Caixa, Fluxo, Conta Cliente, Repasses, Export Contador (PR 27.2)
- [x] NFS-e: decisão explícita de projeto separado (aprovado por Ismael)
- [x] WhatsApp self-service: QR + pairing code via AgentesPage, sem expor credenciais (PR 27.3)
- [x] URLs legadas críticas: aliases e redirects implementados (PR 27.1)
- [x] Estoque avançado: deferido por Ismael (PR 27.5) — não cria segunda fonte de saldo
- [x] Admin `/metricas` → redirect `/analytics` ✓; campaigns/templates → `campaign_templates` (PR 27.6) ✓; onboarding profissional → `/profissionais/:id` (parcial — aceito)
- [x] Nenhum contrato/backend/function da v1 foi copiado como padrão
- [x] Rotas, menus e aliases passam no audit de não-duplicidade
- [x] PRD-MASTER e documentos satélite refletem decisões finais da Fase 27
- ⚠️ Gate externo pendente: validação física Safari iOS + Android Chrome (não executável nesta estação Windows)

**Documentos base:** `POST-PHASE-26-V1-V2-PARITY-AUDIT.md`, `PHASE-27-PREFLIGHT.md`, `PHASE-27-EXECUTION-PLAN.md`.

---

### FASE FUTURA — Advanced
Sem data. Não bloqueia nenhuma fase anterior.
- Knowledge Brain (pgvector, GraphRAG, knowledge_nodes)
- Partner API (api_keys, webhooks, rate limiting)
- Automações avançadas além das FASES 11-26
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
| **Preflight aprovado** | Ficha baseada em `PHASE-PREFLIGHT-CONTRACT.md` aprovada antes da implementação |
| **Ownership preservado** | A capacidade possui um dono; fases posteriores ampliam sem implementação paralela |
| **Rota canônica validada** | URL direta, aliases/redirects, menu e permissões testados |
| **Não-duplicidade comprovada** | Busca técnica não encontrou contrato, schema, fila ou componente paralelo equivalente |

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
| **PHASE-PREFLIGHT-CONTRACT.md** | Ficha obrigatória de ownership, rotas, contratos v2, segurança e não-duplicidade antes de implementar |
| **EVENTS.md** | Contratos completos dos eventos canônicos |

**Em caso de conflito:** PRD-MASTER > PRD-UX (para UX) = PRD-CONSOLIDATION (para schema) > demais.

**Regra de autoridade para implementação:**
> Agentes e desenvolvedores só implementam com base em documento aprovado e versionado em `docs/`.
> Rascunhos, análises e inventários são contexto histórico — nunca spec de implementação.
> Se um documento não está em `docs/` versionado e aprovado, não é autoridade.
