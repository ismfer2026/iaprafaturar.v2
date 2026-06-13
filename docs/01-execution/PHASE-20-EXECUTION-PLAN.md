# FASE 20 — Plano de Execução

## Estoque, Fiscal e Financeiro Avançado

**Status:** Planejada — C20-02 e C20-05 aprovados; aguardando preflight C20-01, C20-03 e C20-04  
**Decision Owner:** Ismael  
**Aplicação principal:** `apps/professional`  
**Fonte contratual:** banco, migrations e RPCs da v2  
**Referência da v1:** somente comportamento e cobertura de frontend  
**Estimativa:** 3 a 4 semanas, condicionada à aprovação dos contratos C20

---

## 1. Objetivo

Fechar os gaps operacionais de estoque, conciliação e configurações financeiras usando exclusivamente o modelo da v2, sem recriar tabelas, funções ou regras legadas.

A fase deve entregar:

- `/estoque` operacional, integrado ao PDV;
- `/financeiro/conciliacao` com importação auditável e confirmação sempre explícita;
- `/financeiro/configuracoes` com gestão completa e restrita a gestor;
- decisão formal sobre fiscal/NFSe, sem criação especulativa de schema;
- contratos, permissões e trilha de auditoria suficientes para impedir duplicidade, IDOR e divergência de saldo.

---

## 2. Limites de Escopo

### Dentro da fase

- produtos, saldo atual e movimentações;
- ajuste manual auditável;
- estoque baixo;
- lotes e vencimentos conforme C20-02 aprovado;
- integração e concorrência entre PDV e estoque;
- importação CSV/OFX para conciliação;
- sugestões de correspondência sem confirmação automática;
- confirmação, descarte e encerramento auditáveis da conciliação;
- bancos, categorias, centros de custo, PIX, gateways e configuração de recibos;
- decisão documentada sobre NFSe/fiscal.

### Fora da fase sem contrato adicional aprovado

- reservas de estoque;
- manutenção de equipamentos ou itens;
- importação de estoque assistida por IA;
- emissão, cancelamento ou consulta de NFSe;
- segundo modelo de conciliação;
- tabelas legadas de estoque da v1;
- alteração das regras de matching pertencentes à Fase 15.

---

## 3. Estado Atual Confirmado

### Estoque e PDV

- `products` e `product_stock_movements` são a base real existente na v2.
- `create_pos_sale` reduz estoque e registra movimento `pdv_sale` atomicamente.
- `upsert_product` pode alterar `stock_quantity` sem gerar movimento, criando risco de divergência do livro de estoque.
- Produtos estão atualmente acoplados à tela de configurações financeiras.
- Não existe rota `/estoque`.
- Não existe contrato real para lotes e vencimentos.

### Conciliação

- A v2 já possui `finance_reconciliation_imports` e `finance_reconciliation_items`.
- `import_reconciliation_items` gera sugestões e não aplica correspondências automaticamente.
- `confirm_reconciliation_match` exige confirmação explícita e registra auditoria.
- Não foi confirmado contrato completo de idempotência, descarte, desfazer correspondência e encerramento de importação.
- A UI atual está dentro da página monolítica `FinanceiroPage`.

### Configurações financeiras

- Existem `finance_bank_accounts`, `finance_categories`, `finance_cost_centers` e `finance_gateway_settings`.
- A UI atual edita apenas uma parcela mínima das entidades.
- Os RPCs sensíveis ainda precisam ser restringidos formalmente a gestor.
- Configurações de recibos e semântica de desativação precisam de contrato explícito.

### Fiscal/NFSe

- A v1 possui referência visual de NFSe.
- Não existe contrato oficial suficiente na v2 para implementar emissão fiscal com segurança.

---

## 4. Pré-requisitos Bloqueantes

Antes do primeiro PR de implementação:

- [ ] correções de autenticação, role e gestão de equipe da Fase 19 aplicadas no ambiente alvo;
- [ ] migration `20260612172000_fix_phase19_professional_data_and_document_roles.sql` aplicada e validada no ambiente alvo;
- [ ] `auth_professional_role()` validada para gestor, operacional e usuário externo;
- [ ] matriz de permissões C20 aprovada por Ismael;
- [ ] modelo canônico de estoque C20-01 aprovado;
- [x] contrato de lotes e vencimentos C20-02 aprovado;
- [ ] ciclo de vida e idempotência da conciliação C20-03 aprovados;
- [ ] contrato de configurações financeiras C20-04 aprovado;
- [x] decisão fiscal/NFSe C20-05 registrada;
- [ ] conflito documental do `PRD-SCHEMA` sobre estoque legado resolvido.

