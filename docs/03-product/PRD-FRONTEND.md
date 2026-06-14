# PRD — Frontend v2 (Todas as Rotas e Componentes)

---

## Governança de rotas

- Fontes de verdade em runtime: `apps/professional/src/routes.ts`, `apps/admin/src/routes.ts` e `apps/client/src/routes.ts`.
- Matriz aprovada: `docs/01-execution/PHASE-18-ROUTE-MATRIX.md`.
- Rotas descritas neste PRD que ainda não constam no registro runtime são planejadas e pertencem à fase indicada na matriz; não representam tela já entregue.
- Menus desktop, mobile e Mais devem derivar dos registros tipados. Rotas desconhecidas exibem 404 controlado.
- Contratos backend são comprovados exclusivamente pela v2 conforme `docs/01-execution/supabase-contract-map-v2.md`.

---

## apps/professional — CRM do Profissional

### Convenções
- Importar supabase de `@/lib/supabase`
- Usar `professionalId` do AuthContext como `professional_id` em queries (NUNCA `user.id` — semântica ambígua; NUNCA `user.user_id` — é o authUserId, não o professionals.id)
- Todo hook de dados: `useQuery` com `enabled: !!profId`
- Mutações: `onSuccess` invalida queries, `onError` faz `toast.error`
- Componentes com permissão: envolver com `<PlanGate capability="...">` ou verificar `canAccessRoute()`

### Rotas — Auth (sem autenticação)

| Rota | Componente | Jornada |
|---|---|---|
| `/` | `LandingPage` | J1 |
| `/login` | `Login` | J1 |
| `/cadastro` | `Cadastro` | J1 |
| `/recuperar-senha` | `RecuperarSenha` | J1 |
| `/reset-password` | `ResetPassword` | J1 |
| `/criar-conta` | `CriarConta` | J1 |

### Fronteira pública

Rotas públicas voltadas ao cliente, como agendamento, anamnese, pacote, orçamento, chat e portal, pertencem exclusivamente ao `apps/client` e são declaradas em `apps/client/src/routes.ts`. O professional mantém apenas rotas de autenticação e criação de conta do profissional.

### Rotas — Auth sem onboarding

| Rota | Componente | Jornada |
|---|---|---|
| `/onboarding` | `Onboarding` | J1 |
| `/upgrade` | redirect para `/planos` | J11 |

### Rotas — Protegidas (auth + onboarding + role)

| Rota | Componente | Role mínimo | Jornada |
|---|---|---|---|
| `/dashboard` | `Dashboard` | operacional | J27 |
| `/agenda` | `Agenda` | operacional | J4 |
| `/clientes` | `Clientes` | operacional | J12 |
| `/clientes/:id` | `ClientePerfil` | operacional | J14 |
| `/clientes/:id/anamnese` | `AnamneseCliente` | operacional | J5 |
| `/funil` | `FunilVendas` | operacional | J55 |
| `/estoque` | `Estoque` | operacional | J22 |
| `/documentos/pacotes` | `Pacotes` | gestor | J24 |
| `/servicos` | `Servicos` | gestor | J4 |
| `/servicos/novo` | `NovoServico` | gestor | J4, J6 |
| `/financeiro` | `Financeiro` | operacional | J7 |
| `/financeiro/conciliacao` | `Conciliacao` | gestor | J63 |
| `/financeiro/configuracoes` | `ConfiguracoesFinanceiro` | gestor | J65 |
| `/conversas` | `Conversas` | operacional | J3 |
| `/documentos/orcamentos` | `Orcamentos` | gestor | J54 |
| `/documentos/orcamentos/novo` | `NovoOrcamento` | gestor | J54 |
| `/documentos/orcamentos/editar/:id` | `EditarOrcamento` | gestor | J54 |
| `/documentos/contratos` | `Contratos` | gestor | J26 |
| `/documentos/contratos/novo` | `NovoContrato` | gestor | J26 |
| `/documentos/anamnese` | `AnamneseDocumentos` | gestor | J5 |
| `/relatorios` | `Relatorios` | gestor | J36 |
| `/rfm` | `RFM` | gestor | J37 |
| `/campanhas` | `Campanhas` | gestor | J19 |
| `/agentes` | `Agentes` | gestor | J20, J21 |
| `/recompensas` | `Recompensas` | gestor | J9, J16 |
| `/aniversariantes` | `Aniversariantes` | operacional | J58 |
| `/parceiros` | `Parceiros` | gestor | J48 |
| `/growth` | `GrowthHub` | gestor | J37, J58 |
| `/planos` | `Planos` | gestor | J11 |
| `/mais` | `Mais` | operacional | navegação |
| `/configuracoes` | `ConfiguracoesIndexPage` | operacional | J18 |
| `/configuracoes/agenda` | `ConfiguracoesAgendaPage` | operacional (seções de clínica/equipe só gestor) | J18 |
| `/configuracoes/notificacoes` | `ConfiguracoesNotificacoesPage` | operacional (seção de clínica só gestor) | J18 |
| `/configuracoes/equipe` | `ConfiguracoesEquipePage` | gestor | J18 |
| `/configuracoes/clinica` | `ConfiguracoesClinicaPage` | gestor | J18 |

