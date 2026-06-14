# FASE 24 — Plano de Execução

## Admin Growth, Broadcast, Notificações e Afiliados

**Status:** concluída; C24-05 reaberto e entrega distribuída validada  
**Decision Owner:** Ismael  
**Aplicação principal:** `apps/admin`  
**Fonte contratual:** banco v2, migrations v2, RPCs v2, Edge Functions v2 e frontend admin v2  
**Estimativa:** 3 a 4 semanas após aprovação do preflight  
**Preflight de referência:** `docs/01-execution/PHASE-24-PREFLIGHT.md`

---

## 1. Objetivo

Completar a comunicação administrativa, a operação de embaixadores e o pipeline comercial da plataforma sem conflitar com growth, parceiros ou funil do app profissional.

A fase deve entregar:

- `/broadcast` como único hub de comunicação admin;
- audiência, canais comprovados, `dry_run`, envio distribuído, histórico, leitura disponível e retenção;
- `/embaixadores` com operação, links, indicações, comissões, PIX, histórico e métricas;
- `/leads` exclusivamente para leads comerciais da plataforma/Nerissa;
- contratos curados, auditáveis, idempotentes e separados dos domínios profissionais;
- aliases existentes sem implementações paralelas.

---

## 2. Condição de Entrada

- [x] Fase 23 concluída e contratos admin globais disponíveis;
- [x] rotas, frontend, Edge Functions, migrations e RPCs atuais inventariados;
- [x] aliases canônicos já existem;
- [x] functions e schema da v1 foram descartados como padrão;
- [x] C24-01 a C24-09 aprovados por Ismael;
- [x] novos contratos de broadcast e leads aprovados pelo schema guard;
- [x] matriz de canais e métricas aprovada;
- [x] estratégia de fila, anti-spam e idempotência aprovada.

**Gate:** PR funcional não começa enquanto qualquer decisão contratual acima estiver aberta.

---

## 3. Princípios de Execução

1. `/broadcast` é a única implementação de comunicação admin.
2. Broadcast admin nunca reutiliza campanhas profissionais sem separação contratual explícita.
3. `/embaixadores` admin e `/parceiros` profissional permanecem domínios distintos.
4. `/leads` nunca consulta ou altera o funil profissional.
5. Toda mutação admin usa contrato específico, motivo e auditoria.
6. Envio real é assíncrono, idempotente, retomável e sujeito a anti-spam.
7. `dry_run` é padrão de segurança e obrigatório em automação.
8. Métricas não comprováveis pelo canal não são simuladas.
9. Payloads são curados e paginados; `get_admin_phase17_dashboard` não cresce.
10. Nenhum schema novo é criado sem schema guard.

---

## 4. Contratos Obrigatórios

### C24-01 — Rotas e ownership

- `/broadcast`, `/embaixadores` e `/leads` são rotas canônicas;
- aliases apenas redirecionam;
- não existe tela paralela em `/campanhas`, `/notificacoes` ou `/afiliados`;
- nenhum código administrativo entra no app profissional.

### C24-02 — Autorização, auditoria e privacidade

- `admin_assert_master()` em RPCs administrativas;
- autenticação interna específica para cron/worker;
- motivo obrigatório em mutações financeiras, suspensão e envio real;
- auditoria com ator, alvo, ação, motivo e resultado;
- `REVOKE ALL` e grants mínimos;
- nenhum dado clínico, segredo ou settings completo em payload.

### C24-03 — Broadcast canônico

- registro persistente de broadcast e destinatários;
- estados e transições explícitos;
- histórico paginado e filtrável;
- idempotência por broadcast, destinatário e canal;
- retenção/arquivamento sem apagar auditoria imutável.

### C24-04 — Audiência e canais

- preview de audiência com contagem e exclusões;
- definição estável de cada segmento;
- canal disponível somente quando capacidade estiver comprovada;
- identificação clara do público e canal antes do envio;
- nenhuma leitura/entrega simulada.

### C24-05 — Entrega distribuída

- envio real enfileira e retorna;
- worker processa em lotes com rate limit, retry e dead-letter/estado terminal;
- retomada não duplica mensagem;
- `dry_run` não envia e produz resultado verificável;
- falha parcial permanece consultável.

**Implementação final:** `admin-broadcast` apenas cria/reutiliza o job idempotente e publica o worker via QStash. `admin-broadcast-worker` faz claim atômico com `FOR UPDATE SKIP LOCKED`, processa lotes de até 10 com intervalo, aplica backoff exponencial, recupera locks expirados, limita tentativas e move falhas esgotadas para `dead_letter`.

### C24-06 — Embaixadores e indicações

- lista, filtros, detalhe, criação vinculada a profissional, aprovação, rejeição e suspensão;
- links, referrals e histórico por payload curado;
- transições inválidas são rejeitadas;
- app profissional continua vendo somente o próprio dashboard.

### C24-07 — Comissões e pagamentos

- cálculo usa `affiliate-commission-cron`;
- comissões e pagamentos possuem estados explícitos;
- confirmação PIX manual exige referência, motivo e auditoria;
- confirmação duplicada é idempotente/rejeitada de forma segura;
- métricas derivam dos contratos canônicos.

