# PRD — Design & UX do iaprafaturar v2

_Definido em 2026-06-04. Documento de referência para design de produto._

---

## Manifesto

> O iaprafaturar v2 não é um painel administrativo. É o braço operacional de um profissional de saúde que não tem secretária, não tem equipe de marketing e não tem horas sobrando. Cada tela deve poupar tempo, não consumir atenção.

**O produto é invisível quando funciona.** O profissional deve terminar o dia sem ter pensado no app — apenas percebido que sua agenda estava cheia, os clientes responderam, e o financeiro fechou. A IA (Rosane, os crons, os agentes) trabalha nos bastidores. A UI existe para as exceções: o que a IA não sabe resolver, o que o profissional quer supervisionar, o que precisa de decisão humana.

**O que isso significa na prática:**
- O app não deve pedir confirmação para o que é rotina
- Notificações são raras e sempre acionáveis (não só informativas)
- Formulários são curtos e contextuais
- O vazio é bem-vindo — uma tela sem dados não grita "você não tem conteúdo"

---

## 1. Princípios de Design

### 1.1 Hierarquia de atenção antes de hierarquia de informação

Cada tela tem exatamente **1 ação primária**. Tudo mais é secundário ou está escondido.

```
❌ Não: 4 botões de mesma hierarquia visual em uma tela
✅ Sim: 1 botão primário (filled), 1-2 links de texto, o resto acessível por gesto ou menu
```

### 1.2 Velocidade percebida como feature

- Toda ação deve dar feedback visual em < 100ms (skeleton, spinner inline, não overlay)
- Optimistic UI em operações de alta frequência (mover kanban, marcar pago, aprovar shadow)
- Dados pré-carregados na navegação (prefetch da próxima tela provável)

### 1.3 Progressão, não formulário

A entrada de dados clínicos não é um formulário. É uma progressão natural da ação.

```
❌ Não: formulário com 12 campos para registrar uma sessão
✅ Sim: "O que foi feito?" → chips de procedimentos + texto livre → valor → pronto
```

### 1.4 IA sem personagem de chatbot

Rosane e os agentes não aparecem como "chatbots" na interface. Eles são o comportamento do app, não uma tela separada.

```
❌ Não: "Rosane diz: olá! Como posso ajudar?" com avatar de robô
✅ Sim: No inbox, a resposta enviada por Rosane tem um ícone sutil ✦ e nada mais
        Shadow mode: um banner discreto "✦ Sugestão pendente" — não um popup
```

### 1.5 Mobile-native, não mobile-adapted

O app é PWA mas deve se comportar como app nativo iOS/Android.

- Sem scroll horizontal em tabelas (repensar os dados ou usar cards)
- Swipe actions em listas (swipe left = ação rápida, não botões na linha)
- Bottom sheet para ações contextuais (não modais centrados)
- Pull-to-refresh em listas de dados (não botão "atualizar")
- Haptic feedback nas ações críticas (vibração sutil no cadastro de pagamento, confirmação de sessão)

---

## 2. Sistema de Design

### 2.1 Paleta de Cores

```
BASE (app tem fundo claro — não escuro, não "SaaS genérico")
  white       #FFFFFF  → superfícies principais
  slate-50    #F8FAFC  → backgrounds de página
  slate-100   #F1F5F9  → backgrounds de card
  slate-950   #020617  → texto principal
  slate-700   #334155  → texto secundário
  slate-400   #94A3B8  → placeholders, desabilitado

OPERACIONAL (confiança, saúde, ação cotidiana)
  teal-600    #0D9488  → ações primárias, botões de confirmação, estados operacionais
  teal-500    #14B8A6  → hover de ações primárias
  teal-100    #CCFBF1  → backgrounds de destaque leve

STATUS SEMÂNTICO
  emerald-500 #10B981  → sucesso, pago, confirmado
  amber-500   #F59E0B  → atenção, pendente, shadow mode pendente
  rose-500    #F43F5E  → erro, urgente, cancelado

IA — RESERVADO EXCLUSIVAMENTE PARA INDICADORES DE IA
  violet-400  #A78BFA  → ícone ✦ (único indicador de ação da IA em todo o app)
  violet-100  #EDE9FE  → background sutil quando shadow mode está ativo
  Regra absoluta: violet NÃO é cor de ação, navegação ou destaque genérico.
                  É o "idioma" da IA. Quando o profissional vê violet, sabe que a IA agiu.

BRAND COLOR DA CLÍNICA (personalização por profissional)
  --clinic-primary: CSS var definida por professionals.settings.primary_color
  Padrão: teal-600 se o profissional não tiver customizado
  Usada em: cabeçalho do PWA público (página de agendamento), logo da clínica, accents do perfil
  NÃO usada em: indicadores de IA, status semânticos, navegação interna do CRM
  Regra: a brand color é para o mundo externo (o que o cliente vê). O CRM interno usa a paleta fixa.
```

