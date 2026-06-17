# FASE 27 — Matriz de Paridade v1 → v2

**Data:** 2026-06-16
**Decision Owner:** Ismael
**Fonte v1 professional:** `iaparalucrar-crm/src/App.tsx` + pages
**Fonte v1 admin:** `iaprafaturar-admin/src/App.tsx` + pages
**Fonte v2:** `apps/professional/src/routes.ts`, `apps/admin/src/routes.ts`, `apps/client/src/routes.ts`
**Modo:** inventário de código + classificação. Nenhuma implementação.

---

## Legenda de Decisão

| Valor | Significado |
|---|---|
| `preservar` | existe na v2 com paridade funcional, sem ação |
| `consolidar` | recurso v1 foi fundido a rota/conceito diferente na v2 |
| `redirecionar` | URL v1 vira alias/redirect para destino v2 canônico |
| `recriar` | recurso útil ausente; deve voltar com contrato v2 |
| `descartar` | não deve voltar; decisão explícita necessária |
| `decidir` | Ismael precisa escolher entre recriar ou descartar |

---

## 1. Professional v1 — Rotas Públicas / Auth

| URL v1 | Recurso percebido | App v2 | URL/tela v2 | Contrato v2 | Decisão | Owner PR | Status |
|---|---|---|---|---|---|---|---|
| `/` | Landing page do produto | professional | `/login` (redirect) | — | `consolidar` | — | executado |
| `/login` | Login profissional | professional | `/login` | Supabase Auth | `preservar` | — | executado |
| `/cadastro` | Criar conta profissional | professional | `/cadastro` → `PublicEntrarPage` | Supabase Auth | `preservar` | — | executado |
| `/criar-conta` | Conta via formulário completo | professional | `/criar-conta` | Supabase Auth | `preservar` | — | executado |
| `/recuperar-senha` | Reset de senha | professional | `/recuperar-senha` | Supabase Auth | `preservar` | — | executado |
| `/reset-password` | Confirmação de reset | professional | `/reset-password` | Supabase Auth | `preservar` | — | executado |
| `/onboarding` | Onboarding pós-cadastro | professional | `/onboarding` | `professionals` + RPCs | `preservar` | — | executado |
| `/entrar` | Landing pública "profissional entrando" via link externo | professional | alias para `/login` ou `/criar-conta` | Supabase Auth | `recriar` | 27.1 | **aprovado — PR 27.1** |
| `/cadastro/:codigo` | Cadastro via código de convite de parceiro | professional | `/criar-conta?ref=:codigo` ou rota dedicada | `professionals` + referral | `recriar` | 27.1 | **aprovado — PR 27.1** |
| `/convite/:codigo` | Link de convite de indicação profissional | professional | rota de processamento de convite | `team_members` ou indicação | `recriar` | 27.1 | **aprovado — PR 27.1** |
| `/indicacao/:codigo` | Link de indicação de cliente final | client | rota client de indicação | `clients` + indicação | `recriar` | 27.1 | **aprovado — PR 27.1** |
| `/agendar/:slug` | Agendamento público | client | `/agendar/:slug` | `public-booking-handler` | `preservar` | — | executado |
| `/chat/:slug` | Chat público com slug | client | `/chat/:slug` | `public-chat-handler` | `preservar` | — | executado |
| `/chat` | Chat público sem slug (genérico) | client | redirect para `/agendar/:slug` ou landing de entrada | `public-booking-handler` | `recriar` | 27.1 | **aprovado — PR 27.1** |
| `/pacote/:slug` | Pacote público | client | `/pacote/:slug` | `public-package-handler` | `preservar` | — | executado |
| `/anamnese/:token` | Anamnese pública | client | `/anamnese/:token` | `anamnese-public-handler` | `preservar` | — | executado |
| `/upgrade` | Tela de upgrade de plano | professional | `/upgrade` → alias para `/planos` | — | `redirecionar` | — | executado |

---

## 2. Professional v1 — Páginas Principais