> `/pacotes`, `/orcamentos*`, `/contratos*`, `/documentos-pacotes`, `/configuracoes/assistente`, `/configuracoes/pagamento`, `/configuracoes/plano`, `/configuracoes/servicos`, `/configuracoes/anamnese` e `/upgrade` são aliases/redirects de compatibilidade, não telas paralelas.
>
> **Decisão da Fase 19 (corrigida após validação independente):** `/configuracoes` é um índice de sub-rotas. `/configuracoes/clinica` possui tela e contrato próprios. `/configuracoes/anamnese` e `/configuracoes/servicos` são aliases para `/documentos/anamnese` e `/servicos`; o card Assistente aponta para `/agentes`.

---

### Componentes por página (detalhado)

#### Dashboard (`/dashboard`)

> Regra PRD-UX: não é painel de métricas, é tela de contexto + ação. 3 zonas fixas.

```typescript
// Zona 1 — HOJE (sempre visível, não scrollável)
<DashboardHoje />
// Saudação contextual (manhã/tarde/noite) + data
// Lista de agendamentos do dia com status (confirmado, shadow mode ✦)
// Botão primário: "+ Encaixe rápido"

// Zona 2 — ATENÇÃO NECESSÁRIA (só renderiza se há itens urgentes)
<DashboardAtencao />
// Itens que requerem ação do profissional hoje:
//   ✦ Shadow mode pendente → abre inbox na mensagem
//   💬 Mensagem urgente → abre conversa
//   ⏱ Trial expirando → link para upgrade (não banner global)
// Se não há itens: zona não renderiza. Tela limpa = boa notícia.

// Zona 3 — PULSO DO MÊS (scroll para ver)
<DashboardPulso />
// 1 número grande: receita do mês + tendência (↑↓ vs mês anterior)
// Contexto mínimo: N sessões · M clientes
// Link "Ver financeiro completo" (não card)

// Hook único:
useQuery(['dashboard-rpc', profId]) // RPC server-side agrega tudo em 1 query
```

#### Agenda (`/agenda`)

```typescript
// Views (toggle: Dia | Semana | Mês):
<AgendaSemanaCompacta />  // Mobile: barras de ocupação por dia (não grade horária)
                          // Toca o dia → expande para lista de agendamentos + slots livres
<AgendaMes />             // Visão mensal com badges de quantidade
<AgendaDia />             // Lista do dia ordenada por hora, slots livres visíveis com tap p/ criar
// Sem grade 07:00-21:00 no mobile — usar lista com slots livres intercalados

// Ações:
<NovoAgendamentoModal /> // Criar appointment (cliente, serviço, data/hora, team_member)
<AgendamentoPerfil />    // Detalhe: editar, cancelar, registrar sessão, confirmar
<SerieRecorrenteModal /> // Criar/gerenciar série recorrente (J56)

// Filtros:
- Por team_member (secretária vê agenda de todos; profissional pode filtrar)
- Por status (agendado, confirmado, concluido, cancelado)

// Indicadores visuais:
- 🔗 ícone para agendamentos de série recorrente
- ⚠️ badge para não confirmados (D-1 sem resposta)
- 🟡 cor para sessões com pagamento pendente
```