### 2.2 Tipografia

```
Família: "Inter" (variável, carregamento único)

Escala (fluid, clamp):
  display-lg   clamp(28px, 4vw, 36px)  weight 700  → headline de seção vazia
  display-md   clamp(22px, 3vw, 28px)  weight 700  → valor principal no dashboard
  heading-lg   20px  weight 600  → título de card/seção
  heading-md   16px  weight 600  → subtítulo, nome de cliente
  body-md      15px  weight 400  → corpo de texto, campos
  body-sm      13px  weight 400  → labels, metadata, timestamps
  caption      11px  weight 500  → badges, tags

Regra: NUNCA mais de 3 tamanhos na mesma tela
```

### 2.3 Espaçamento

```
Base: 4px
Escala: 4, 8, 12, 16, 20, 24, 32, 40, 48, 64px

Padrões:
  padding de card:        16px (mobile) → 20px (desktop)
  gap entre cards:        12px
  padding de tela:        16px horizontal (mobile) → 24px (desktop)
  altura de item de lista: 64px (toque mínimo: 44px)
```

### 2.4 Radius e Sombras

```
Radius:
  card:     12px
  button:   8px
  badge:    99px (pill)
  input:    8px
  bottom sheet: 20px (topo)

Sombras (2 níveis — não mais):
  card-resting:  0 1px 3px rgba(0,0,0,0.08)
  card-elevated: 0 4px 12px rgba(0,0,0,0.12)
  Nunca usar sombra colorida — parece barato
```

### 2.5 Ícones

```
Biblioteca: Lucide React (já compatível com shadcn/ui)
Tamanho: 20px em listas/buttons, 16px em badges, 24px em ações standalone
Stroke: 1.5px (não 2px — mais elegante)
Nunca preenchido (filled) exceto: ícone ✦ para IA (caso especial)
```

### 2.6 Animações

```
Filosofia: sem animação decorativa. Só animação com propósito.

Transição de página:        fade + slide-up (200ms ease-out)
Abrir bottom sheet:         slide-up (280ms spring: stiffness 300, damping 30)
Fechar bottom sheet:        slide-down (200ms ease-in)
Skeleton loading:           pulse (1.5s infinite, opacity 0.4 → 1.0)
Toast notification:         slide-in-right (180ms ease-out), auto-dismiss 3s
Optimistic update:          fade de cor (150ms) — verde → normal
Kanban card drag:           scale(1.02) + sombra elevada durante drag
```

---

## 3. Telas Principais

### 3.1 Home / Dashboard

**Objetivo:** Em 3 segundos, o profissional sabe o que precisa fazer hoje.

**Não é:** um painel de métricas. É uma tela de contexto + ação.

**Layout mobile (scroll vertical, 3 zonas):**