**Gate:** nenhuma implementação começa com contrato crítico “a decidir depois”.

---

## 5. Contratos Obrigatórios

### C20-01 — Estoque canônico e fonte de verdade

Decisão recomendada:

- `products` representa cadastro e saldo agregado atual;
- `product_stock_movements` é o livro auditável de toda alteração de saldo;
- toda alteração de quantidade ocorre atomicamente com um movimento;
- `create_pos_sale` permanece como único owner da baixa por venda;
- edição de produto não pode alterar saldo silenciosamente;
- ajustes manuais são gestor-only, auditados e idempotentes;
- operacional pode consultar estoque e vender, mas não ajustar ou administrar produtos.

O contrato deve definir:

- RPC de criação/edição/desativação de produto;
- RPC de ajuste manual;
- motivos de movimento permitidos;
- regra de saldo inicial;
- proteção contra saldo negativo;
- concorrência entre venda e ajuste;
- paginação e filtros das leituras.

### C20-02 — Lotes e vencimentos — aprovado por Ismael

Vencimento deve ser modelado por lote, não como uma única data no produto.

Decisão aprovada:

- criar contrato aditivo de `product_batches`;
- cada lote pertence a produto e tenant;
- lote possui código, quantidade, vencimento e status;
- `products.stock_quantity` permanece a única fonte de verdade do saldo vendável atual;
- lotes representam somente a parcela rastreada por lote do saldo agregado;
- deve valer `SUM(product_batches.quantity) <= products.stock_quantity`;
- quantidade sem lote é sempre derivada por `products.stock_quantity - SUM(product_batches.quantity)` e não deve ser persistida como segunda fonte;
- toda entrada, ajuste ou baixa explícita de lote deve atualizar lote, saldo agregado e movimento na mesma transação;
- FEFO e baixa automática de lote pelo PDV ficam explicitamente deferidos;
- enquanto houver quantidade sem lote suficiente, vendas pelo PDV reduzem somente o saldo agregado;
- quando a venda precisar consumir quantidade rastreada por lote, o PDV deve exigir seleção manual de lote; não escolherá lote automaticamente;
- o sistema deve rejeitar qualquer baixa agregada que torne `SUM(product_batches.quantity) > products.stock_quantity`;
- impedir que lote introduza uma segunda fonte de verdade.

Não será adotado `SUM(product_batches.quantity) = products.stock_quantity` nesta fase: essa igualdade exigiria que toda venda escolhesse e baixasse um lote, contradizendo o deferimento explícito do FEFO.

**Gate:** `/estoque` não pode ser declarado completo sem vencimentos operacionais, cálculo visível da quantidade sem lote e proteção das invariantes no banco.

### C20-03 — Conciliação, idempotência e ciclo de vida

Reutilizar integralmente:

- `finance_reconciliation_imports`;
- `finance_reconciliation_items`;
- `import_reconciliation_items`;
- `confirm_reconciliation_match`;
- regras de matching da Fase 15.

O contrato deve acrescentar ou confirmar:

- importação e confirmação gestor-only;
- fingerprint/idempotency key por arquivo e item;
- comportamento para CSV/OFX duplicado;
- estados válidos da importação e dos itens;
- ações de ignorar, desfazer e finalizar;
- auditoria de todas as decisões;
- nenhuma confirmação automática.

### C20-04 — Configurações financeiras e preservação histórica

O contrato deve definir:

- escrita gestor-only;
- CRUD ou ativação/desativação explícita para todas as entidades;
- tratamento de múltiplos bancos, categorias, centros de custo e gateways;
- contrato de PIX;
- configuração de recibos;
- validações e segredos de gateway;
- garantia de que renomear ou desativar configuração não reescreve histórico financeiro.

Produtos deixam de pertencer à responsabilidade de `/financeiro/configuracoes`.

### C20-05 — Fiscal/NFSe — aprovado por Ismael

Decisão aprovada para esta fase:

- documentar NFSe como fora do escopo de implementação;
- não criar rota, tabela, RPC ou integração fiscal;
- registrar requisitos necessários para fase futura: provedor, municípios, credenciais, dados do emissor, estados, webhooks, cancelamento, auditoria e retenção.