#### Clientes (`/clientes`)

```typescript
// Lista:
<KanbanJornada />        // Cards por journey_stage (drag-drop entre stages)
<ListaClientes />        // Tabela com busca, filtros, paginação
<MapaClientes />         // Futuramente: geolocalização (ponto em aberto)

// Filtros:
- journey_stage
- rfm_segment
- health_score.risk_level
- tem_agendamento_futuro
- inativo há X dias

// Ações globais:
<ImportarClientesModal />  // CSV import
<NovoClienteModal />       // Cadastro manual

// Hooks:
useQuery(['clients', profId, filtros])
useMoveClientStage()      // otimistic update
```

#### Perfil do Cliente (`/clientes/:id`)

```typescript
// Tabs:
<TabResumo />            // Health score, journey stage, próxima sessão, saldo pontos
<TabHistorico />         // Sessões, pagamentos, anamnese, documentos (timeline)
<TabConversas />         // Conversa WhatsApp/email com Rosane (somente leitura do histórico)
<TabFinanceiro />        // Transações, pacotes ativos, inadimplência
<TabAnamnese />          // Fichas de anamnese preenchidas
<TabDocumentos />        // Orçamentos e contratos

// Ações:
<RegistrarSessaoButton />   // Abre NovoServico (J6)
<EnviarMensagemButton />    // Abre conversa no inbox
<GerarOrcamentoButton />    // Redireciona para /documentos/orcamentos/novo?client=id
```

#### Financeiro (`/financeiro`)

```typescript
// Tabs:
<ExtratoBancario />       // Lista de financial_transactions com filtros
<DRE />                   // Receitas vs despesas por período (gráfico)
<ContasReceber />         // Pendentes de recebimento
<ContasPagar />           // Despesas futuras

// Ações:
<PDVModal />              // Venda rápida (J62) — botão "Venda Rápida"
<NovaTransacaoModal />    // Lançamento manual
<ImportarOFXDialog />     // Upload OFX → redireciona para /financeiro/conciliacao

// Formatação monetária: sempre pt-BR, R$ com decimais
```

#### Conciliação (`/financeiro/conciliacao`)

```typescript
// Fluxo:
1. <SelecionarContaStep />     // Escolher bank_account_id
2. <ImportarExtratoStep />     // Upload OFX/CSV + preview de lançamentos
3. <RevisaoMatchesStep />      // Lista de matched/duvidosos/nao_identificados
4. <FinalizarStep />           // Sumário + botão Fechar Conciliação

// Componentes:
<LancamentoMatch />            // Card com extrato vs transação CRM
<LancamentoDuvidoso />         // Card com opções: confirmar, criar, ignorar
<LancamentoNaoIdentificado />  // Card com opção: criar novo lançamento ou ignorar
```

#### Agentes (`/agentes`)

```typescript
// Estrutura:
<ConfigRosane />          // Nome, shadow mode, horário de atendimento, responder fora do horário
<ListaAgentes />          // Grid de 9 agentes com toggle on/off

// Por agente (drawer lateral):
<ConfigAgente slug="indicacao">
  min_sessions: number
  cooldown_days: number
  min_nps: 1|2|3|4|5
</ConfigAgente>

<ConfigAgente slug="reativacao">
  inactive_threshold_days: number
  max_attempts: 1|2|3
</ConfigAgente>

<ConfigAgente slug="upsell">
  <RegraUpsellEditor />  // CRUD de regras: gatilho + oferta + validade
</ConfigAgente>

<ConfigAgente slug="aniversariantes">
  send_time: time
  offer_enabled: boolean
  offer_config: {type, value, validity_days}
</ConfigAgente>

// Shadow mode log:
<ShadowSuggestionsLog /> // Lista de sugestões pendentes com [Aprovar]/[Editar]/[Rejeitar]
```

#### Relatórios (`/relatorios`)