```
┌──────────────────────────────┐
│  ☀️ Bom dia, Dra. Ana        │  ← saudação contextual (manhã/tarde/noite)
│  Segunda, 4 de junho         │  ← data, não timestamp
└──────────────────────────────┘

ZONA 1 — HOJE (não scrollável, sempre visível)
┌──────────────────────────────┐
│  📅  AGENDA DE HOJE          │
│  ─────────────────────────── │
│  09:00  Maria Silva          │  ← próximo agendamento
│         Drenagem · 60 min    │
│  10:30  João Santos   CONF.  │  ← status: confirmado (chip verde)
│  14:00  Luísa Mendes  ✦ IA  │  ← shadow mode: Rosane respondeu confirmação
│                              │
│  [ + Encaixe rápido ]        │  ← ação primária desta zona
└──────────────────────────────┘

ZONA 2 — ATENÇÃO NECESSÁRIA (só aparece se houver itens)
┌──────────────────────────────┐
│  ⚡ 2 itens precisam de você │
│  ─────────────────────────── │
│  ✦ Rosane sugeriu resposta   │  → toca: abre inbox direto na mensagem
│    para Maria · agora        │
│  💬 Bruno enviou mensagem    │  → toca: abre conversa
│    urgente · 14 min atrás    │
└──────────────────────────────┘

ZONA 3 — PULSO DO MÊS (scroll para ver)
┌──────────────────────────────┐
│  R$ 8.400    ↑ 12%           │  ← 1 número grande + tendência
│  receita em junho            │
│  ─────────────────────────── │
│  34 sessões · 18 clientes    │  ← contexto mínimo
│  [ Ver financeiro completo ] │  → link, não card
└──────────────────────────────┘
```

**Regra:** ZONA 2 não aparece se não há itens urgentes. Tela limpa = boa notícia.

---

### 3.2 CRM / Kanban

**Objetivo:** Profissional vê onde cada cliente está na jornada e age sobre os que precisam de atenção.

**Problema a evitar:** 6 colunas com cards minúsculos no mobile → ilegível e sem ação.

**Solução:**

```
MOBILE: lista única com filtro de stage no topo
┌──────────────────────────────┐
│ [Todos] [Agendado] [Tratando]│  ← chip filter horizontal, scroll
│         [Pós] [Fiel] [Inativo│
└──────────────────────────────┘
│  Maria Silva                 │
│  Tratamento · 3ª sessão      │  ← contexto relevante (não a data de cadastro)
│  Última visita: 12 dias      │  ← dado de ação, não metadata
│  ─────────────────────────── │
│  João Santos        🔴 REATIV│  ← badge de alerta da IA
│  Inativo · 67 dias           │
│  ─────────────────────────── │

SWIPE RIGHT no cliente → ação rápida (Agendar / Enviar mensagem)
SWIPE LEFT no cliente  → mover stage (bottom sheet com opções)
TAP no cliente         → perfil completo
```

```
TABLET/DESKTOP: Kanban clássico (colunas horizontais)
Máx 6 colunas visíveis. Cards: nome + último contato + 1 badge de alerta.
Drag-and-drop para mover stage.
```

**Empty state (stage vazio):**
```
[ Ícone sutil de pessoa + ]
  Sem clientes aqui ainda
  [ Importar / Adicionar cliente ]
```
Nunca: "Você não tem clientes neste estágio. Comece adicionando clientes!"

---

### 3.3 Inbox Omnichannel

**Objetivo:** Profissional monitora e intervém em conversas. Rosane cuida do resto.

**Hierarquia de atenção (obrigatória):**

```
┌──────────────────────────────┐
│ [WhatsApp ▾] [Filtrar] 🔔 3  │  ← canal filter + badge de itens urgentes
└──────────────────────────────┘

URGENTE (barra esquerda rose-500, background rose-50 faint)
│  🔴  Bruno Almeida  · 2 min  │
│  "quero cancelar minha sessão│  ← preview da mensagem
│  de amanhã por causa de..."  │
│  ─────────────────────────── │

SHADOW MODE PENDENTE (borda amber-200, fundo amber-50 faint)
│  ✦  Maria Silva  · 5 min     │
│  Rosane sugere: "Olá Maria!  │
│  Que bom que entrou em conta │  ← preview da sugestão (não da mensagem)
│  [Aprovar] [Editar] [Ignorar]│  ← ações inline — não abrir tela
│  ─────────────────────────── │

NORMAL (sem cor especial)
│  João Santos  · 12 min       │
│  ✦ Rosane respondeu          │  ← indicador sutil de IA
│  "Perfeito, vejo você na ter │
│  ─────────────────────────── │
│  Luísa Mendes  · 1h          │
│  "Muito obrigada!"           │
```