NFSe não será implementada na Fase 20. Uma fase futura só poderá implementá-la após Ismael aprovar contrato completo no `PRD-SCHEMA`.

---

## 6. Matriz de Permissões

| Ação | Operacional | Gestor |
|---|---:|---:|
| Consultar produtos e saldo | Sim | Sim |
| Consultar movimentos e alertas | Sim | Sim |
| Vender produto pelo PDV | Sim | Sim |
| Criar, editar ou desativar produto | Não | Sim |
| Ajustar saldo manualmente | Não | Sim |
| Gerenciar lotes e vencimentos | Não | Sim |
| Consultar extrato financeiro permitido | Sim | Sim |
| Importar arquivo de conciliação | Não | Sim |
| Confirmar, ignorar ou desfazer match | Não | Sim |
| Finalizar ou cancelar conciliação | Não | Sim |
| Alterar configurações financeiras | Não | Sim |
| Acessar eventual operação fiscal | Não | Sim |

Todos os bloqueios devem existir no banco/RPC. Ocultar ações na UI é apenas defesa adicional.

---

## 7. Sequência de Execução

### PR 20.0 — Preflight contratual e documental

- aprovar C20-01, C20-03 e C20-04; ratificar C20-02 e C20-05;
- validar a aplicação das correções de role da Fase 19;
- corrigir o conflito entre schema aspiracional legado e schema real de estoque;
- registrar owners de rota, hook, RPC e tabela;
- inventariar componentes reutilizáveis da tela financeira atual;
- registrar decisão fiscal;
- congelar matriz de permissões.

**Gate:** contratos críticos aprovados e conflitos resolvidos.

### PR 20.1 — Segurança e ciclo financeiro

- restringir RPCs de conciliação e configurações a gestor;
- fechar IDOR e validar tenant em todas as mutações;
- implementar idempotência da importação;
- completar ciclo de vida auditável da conciliação conforme C20-03;
- garantir que nenhuma sugestão seja aplicada automaticamente;
- adicionar testes de autorização, duplicidade e concorrência.

**Gate:** operacional não executa mutações financeiras de gestor.

### PR 20.2 — Contrato operacional de estoque

- separar edição de cadastro de alteração de saldo;
- garantir movimento atômico para saldo inicial e ajuste manual;
- preservar `create_pos_sale` como owner da baixa do PDV;
- implementar desativação segura de produto;
- implementar consultas paginadas de saldo, movimentos e estoque baixo;
- adicionar testes de saldo negativo, concorrência, IDOR e auditoria.

**Gate:** nenhum caminho válido altera estoque sem movimento correspondente.

### PR 20.3 — Lotes, vencimentos e alertas

- implementar C20-02 aprovado;
- criar gestão de lotes e vencimentos;
- implementar alertas de vencimento;
- exibir saldo rastreado por lote e quantidade sem lote derivada;
- validar `SUM(lotes) <= saldo agregado` em todas as operações;
- exigir seleção manual de lote no PDV somente quando a venda exceder a quantidade sem lote;
- manter FEFO e baixa automática de lote pelo PDV fora do escopo;
- adicionar testes de concorrência e isolamento por tenant.

**Gate:** lote não cria fonte de verdade concorrente.

### PR 20.4 — Rota `/estoque`

- criar rota e navegação próprias;
- entregar produtos, saldo, movimentos, estoque baixo e vencimentos;
- criar estados de loading, vazio, erro e permissão;
- permitir ajustes e administração apenas para gestor;
- remover gestão de produtos de `/financeiro/configuracoes`;
- manter PDV consumindo os contratos canônicos;
- validar responsividade e acessibilidade.

**Gate:** estoque mínimo funciona ponta a ponta com o PDV.

### PR 20.5 — Rota `/financeiro/conciliacao`

- separar a experiência da página financeira monolítica;
- implementar fluxo: upload, validação, revisão, confirmação e encerramento;
- suportar CSV e OFX dentro do contrato aprovado;
- exibir sugestões, confiança e motivo sem autoaplicar;
- permitir ignorar, desfazer e corrigir apenas se contratados;
- impedir reimportação silenciosa;
- entregar filtros, paginação e estados completos.

**Gate:** cada match final possui confirmação humana e auditoria.

### PR 20.6 — Rota `/financeiro/configuracoes`

- separar configurações da tela financeira monolítica;
- entregar gestão completa de bancos, categorias, centros de custo, PIX e gateways;
- implementar configuração de recibos aprovada;
- restringir rota e mutações a gestor;
- preservar referências históricas;
- remover qualquer responsabilidade de estoque.