```typescript
// Tabs:
<RelatorioFinanceiro />   // Receita por período, por serviço, por forma de pagamento
<RelatorioClientes />     // Novos, retidos, inativos, taxa de retorno
<RelatorioAgenda />       // Taxa de ocupação, cancelamentos, faltas
<RelatorioRosane />       // Mensagens enviadas, taxa de resposta, conversões por agente

// Gráficos: Recharts (line, bar, pie)
// Exportar: CSV e PDF
```

#### RFM (`/rfm`)

```typescript
// Matriz 5×5 de recência vs frequência
// Cada célula clicável → lista de clientes no segmento
// Por segmento:
<SegmentoCard segment="champions" />    // Verde
<SegmentoCard segment="at_risk" />      // Vermelho
<SegmentoCard segment="lost" />         // Cinza

// Ação por segmento:
[Criar Campanha para este segmento]  → /campanhas/novo?segment=at_risk
[Ativar Reativação Automática]       → toggle em professional_agents
```

#### Inbox/Conversas (integrado ao perfil do cliente)

```typescript
// Acesso: ícone de chat em qualquer card de cliente
// Ou via /clientes/:id → Tab Conversas

<InboxUnificado>
  <ListaConversas />          // canal, último preview, horário, unread badge
  <ConversaDetalhe>
    <HistoricoMensagens />    // timeline de mensagens
    <RosaneStatusBar />       // active | shadow | paused | human_takeover
    <InputHumano />           // profissional assumir e escrever
    <BotaoAssumirConversa />  // human_takeover
    <BotaoDevolver />         // devolver para Rosane
  </ConversaDetalhe>
</InboxUnificado>

// Filtros:
- Canal (whatsapp / email / web_chat)
- Status Rosane (active / shadow / human_takeover)
- Não lidas
```

#### Configurações (`/configuracoes`)

> Regra PRD-UX: grupos que abrem em tela própria. Sem tabs nem accordion pesado.

```typescript
// Tela raiz: lista de grupos (cada item → navegação para tela própria)
<ConfiguracoesLista />
//   Assistente (Rosane)     →  /agentes
//   📅 Agenda               →  /configuracoes/agenda
//   Pagamento               →  /financeiro/configuracoes
//   📋 Serviços e Pacotes   →  /configuracoes/servicos
//   🔔 Notificações         →  /configuracoes/notificacoes
//   👥 Equipe               →  /configuracoes/equipe
//   🏢 Clínica              →  /configuracoes/clinica
//   Plano                   →  /planos

// Cada sub-rota é uma tela independente com:
// - Header com botão voltar (chevron esquerdo)
// - Formulário focado no domínio
// - Botão "Salvar" fixo no rodapé (bottom de tela, não flutuante)
```

`/configuracoes/admin` é proibida no app profissional. Configurações SaaS pertencem a `apps/admin`.

---

## apps/client — PWA do Cliente

### Características PWA
- `display: standalone` — nunca alterar
- `theme_color`: definido dinamicamente pelo `professionals.settings.primary_color`
- Manifest dinâmico gerado server-side por slug
- Offline: cache de agendamentos (3 dias anteriores + 7 dias futuros) e histórico básico

### Rotas

| Rota | Componente | Jornada | Auth |
|---|---|---|---|
| `/` | `HomeCliente` | J28 | Magic link |
| `/onboarding` | `OnboardingCliente` | J60 | Magic link (primeiro acesso) |
| `/agenda` | `AgendaCliente` | J28 | Magic link |
| `/historico` | `HistoricoCliente` | J29 | Magic link |
| `/cancelar/:appointmentId` | `CancelarAgendamento` | J30 | Magic link |
| `/agendar` | `AutoAgendamento` | J32 | Magic link |
| `/pacote/:packageId` | `PacoteAtivo` | J31 | Magic link |
| `/anamnese/:token` | `AnamnesePublica` | J5 | Anon (token) |
| `/cadastro` | `CadastroPublico` | J11 | Anon |
| `/login` | `LoginOTP` | J15 | Anon |

### Onboarding do Cliente (`/onboarding`) — J60

