# FASE 27 - Preflight

## Paridade Percebida v1 -> v2 e Recovery de Recursos

**Status:** planejada; aguardando aprovação explícita de Ismael para execução funcional  
**Decision Owner:** Ismael  
**Data:** 2026-06-16  
**Base:** `POST-PHASE-26-V1-V2-PARITY-AUDIT.md`  
**Modo:** Plan Mode; sem implementação neste documento

---

## 1. Objetivo

Fechar a lacuna entre a v2 tecnicamente concluída e a v2 percebida como evolução completa da v1.

A Fase 27 existe porque a v1 tinha recursos úteis construídos aos poucos, mas também acumulou conflitos de rotas, funções duplicadas e fragilidade de backend. A v2 não deve copiar esses bugs, mas também não deve remover recursos úteis sem decisão explícita.

---

## 2. Escopo

### Inclui

- professional v1 em `iaparalucrar-crm`;
- admin v1 em `iaprafaturar-admin`;
- professional/admin/client v2 em `iaprafaturar.v2`;
- rotas, menus, páginas, abas, botões, modais, estados e jornadas;
- compatibilidade de URLs legadas críticas;
- recuperação de recursos por contratos v2;
- documentação de descartes aprovados.

### Não inclui

- copiar DB/functions/hooks da v1 como padrão;
- criar produto novo sem relação com paridade;
- executar NFS-e sem contrato fiscal aprovado;
- envio real de WhatsApp/IA em QA;
- ações destrutivas em schema sem gate próprio.

---

## 3. Invariantes

1. v1 é referência de experiência, não fonte técnica.
2. O DB Supabase v2 e migrations v2 vencem qualquer suposição da v1.
3. Toda recuperação deve usar contrato v2 existente ou abrir schema guard.
4. Nenhuma URL legada pode criar estado paralelo.
5. Nenhum recurso pode duplicar rota, tabela, RPC, fila, hook ou Edge Function com a mesma responsabilidade.
6. Go comercial permanece bloqueado até a matriz v1 -> v2 estar fechada.

---

## 4. Decisões C27

| ID | Decisão | Status inicial |
|---|---|---|
| C27-01 | A v1 será usada somente para comparar jornada/UX, nunca como padrão técnico | aprovado por premissa |
| C27-02 | Financeiro avançado deve voltar como visões/filtros sobre contratos v2, não como modelo paralelo | **aprovado por Ismael (2026-06-16):** Caixa, Conta Cliente e Fluxo de Caixa recriar como visões v2; Comanda aguarda opinião técnica; Caixinha e Conta Profissional pendentes |
| C27-03 | NFS-e deve ser decidida: voltar agora com contrato completo ou permanecer fase futura explícita | **aprovado por Ismael (2026-06-16): fora deste projeto** — sem rota de aviso, sem contrato; projeto separado no futuro; PR 27.4 eliminado |
| C27-04 | WhatsApp self-service deve usar contrato seguro v2; se faltar contrato, PR funcional bloqueia | **aprovado por Ismael (2026-06-16): recriar com urgência** — P0 crítico; profissional deve conectar/desconectar instância sem suporte manual |
| C27-05 | URLs legadas públicas/profissionais/admin devem receber alias/redirect quando houver destino seguro | **aprovado por Ismael (2026-06-16): todas as funções continuam necessárias** — implementar rotas/redirects v2 em PR 27.1; slugs podem mudar, funcionalidades não |
| C27-06 | Estoque avançado só pode reaproveitar produtos/lotes/movimentos v2 | a aprovar |
| C27-07 | Admin campanhas/templates/gatilhos deve ser comparado contra `/broadcast`; lacunas viram contrato v2 | a aprovar |
| C27-08 | Recursos de debug/teste premium da v1 ficam descartados salvo decisão contrária de Ismael | a aprovar |
| C27-09 | PWA/offline/centro de notificações só volta se for experiência real de usuário, não infraestrutura legada problemática | a aprovar |
| C27-10 | Cada descarte precisa aparecer no PRD e na matriz de paridade | a aprovar |

---

## 5. Gaps G27