### C24-08 — Leads da plataforma

- `sales_leads` e RPCs específicas somente após schema guard;
- pipeline, filtros, detalhe, score e follow-up;
- integração Nerissa separada das conversas profissionais;
- sem leitura ou escrita em `funnel_opportunities`;
- takeover humano somente se aprovado.

### C24-09 — UX, i18n e QA

- loading, empty, error, unauthorized, success e partial failure;
- paginação e filtros preservam estado;
- confirmação para envio real, suspensão e pagamento;
- 390px e desktop sem sobreposição;
- pt-BR, en-US e es-419 completos;
- QA de carga e retries usa `dry_run`.

---

## 5. Ownership de Rotas

| Rota | Responsabilidade | Contrato principal |
|---|---|---|
| `/broadcast` | comunicação administrativa e histórico | C24-03 / C24-04 / C24-05 |
| `/campanhas` | alias para `/broadcast` | C24-01 |
| `/notificacoes` | alias para `/broadcast` | C24-01 |
| `/embaixadores` | afiliados, comissões, pagamentos e métricas | C24-06 / C24-07 |
| `/afiliados` | alias para `/embaixadores` | C24-01 |
| `/leads` | leads comerciais da plataforma/Nerissa | C24-08 |
| `/parceiros` profissional | fora do admin; parceiros do profissional | não alterar |

---

## 6. Sequência de Execução

### PR 24.0 — Preflight documental e decisões

- [x] inventariar rotas, telas, Edge Functions, RPCs e migrations v2;
- [x] registrar C24-01 a C24-09;
- [x] registrar G24-01 a G24-10;
- [x] comprovar ausência de contrato implementado de `sales_leads`;
- [x] separar broadcast admin de campanhas profissionais;
- [x] separar embaixadores admin de parceiros profissionais;
- [x] obter aprovação explícita de Ismael;
- [x] aprovar matrizes de canais, métricas, permissões e retenção;
- [x] obter parecer do schema guard para broadcast e leads.

**Gate:** PR 24.1 só começa com contratos e decisões aprovados.

### PR 24.1 — Contratos, schema guard e hardening

- definir/aplicar domínio persistente de broadcast sem duplicar campanhas profissionais;
- criar contratos de audiência, histórico, destinatários, resultados e métricas;
- adaptar `admin-broadcast` para orquestração assíncrona;
- definir worker, retry, rate limit, idempotência e estados terminais;
- criar contratos curados de embaixadores, detalhe, referrals, comissões e pagamentos;
- remover dependência de `/embaixadores` do `get_admin_phase17_dashboard`;
- criar contrato `sales_leads` e RPCs somente após schema guard;
- aplicar autorização, auditoria, grants e testes negativos.

**Gate:** nenhuma UI nova consome tabela sensível diretamente, payload monolítico ou contrato profissional.

### PR 24.2 — `/broadcast`: composição, audiência e canais

- transformar `/broadcast` em hub único;
- implementar composição, preview de audiência e contagem de exclusões;
- mostrar somente canais aprovados;
- manter `dry_run` ativado por padrão;
- exigir confirmação e motivo para envio real;
- identificar claramente audiência, canal e impacto;
- consolidar aliases sem telas paralelas.

**Gate:** admin entende exatamente quem receberá a comunicação antes de confirmar.

### PR 24.3 — Entrega, histórico, leitura e retenção

- enfileirar e processar envios em lotes;
- exibir progresso, falhas parciais, retries e estados finais;
- criar histórico paginado e detalhe por broadcast;
- exibir entrega, leitura e resposta somente quando comprovadas;
- implementar retenção/arquivamento aprovado;
- validar idempotência e retomada sem duplicidade;
- adicionar métricas de comunicação canônicas.

**Gate:** timeout, retry ou retomada não pode duplicar comunicação.

### PR 24.4 — `/embaixadores`: operação e indicações

- substituir payload monolítico por contratos curados;
- implementar lista, filtros e detalhe;
- permitir criação vinculada a profissional existente;
- completar aprovação, rejeição e suspensão com motivo;
- exibir links, indicações e histórico;
- manter ações administrativas fora do app profissional.

**Gate:** admin opera embaixadores sem acesso direto a tabelas e sem afetar `/parceiros`.

### PR 24.5 — Comissões, PIX e métricas de afiliados

- exibir comissões e pagamentos por estado;
- integrar cálculo canônico via cron;
- implementar confirmação PIX manual auditada;
- rejeitar duplicidade e transições inválidas;
- exibir histórico financeiro e métricas derivadas;
- validar que profissional vê somente o próprio escopo permitido.

**Gate:** cada alteração financeira possui ator, motivo, referência e audit log.

### PR 24.6 — `/leads` da plataforma/Nerissa

- criar a rota e navegação somente após contrato aprovado;
- implementar pipeline, filtros, detalhe, score e follow-up;
- integrar criação/atualização Nerissa por contrato específico;
- impedir qualquer acesso ao funil profissional;
- implementar takeover apenas se aprovado no preflight;
- incluir métricas comerciais com fonte explícita.