**Ao abrir uma conversa:**
- Timeline única, cronológica
- Mensagens da Rosane têm ícone ✦ à esquerda (não "Enviado por IA")
- Campo de texto + botão enviar + botão "Assumir conversa" (flag para Rosane parar)
- Ao assumir: Rosane para de responder, profissional vira o remetente

---

### 3.4 Registro de Sessão

**Objetivo:** Registrar o que foi feito em < 2 minutos. Não é um prontuário eletrônico completo.

**Fluxo linear (3 momentos, não 7 abas):**

```
MOMENTO 1 — DURANTE A SESSÃO (pré-criado ao confirmar a sessão)
┌──────────────────────────────┐
│ ← Maria Silva · Drenagem     │
│   Hoje, 09:00                │
│  ─────────────────────────── │
│  + Adicionar procedimento    │
│  [Drenagem] [Massagem] [+]   │  ← chips dos serviços da clínica
│                              │
│  + Produto utilizado         │
│  [Creme X] [Óleo Y] [+]      │
│                              │
│  [ Encerrar sessão → ]       │  ← ação primária
└──────────────────────────────┘

MOMENTO 2 — AO ENCERRAR (bottom sheet, não tela nova)
┌──────────────────────────────┐  ← sobe de baixo, 60% da tela
│  Evolução clínica            │
│  ┌────────────────────────┐  │
│  │ (texto livre, auto-    │  │
│  │  resize, 200 chars min)│  │
│  └────────────────────────┘  │
│                              │
│  R$ [____]  [Dinheiro ▾]    │  ← valor + forma de pagamento
│                              │
│  [ Confirmar e fechar ]      │
└──────────────────────────────┘

MOMENTO 3 — AUTOMÁTICO (app faz, não profissional)
  Rosane envia follow-up configurado (NPS / retorno / indicação)
  Cron atualiza RFM, pontos de fidelidade, health score
  Dashboard atualiza receita do mês
```

**O que NÃO aparece para o profissional:** embeddings, AI score, version history, metadata de infra. Esses dados existem mas são invisíveis.

---

### 3.5 Agenda / Calendário

**Objetivo:** Ver e criar agendamentos com o mínimo de fricção.

**View padrão: semana compacta no mobile**

```
┌──────────────────────────────┐
│ [Dia] [Semana] [Mês]         │  ← toggle de view
│  < Semana 1-7 jun >          │
└──────────────────────────────┘
│  SEG  TER  QUA  QUI  SEX     │
│  04   05   06   07   08      │
│  ██   ██░  ░░   ██   ██░     │  ← barras de ocupação (não grade de horários)
└──────────────────────────────┘

Toca "TER 05":
┌──────────────────────────────┐
│  Terça, 5 de junho           │
│  ─────────────────────────── │
│  09:00  Maria Silva          │
│          Drenagem · 60 min   │
│  10:30  [slot livre]         │  ← slots livres visíveis, com tap para criar
│  11:00  João Santos          │
│  ...                         │
│  [ + Novo agendamento ]      │  ← FAB (floating action button)
└──────────────────────────────┘
```

**Criar agendamento (5 campos, não 15):**
```
1. Cliente: busca por nome ou telefone (autocomplete)
2. Serviço: lista da clínica (tap para selecionar)
3. Data/hora: picker nativo (wheel no iOS, grid no Android)
4. Duração: preset do serviço (editável)
5. Canal: presencial / online (toggle)

[ Criar ] → cria + Rosane envia confirmação automaticamente
```

---

### 3.6 Financeiro

**Objetivo:** Ver o que entrou, o que está pendente, e fechar o caixa.

**Não é:** balanço contábil. É fluxo de caixa operacional.