```typescript
// 5 passos lineares (máx 1 min):
<Passo1BoasVindas>
  // Logo + cor da clínica, nome da Rosane
  // "Bem-vindo ao app da [Clínica]!"
</Passo1BoasVindas>

<Passo2ConfirmarDados>
  // nome, telefone, email (editável)
  // UPDATE clients SET ... WHERE id = clientId
</Passo2ConfirmarDados>

<Passo3LGPD>
  // Resumo do que é armazenado + link para política
  // [Entendi e aceito] → lgpd_consent_at = now(), canal = 'pwa'
</Passo3LGPD>

<Passo4InstalarApp>
  // Instrução iOS / Android
  // beforeinstallprompt → prompt nativo
  // [Agora não] → pular
</Passo4InstalarApp>

<Passo5PushNotifications>
  // Notification.requestPermission()
  // Se aceito → salvar push_notifications_enabled = true
</Passo5PushNotifications>

// Após completar: SET clients.pwa_onboarded_at = now()
// Redirect → /
// NUNCA bloquear — cliente pode pular todos os passos
```

### Home do Cliente (`/`)

```typescript
<HomeCliente>
  <HeaderClinica />              // Logo clínica + nome
  <ProximaSessaoCard />          // Próximo agendamento
  <AgendaResumida />             // Lista de próximas sessões
  <AcoesRapidas>
    <BotaoAgendar />             // → /agendar
    <BotaoHistorico />           // → /historico
    <BotaoPacoteAtivo />         // → /pacote/:id (se tem pacote ativo)
    <BotaoFidelidade />          // Pontos de fidelidade
  </AcoesRapidas>
</HomeCliente>
```

### Autoagendamento (`/agendar`) — J32

```typescript
<AutoAgendamento>
  <SelecionarServico />          // Lista de services.is_public=true
  <SelecionarHorario />          // Grade de disponibilidade
  <ConfirmarDados />             // Resumo + confirmar
  // → INSERT appointments (booked_by_client=true)
  // → Notificação para profissional
</AutoAgendamento>
```

---

## apps/admin — Painel Ismael

### Autenticação

```typescript
// Login separado via master_admins
// Não usa professionals como tenant
// Não usa auth_professional_id() no admin — queries são globais
```

### Rotas

| Rota | Componente | Jornada |
|---|---|---|
| `/dashboard` | `DashboardAdmin` | J47 |
| `/profissionais` | `ListaProfissionais` | J33 |
| `/profissionais/:id` | `PerfilProfissional` | J34 |
| `/planos` | `PlanosAdmin` | J38 |
| `/leads` | `PipelineLeads` | J33 |
| `/analytics` | `AnalyticsPlataforma` | J36 |
| `/embaixadores` | `Embaixadores` | J48 |
| `/agentes` | `AgentesAdmin` | J52 |
| `/broadcast` | `BroadcastAdmin` | J35 |
| `/melhorias` | `MelhoriasAdmin` | J53 |
| `/configuracoes` | `ConfiguracoesAdmin` | J38 |
| `/nexus` | `Nexus` | J47 |

> `/` redireciona para `/dashboard`. `/afiliados` redireciona para `/embaixadores`. `/campanhas` e `/notificacoes` admin redirecionam ou navegam para subáreas de `/broadcast`. Nenhum alias mantém tela paralela.
>
> **Implementação Fase 23:** `/analytics`, `/profissionais/:id` e `/configuracoes` foram adicionadas. `/dashboard` mantém resumo acionável; `/analytics` concentra histórico. `/profissionais` é a entrada única para detalhe e onboarding administrativo.

### Dashboard Admin (`/dashboard`)

```typescript
<DashboardAdmin>
  <MRRCard />                    // MRR total, crescimento vs mês anterior
  <ProfissionaisAtivosCard />    // Total, em trial, em risco
  <ChurnCard />                  // Churn do mês, previsão
  <LeadsHotosCard />             // Leads quentes no pipeline Nerissa
  <PlatformHealthCard />         // Health score médio da plataforma
  <AlertasCriticosCard />        // Profissionais com instância offline, créditos zerados
  <NexusChat />                  // Chat com Nerissa via web (Nexus)
</DashboardAdmin>
```

### Pipeline de Leads Admin (`/leads`)

