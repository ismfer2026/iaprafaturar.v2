# FASE 21 — Plano de Execução

## Growth Profissional, Recompensas e Retenção

**Status:** PR 21.0 documental concluído — PR 21.1 funcional bloqueado  
**Decision Owner:** Ismael  
**Aplicação principal:** `apps/professional`  
**Fonte contratual:** banco, migrations e RPCs da v2  
**Referência da v1:** somente comportamento e cobertura de frontend  
**Estimativa:** 3 a 4 semanas, após os gates de ambiente e contratos C21
**Preflight aprovado:** `docs/01-execution/PHASE-21-PREFLIGHT.md`

---

## 1. Objetivo

Transformar o growth profissional existente em capacidades navegáveis, acionáveis e isoladas por tenant, sem duplicar a fundação criada nas Fases 8 e 16 e sem misturar campanhas profissionais com broadcast administrativo.

A fase deve entregar:

- `/growth` como hub de indicadores e atalhos, sem formulários ou regras paralelas;
- `/campanhas` com ciclo de vida, segmentação, agendamento, dry-run, envio e resultados;
- `/rfm` com matriz e segmentos acionáveis;
- `/recompensas` com indicação cliente→cliente, fidelidade, ranking e resgates;
- `/aniversariantes` com consulta operacional e ações permitidas;
- `/parceiros` como visão profissional do programa de parceiros da plataforma;
- retenção e reativação baseadas em `client_health_scores`, opt-out e cooldown existentes.

---

## 2. Condição de Entrada

A Fase 20 está completa no código e nos PRDs, com `typecheck`, `lint`, `build` e `git diff --check` verdes. Porém, ainda depende de aplicação das migrations e QA integrado no ambiente Supabase.

Antes do PR 21.1:

- [ ] migrations pendentes das Fases 19 e 20 aplicadas no ambiente alvo;
- [ ] `auth_professional_role()` validada para gestor, operacional e usuário externo;
- [ ] testes negativos de tenant e role das Fases 19 e 20 executados;
- [ ] migrations das Fases 8, 16 e 17 confirmadas no ambiente alvo;
- [x] contratos C21-01 a C21-07 aprovados tecnicamente no PR 21.0;
- [ ] lacunas contratuais recebem owner e tarefa antes de qualquer implementação dependente.

**Gate:** o planejamento pode avançar, mas nenhuma implementação funcional da Fase 21 começa sem o ambiente anterior validado.

---

## 3. Estado Atual Confirmado

### Frontend

- `GrowthPage.tsx` concentra hoje hub, campanhas, risco, fidelidade, e-mail, chat, upsell e RFM.
- `/growth`, `/campanhas`, `/rfm` e `/recompensas` apontam para o mesmo componente.
- `/aniversariantes` e `/parceiros` ainda não existem no app profissional.
- A implementação atual é parcial e deve ser desmontada progressivamente, preservando comportamento válido.

### Campanhas e comunicação

- Existem `campaigns`, `campaign_recipients`, `campaign_dispatches`, `campaign_cooldowns` e `campaign_result_snapshots`.
- Existem RPCs para criar, agendar, cancelar, executar e consultar resultados.
- WhatsApp e e-mail possuem opt-out; execução segmentada já aplica cooldown e suporta dry-run.
- Deve ser provado que horário permitido, instância correta, autorização por role e processamento de agendamentos estão completos.

### RFM, health e retenção

- Existem `rfm_scores`, `client_health_scores`, recálculo e `get_reactivation_queue`.
- Health score já possui risco, sinais, cooldown e tentativas de reativação.
- A UI atual lista dados, mas não entrega matriz RFM 5×5 nem fluxo completo segmento → ação.

### Recompensas e indicações

- Existem `clients.loyalty_points`, `loyalty_transactions`, `loyalty_redemptions`, `referral_links` e `referral_events`.
- Existem RPCs para criar link, registrar eventos, entregar recompensa e resgatar pontos.
- Programa, templates e ranking ainda não possuem contrato operacional confirmado.
- O plano deve impedir divergência entre saldo agregado e livro de transações.

### Aniversariantes

- `clients.birth_date` e índice por tenant já existem.
- Não existe justificativa para criar tabela paralela de aniversariantes.
- Falta leitura contratada por período, filtros, paginação e ações permitidas.

### Parceiros profissionais

- A Fase 17 criou `platform_affiliate_partners`, referrals, commissions, payments e solicitação de entrada no programa.
- Aprovação e confirmação de pagamento pertencem ao admin.
- `/parceiros` deve expor somente o escopo do profissional autenticado.
- `referral_links/referral_events` são indicação cliente→cliente e não podem ser confundidos com parceiros profissionais.