```
┌──────────────────────────────┐
│  JUNHO 2026                  │
│  R$ 8.400     R$ 1.200       │
│  Recebido     A receber      │
│  ─────────────────────────── │
│  [ Hoje ] [ Semana ] [ Mês ] │
└──────────────────────────────┘

Lista de transações (card por dia):
┌──────────────────────────────┐
│  Hoje — R$ 680               │  ← total do dia como header do grupo
│  ─────────────────────────── │
│  Maria Silva  R$ 350  PIX ✓  │
│  João Santos  R$ 180  Dinhei │
│  Luísa Mendes R$ 150  Pendente│  ← status visual: ✓ pago / ⏱ pendente
└──────────────────────────────┘

Tap em transação pendente → bottom sheet:
  "Luísa pagou?"  [ Sim, PIX ] [ Sim, Dinheiro ] [ Ainda não ]
  → 1 tap para marcar como pago
```

**Adicionar receita (não é formulário completo):**
```
[ + Registrar recebimento ]
  Valor: R$ ____
  De: [busca cliente]
  Forma: [PIX] [Cartão] [Dinheiro] [Outro]
  [ Registrar ]
```

---

### 3.7 Configurações / Setup

**Objetivo:** Configurar 1 vez, nunca mais voltar.

**Estrutura em grupos (não lista alfabética):**
```
🤖 Assistente (Rosane)
   Nome · Tom · Shadow mode · Horário de atendimento

📅 Agenda
   Duração padrão · Antecedência mínima · Canais ativos

💳 Pagamento
   PIX · Parcelamento · Gateway

📋 Serviços e Pacotes
   Lista de serviços · Preços · Categorias

🔔 Notificações
   O que me avisar · Como me avisar · Horário de silêncio

👥 Equipe
   Membros · Permissões
```

**Princípio:** cada grupo abre em tela própria, não accordion. O accordion parece web de 2015.

---

## 4. Padrões de Interação

### 4.1 Bottom Sheet (não Modal)

Use bottom sheet para:
- Ações contextuais de um item (não criar uma nova tela)
- Formulários rápidos (≤ 5 campos)
- Confirmações destrutivas

Use tela nova para:
- Perfil completo de cliente
- Registro de sessão com histórico
- Configurações de cada domínio

### 4.2 Empty States com Propósito

Cada tela vazia tem **1 ação de próximo passo**, não só uma mensagem.

```
Exemplo: Agenda sem agendamentos hoje
  [ Ícone de calendário calmo, não triste ]
  Dia livre hoje
  [ Criar encaixe ] ou [ Ver semana ]
```

```
Exemplo: Inbox sem mensagens
  [ Ícone de telefone em paz ]
  Rosane está cuidando de tudo
  [ Ver histórico de conversas ]
```

### 4.3 Feedback de Ações

```
Ação confirmada:    toast verde (bottom, 3s, auto-dismiss)
Ação com aviso:     toast amber (bottom, 5s, com link de ação)
Ação com erro:      toast rose (bottom, persistente até dismiss manual)
Ação em progresso:  spinner inline no botão (botão desabilitado durante)
Ação otimista:      item já aparece na lista com opacity 0.7 até confirmar
```

### 4.4 Ícone ✦ — Identidade da IA

Única linguagem visual para indicar que a IA agiu:

```
No inbox:      ✦ (violet-400) antes do preview da mensagem
No dashboard:  ✦ antes do item de shadow mode pendente
No histórico:  ✦ na timeline de mensagens enviadas por Rosane
No kanban:     ✦ no badge quando a IA sugeriu mover o cliente
```

**Nunca usar:** "Enviado por IA", "Sugestão automática", "Gerado por Rosane". O profissional já sabe que a IA está lá. O ✦ é suficiente.

### 4.5 Gestos no Mobile

```
Swipe right (lista de clientes): ação positiva (Agendar / Contatar)
Swipe left (lista de clientes):  ação de mover (trocar stage)
Swipe right (conversa no inbox): marcar como lida / resolver
Swipe left (conversa no inbox):  silenciar / esconder
Long press (card do kanban):     ativa modo de seleção múltipla
Pull-to-refresh:                 atualiza a lista atual
```