```typescript
<PipelineAdmin>
  // Kanban: novo → qualificado → demo → proposta → convertido → perdido
  // Cada card: nome, telefone, fonte, última interação, score
  // Ações: mover manualmente, ver conversa Nerissa, atribuir follow-up
</PipelineAdmin>
```

### Perfil do Profissional (`/profissionais/:id`)

```typescript
<PerfilProfissional>
  <InfoGeral />           // Dados, plano, trial status
  <HealthScore />         // professional_platform_health_scores
  <NerissaSetup />        // Status do setup + itens concluídos/pendentes
  <HistoricoCobranca />   // Stripe subscriptions, invoices
  <AgentesConfig />       // professional_agents (leitura)
  <BotoesAcao>
    <BotaoImpersonar />   // Logar como esse profissional (service_role)
    <BotaoSuspender />    // Suspender conta
    <BotaoAprovarAfiliado /> // Aprovar affiliate_partner
  </BotoesAcao>
</PerfilProfissional>
```

---

## packages/domain — Tipos Compartilhados

```typescript
// Todos os apps importam daqui:

export interface ProfessionalRecord {
  id: string;
  name: string;
  business_name?: string;
  email: string;
  phone_whatsapp?: string;
  slug: string;
  logo_url?: string;
  plan_type: 'trial' | 'individual' | 'equipe' | 'team' | 'enterprise';
  whatsapp_connected: boolean;
  onboarding_completed: boolean;
  settings: ProfessionalSettings;
}

export interface ClientRecord {
  id: string;
  professional_id: string;
  full_name: string;            // NUNCA nulo
  phone_whatsapp?: string;
  email?: string;
  birth_date?: string;
  journey_stage: JourneyStage;
  source?: string;
  lgpd_consent_at?: string;
  pwa_onboarded_at?: string;
  loyalty_points: number;
  is_active: boolean;
}

export type JourneyStage =
  | 'lead'
  | 'agendado'
  | 'em_tratamento'
  | 'pos_tratamento'
  | 'cliente_fiel'
  | 'inativo';

export interface AppointmentRecord {
  id: string;
  professional_id: string;
  client_id?: string;
  service_id?: string;
  scheduled_at: string;
  duration_minutes: number;
  status: AppointmentStatus;
  confirmation_status?: 'pendente' | 'confirmado' | 'cancelado';
  is_recurring: boolean;
  series_id?: string;
}

export type AppointmentStatus =
  | 'agendado'
  | 'confirmado'
  | 'concluido'
  | 'cancelado'
  | 'falta';

export interface FinancialTransactionRecord {
  id: string;
  professional_id: string;
  type: 'receita' | 'despesa' | 'transferencia';
  amount: number;
  net_amount: number;
  status: 'pendente' | 'pago' | 'cancelado' | 'estornado';
  payment_method?: string;
  description: string;
  source: string;
  due_date?: string;
  paid_at?: string;
}

// Zod schemas (validação de formulários):
export const ClientSchema = z.object({
  full_name: z.string().min(2, 'Nome obrigatório'),
  phone_whatsapp: z.string().optional(),
  email: z.string().email().optional().or(z.literal('')),
  birth_date: z.string().optional(),
  journey_stage: z.enum(['lead','agendado','em_tratamento','pos_tratamento','cliente_fiel','inativo']),
});

export const AppointmentSchema = z.object({
  client_id: z.string().uuid(),
  service_id: z.string().uuid(),
  scheduled_at: z.string().datetime(),
  duration_minutes: z.number().min(15).max(480),
  team_member_id: z.string().uuid().optional(),
  notes: z.string().optional(),
});
```

---

## packages/i18n — Internacionalização

```typescript
// Locales suportados:
// es-419 = Espanhol Latino-Americano (padrão IETF correto — NUNCA es-AL)
export type Locale = 'pt-BR' | 'en-US' | 'es-419';

// Resolução:
// 1. localStorage 'iap_locale'
// 2. navigator.language normalizado
// 3. default: 'pt-BR'

// Uso:
const { t } = useI18n();
t('agenda.novo_agendamento')  // → "Novo Agendamento" / "New Appointment" / ...
t('clientes.count', { count: 42 }) // → "42 clientes"

// Cobertura obrigatória em pt-BR (primary):
// Todas as strings de UI, mensagens de erro, labels de formulário

// Cobertura en-US e es-419:
// Páginas públicas (agendar, cadastro, anamnese, pacote, chat)
// PWA do cliente
// Mensagens da Rosane (geradas pela IA com locale do cliente)
```