---

## 4. Decisões e Contratos Obrigatórios

### C21-01 — Ownership de rotas e desmontagem do monólito

- `/growth` é somente hub: indicadores, alertas e links.
- `/campanhas`, `/rfm`, `/recompensas`, `/aniversariantes` e `/parceiros` possuem páginas e hooks próprios.
- `GrowthPage` não executa consultas pesadas pertencentes às rotas dedicadas.
- Nenhuma rota dedicada reutiliza estado interno ou formulários do hub.
- Risco, reativação e upsell podem aparecer no hub como filas resumidas e ações profundas, sem segundo owner de dados.

**Gate:** nenhuma capacidade permanece implementada simultaneamente no hub e em página dedicada.

### C21-02 — Campanhas profissionais e consentimento

Reutilizar exclusivamente:

- `campaigns`;
- `campaign_recipients`;
- `campaign_dispatches`;
- `campaign_cooldowns`;
- `campaign_result_snapshots`;
- RPCs v2 das Fases 8 e 16.

O contrato deve confirmar:

- criação, edição permitida, agendamento, cancelamento e execução;
- segmentos e filtros aceitos pelo banco;
- dry-run obrigatório antes de envio real, salvo decisão explícita de Ismael;
- opt-out por canal, cooldown, base legal e motivo de bloqueio visíveis;
- janela de horário e timezone aplicáveis;
- uso da instância/canal correto do profissional;
- idempotência e concorrência de execução;
- ausência total de dependência de `/broadcast` ou contratos admin.

### C21-03 — RFM, health score e ações de retenção

- `rfm_scores` permanece fonte canônica do RFM calculado.
- `client_health_scores` permanece fonte canônica de risco e reativação.
- `/rfm` entrega matriz recência × frequência, distribuição por segmento, clientes e recálculo.
- Cada ação iniciada por segmento deve navegar ou criar intenção explícita em `/campanhas`, sem envio automático.
- Reativação usa `get_reactivation_queue`, status e cooldown existentes.
- Health score deve exibir sinais explicáveis, sem fórmula paralela no frontend.

### C21-04 — Recompensas, fidelidade e indicação cliente→cliente

- `loyalty_transactions` é o livro imutável de pontos.
- `clients.loyalty_points` só pode ser saldo agregado atualizado atomicamente com o livro; divergência deve ser detectável e rejeitada/corrigível por contrato.
- `loyalty_redemptions` é o owner dos resgates.
- `referral_links` e `referral_events` são o owner de indicação cliente→cliente.
- Ranking é leitura derivada, nunca saldo persistido paralelo.
- Programa e templates só recebem novo schema após prova de lacuna e aprovação de Ismael.
- Recompensa por indicação deve ser idempotente e vinculada ao evento qualificador.

### C21-05 — Aniversariantes

- `clients.birth_date` é a única fonte de verdade.
- `/aniversariantes` permite lista, intervalo, mês, busca e filtros por contato/consentimento.
- Operacional pode consultar e iniciar ação individual permitida.
- Campanha em lote, template promocional e alteração de regras permanecem gestor-only.
- Toda ação de comunicação reutiliza campanhas ou fila de canal existente; não criar fila de aniversário.

### C21-06 — Parceiros profissionais

- `/parceiros` usa os contratos `platform_affiliate_*` existentes quando o profissional participa como parceiro da plataforma.
- O profissional pode solicitar participação, consultar próprio código/link, referrals atribuídos, comissões e pagamentos visíveis.
- O profissional não aprova cadastro, comissão ou pagamento.
- Aprovação, suspensão, cálculo administrativo e confirmação de pagamento pertencem à Fase 24.
- Não criar `professional_referrals` ou resumo paralelo sem prova de que os contratos da Fase 17 são insuficientes.

### C21-07 — Permissões, LGPD e auditoria

- Ações de campanha, RFM, recompensa e parceiros sensíveis são gestor-only no banco/RPC.
- `/aniversariantes` possui leitura operacional, com ações limitadas pelo contrato.
- Opt-out nunca pode ser ignorado pela UI, RPC, cron ou agente.
- Toda ação de envio, resgate, ajuste, recálculo e mudança de status registra auditoria.
- Consultas e RPCs validam tenant e impedem IDOR.
- Dados sensíveis não entram em snapshots, logs ou payloads além do necessário.

---

## 5. Matriz de Permissões