| URL v1 | Recurso percebido | App v2 | URL/tela v2 | Contrato v2 | Decisão | Owner PR | Status |
|---|---|---|---|---|---|---|---|
| `/dashboard` | Dashboard com KPIs e agenda do dia | professional | `/dashboard` | `get_dashboard_rpc` | `preservar` | — | executado |
| `/clientes` | Lista + Kanban de clientes | professional | `/clientes` | `clients` + RPCs | `preservar` | — | executado |
| `/clientes/:clientId` | Perfil completo do cliente | professional | `/clientes/:id` | `clients` + RPCs | `preservar` | — | executado |
| `/clientes/:clientId/anamnese` | Anamnese do cliente | professional | `/clientes/:id/anamnese` | `anamnese_fichas` + RPCs | `preservar` | — | executado |
| `/agenda` | Agenda de atendimentos | professional | `/agenda` | `appointments` + `sessions` | `preservar` | — | executado |
| `/sessoes` | Sessões (alias) | professional | `/agenda` (redirect existente) | — | `redirecionar` | — | executado |
| `/funil` | Funil de vendas | professional | `/funil` | RPCs de funil | `preservar` | — | executado |
| `/servicos` | Catálogo de serviços | professional | `/servicos` | `services` + RPCs | `preservar` | — | executado |
| `/servicos/novo` | Criar serviço | professional | `/servicos/novo` | `services` + RPCs | `preservar` | — | executado |
| `/pacotes` | Pacotes (rota direta) | professional | `/documentos/pacotes` (alias `/pacotes` ✓) | `packages` | `redirecionar` | — | executado |
| `/contratos` | Contratos | professional | `/documentos/contratos` (alias `/contratos` ✓) | `contracts` | `redirecionar` | — | executado |
| `/contratos/novo` | Novo contrato | professional | `/documentos/contratos` (form inline) | `contracts` | `consolidar` | — | executado |
| `/orcamentos` | Orçamentos | professional | `/documentos/orcamentos` (alias `/orcamentos` ✓) | `quotes` | `redirecionar` | — | executado |
| `/orcamentos/novo` | Novo orçamento | professional | `/documentos/orcamentos` (form inline) | `quotes` | `consolidar` | — | executado |
| `/orcamentos/editar/:id` | Editar orçamento | professional | `/documentos/orcamentos` (form inline) | `quotes` | `consolidar` | — | executado |
| `/aniversariantes` | Aniversariantes | professional | `/aniversariantes` | `phase21_*` | `preservar` | — | executado |
| `/parceiros` | Parceiros | professional | `/parceiros` | `phase21_*` | `preservar` | — | executado |
| `/rfm` | Análise RFM | professional | `/rfm` | `phase21_get_rfm_*` | `preservar` | — | executado |
| `/campanhas` | Campanhas do profissional | professional | `/campanhas` | `phase21_*` | `preservar` | — | executado |
| `/recompensas` | Recompensas e fidelidade | professional | `/recompensas` | `phase21_*` | `preservar` | — | executado |
| `/indicacoes` | Indicações (alias) | professional | `/recompensas?tab=indicacoes` (alias ✓) | — | `redirecionar` | — | executado |
| `/fidelidade` | Fidelidade (alias) | professional | `/recompensas?tab=fidelidade` (alias ✓) | — | `redirecionar` | — | executado |
| `/relatorios` | Relatórios | professional | `/relatorios` | RPCs de relatório | `preservar` | — | executado |
| `/agentes` | Agentes IA + chat de teste | professional | `/agentes` | `professional_agents` + `agent_executions` | `preservar` | — | executado |
| `/adm` | Painel interno admin (dentro do app profissional) | admin (app separado) | admin v2 completo | — | `consolidar` | — | executado |

---

## 3. Professional v1 — Financeiro

O `/financeiro` v1 era uma tela única com 7–8 abas. O v2 usa `/financeiro` como extrato principal + sub-rotas dedicadas.