**Gate:** testes provam que `/leads` não lê nem altera `funnel_opportunities` ou dados clínicos.

### PR 24.7 — QA, segurança e encerramento

- executar typecheck, lint, build e `git diff --check`;
- executar `supabase db lint` e testes negativos de autorização;
- validar idempotência, retries, anti-spam e falha parcial com `dry_run`;
- validar auditoria de envio, suspensão, comissão e pagamento;
- validar aliases e ausência de implementações paralelas;
- validar isolamento admin/professional e leads/funil;
- validar loading, empty, error, unauthorized e confirmações;
- validar 390px, desktop e i18n nos três idiomas;
- sincronizar PRD-MASTER, PRD-FRONTEND, PRD-SCHEMA e PRD-EDGE-FUNCTIONS;
- registrar dívidas remanescentes sem marcar critérios incompletos.

**Gate:** a fase só fecha com todos os critérios de encerramento comprovados.

---

## 7. Ordem de Prioridade dos Contratos

1. separação de domínios e autorização;
2. broadcast persistente, idempotência e fila;
3. capacidades reais de canais e métricas;
4. payloads curados de afiliados;
5. pagamentos e comissões auditáveis;
6. contrato isolado de leads da plataforma;
7. UX, aliases e QA.

---

## 8. Testes Obrigatórios

### Segurança e isolamento

- autenticado não-admin não executa contratos admin;
- profissional não executa aprovação, suspensão ou pagamento;
- admin broadcast não lê campanhas/clientes profissionais;
- `/leads` não lê ou altera funil profissional;
- payloads não expõem segredo, settings completo ou dados clínicos;
- toda mutação sensível gera audit log.

### Broadcast

- `dry_run` não envia mensagem real;
- preview e execução usam a mesma definição de audiência;
- retry e retomada não duplicam destinatário;
- falha parcial não marca broadcast inteiro como sucesso;
- canal indisponível não pode ser selecionado;
- leitura/entrega ausente aparece como indisponível, não como zero.

### Afiliados

- criação exige profissional existente;
- transição inválida de parceiro/comissão/pagamento é rejeitada;
- confirmação PIX duplicada não duplica pagamento;
- suspensão exige motivo;
- profissional vê somente dados próprios permitidos.

### Leads

- lead percorre etapas válidas;
- origem, responsável e follow-up são auditáveis;
- Nerissa não altera lead fora do contrato;
- ID inexistente ou não permitido não altera dados;
- nenhuma query cruza com `funnel_opportunities`.

### Frontend

- aliases redirecionam sem implementação paralela;
- filtros e paginação preservam estado;
- loading, empty, error, unauthorized e partial failure são visíveis;
- textos existem nos três idiomas;
- telas são utilizáveis em 390px sem sobreposição.

---

## 9. Riscos e Mitigações

| Risco | Mitigação |
|---|---|
| spam ou envio duplicado | fila, rate limit, idempotência e `dry_run` |
| histórico incompleto | domínio persistente e estados explícitos |
| métricas enganosas | matriz de capacidade por canal |
| conflito com campanhas profissionais | ownership e contratos separados |
| payload afiliado excessivo | contratos curados e paginados |
| pagamento duplicado | idempotência, transições e auditoria |
| conflito `/leads` x `/funil` | schema/RPC exclusivo e testes negativos |
| schema especulativo | schema guard bloqueante |
| operação admin no app profissional | grants, rotas e QA de isolamento |

---

## 10. Critérios de Encerramento

- [x] C24-01 a C24-09 aprovados e implementados;
- [x] `/broadcast` é a única implementação de comunicação admin;
- [x] broadcast possui contrato único, histórico e execução idempotente;
- [x] envio real enfileira e retorna sem percorrer destinatários no orquestrador;
- [x] worker processa lotes com rate limit, retry, recuperação de lock e `dead_letter`;
- [x] retomada com a mesma `idempotency_key` não cria novo broadcast nem duplica destinatários;
- [x] audiência e canais exibem somente capacidades comprovadas;
- [x] campanhas/notificações admin foram consolidadas com decisão registrada;
- [x] `/embaixadores` cobre operação, indicações, comissões, PIX, histórico e métricas;
- [x] pagamentos e comissões são auditáveis e resistentes a duplicidade;
- [x] `/afiliados` redireciona sem implementação paralela;
- [x] `/parceiros` profissional permanece separado;
- [x] `/leads` usa contrato da plataforma e não toca o funil profissional;
- [x] nenhuma ação administrativa sensível existe no app profissional;
- [x] typecheck, lint, build, db lint, testes negativos e diff-check passam;
- [x] responsividade, estados de UI e i18n pt-BR/en-US/es-419 foram implementados; QA físico em 390px permanece externo;
- [x] PRDs foram sincronizados.

---

## 11. Fora do Escopo

- campanhas, parceiros, clientes e funil do profissional;
- pagamentos afiliados automáticos ou Stripe Connect sem decisão futura;
- parceiro afiliado externo sem vínculo com profissional;
- canais sem contrato v2 comprovado;
- takeover de lead sem contrato explícito;
- functions, tabelas e contratos da v1;
- recursos das Fases 25 e 26.
