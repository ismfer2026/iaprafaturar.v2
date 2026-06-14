# FASE 24 — Preflight Contratual

## Admin Growth, Broadcast, Notificações e Afiliados

**Status:** concluído; C24-05 reaberto, corrigido e validado em 2026-06-14  
**Data da auditoria:** 2026-06-14  
**Decision Owner:** Ismael  
**Aplicação principal:** `apps/admin`  
**Fonte de verdade:** PRD-MASTER, PRDs v2, migrations v2, RPCs v2, Edge Functions v2 e frontend admin v2  
**Referência v1:** somente inventário de jornadas e recursos; functions e schema da v1 não são padrão

---

## 1. Parecer de Preflight

A Fase 24 deve completar a comunicação administrativa da plataforma, a operação de embaixadores e o pipeline comercial da Nerissa sem reutilizar domínios profissionais e sem criar rotas paralelas.

O v2 já possui:

- `/broadcast`, com envio WhatsApp imediato e `dry_run` pela Edge Function `admin-broadcast`;
- `/embaixadores`, com aprovação e suspensão básicas;
- aliases `/campanhas` e `/notificacoes` para `/broadcast`, e `/afiliados` para `/embaixadores`;
- contratos afiliados da Fase 17 e o `affiliate-commission-cron`;
- auditoria administrativa global da Fase 23.

Os gaps centrais são:

- broadcast não possui contrato persistente único para histórico, destinatários, idempotência, leitura e limpeza;
- envio real atual percorre destinatários sincronamente, sem fila distribuída ou controle anti-spam comprovado;
- canais além de WhatsApp não possuem capacidade v2 confirmada;
- `/embaixadores` ainda consome o payload monolítico `get_admin_phase17_dashboard`;
- faltam criação controlada, detalhe, indicações, comissões, pagamentos PIX, histórico e métricas;
- `/leads` não existe e nenhuma migration v2 de `sales_leads` foi encontrada;
- não existe matriz aprovada de métricas de comunicação e afiliados.

**Gate geral:** nenhum PR funcional começa antes da aprovação explícita de Ismael para C24-01 a C24-09 e da passagem pelo schema guard dos novos contratos.

---

## 2. Decisões Recomendadas para Aprovação

### C24-01 — Rotas e separação de domínios

**Recomendação:** manter as rotas canônicas já definidas.

- `/broadcast` é a única implementação de comunicação admin;
- `/campanhas` e `/notificacoes` permanecem aliases para `/broadcast`;
- `/embaixadores` é a única implementação administrativa de afiliados;
- `/afiliados` permanece alias para `/embaixadores`;
- `/parceiros` pertence exclusivamente ao app profissional;
- `/leads` administra apenas leads comerciais da plataforma/Nerissa;
- nenhum contrato de campanhas profissionais ou `/funil` será reutilizado.

### C24-02 — Identidade, auditoria e privacidade

**Recomendação:** manter `master_admin` como único ator administrativo humano.

- RPCs administrativas começam com `admin_assert_master()`;
- mutações exigem motivo, alvo e auditoria;
- cron interno usa autenticação interna explícita;
- payloads nunca expõem dados clínicos, tokens, secrets ou settings completos;
- nenhuma ação administrativa fica disponível no app profissional.

### C24-03 — Domínio canônico de broadcast

**Recomendação:** criar um domínio persistente próprio de comunicação da plataforma após schema guard.

- broadcast admin não usa `campaigns` profissionais;
- contrato registra mensagem, audiência, canais, estado, `dry_run`, ator e timestamps;
- destinatários e resultados possuem idempotência e histórico consultável;
- `agent_executions` e `message_events` continuam evidência técnica, mas não substituem o histórico de produto;
- limpeza significa retenção/arquivamento aprovado, nunca apagar auditoria imutável.

### C24-04 — Audiência e canais

**Recomendação:** oferecer somente capacidades comprovadas no v2.

- audiências iniciais: risco, trial e todos os profissionais, com contagem prévia;
- segmentações novas exigem fonte e definição registradas;
- WhatsApp é o único canal inicialmente confirmado;
- push/in-app ficam bloqueados até contrato de entrega e leitura aprovado;
- a UI nunca oferece canal indisponível nem simula leitura;
- toda comunicação identifica claramente o público selecionado.

### C24-05 — Entrega, anti-spam, idempotência e métricas