**Gate:** alterações de configuração não modificam lançamentos históricos.

### PR 20.7 — Validação integrada PDV, estoque e financeiro

- testar venda concorrente com ajuste manual;
- testar rollback completo quando venda falha;
- reconciliar venda, transação financeira e movimento de estoque;
- testar produto desativado, saldo insuficiente e múltiplos usuários;
- validar alertas após vendas e ajustes;
- confirmar ausência de duplicação de regra entre frontend e banco.

**Gate:** não existe divergência reproduzível entre PDV, saldo e movimentos.

### PR 20.8 — QA, documentação e encerramento

- executar typecheck, lint, build e testes;
- revisar roles, IDOR, tenant isolation e auditoria;
- revisar acessibilidade, responsividade, loading, erro e vazio;
- registrar decisão final de NFSe;
- sincronizar `PRD-MASTER`, `PRD-FRONTEND`, `PRD-SCHEMA` e este plano;
- registrar dívidas explicitamente aceitas por Ismael.

**Gate:** DoD da Fase 20 comprovado por evidência, não apenas marcado.

---

## 8. Inventário de Ownership Planejado

| Área | Rota | Owner de UI | Contrato principal |
|---|---|---|---|
| Estoque | `/estoque` | página/hook dedicados de estoque | C20-01 e C20-02 |
| PDV | `/financeiro/pdv` | fluxo existente | `create_pos_sale` |
| Conciliação | `/financeiro/conciliacao` | página/hook dedicados | C20-03 + Fase 15 |
| Configurações | `/financeiro/configuracoes` | página/hook dedicados | C20-04 |
| Fiscal/NFSe | não criar por padrão | sem owner nesta fase | C20-05 |

`FinanceiroPage` pode permanecer como shell ou extrato, mas não deve continuar concentrando regras e ownership das três áreas.

---

## 9. Riscos e Mitigações

| Risco | Mitigação obrigatória |
|---|---|
| Alteração direta de `stock_quantity` cria divergência | toda mutação gera movimento na mesma transação |
| Venda e ajuste concorrentes produzem saldo incorreto | lock/transação no banco e testes concorrentes |
| Importação CSV/OFX duplicada | fingerprint e idempotência por tenant |
| Operacional acessa ações de gestor | autorização no RPC e testes negativos |
| Configuração reescreve histórico | IDs históricos preservados e desativação explícita |
| Lotes criam segundo saldo divergente | contrato único de agregação e invariantes testadas |
| Página financeira monolítica mantém acoplamento | separar owners de rota, hooks e contratos |
| Schema legado induz criação duplicada | corrigir PRD-SCHEMA no preflight |
| NFSe é implementada sem base legal/técnica | decisão C20-05 bloqueante |
| Correções da Fase 19 não estão aplicadas | gate de ambiente antes do PR 20.1 |

---

## 10. Critérios de Encerramento

- [ ] `/estoque` entrega produtos, saldo, movimentos, estoque baixo e vencimentos;
- [ ] toda alteração de estoque é auditável e reconciliada com PDV;
- [ ] concorrência e saldo negativo estão protegidos no banco;
- [ ] `/financeiro/conciliacao` usa exclusivamente o modelo da Fase 15;
- [ ] nenhuma correspondência é confirmada automaticamente;
- [ ] importações duplicadas são detectadas;
- [ ] `/financeiro/configuracoes` suporta múltiplas entidades e é gestor-only;
- [ ] configurações não reescrevem histórico;
- [ ] isolamento por tenant e IDOR possuem testes negativos;
- [ ] decisão sobre NFSe está aprovada e documentada;
- [ ] nenhuma tabela ou função legada da v1 foi recriada;
- [ ] PRDs e contratos refletem exatamente o que foi entregue;
- [ ] dívidas restantes possuem owner, justificativa e fase de destino.

---

## 11. Checklist para Iniciar

- [ ] Ismael aprova este plano;
- [x] Ismael aprovou C20-02: lotes são parcela rastreada do saldo agregado; FEFO deferido;
- [x] Ismael aprovou C20-05: NFSe fora da implementação da Fase 20;
- [ ] ambiente confirma migrations e correções da Fase 19;
- [ ] PR 20.0 é aberto antes de qualquer código funcional;
- [ ] nenhuma tarefa começa sem owner, rota, contrato, permissão e teste esperado.
