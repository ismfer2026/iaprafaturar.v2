# FASE 27 - Plano de Execução

## Paridade Percebida v1 -> v2 e Recovery de Recursos

**Status:** planejada; execução funcional bloqueada até aprovação do preflight  
**Decision Owner:** Ismael  
**Skill aplicada:** site-architecture  
**Referências:** `POST-PHASE-26-V1-V2-PARITY-AUDIT.md`, `PHASE-27-PREFLIGHT.md`

---

## 1. Objetivo

Garantir que a v2 seja percebida como evolução da v1: mais segura, mais organizada e sem perda de recursos úteis.

A Fase 27 não reabre as 26 fases técnicas. Ela adiciona um gate de paridade de produto antes do Go comercial.

---

## 2. Ordem Lógica

### PR 27.0 - Inventário navegável e matriz de paridade

**Objetivo:** provar exatamente o que existe, foi consolidado, sumiu ou deve ser descartado.

**Tarefas:**
- inventariar rotas e menus professional v1;
- inventariar rotas e menus admin v1;
- inventariar rotas e menus professional/admin/client v2;
- capturar evidência visual das rotas P0 quando possível;
- criar `PHASE-27-V1-V2-PARITY-MATRIX.md`;
- classificar cada item como `preservar`, `consolidar`, `redirecionar`, `recriar`, `descartar`.

**DoD:**
- matriz cobre todas as páginas v1 em `src/pages`;
- cada rota crítica tem destino v2 ou decisão;
- nenhum item P0 fica sem owner.

**Gate:** PR 27.1 só começa após Ismael aprovar as decisões P0.

---

### PR 27.1 - Compatibilidade de URLs e navegação

**Objetivo:** impedir que links e hábitos da v1 quebrem sem necessidade.

**Escopo inicial:**
- professional `/indicacoes` -> rota canônica aprovada de recompensas/indicações;
- professional `/fidelidade` -> rota canônica aprovada de recompensas/fidelidade;
- admin `/metricas` -> `/analytics` ou decisão;
- avaliar `/convite/:codigo`, `/indicacao/:codigo`, `/cadastro/:codigo`, `/entrar`, `/chat`.

**Regras:**
- alias nunca mantém estado paralelo;
- rota antiga dinâmica só é redirecionada se houver destino seguro no app correto;
- links públicos legados precisam teste de token/slug inválido.

**DoD:**
- aliases aprovados testados;
- rotas descartadas documentadas;
- menus não apontam para rotas removidas.

---

### PR 27.2 - Financeiro avançado sem duplicidade

**Objetivo:** recuperar a operação financeira percebida na v1 usando contratos v2.

**Recursos a comparar:**
- Caixa;
- Comanda;
- Entrada/Saída;
- Conta Cliente;
- Fluxo de Caixa;
- Conta Profissional;
- Caixinha;
- Conciliação;
- PDV;
- exportação para contador.

**Abordagem:**
- preferir visões, filtros e agrupamentos sobre `financial_transactions`;
- reutilizar categorias, contas, centros de custo, recibos e conciliação v2;
- não criar tabelas paralelas para caixa/comanda/conta;
- se faltar contrato, criar tarefa de schema guard.

**DoD:**
- cada aba v1 possui equivalente v2 ou descarte aprovado;
- nenhuma nova fonte de verdade financeira;
- gestor/operacional respeita matriz de permissões;
- build/lint/typecheck passam.

---

### PR 27.3 - WhatsApp self-service profissional

**Objetivo:** devolver ao profissional capacidade segura de conectar e gerenciar WhatsApp quando o contrato v2 permitir.

**Recursos v1 a validar:**
- status;
- QR;
- código de pareamento;
- Meta Cloud;
- desconectar;
- refresh;
- telefone padrão/links rápidos.

**Abordagem:**
- auditar Edge Functions v2 relacionadas a WhatsApp;
- nunca expor `evolution_instance_token` ou credenciais no frontend;
- separar status de conexão de configuração de agentes;
- se contrato v2 insuficiente, abrir schema/function guard antes da UI.

**DoD:**
- UI self-service existe ou decisão operacional está documentada;
- credenciais não vazam;
- ações auditáveis;
- rotas ficam em `/agentes` ou `/configuracoes/assistente` como redirect documentado, sem duplicidade.

---

### ~~PR 27.4 - NFS-e~~ — ELIMINADO

**Decisão de Ismael (2026-06-16):** NFS-e está fora deste projeto. Projeto separado no futuro. Nenhuma rota, contrato ou UI neste escopo. PR 27.4 removido da sequência.