**Recomendação:** envio real deve ser assíncrono, distribuído e retomável.

- `dry_run` permanece padrão e obrigatório em QA automatizado;
- envio real cria trabalho persistente e retorna sem percorrer toda a audiência;
- workers respeitam limites, retry controlado e idempotência por broadcast/destinatário/canal;
- métricas distinguem selecionado, elegível, enfileirado, enviado, entregue, lido, respondido, falhou e ignorado;
- estados não comprováveis pelo canal permanecem indisponíveis, não viram zero enganoso.

### C24-06 — Operação de embaixadores

**Recomendação:** ampliar os contratos da Fase 17 por payloads administrativos curados.

- listar, filtrar, consultar detalhe, aprovar, rejeitar e suspender;
- criação manual vincula somente um `professional_id` existente;
- parceiro externo sem profissional exige decisão e schema futuro, fora desta fase;
- links, indicações e histórico usam os contratos afiliados canônicos;
- nenhuma tela usa `get_admin_phase17_dashboard` como payload genérico.

### C24-07 — Comissões e pagamentos PIX

**Recomendação:** manter cálculo automático e confirmação de pagamento manual auditada.

- `affiliate-commission-cron` calcula comissões;
- admin revisa comissões e confirma pagamentos por RPC específica;
- PIX é registrado por referência/comprovante permitido, sem guardar segredo bancário;
- confirmação duplicada ou transição inválida é rejeitada;
- Stripe Connect e pagamento automático ficam fora do escopo sem decisão separada.

### C24-08 — Leads comerciais da plataforma

**Recomendação:** `/leads` usa exclusivamente um contrato v2 de `sales_leads`, criado somente após schema guard.

- pipeline: novo, qualificado, demo, proposta, convertido e perdido;
- origem, score, última interação, responsável e próximo follow-up são campos curados;
- integração Nerissa usa contratos específicos e auditáveis;
- `/leads` não lê nem altera `funnel_opportunities`, clientes ou conversas profissionais;
- takeover humano só entra após contrato explícito de ownership e auditoria.

### C24-09 — UX, idiomas e QA

**Recomendação:** aplicar o padrão operacional do admin v2.

- telas responsivas e utilizáveis em 390px;
- listas extensas são paginadas e filtráveis;
- loading, empty, error, unauthorized, success e partial failure são explícitos;
- ações financeiras e envios reais exigem confirmação e motivo;
- i18n completo em pt-BR, en-US e es-419;
- testes reais de envio usam audiência controlada; automação usa `dry_run`.

---

## 3. Inventário de Contratos v2

| Domínio | Contrato existente | Estado para Fase 24 |
|---|---|---|
| Identidade admin | `admin_assert_master()`, `is_master_admin()` | reutilizar e testar negativamente |
| Broadcast | Edge Function `admin-broadcast` | manter entrada; redesenhar persistência e execução |
| Evidência técnica | `agent_executions`, `message_events` | reutilizar; não tratar como histórico de produto |
| Afiliados | `platform_affiliate_partners`, `platform_affiliate_referrals`, `platform_affiliate_commissions`, `platform_affiliate_payments` | reutilizar |
| Revisão de embaixador | `admin_review_ambassador_request()` | reutilizar/estender sem update direto |
| Pagamento afiliado | `admin_confirm_affiliate_payment()` | reutilizar e validar idempotência/auditoria |
| Cálculo de comissão | `calculate_affiliate_commissions()`, `affiliate-commission-cron` | reutilizar |
| Dashboard afiliado profissional | `get_my_ambassador_dashboard()` e wrapper da Fase 21 | manter exclusivo do profissional |
| Payload admin Fase 17 | `get_admin_phase17_dashboard()` | remover dependência de `/embaixadores` |
| Leads comerciais | sem migration/RPC v2 confirmada para `sales_leads` | bloqueado por schema guard |

---

## 4. Gaps Bloqueantes