---

## Service Worker (apps/professional + apps/client)

```javascript
// Cache strategy unificado no v2 — IndexedDB como único source of truth offline

// sw.js:
const CACHE_NAME = 'iaprafaturar-v2';

// Estratégias:
// 1. Supabase Auth/Functions/API → sempre rede, sem fallback
// 2. Assets estáticos → stale-while-revalidate
// 3. Navegação interna → network-first com fallback para cache
// 4. Offline → /offline.html com dados do IndexedDB

// IndexedDB schema (idb v8):
const db = await openDB('iaprafaturar-v2', 1, {
  upgrade(db) {
    db.createObjectStore('appointments', { keyPath: 'id' });
    db.createObjectStore('clients', { keyPath: 'id' });
    db.createObjectStore('pending_sync', { keyPath: 'id', autoIncrement: true });
    db.createObjectStore('meta');
  }
});

// Sync (quando volta online):
async function syncPendingOperations() {
  const pending = await db.getAll('pending_sync');
  for (const op of pending) {
    await supabase.from(op.table)[op.type](op.data);
    await db.delete('pending_sync', op.id);
  }
}

// REGRA: uma única fila de sync — sem duplicidade localStorage + IndexedDB
```

---

## Manifest Dinâmico (apps/client)

```typescript
// Cada clínica tem seu próprio manifest
// Gerado via Edge Function ou endpoint /api/manifest/:slug

const manifest = {
  name: `App da ${professional.business_name}`,
  short_name: professional.business_name?.substring(0, 12),
  start_url: `/?pwa=1&professional=${professional.id}`,
  display: 'standalone',     // NUNCA alterar
  theme_color: professional.settings?.primary_color ?? '#0D9488', // brand color da clínica, padrão teal-600
  background_color: '#ffffff',
  icons: [
    { src: professional.logo_url ?? '/default-icon-192.png', sizes: '192x192', type: 'image/png' },
    { src: professional.logo_url ?? '/default-icon-512.png', sizes: '512x512', type: 'image/png' },
  ]
};
```

---

## PlanGate Component

```typescript
// Bloqueia features não disponíveis no plano atual
interface PlanGateProps {
  capability: keyof PlanCapabilities;
  fallback?: ReactNode;  // default: upsell card
  children: ReactNode;
}

// Capabilities por plano:
const PLAN_CAPABILITIES: Record<PlanType, PlanCapabilities> = {
  trial:      { MULTI_PROFESSIONAL: false, CAMPAIGNS: false, FUNNEL_AUTOMATIONS: false, EMAIL_CHANNEL: false, BANK_RECONCILIATION: false },
  individual: { MULTI_PROFESSIONAL: false, CAMPAIGNS: true,  FUNNEL_AUTOMATIONS: false, EMAIL_CHANNEL: true,  BANK_RECONCILIATION: true  },
  equipe:     { MULTI_PROFESSIONAL: true,  CAMPAIGNS: true,  FUNNEL_AUTOMATIONS: true,  EMAIL_CHANNEL: true,  BANK_RECONCILIATION: true  },
  team:       { MULTI_PROFESSIONAL: true,  CAMPAIGNS: true,  FUNNEL_AUTOMATIONS: true,  EMAIL_CHANNEL: true,  BANK_RECONCILIATION: true  },
  enterprise: { MULTI_PROFESSIONAL: true,  CAMPAIGNS: true,  FUNNEL_AUTOMATIONS: true,  EMAIL_CHANNEL: true,  BANK_RECONCILIATION: true  },
};

// REGRA INVIOLÁVEL:
// Agentes de IA (Rosane, upsell, reativação, indicação, etc.)
// NÃO são bloqueados por plano — disponíveis em todos.
// Diferenciação é por número de clientes e team_members, não por corte de IA.
```