| Ação | Operacional | Gestor |
|---|---:|---:|
| Consultar hub Growth | Não | Sim |
| Consultar campanhas e resultados | Não | Sim |
| Criar, agendar, executar ou cancelar campanha | Não | Sim |
| Executar dry-run | Não | Sim |
| Consultar e recalcular RFM/health | Não | Sim |
| Iniciar campanha a partir de segmento | Não | Sim |
| Consultar recompensas, ranking e indicações | Não | Sim |
| Ajustar pontos, entregar recompensa ou resgatar | Não | Sim |
| Consultar aniversariantes | Sim | Sim |
| Iniciar contato individual permitido | Sim | Sim |
| Criar campanha em lote de aniversariantes | Não | Sim |
| Consultar próprio programa de parceiros | Não | Sim |
| Solicitar participação no programa | Não | Sim |
| Aprovar parceiro, comissão ou pagamento | Não | Não — admin |

Todos os bloqueios devem existir no banco/RPC. A UI é defesa adicional.

---

## 6. Inventário Planejado de Ownership

| Área | Rota | Owner de UI | Contrato principal |
|---|---|---|---|
| Hub | `/growth` | `GrowthPage` simplificada | agregações e atalhos |
| Campanhas | `/campanhas` | página/hook dedicados | C21-02 |
| RFM e retenção | `/rfm` | página/hook dedicados | C21-03 |
| Recompensas | `/recompensas` | página/hook dedicados | C21-04 |
| Aniversariantes | `/aniversariantes` | página/hook dedicados | C21-05 |
| Parceiros | `/parceiros` | página/hook dedicados | C21-06 |

---

## 7. Sequência de Execução

### PR 21.0 — Preflight contratual e ambiental

- [ ] comprovar gates das Fases 19 e 20 no ambiente alvo;
- [x] aprovar C21-01 a C21-07;
- [x] inventariar tabelas, RPCs, policies, componentes e hooks existentes;
- [ ] testar roles e IDOR dos contratos das Fases 8, 16 e 17 no ambiente alvo;
- [x] classificar cada lacuna como frontend, contrato aditivo ou decisão de produto;
- [x] registrar contratos ausentes de programa/templates, aniversariantes e parceiros;
- [x] congelar matriz de permissões e ownership;
- [x] registrar G21-01 a G21-08 e seus PRs owners em `PHASE-21-PREFLIGHT.md`.

**Gate:** preflight documental concluído; PR 21.1 continua bloqueado até comprovação ambiental e testes negativos.

### PR 21.1 — Separação estrutural do Growth

- criar páginas e hooks dedicados sem alterar comportamento;
- manter `/growth` somente como hub;
- remover abas, formulários, queries e mutações duplicadas do `GrowthPage`;
- registrar rotas `/aniversariantes` e `/parceiros`;
- preservar lazy loading, redirects e navegação direta.

**Gate:** cada rota possui um único owner e o hub não contém implementação paralela.

### PR 21.2 — Campanhas profissionais

- entregar lista, filtros, criação, agendamento, cancelamento e detalhes;
- exibir audiência, canais, opt-out, cooldown e resultados;
- implementar dry-run e confirmação explícita antes do envio real;
- comprovar janela de horário, timezone, idempotência e instância correta;
- impedir qualquer uso dos contratos de broadcast admin.

**Gate:** campanha real não envia fora das regras de consentimento, cooldown e horário.

### PR 21.3 — RFM e retenção acionável

- entregar matriz 5×5 e distribuição por segmento;
- listar clientes por célula/segmento e sinais de health score;
- permitir recálculo gestor-only;
- iniciar campanha com segmento pré-selecionado;
- entregar fila de risco/reativação com cooldown visível;
- não calcular score nem elegibilidade no frontend.

**Gate:** cada segmento gera ação explícita e auditável, nunca envio automático.

### PR 21.4 — Recompensas, fidelidade e indicação

- entregar saldo, histórico, ranking derivado, links e eventos de indicação;
- entregar resgates e recompensas por evento qualificador;
- validar atomicidade entre saldo agregado, livro e resgate;
- implementar programa/templates somente se C21-04 comprovar contrato;
- incluir prevenção de fraude, duplicidade e recompensa repetida.

**Gate:** nenhuma divergência reproduzível entre saldo, livro e resgates.

### PR 21.5 — Aniversariantes

- entregar rota navegável para operacional e gestor;
- implementar lista, período, busca, filtros e estados;
- permitir ação individual conforme consentimento;
- iniciar campanha em lote apenas para gestor, reutilizando `/campanhas`;
- não criar tabela, fila ou saldo próprio.

**Gate:** aniversariantes usam somente `clients.birth_date` e comunicação canônica.

### PR 21.6 — Parceiros profissionais