| Aba/Rota v1 | Recurso percebido | App v2 | URL/tela v2 | Contrato v2 | Decisão | Owner PR | Status |
|---|---|---|---|---|---|---|---|
| `/financeiro` tab `caixa` | Visão de caixa do dia/período — entradas e saídas do período selecionado | professional | `/financeiro` cobre parcialmente | `financial_transactions` | `recriar` | 27.2 | **aprovado por Ismael** |
| `/financeiro` tab `comanda` | Lançar cobranças por sessão de atendimento | professional | modal de fechamento de sessão em `/agenda` | `financial_transactions` + `sessions` | `consolidar` | 27.2 | **aprovado por Ismael — sem aba separada** |
| `/financeiro` tab `entrada_saida` | Lançar receitas e despesas avulsas | professional | `/financeiro` (extrato já cobre) | `financial_transactions` | `consolidar` | 27.2 | **aprovado — extrato cobre, sem aba separada** |
| `/financeiro` tab `cliente` | Conta do cliente — saldo, créditos, histórico do cliente | professional | `/clientes/:id` (parcial) | `financial_transactions` | `recriar` | 27.2 | **aprovado por Ismael** |
| `/financeiro` tab `fluxo` | Fluxo de caixa projetado/realizado | professional | sem aba equivalente | `financial_transactions` | `recriar` | 27.2 | **aprovado por Ismael** |
| `/financeiro` tab `profissional` | Conta do profissional — comissões, repasses para colaboradores | professional | aba "Repasses" em `/financeiro` — visão derivada de sessions+team_members | `financial_transactions` + `sessions` + `team_members` | `recriar` | 27.2 | **aprovado por Ismael — aba ou visão, o que ficar mais amigável** |
| `/financeiro` tab `caixinha` | Reserva financeira interna (poupança da clínica) | professional | categoria de reserva em `financial_transactions` (sem feature dedicada) | `financial_transactions` | `descartar` | — | **recomendado descartar — ver §10** |
| `/financeiro/conciliacao` | Conciliação bancária | professional | `/financeiro/conciliacao` | RPCs fase 20 | `preservar` | — | executado |
| `/financeiro/nfse` | Emissão de NFS-e | professional | **fora deste projeto** | — | `descartar` | — | **aprovado por Ismael — projeto separado no futuro** |
| `/financeiro/configuracoes` | Configurações financeiras (categorias, contas, centros de custo) | professional | `/financeiro/configuracoes` (alias `/configuracoes/pagamento` ✓) | RPCs fase 15/20 | `preservar` | — | executado |
| Botão "Exportar Contador" | Gerar pacote ZIP para contabilidade | professional | seção em `/relatorios` | `financial_transactions` | `recriar` | 27.2 | **aprovado por Ismael — em Relatórios** |
| Botão PDV (modal) | PDV integrado ao atendimento | professional | PDV via `/financeiro` | `financial_transactions` | `preservar` | — | executado |

---

## 4. Professional v1 — Estoque

| Aba v1 | Recurso percebido | App v2 | URL/tela v2 | Contrato v2 | Decisão | Owner PR | Status |
|---|---|---|---|---|---|---|---|
| `/estoque` tab `produtos` | Catálogo de produtos | professional | `/estoque` | `products` | `preservar` | — | executado |
| `/estoque` tab `estoque` / sub-aba `itens` | Saldo atual por item | professional | `/estoque` | `products` + `product_batches` | `consolidar` | — | executado |
| `/estoque` tab `estoque` / sub-aba `reservas` | Reservas de produto | professional | sem aba equivalente visível | `product_stock_movements` | `decidir` | 27.5 | **⏸️ deferido — decisão de Ismael (fora do escopo 27)** |
| `/estoque` tab `estoque` / sub-aba `manutencao` | Manutenção de itens | professional | sem aba equivalente visível | `product_stock_movements` | `decidir` | 27.5 | **⏸️ deferido — decisão de Ismael (fora do escopo 27)** |
| `/estoque` tab `gestao` | Gestão avançada — consumo, expedição, histórico | professional | sem aba equivalente visível | `product_stock_movements` | `decidir` | 27.5 | **⏸️ deferido — decisão de Ismael (fora do escopo 27)** |

---

## 5. Professional v1 — Configurações

| Aba v1 | Recurso percebido | App v2 | URL/tela v2 | Contrato v2 | Decisão | Owner PR | Status |
|---|---|---|---|---|---|---|---|
| tab `empresa` | Dados da clínica (nome, CNPJ, WhatsApp, endereço, bio, PIX) | professional | `/configuracoes/clinica` | `professionals` + RPCs | `preservar` | — | executado |
| tab `colaboradores` | Gestão de equipe | professional | `/configuracoes/equipe` | `team_members` + RPCs | `preservar` | — | executado |
| tab `categorias` | Categorias de atendimento | professional | `/configuracoes` (consolidado) | `appointment_categories` | `consolidar` | — | executado |
| tab `agendamentos` | Regras de agendamento (duração, intervalo, antecedência) | professional | `/configuracoes/agenda` | RPCs de agenda | `preservar` | — | executado |
| tab `integracoes` / WhatsApp | Conectar WhatsApp — QR, código de pareamento, status, desconectar, Meta Cloud | professional | `/agentes` (status parcial) — **sem fluxo de conexão** | **contrato v2 insuficiente** | `recriar` | 27.3 | **aprovado por Ismael — urgente** |
| tab `integracoes` / SMTP | Configuração de e-mail SMTP do profissional | professional | fase futura — schema existe (`email_channel_settings` com `provider='smtp'`) mas email-dispatcher só implementa Resend; incompleto | `email_channel_settings` | `descartar` do escopo 27 | — | **fase futura — ver §10** |
| tab `plano` | Ver/gerenciar assinatura | professional | `/planos` (alias `/configuracoes/plano` ✓) | `platform-checkout` | `redirecionar` | — | executado |
| tab `parceiros` | Área de parceiros dentro de configurações | professional | `/parceiros` | `phase21_*` | `consolidar` | — | executado |
| `/configuracoes/anamnese` | Builder de template de anamnese | professional | `/documentos/anamnese` (alias ✓) | `anamnese_templates` | `redirecionar` | — | executado |
| `/configuracoes/assistente` | Configurações do assistente IA | professional | `/agentes` (alias ✓) | `professional_agents` | `redirecionar` | — | executado |
| `/configuracoes/servicos` | Atalho para serviços | professional | `/servicos` (alias ✓) | `services` | `redirecionar` | — | executado |
| `/configuracoes/pagamento` | Atalho para financeiro config | professional | `/financeiro/configuracoes` (alias ✓) | RPCs financeiro | `redirecionar` | — | executado |