| ID | Gap | Risco | Owner planejado | Bloqueia |
|---|---|---|---|---|
| G24-01 | C24-01 a C24-09 sem aprovação final | decisões implícitas | PR 24.0 | todos os PRs funcionais |
| G24-02 | broadcast sem histórico canônico persistente | perda de rastreabilidade e duplicidade | PR 24.1 | PR 24.2 / 24.3 |
| G24-03 | envio síncrono sem fila, retry e idempotência por destinatário | spam, timeout e reenvio duplicado | PR 24.1 | envio real |
| G24-04 | canais e semântica de leitura não comprovados | UI enganosa | PR 24.0 / 24.1 | PR 24.2 / 24.3 |
| G24-05 | `/embaixadores` usa payload monolítico | excesso de dados e acoplamento | PR 24.1 | PR 24.4 |
| G24-06 | criação, detalhe e histórico administrativo de embaixador incompletos | operação parcial | PR 24.1 / 24.4 | encerramento |
| G24-07 | pagamento PIX e transições precisam de validação de idempotência | pagamento duplicado ou não auditado | PR 24.1 / 24.5 | PR 24.5 |
| G24-08 | não existe contrato implementado de `sales_leads` | conflito com funil profissional ou schema especulativo | PR 24.1 | PR 24.6 |
| G24-09 | métricas de comunicação e afiliados sem matriz canônica | números divergentes | PR 24.0 / 24.1 | encerramento |
| G24-10 | ausência de QA negativo e de carga com `dry_run` | regressão de segurança/entrega | PR 24.7 | encerramento |

---

## 5. Matriz de Permissões

| Ação | Master admin | Cron interno | Profissional | Operacional |
|---|---|---|---|---|
| Criar/revisar broadcast | permitido e auditado | não | proibido | proibido |
| Executar broadcast real | permitido com confirmação | permitido para job aprovado | proibido | proibido |
| Consultar histórico admin | permitido | não | proibido | proibido |
| Aprovar/suspender embaixador | permitido com motivo | não | proibido | proibido |
| Consultar próprio dashboard afiliado | não é fluxo admin | não | somente próprio | proibido |
| Calcular comissões | permitido se contrato aprovar | permitido | proibido | proibido |
| Confirmar pagamento PIX | permitido com motivo/referência | não | proibido | proibido |
| Operar leads da plataforma | permitido | Nerissa por contrato específico | proibido | proibido |

---

## 6. Matrizes Obrigatórias

### Capacidades de Canal

| Canal | Envio | Entrega | Leitura | Resposta | Decisão inicial |
|---|---|---|---|---|---|
| WhatsApp admin | confirmado | validar evento disponível | validar evento disponível | validar correlação | habilitar conforme contrato |
| Push/in-app | não confirmado | não confirmado | não confirmado | não aplicável | bloquear até contrato |

### Métricas

| Domínio | Métricas mínimas | Fonte esperada |
|---|---|---|
| Broadcast | selecionados, elegíveis, enfileirados, enviados, falhas, entregues/lidos quando comprovados | domínio canônico de broadcast + eventos técnicos |
| Audiência | composição e exclusões | contrato curado de segmentação |
| Embaixadores | pendentes, ativos, suspensos, conversão | contratos afiliados |
| Indicações | clicks, registros, trials, pagos, desqualificados | `platform_affiliate_referrals` |
| Comissões | pendentes, aprovadas, pagas, canceladas | `platform_affiliate_commissions` |
| Pagamentos | pendentes, processando, pagos, falhos | `platform_affiliate_payments` |
| Leads | volume por etapa, conversão e follow-up vencido | contrato v2 de `sales_leads` |

---

## 7. Gates Antes do PR 24.1

- [x] Ismael aprovou C24-01 a C24-09;
- [x] domínio persistente de broadcast passou pelo schema guard;
- [x] matriz de canais foi validada contra eventos realmente disponíveis;
- [x] estratégia de fila, retry, idempotência e anti-spam foi aprovada;
- [x] contratos administrativos curados de afiliados foram definidos;
- [x] criação manual de embaixador vinculada a profissional existente foi aprovada;
- [x] confirmação manual de PIX como fluxo canônico foi aprovada;
- [x] contrato `sales_leads` passou pelo schema guard;
- [x] métricas de comunicação, afiliados e leads foram classificadas;
- [x] nenhum contrato depende de schema ou function da v1.

---

## 8. Resultado Esperado do PR 24.0

O preflight foi aprovado por Ismael e executado. Os contratos base foram aplicados pelas migrations `20260614110000` e `20260614111000`. Após auditoria, o C24-05 foi reaberto e concluído pela migration `20260614112000`, pelo orquestrador `admin-broadcast` e pelo worker interno `admin-broadcast-worker`.
