# FASE 21 — Preflight Contratual

## Growth Profissional, Recompensas e Retenção

**Status:** PR 21.0 documental concluído — PR 21.1 bloqueado  
**Data da auditoria:** 2026-06-12  
**Decision Owner:** Ismael  
**Parecer técnico:** contratos C21-01 a C21-07 aprovados para execução, sujeitos aos gaps bloqueantes deste documento  
**Fonte de verdade:** banco, migrations, RPCs e frontend da v2

---

## 1. Parecer de Aprovação

Os contratos C21-01 a C21-07 estão coerentes com a arquitetura da v2 e ficam aprovados como direção obrigatória da Fase 21.

Esta aprovação não significa que os contratos já estejam integralmente implementados. O inventário encontrou gaps de autorização, processamento e consistência que devem ser corrigidos nos PRs indicados antes de disponibilizar a capacidade funcional correspondente.

**Decisão de gate:**

- PR 21.0 documental: **GO**;
- PR 21.1 funcional: **NO-GO** até validar o ambiente real e executar os testes negativos das Fases 19/20;
- cada PR funcional posterior permanece bloqueado pelos gaps contratuais associados.

---

## 2. Aprovação dos Contratos

| Contrato | Parecer | Condição obrigatória |
|---|---|---|
| C21-01 — Ownership de rotas | Aprovado | separar páginas, hooks e queries antes de ampliar funcionalidades |
| C21-02 — Campanhas profissionais | Aprovado com gaps bloqueantes | hardening de role, horário/timezone e processamento agendado |
| C21-03 — RFM, health e retenção | Aprovado com gap bloqueante | hardening gestor-only para consulta sensível e recálculo |
| C21-04 — Recompensas e fidelidade | Aprovado com gaps bloqueantes | hardening de role, reconciliação de saldo/livro e decisão sobre programa/templates |
| C21-05 — Aniversariantes | Aprovado com contrato aditivo necessário | leitura paginada e ação individual com consentimento |
| C21-06 — Parceiros profissionais | Aprovado com gap bloqueante | hardening gestor-only e revisão do payload exposto |
| C21-07 — Permissões, LGPD e auditoria | Aprovado como invariante obrigatório | comprovação no ambiente real e testes negativos |

Nenhum dos sete contratos está rejeitado ou precisa ser redesenhado. As condições acima são tarefas de implementação e validação, não decisões abertas de produto.

---

## 3. Inventário de Frontend

| Capacidade | Estado atual | Gap confirmado | Owner futuro |
|---|---|---|---|
| Hub Growth | `GrowthPage.tsx` monolítica | contém consultas, formulários e regras de várias áreas | `/growth` |
| Campanhas | mesma `GrowthPage` | sem página e hook próprios | `/campanhas` |
| RFM e retenção | mesma `GrowthPage` | sem matriz 5×5 e fluxo segmento → ação | `/rfm` |
| Recompensas | mesma `GrowthPage` | cobertura parcial, sem owner isolado | `/recompensas` |
| Aniversariantes | inexistente | rota, página, hook e contrato de leitura ausentes | `/aniversariantes` |
| Parceiros | inexistente | rota, página e hook ausentes | `/parceiros` |

`/growth`, `/campanhas`, `/rfm` e `/recompensas` apontam atualmente para o mesmo componente. C21-01 exige desmontagem progressiva, sem duplicar estado ou consultas.

---

## 4. Inventário de Contratos v2

| Área | Contratos canônicos existentes | Estado auditado |
|---|---|---|
| Campanhas | `campaigns`, recipients, dispatches, cooldowns, snapshots; RPCs de criação, agenda, cancelamento, execução e resultado | tenant validado; role e processamento precisam de hardening |
| RFM e health | `rfm_scores`, `client_health_scores`, RPCs de cálculo e `get_reactivation_queue` | fontes canônicas confirmadas; role precisa de hardening |
| Fidelidade | `clients.loyalty_points`, `loyalty_transactions`, `loyalty_redemptions` | operações atômicas existentes; falta contrato de reconciliação e hardening |
| Indicação cliente→cliente | `referral_links`, `referral_events`, RPCs de link, evento e recompensa | idempotência de recompensa confirmada; role precisa de hardening |
| Aniversariantes | `clients.birth_date` | fonte canônica confirmada; leitura operacional dedicada ausente |
| Parceiros | `platform_affiliate_partners`, referrals, commissions, payments; RPCs de solicitação e dashboard | isolamento por `professional_id` existe; role e payload precisam de hardening |