---

### PR 27.5 - Estoque operacional avançado

**Objetivo:** validar se consumo, expedição, reserva/manutenção e histórico da v1 devem voltar.

**Abordagem:**
- usar `products`, `product_batches` e `product_stock_movements`;
- preservar invariante da Fase 20;
- implementar como movimentos/tipos/visões, não segunda fonte de saldo;
- PDV continua respeitando lote quando necessário.

**DoD:**
- cada recurso de estoque v1 tem decisão;
- nenhuma violação de saldo agregado/lote;
- histórico é derivado de movimentos v2.

---

### PR 27.6 - Admin parity

**Objetivo:** garantir que admin v2 cobre o valor operacional do admin v1.

**Comparar:**
- `/metricas` vs `/analytics`;
- `/onboarding-profissional` vs `/profissionais/:id` e onboarding manual;
- `/campanhas` vs `/broadcast`;
- templates, gatilhos e audiências;
- `/embaixadores`;
- `/notificacoes`.

**Regras:**
- campanhas admin não podem conflitar com growth profissional;
- broadcast continua owner de comunicação admin;
- templates/gatilhos só voltam se houver contrato v2 ou schema guard.

**DoD:**
- admin v1 mapeado contra admin v2;
- aliases aprovados;
- lacunas funcionais viram PR ou descarte aprovado.

---

### PR 27.7 - PWA, notificações e offline

**Objetivo:** decidir se recursos periféricos da v1 eram produto ou infraestrutura problemática.

**Comparar:**
- centro de notificações;
- notification bell;
- prompt/overlay;
- status offline;
- sync local;
- instalação PWA.

**Regra:** não reintroduzir cache inseguro de Supabase removido na Fase 26.

**DoD:**
- experiência útil preservada ou descartada;
- nenhum cache autenticado inseguro;
- documentação atualizada.

---

### PR 27.8 - QA final e Go/No-Go

**Objetivo:** fechar paridade percebida.

**Tarefas:**
- rodar matriz v1 -> v2;
- testar rotas legadas;
- testar professional/admin/client em 390px;
- validar build/lint/typecheck;
- atualizar PRDs;
- emitir `PHASE-27-QA-REPORT.md`;
- Ismael decide Go/No-Go comercial.

**DoD:**
- zero P0 aberto;
- P1 aberto só com decisão explícita;
- Go comercial não depende de suposição.

---

## 3. Sequência Recomendada

1. PR 27.0
2. PR 27.1
3. PR 27.2
4. PR 27.3
5. PR 27.4
6. PR 27.5
7. PR 27.6
8. PR 27.7
9. PR 27.8

Financeiro, WhatsApp, NFS-e e URLs legadas são P0. Estoque/admin/PWA são P1/P2, mas devem entrar no QA final.

---

## 4. Testes Obrigatórios

- `npm test`;
- `npm run typecheck`;
- `npm run lint`;
- `npm run build`;
- `git diff --check`;
- testes de rotas/aliases v1 -> v2;
- smoke visual 390px e desktop;
- testes negativos de permissão quando houver contrato sensível.

---

## 5. Critérios de Encerramento

- [ ] matriz v1 -> v2 completa;
- [ ] todos os P0 fechados ou descartados por Ismael;
- [ ] financeiro avançado aprovado;
- [ ] NFS-e decidido;
- [ ] WhatsApp self-service decidido/implementado com segurança;
- [ ] URLs legadas críticas tratadas;
- [ ] estoque/admin/PWA avaliados;
- [ ] nenhum contrato v1 copiado como padrão técnico;
- [ ] PRDs sincronizados;
- [ ] QA final aprovado;
- [ ] Go/No-Go comercial registrado.

---

## 6. Riscos

| Risco | Mitigação |
|---|---|
| Recriar bugs da v1 | v1 só como UX; contrato v2 obrigatório |
| Duplicar financeiro | usar visões/filtros sobre transações v2 |
| Expor credenciais WhatsApp | UI só chama contrato seguro, sem tokens |
| NFS-e especulativa | contrato fiscal antes de UI |
| Quebrar links legados | alias/redirect testado |
| Aumentar escopo sem fim | cada item exige decisão Ismael |

---

## 7. Aprovação

Antes de execução funcional, Ismael aprova:

- C27-01 a C27-10;
- prioridade P0/P1/P2;
- destino das URLs legadas;
- decisão inicial sobre NFS-e;
- limites do financeiro avançado;
- política de WhatsApp self-service.