---

## 6. Admin v1 — Todas as Rotas

| URL v1 | Recurso percebido | App v2 | URL/tela v2 | Contrato v2 | Decisão | Owner PR | Status |
|---|---|---|---|---|---|---|---|
| `/login` | Login admin | admin | `/login` | Supabase Auth | `preservar` | — | executado |
| `/dashboard` | Dashboard admin com KPIs de plataforma | admin | `/dashboard` | `get_admin_dashboard_rpc` | `preservar` | — | executado |
| `/profissionais` | Lista de profissionais | admin | `/profissionais` | `phase23_*` | `preservar` | — | executado |
| `/planos` | Gestão de planos | admin | `/planos` | `phase23_*` | `preservar` | — | executado |
| `/embaixadores` | Embaixadores/afiliados | admin | `/embaixadores` (alias `/afiliados` ✓) | `phase24_*` | `preservar` | — | executado |
| `/agentes` | Config global de agentes IA | admin | `/agentes` | `phase23_*` | `preservar` | — | executado |
| `/melhorias` | Fila de melhorias/feedback | admin | `/melhorias` | `phase23_*` | `preservar` | — | executado |
| `/configuracoes` | Configurações da plataforma | admin | `/configuracoes` | `phase23_*` | `preservar` | — | executado |
| `/nexus` | Nexus (IA central) | admin | `/nexus` | Fase 17 | `preservar` | — | executado |
| `/metricas` | Métricas — tabs: growth, financial, engagement, agents, health | admin | `/analytics` (alias `/metricas` → `/analytics` via PR 27.1) | `phase23_*` | `redirecionar` | 27.6 | **executado — PR 27.1** |
| `/onboarding-profissional` | Onboarding manual de profissional pelo admin | admin | `/profissionais/:id` (detalhe parcial — aceito) | `phase23_*` | `consolidar` | — | **aceito como consolidado em `/profissionais/:id`** |
| `/campanhas` | Campanhas admin — lista + biblioteca de templates (usáveis por admin E profissional) + gatilhos + audiências | admin | `/templates` — `campaign_templates` global com RPCs admin (PR 27.6) | `campaign_templates` | `recriar` | 27.6 | **executado — PR 27.6** |
| `/notificacoes` | Notificações admin | admin | `/broadcast` (alias `/notificacoes` ✓) | `admin-broadcast` | `redirecionar` | — | executado |
| `/teste-premium` | Página de teste premium (debug/QA interno) | admin | **descartado** | — | `descartar` | — | aprovado por premissa |
| `/debug` | Debug (DEV only) | admin | **descartado — DEV only** | — | `descartar` | — | aprovado por premissa |

---

## 7. Client v2 — Rotas Novas (sem equivalente v1)

Estas rotas não existiam na v1. São capacidades inteiramente novas do v2.

| URL v2 | Recurso | Contrato v2 | Status |
|---|---|---|---|
| `/cliente/:slug` | Onboarding de cliente via slug do profissional | `client-portal-handler` | novo na v2 |
| `/agendamento/:token` | Ações pós-agendamento via token | `public-appointment-actions` | novo na v2 |
| `/orcamento/:token` | Orçamento público via token | `public-quote-handler` | novo na v2 |
| `/portal/*` | Portal completo do cliente (histórico, pacotes, agenda) | `client-portal-handler` | novo na v2 |

---

## 8. Resumo Executivo

### Por decisão — estado final (2026-06-17)

| Decisão | Contagem |
|---|---|
| `preservar` (já OK) | 32 |
| `redirecionar` (executado) | 17 |
| `consolidar` (executado) | 10 |
| `recriar` (executado via PRs 27.1–27.7) | 15 |
| `descartar` (aprovado) | 6 |
| `decidir` (deferido por Ismael) | 0 — 27.5 formalmente deferido |

