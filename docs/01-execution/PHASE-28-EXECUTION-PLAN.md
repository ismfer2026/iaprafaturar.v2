# FASE 28 - Plano de Execução

## Correção de Onboardings Públicos e Separação de Funis

**Status:** planejada; execução funcional bloqueada até aprovação do preflight  
**Decision Owner:** Ismael  
**Skills aplicadas:** site-architecture, onboarding, referrals  
**Referências:** `PRD-MASTER.md`, `01-onboarding-profissional.md`, `09-indicacao.md`, `PHASE-PREFLIGHT-CONTRACT.md`

---

## 1. Objetivo

Restaurar a separação correta entre quatro fluxos públicos que hoje estão sob risco de conflito na v2:

1. profissional convidando profissional para usar a plataforma;
2. onboarding/cadastro de novo profissional;
3. onboarding/cadastro público de cliente da clínica;
4. cliente indicando/referenciando possível cliente para a clínica.

A v1 pode ser usada apenas para validar comportamento esperado de produto e tela. A implementação deve usar contratos v2 ou abrir lacuna formal de schema/function guard antes de qualquer código.

---

## 2. Mapa Canônico de Rotas

| Fluxo | Ator externo | Rota canônica | App dono | Não pode fazer |
|---|---|---|---|---|
| Profissional indica profissional | profissional indicador + profissional convidado | `/convite/:codigo` -> `/entrar?ref=...` | `professional` | criar cliente, abrir Rosane, escrever em `clients` |
| Novo profissional entra/onboarda | profissional convidado/lead | `/entrar?ref=...` e `/criar-conta` | `professional` | usar rota de cliente, exigir auth antes da pré-conta |
| Cliente da clínica se cadastra/onboarda | cliente/paciente da clínica | `/cliente/:slug` e/ou `/cadastro/:codigo` após decisão de preflight | `client` | criar profissional, tocar billing SaaS, usar contexto de referral profissional |
| Cliente indica possível cliente | cliente indicador + possível cliente | `/indicacao/:codigo` | `client` | criar profissional, pagar comissão de afiliado da plataforma |

Regra de compatibilidade: `/cadastro` sem código continua sendo profissional; `/cadastro/:codigo` é cliente. A diferença é parte do contrato e deve ser testada por URL direta. O preflight decide se `/cadastro/:codigo` reutiliza o fluxo existente `/cliente/:slug`, redireciona para ele após resolver o código, ou amplia o mesmo contrato sem criar uma segunda experiência paralela.

---

## 3. Ordem de Execução Segura

### PR 28.0 - Preflight e matriz de rotas públicas

**Objetivo:** provar o estado atual antes de mudar código.

**Tarefas:**
- listar rotas reais em `apps/professional/src/App.tsx` e `apps/client/src/routes.ts`;
- listar links gerados por UI (`/convite`, `/entrar`, `/cadastro`, `/indicacao`);
- inventariar `/cliente/:slug` e decidir sua relação com `/cadastro/:codigo`;
- provar como `registration_links.code` pode ser resolvido publicamente sem SELECT anon direto;
- auditar `/indicacao/:codigo` existente antes de classificar qualquer trabalho como rebuild;
- comparar com v1 somente como comportamento de produto;
- classificar cada rota como canônica, alias, redirect ou bug.

**DoD:**
- matriz contém `/convite/:codigo`, `/entrar`, `/cadastro`, `/cadastro/:codigo`, `/cliente/:slug`, `/indicacao/:codigo`;
- cada rota tem app dono, ator, backend esperado e teste de token/código inválido;
- lacuna de `registration_links` está classificada: RPC/Edge Function pública necessária, contrato existente suficiente, ou rota deve redirecionar por outro identificador;
- decisão aprovada para evitar duplicidade entre `/cliente/:slug` e `/cadastro/:codigo`;
- `/indicacao/:codigo` foi classificado como `validar existente`, `corrigir`, ou `recriar com contrato v2`;
- nenhuma alteração funcional começa sem aprovação.

### PR 28.1 - Profissional convidando profissional

**Objetivo:** restaurar o handoff correto do convite profissional.

**Contrato de produto:**
- `/convite/:codigo` é landing de indicação profissional;
- CTA deve preservar `codigo/ref` e `lang`;
- próximo passo é onboarding/cadastro de profissional, não cadastro de cliente;
- a pré-conta deve registrar origem para atribuição de parceiro/afiliado.

**Abordagem:**
- corrigir o CTA de convite para apontar ao fluxo de profissional aprovado;
- remover redirects circulares que transformem `/entrar?ref=...` de volta em `/convite/...` depois do CTA;
- se o chat público de onboarding profissional da v1 for retomado, implementar sobre Edge Function/contrato v2 novo ou existente, nunca copiando `onboarding-agent` da v1 como backend.

**DoD:**
- URL direta `/convite/FERNA704?lang=pt-BR` abre landing;
- CTA não abre `/cadastro` estático por engano;
- `/entrar?ref=FERNA704&lang=pt-BR` preserva origem e cria pré-conta profissional;
- nenhum registro em `clients`.