| ID | Área | Gap | Severidade |
|---|---|---|---|
| G27-01 | Financeiro | v1 tinha Caixa, Comanda, Entrada/Saída, Conta Cliente, Fluxo, Conta Profissional, Caixinha, Conciliação e PDV; v2 expõe Extrato, PDV, Conciliação e Configurações | P0 |
| G27-02 | NFS-e | `/financeiro/nfse` existe na v1 e não existe na v2 | P0 |
| G27-03 | WhatsApp | v1 tinha QR/código/Meta Cloud/desconectar/status; v2 mostra status mas não self-service completo | P0 |
| G27-04 | URLs legadas | `/convite/:codigo`, `/indicacao/:codigo`, `/cadastro/:codigo`, `/entrar`, `/chat`, `/indicacoes`, `/fidelidade`, admin `/metricas` | P0 |
| G27-05 | Estoque | v1 tinha consumo, expedição, histórico, reserva/manutenção; v2 tem produto, ajuste e lotes | P1 |
| G27-06 | Export contador | v1 exportava pacote para contador; v2 não tem equivalente encontrado | P1 |
| G27-07 | Conta cliente/profissional | v1 tinha visões financeiras dedicadas; v2 concentra em extrato/perfil | P1 |
| G27-08 | Admin métricas | v1 admin tinha `/metricas`; v2 usa `/analytics` sem alias | P1 |
| G27-09 | Admin onboarding profissional | v1 tinha `/onboarding-profissional`; v2 precisa validar equivalência | P1 |
| G27-10 | Admin campanhas/templates/gatilhos | v1 admin era mais granular; v2 consolida em `/broadcast` | P1 |
| G27-11 | PWA/offline/notificações | v1 tinha centro/overlay/offline sync; v2 tem preferências e PWA mais seguro | P2 |

---

## 6. Contratos Bloqueantes

| Área | Pode implementar UI se... | Bloqueia se... |
|---|---|---|
| Financeiro avançado | contratos v2 de transações, categorias, contas, centros, recibos, conciliação e PDV cobrem a visão | precisar nova fonte financeira paralela |
| NFS-e | contrato fiscal aprovado com provider, município, credenciais, ambiente, status e auditoria | não houver contrato fiscal e RLS/grants |
| WhatsApp self-service | existir Edge Function/RPC v2 para status, QR/código, conectar e desconectar sem expor token | exigir token/credencial no frontend |
| URLs legadas | destino canônico v2 existe e não depende de estado local frágil | destino exigir contrato inexistente |
| Estoque avançado | products/product_batches/product_stock_movements suportam a ação | gerar segunda fonte de saldo |
| Admin campanhas | `admin-broadcast`, worker e contratos phase24 suportam templates/gatilhos | recriar campaigns admin paralela |

---

## 7. Matriz Obrigatória de Paridade

Cada item da v1 deve receber:

| Campo | Obrigatório |
|---|---|
| App origem | professional v1 ou admin v1 |
| URL/tela v1 | rota, página, aba ou modal |
| Recurso percebido | o que o usuário conseguia fazer |
| App destino v2 | professional/admin/client |
| URL/tela v2 | rota canônica ou alias |
| Contrato v2 | tabela/RPC/Edge Function/hook |
| Decisão | preservar, consolidar, redirecionar, recriar, descartar |
| Evidência | screenshot, código, teste ou PRD |
| Owner PR | 27.x |
| Status | pendente, aprovado, executado, descartado |

---

## 8. Gates

### Gate 27.0

- C27-01 a C27-10 aprovados por Ismael;
- matriz v1 -> v2 criada;
- screenshots ou inventário visual mínimo das rotas críticas;
- nenhum PR funcional iniciado antes da decisão de cada P0.

### Gate de Schema

Obrigatório para:

- NFS-e;
- WhatsApp self-service se contrato v2 for insuficiente;
- estoque avançado se exigir nova semântica de movimento;
- campanhas admin se broadcast atual não suportar templates/gatilhos.

### Gate de QA

- rotas legadas diretas testadas;
- aliases não sombreiam rota canônica;
- mobile 390px validado;
- usuário da v1 consegue localizar o recurso equivalente em até 3 cliques ou há redirect;
- nenhum envio real em teste automatizado.

---

## 9. Saída Esperada

- `PHASE-27-V1-V2-PARITY-MATRIX.md`;
- `PHASE-27-QA-REPORT.md`;
- PRD-MASTER/FRONTEND/SCHEMA/EDGE/CONSOLIDATION atualizados;
- Go/No-Go comercial decidido por Ismael.

---

## 10. Aprovação Necessária

Antes de PR 27.1 funcional:

- Ismael aprova C27-01 a C27-10;
- Ismael decide P0: financeiro avançado, NFS-e, WhatsApp self-service e URLs legadas;
- qualquer contrato novo passa por schema guard.