---

## 5. Estados Especiais de UX

### 5.1 Shadow Mode — UX de Aprovação

O shadow mode não deve interromper o fluxo. Funciona assim:

```
No inbox (lista):
  [banner amber sutil no topo da conversa em shadow]
  "✦ Rosane tem uma sugestão"
  
Ao abrir a conversa em shadow:
  Timeline normal com sugestão da Rosane em destaque:
  ┌─────────────────────────────┐
  │ ✦ Rosane sugere:            │ ← fundo violet-50, borda violet-200
  │ "Olá Maria! Que ótimo..."   │
  │ [Aprovar ✓]  [Editar ✎]    │ ← 2 ações, sem "Rejeitar" (simplesmente ignorar)
  └─────────────────────────────┘
  
  Abaixo: campo de resposta manual (caso profissional queira escrever)
```

### 5.2 Intervenção Humana em Conversa Ativa

```
Na conversa, botão discreto no topo:
  "Assumir conversa" (link, não botão primário)
  
Ao assumir:
  Banner no topo da conversa: "Você está no controle"
  Rosane para de responder silenciosamente
  Campo de texto assume o cursor (foco automático)
  
Para devolver para Rosane:
  "Passar para Rosane" (link no topo)
  Rosane retoma com contexto da intervenção
```

### 5.3 Trial Expirando

```
Não: banner vermelho agressivo no topo de todas as telas

Sim: no dashboard, zona 2 (atenção necessária):
  "⏱ Seu trial termina em 3 dias"
  [ Ver planos ] → leva direto para upgrade
  
  Após clicar "Ver planos" e fechar: não mostrar de novo por 24h
```

### 5.4 Offline / Sem Conexão

```
No topo, banner slate-800:
  "Sem conexão — alterações serão salvas quando voltar"
  
O app continua funcionando para:
  - Ver agenda (cache)
  - Registrar sessão (fila offline)
  - Ver clientes (cache)
  
O app bloqueia apenas:
  - Enviar mensagens WhatsApp (necessita conexão)
  - Criar agendamento (necessita validação de conflito)
```

---

## 6. UX da IA — Como a Inteligência se Manifesta

A IA do produto não tem interface própria. Ela tem **presença no fluxo**.

```
ANTES de uma ação (sugestão):
  Subtle: um placeholder inteligente, uma sugestão de valor, um nome auto-preenchido
  
DURANTE uma ação (completar):
  Autocomplete no campo de evolução clínica (sugestões baseadas em sessões anteriores)
  Chips de procedimentos pré-selecionados (com base no serviço agendado)
  
DEPOIS de uma ação (trabalho autônomo):
  Rosane enviou follow-up → aparece discretamente no histórico da conversa
  Cron gerou insight → aparece no dashboard na próxima visita (não notificação push)
  RFM atualizou → badge no card do cliente no kanban (não notificação)
```

**O princípio:** notificações push são para coisas que precisam de resposta humana. Tudo que é informativo vai para onde o profissional já estaria olhando.

---

## 7. Checklist de Review de UX (para cada tela nova)

Antes de considerar uma tela pronta, verificar:

- [ ] Tem 1 ação primária clara? (não 2, não 0)
- [ ] O título da tela diz o que o usuário está fazendo, não o que a tela é? ("Registrar sessão" não "Sessões")
- [ ] Em mobile, cabe em 1 coluna sem scroll horizontal?
- [ ] O empty state tem próximo passo? (não só uma ilustração)
- [ ] Formulários têm ≤ 6 campos visíveis ao mesmo tempo?
- [ ] Ações destrutivas têm confirmação (mas não excessiva)?
- [ ] O estado de loading é inline (não overlay)?
- [ ] A IA é indicada pelo ✦ sem explicação adicional?
- [ ] O profissional consegue completar a ação principal em ≤ 3 taps?
- [ ] A tela funciona sem dados? (edge case: novo usuário, sem clientes)