Não foi encontrado contrato v2 confirmado para programa de fidelidade configurável, templates de recompensa ou ranking persistido. Nenhum schema deve ser criado até o PR 21.4 provar a lacuna e Ismael aprovar a solução.

---

## 5. Gaps Bloqueantes e Owners

| ID | Gap | Risco | Owner de execução | Bloqueia |
|---|---|---|---|---|
| G21-01 | RPCs Growth das Fases 8/16 usam apenas `auth_professional_id()` | operacional pode executar ações gestor-only | PR 21.2/21.3/21.4 | capacidades sensíveis |
| G21-02 | execução de campanha não comprova horário permitido e timezone | envio fora da janela contratada | PR 21.2 | envio real |
| G21-03 | agendamento altera status/data, mas processador idempotente e instância correta não estão comprovados | campanha agendada não executa ou usa canal incorreto | PR 21.2 | agendamento e envio real |
| G21-04 | saldo agregado e livro não possuem RPC de reconciliação comprovada | divergência silenciosa de pontos | PR 21.4 | encerramento de recompensas |
| G21-05 | programa/templates de recompensa não possuem contrato v2 confirmado | schema especulativo ou funcionalidade incompleta | PR 21.4 + Ismael | programa/templates |
| G21-06 | aniversariantes não possuem leitura dedicada paginada nem ação individual contratada | consulta cara ou comunicação fora das regras | PR 21.5 | rota `/aniversariantes` |
| G21-07 | RPCs de parceiros usam apenas `auth_professional_id()` e retornam linhas completas | operacional acessa área gestor-only e payload pode exceder o necessário | PR 21.6 | rota `/parceiros` |
| G21-08 | roles e testes negativos ainda não foram comprovados no ambiente real | regressão de tenant, role ou IDOR | ambiente + QA | PR 21.1 |

### Hardening obrigatório de role

A mudança da Fase 19 fez `auth_professional_id()` resolver também membros ativos da equipe. Portanto, RPCs antigas que validam somente essa função não distinguem gestor de operacional.

Antes da liberação de cada capacidade gestor-only, a RPC correspondente deve validar `auth_professional_role() = 'gestor'` no banco. Ocultar controles na UI não satisfaz C21-07.

---

## 6. Evidências Confirmadas

- `run_segmented_campaign` aplica opt-out por canal, cooldown, tenant e dry-run.
- `run_segmented_campaign` não comprova janela de horário/timezone nem processamento externo da fila.
- `record_referral_reward_delivered` possui índice único e retorno idempotente para recompensa já entregue.
- recompensa por indicação e resgate atualizam livro e saldo na mesma transação RPC.
- `redeem_loyalty_reward` bloqueia saldo insuficiente e trava o cliente com `FOR UPDATE`.
- `get_my_ambassador_dashboard` restringe por `professional_id`, mas não por role e retorna registros completos.
- `clients.birth_date` já é a fonte adequada para aniversariantes.
- não existem páginas dedicadas para `/aniversariantes` e `/parceiros`.

---

## 7. Gates Antes do PR 21.1

- [ ] migrations pendentes das Fases 19 e 20 aplicadas no ambiente alvo;
- [ ] `auth_professional_role()` validada como `gestor`, `operacional` e `NULL` para externo;
- [ ] testes negativos de tenant e role das Fases 19 e 20 executados;
- [ ] dois tenants usados para provar ausência de IDOR;
- [ ] G21-01 a G21-08 registrados no backlog dos PRs owners;
- [ ] nenhum PR funcional libera capacidade cujo gap bloqueante permaneça aberto.

---

## 8. Resultado do PR 21.0

O preflight documental está concluído. Ownership, contratos, permissões, fontes canônicas, gaps e gates estão definidos.

A Fase 21 está pronta para seguir quando os gates de ambiente forem comprovados. Até lá, o estado correto é **planejada, com PR 21.1 bloqueado**.