- entregar solicitação de participação, status e link/código próprio;
- exibir referrals, desempenho, comissões e pagamentos permitidos;
- aplicar leitura somente do parceiro autenticado;
- não expor ações administrativas;
- validar fronteira com `/embaixadores` da Fase 24.

**Gate:** profissional não vê dados de outro parceiro nem executa ação admin.

### PR 21.7 — Integração de jornadas e mensuração

- validar campanha → recipient → dispatch → resultado;
- validar RFM/health → segmento → campanha;
- validar referral → evento qualificador → recompensa → resgate;
- validar aniversário → ação permitida → resultado;
- medir entrega, bloqueios por opt-out/cooldown, conversão, referrals e resgates;
- revisar gatilhos de retenção segundo sinais explicáveis, sem dark patterns.

**Gate:** jornadas completas usam contratos canônicos e métricas auditáveis.

### PR 21.8 — QA, documentação e encerramento

- executar typecheck, lint, build e testes;
- testar gestor, operacional, usuário externo e dois tenants;
- revisar IDOR, RLS, consentimento, cooldown, horário e auditoria;
- validar responsividade, acessibilidade, loading, erro e vazio;
- sincronizar `PRD-MASTER`, `PRD-FRONTEND`, `PRD-SCHEMA` e este plano;
- registrar dívidas aceitas por Ismael com fase de destino.

**Gate:** DoD comprovado por evidência no ambiente, não apenas marcado.

---

## 8. Riscos e Mitigações

| Risco | Mitigação obrigatória |
|---|---|
| `GrowthPage` continua monolítica | separar owners antes de ampliar funcionalidades |
| Campanhas profissionais usam broadcast admin | contratos, rotas e queries explicitamente separados |
| Envio ignora opt-out/cooldown/horário | bloqueio obrigatório no RPC/processador, com testes negativos |
| RFM/health calculado no frontend | frontend apenas apresenta resultado canônico |
| Saldo de fidelidade diverge do livro | atomicidade e reconciliação contratadas em C21-04 |
| Ranking cria fonte paralela | ranking sempre derivado |
| Aniversariantes criam fila própria | reutilizar campanhas/fila de canal existente |
| Parceiros confundidos com indicação cliente→cliente | contratos e nomenclatura separados |
| Profissional executa ação admin | policies/RPCs e testes negativos |
| Automação causa spam ou comunicação inadequada | consentimento, limite, cooldown, horário e confirmação |
| Lacuna de programa/templates gera schema especulativo | prova de lacuna e aprovação antes de migration |

---

## 9. Critérios de Encerramento

- [ ] `/growth` é hub e não duplica formulários, queries pesadas ou regras;
- [ ] campanhas mostram resultados e respeitam consentimento, cooldown e horário;
- [ ] RFM possui matriz e segmentos acionáveis;
- [ ] health score e reativação exibem sinais e cooldown canônicos;
- [ ] recompensas cobrem indicação, fidelidade, ranking e resgate;
- [ ] saldo, livro e resgates permanecem consistentes;
- [ ] `/aniversariantes` possui UI operacional e ações permitidas;
- [ ] `/parceiros` mostra somente relações e métricas permitidas;
- [ ] nenhuma capacidade usa contratos de broadcast admin;
- [ ] nenhum saldo, fila, programa ou ranking paralelo foi criado;
- [ ] isolamento por tenant, IDOR, roles e auditoria foram comprovados;
- [ ] PRDs refletem exatamente o que foi entregue;
- [ ] dívidas restantes possuem owner, justificativa e fase de destino.

---

## 10. Aplicação das Skills

### `churn-prevention`

- health score e risco são sinais para intervenção antes da perda;
- reativação deve respeitar cooldown, contexto e limite de tentativas;
- ações devem ser explicáveis e mensuradas por retenção real, não apenas envio.

### `referrals`

- indicação cliente→cliente segue o ciclo link → conversão → recompensa;
- recompensa deve ocorrer somente após evento qualificador e com proteção contra fraude;
- ranking e métricas são derivados do programa canônico.

### `emails`

- campanhas e reativação precisam de gatilho, objetivo, audiência, saída e métrica;
- cada comunicação possui uma ação principal;
- opt-out, frequência e relevância têm precedência sobre volume.

---

## 11. Aprovação para Iniciar

- [ ] Ismael aprova este plano;
- [x] C21-01 a C21-07 possuem aprovação técnica e condições registradas;
- [ ] ambiente Supabase confirma as migrations e testes pendentes das Fases 19 e 20;
- [x] PR 21.0 documental é concluído antes de código funcional;
- [x] gaps conhecidos possuem owner de PR, contrato, permissão e teste esperado;
- [ ] nenhuma implementação funcional começa antes dos gates ambientais.