### Estado Final das PRs

| Gap | Decisão | PR | Status |
|---|---|---|---|
| G27-01: Financeiro avançado (Caixa, Conta Cliente, Fluxo) | recriar como visões v2 | 27.2 | ✅ executado |
| G27-01: Comanda | consolidar no fechamento de sessão em `/agenda` | 27.2 | ✅ executado |
| G27-02: NFS-e | fora deste projeto — projeto separado | — | ✅ descartado (Ismael) |
| G27-03: WhatsApp self-service | QR + pairing code via AgentesPage | 27.3 | ✅ executado |
| G27-04: URLs legadas | aliases e redirects | 27.1 | ✅ executado |
| G27-05: Estoque reservas/manutenção/expedição | deferido por Ismael | 27.5 | ⏸️ deferido |
| G27-06: Export para contador | botão CSV em ReportsPage | 27.2 | ✅ executado |
| G27-07: Repasses | aba Repasses em `/financeiro` | 27.2 | ✅ executado (parcial — `team_member_id` em sessions: migration futura) |
| G27-07: Caixinha | descartar — sem feature dedicada | — | ✅ descartado |
| G27-08: Admin `/metricas` | alias → `/analytics` | 27.1 | ✅ executado |
| G27-09: Admin onboarding profissional | consolidado em `/profissionais/:id` | — | ✅ aceito |
| G27-10: Admin campanhas templates | `campaign_templates` — RPCs admin + UI | 27.6 | ✅ executado |
| G27-11: SMTP configuração | descartar do escopo 27 — fase futura | — | ✅ descartado |
| G27-12: Offline indicator | OfflineBanner no AppShell | 27.7 | ✅ executado |

---

## 9. Próximos Passos Desbloqueados

Com as decisões P0 aprovadas, os PRs a seguir podem começar:

1. **PR 27.1** — aliases/redirects para todas as URLs legadas aprovadas
2. **PR 27.3** — WhatsApp self-service (**urgente** — bloqueante de operação)
3. **PR 27.2** — financeiro: Caixa, Conta Cliente, Fluxo de Caixa (Comanda aguarda decisão)
4. ~~**PR 27.4**~~ — NFS-e descartada deste projeto; PR 27.4 eliminado
5. **PR 27.5, 27.6, 27.7** — após decisões P1

---

## 10. Notas Técnicas de Decisão

### Comanda — aprovado: consolidar no fechamento de sessão

Na v1, a Comanda era uma aba separada no financeiro ("abrir → lançar itens → fechar → faturar"). Na v2, o momento natural é o **encerramento da sessão em `/agenda`**: profissional fecha o atendimento, adiciona serviços/produtos extras consumidos (opcional), confirma a cobrança. Isso gera `financial_transaction` + `product_stock_movement` sem duplicar conceitos.

Ismael aprovou essa consolidação em 2026-06-16.

---

### Caixinha — recomendado descartar

A Caixinha era uma "poupança interna" da clínica — reservar um percentual do faturamento automaticamente. Ismael não tinha certeza sobre o uso real.

**Recomendação: descartar como feature dedicada.** O mesmo objetivo pode ser alcançado com uma categoria `"Reserva"` nas `financial_transactions`, sem nenhuma lógica especial. Uma feature de Caixinha só vale a pena se houver automação (separar X% de cada recebimento) — e isso requer novo contrato, scheduler, e estado paralelo de caixa. Risco alto para valor incerto.

Se profissionais pedirem, vira feature futura isolada.

---

### SMTP — incompleto, fase futura

O schema v2 já tem `email_channel_settings` com `provider IN ('resend','smtp','disabled')`, mas o `email-dispatcher` só implementa Resend. A configuração de SMTP custom do profissional não está funcional de ponta a ponta.

Pela regra de Ismael ("se estiver completo, volta; senão fase futura"): **fase futura**. Não entra no escopo da Fase 27.

---

### Admin campanhas templates vs. broadcast — são conceitos distintos

Confirmado por Ismael (2026-06-16):

- **Templates de campanha:** biblioteca curada pelo admin, disponível para admin E para profissionais usarem ao criar campanhas próprias para seus clientes. Precisa de contrato novo (`campaign_templates` com RLS admin-escreve / profissional-lê).
- **Broadcast:** comunicação da **plataforma** para **profissionais** (avisos, releases, notificações de sistema). Contrato `admin-broadcast` + `phase24_*` — já existe e está correto.

Os dois coexistem sem conflito. O gap é a biblioteca de templates — será contrato novo em PR 27.6 com schema guard obrigatório antes da UI.