### PR 28.2 - Onboarding/cadastro público de cliente da clínica

**Objetivo:** recuperar a regra da v1: cliente da clínica usa link público próprio e nunca vira profissional.

**Contrato de produto:**
- `/cadastro/:codigo` é cliente/paciente da clínica;
- `codigo` resolve `registration_links` com tenant validado pelo backend;
- `registration_links` não deve ser lida diretamente por `anon`; a resolução pública exige RPC/Edge Function segura quando não existir contrato v2 equivalente;
- `/cliente/:slug` é contrato existente do app client e deve ser reutilizado ou formalmente diferenciado antes de qualquer UI nova;
- sessão pública deve registrar progresso em `registration_sessions` ou contrato v2 equivalente;
- resultado final cria/atualiza `clients` no escopo do profissional correto.

**Abordagem:**
- mover ou recriar a experiência no `apps/client`, pois este é o app dono das rotas públicas de cliente na v2;
- preferir adaptar/reutilizar `PublicClientOnboardingPage` se o preflight concluir que o fluxo é o mesmo;
- reaproveitar handlers públicos v2 sempre que possível;
- se faltar equivalente ao `cadastro-agent` da v1, abrir lacuna formal antes de criar Edge Function nova;
- manter `/cadastro/:codigo` como rota direta navegável no domínio público, mesmo que internamente use componente/handler novo.

**DoD:**
- resolução de `registration_links.code` passa por backend público seguro ou redirect aprovado;
- `/cliente/:slug` e `/cadastro/:codigo` não criam duas fontes de onboarding de cliente;
- `/cadastro/{registration_code}` não renderiza landing de convite profissional;
- código inválido mostra erro amigável;
- `professionalA` e `professionalB` permanecem isolados;
- cliente criado/atualizado recebe `professional_id` apenas do backend validado;
- nenhum registro em `professionals`.

### PR 28.3 - Cliente indica possível cliente para a clínica

**Objetivo:** manter indicação de cliente separada de afiliado/parceiro profissional.

**Regra de execução:** este PR começa como validação do fluxo existente em `apps/client`. Só há implementação se o PR 28.0 provar lacuna real.

**Contrato de produto:**
- `/indicacao/:codigo` pertence ao funil da clínica;
- Rosane pode pedir indicação em momento adequado;
- lead indicado entra no CRM do profissional, não no onboarding da plataforma;
- recompensas do cliente indicador são do profissional, não comissão SaaS.

**DoD:**
- preflight confirmou se `PublicIndicacaoPage` existente é suficiente, precisa correção pontual ou deve ser substituída;
- indicação cria lead/registro no escopo da clínica;
- não dispara `public-create-account`;
- não toca tabelas de afiliado/commissionamento da plataforma.

### PR 28.4 - QA, aliases e documentação final

**Objetivo:** fechar a fase sem regressões.

**Testes obrigatórios:**
- URL direta válida e inválida para as quatro rotas;
- preservação de `lang` e `ref`;
- mobile 390px;
- isolamento `professionalA` vs `professionalB`;
- build, lint e typecheck;
- dry-run em qualquer IA/WhatsApp envolvido.

**Documentos a sincronizar:**
- `PRD-MASTER.md`;
- `PRD-FRONTEND.md`;
- `PRD-EDGE-FUNCTIONS.md`;
- `PRD-SCHEMA.md`, se houver migration/RPC nova;
- fluxos `01-onboarding-profissional.md` e `09-indicacao.md`, se a decisão final alterar contrato de produto.

---

## 4. Proibições

- Não usar `/cadastro/:codigo` para profissional.
- Não usar `/convite/:codigo` para cliente da clínica.
- Não criar cliente pelo `public-create-account`.
- Não criar profissional por handler de cliente.
- Não criar segunda experiência de onboarding de cliente se `/cliente/:slug` já cobre o caso.
- Não copiar backend v1 como fonte técnica.
- Não criar segunda fonte de verdade para `registration_links`, `registration_sessions`, afiliados ou indicações.

---

## 5. Definition of Done da Fase 28

- [ ] Preflight aprovado por Ismael.
- [ ] Mapa canônico de rotas públicas aprovado.
- [ ] Decisão `/cliente/:slug` versus `/cadastro/:codigo` aprovada.
- [ ] Caminho público seguro para resolver `registration_links.code` aprovado quando `/cadastro/:codigo` for mantido.
- [ ] `/convite/:codigo` e `/entrar?ref=...` cobrem somente profissional -> profissional.
- [ ] `/cadastro/:codigo` cobre somente cliente da clínica.
- [ ] `/indicacao/:codigo` foi validado antes de qualquer rebuild e cobre somente cliente indicando possível cliente.
- [ ] Fluxos preservam `lang`, `ref` e contexto de tenant.
- [ ] Nenhum fluxo público aceita `professional_id` confiando no payload do cliente.
- [ ] Testes cobrem códigos inválidos e isolamento entre tenants.
- [ ] PRDs técnicos sincronizados após implementação.
