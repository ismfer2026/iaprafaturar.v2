# FASE 25 — Preflight Contratual

## Client App e Portal do Cliente

**Status:** aprovado por Ismael e concluído em 2026-06-14  
**Data da auditoria:** 2026-06-14  
**Decision Owner:** Ismael  
**Aplicação principal:** `apps/client`  
**Fonte de verdade:** PRD-MASTER, PRDs v2, migrations v2, RPCs v2, Edge Functions v2 e frontend client v2  
**Referência v1:** não aplicável; o app cliente não existia na v1  

---

## 1. Parecer de Preflight

A Fase 25 deve estabilizar a experiência pública e completar o portal do cliente sem criar um segundo sistema de autenticação, um segundo chat ou acesso direto amplo ao banco.

O v2 já possui:

- rotas públicas para onboarding, agendamento, ações de agendamento, anamnese, pacote, orçamento e chat;
- rotas do portal para home, histórico, pacotes, agendar e onboarding;
- Edge Functions públicas e RPCs canônicas para os principais fluxos;
- contratos Zod compartilhados para booking, ações de agendamento, anamnese, pacote, orçamento e portal;
- app client sem leitura direta ampla por `supabase.from`;
- chat público fundado na Fase 16.

Os gaps centrais são:

- não existe rate limit canônico comprovado em todos os handlers públicos;
- `public-chat-handler` não possui contrato runtime compartilhado e devolve mensagens internas;
- `client-portal-handler` mantém validação manual paralela ao contrato Zod existente;
- `public-package-handler` e `public-quote-handler` não possuem `verify_jwt = false` explícito em `supabase/config.toml`;
- redirects e helpers não preservam `lang`, `ref`, `slug` e identidade de fluxo de forma uniforme;
- token e cache do portal são persistidos em `localStorage` sem decisão explícita de retenção e limpeza;
- portal possui textos pt-BR hardcoded e funcionalidades backend ainda não expostas na UI;
- fallback `/agendar/demo` pode apontar para tenant inexistente/incorreto;
- payloads públicos ainda precisam de auditoria campo a campo e testes negativos.

**Gate geral:** nenhum PR funcional começa antes da aprovação explícita de Ismael para C25-01 a C25-10. Qualquer tabela, RPC ou mecanismo persistente de rate limit novo deve passar pelo schema guard.

---

## 2. Decisões Recomendadas para Aprovação

### C25-01 — Rotas e ownership canônicos

- manter exatamente uma rota e um handler canônico por jornada;
- `/chat/:slug` continua usando `public-chat-handler` da Fase 16;
- `/portal/*` usa somente `client-portal-handler`;
- rotas públicas por slug e token não dependem de auth profissional;
- `/` e not-found não redirecionam para `/agendar/demo`;
- nenhuma rota paralela será criada para capacidades já existentes.

### C25-02 — Identidade e preservação de parâmetros

- `lang` e `ref` sobrevivem aos redirects permitidos;
- `slug` acompanha somente jornadas do mesmo profissional;
- token permanece apenas na rota tokenizada ou na sessão do portal;
- token nunca é copiado para query string, analytics, logs ou rota sem necessidade;
- redirect sem identidade suficiente termina em estado neutro e amigável, não em tenant demo.

### C25-03 — Validação runtime e envelope público

- cada handler usa contrato compartilhado em `packages/contracts/edge-functions`;
- entrada e saída pública são validadas em runtime;
- erros usam envelope mínimo e enum estável, sem mensagem SQL/interna;
- `client-portal-handler` passa a usar seu contrato compartilhado;
- `public-chat-handler` recebe contrato compartilhado sem criar segundo chat.

### C25-04 — Rate limit e proteção contra abuso

- todos os handlers públicos aplicam rate limit antes de mutações ou consultas sensíveis;
- chave usa IP + handler/mode + identificador hasheado quando necessário;
- tokens, telefones, e-mails e mensagens nunca são persistidos como chave bruta;
- limites diferenciam leitura, criação, decisão e envio de mensagem;
- honeypot do chat é preservado, mas não substitui rate limit;
- novo schema/RPC persistente só entra após schema guard.

### C25-05 — Privacidade, payload mínimo e sessão

- respostas públicas são curadas campo a campo;
- nenhum handler expõe dados clínicos, credenciais, settings completos ou dados de terceiros;
- token do portal usa `sessionStorage` por padrão;
- persistência durável exige decisão de produto explícita de “lembrar dispositivo”;
- token/cache são apagados em logout, token inválido, expiração e troca de identidade;
- cache contém somente payload curado e nunca substitui revalidação da sessão.

### C25-06 — Agendamento e ações de agendamento

- booking público, booking do portal e ações tokenizadas reutilizam contratos existentes;
- disponibilidade e confirmação permanecem tenant-scoped;
- cancelamento e reagendamento respeitam regras canônicas;
- portal expõe ações já suportadas pelo handler, sem RPC paralela;
- falha de confirmação externa não duplica agendamento.

### C25-07 — Anamnese, pacote e orçamento

- cada fluxo continua usando seu handler canônico;
- token/slug inválido, expirado ou já decidido recebe estado amigável;
- upload de anamnese mantém limites e validação existentes;
- orçamento preserva decisão e assinatura canônicas;
- pacote não acessa diretamente tabelas de clientes ou vendas.

### C25-08 — Chat público

- `/chat/:slug` reutiliza exclusivamente `public-chat-handler`;
- handler recebe validação runtime, payload mínimo, rate limit e erro curado;
- não existe envio automático externo pelo client;
- spam/honeypot, tamanho de mensagem e dados opcionais são validados;
- nenhum detalhe de conversa profissional é retornado ao público.

### C25-09 — Portal completo, idioma e marca

- portal cobre home, histórico permitido, pacotes, agendar e onboarding;
- incluir atualização de perfil, cancelamento e reagendamento já suportados pelo handler;
- histórico usa cursor/load more e não carrega tudo;
- idioma, marca e identidade profissional são aplicados em todas as subrotas;
- pt-BR, en-US e es-419 completos;
- estados loading, empty, error, expired, unauthorized e success são explícitos.

### C25-10 — QA, mobile e observabilidade segura

- validar todas as rotas em 390px e desktop;
- automatizar casos de token inválido/expirado, slug inexistente, rate limit e privacidade;
- testes nunca enviam WhatsApp real;
- logs e analytics não registram token ou conteúdo sensível;
- cada jornada possui teste BDD de sucesso e falha;
- encerramento exige prova de ausência de acesso direto paralelo.

---

## 3. Inventário de Rotas e Handlers

| Rota | Acesso | Handler canônico | Estado para Fase 25 |
|---|---|---|---|
| `/cliente/:slug` | slug público | `public-booking-handler` | estabilizar onboarding e redirects |
| `/agendar/:slug` | slug público | `public-booking-handler` | estabilizar |
| `/agendamento/:token` | token público | `public-appointment-actions` | estabilizar |
| `/anamnese/:token` | token público | `anamnese-public-handler` | estabilizar |
| `/pacote/:slug` | slug público | `public-package-handler` | corrigir exposição/config e estabilizar |
| `/orcamento/:token` | token público | `public-quote-handler` | corrigir exposição/config e estabilizar |
| `/chat/:slug` | slug público | `public-chat-handler` | hardening; não recriar |
| `/portal/:token` | bootstrap token | `client-portal-handler` | estabilizar sessão e redirect |
| `/portal/home` | sessão portal | `client-portal-handler` | completar |
| `/portal/historico` | sessão portal | `client-portal-handler` | paginação/cursor |
| `/portal/pacotes` | sessão portal | `client-portal-handler` | estabilizar |
| `/portal/agendar` | sessão portal | `client-portal-handler` | completar ações |
| `/portal/onboarding` | sessão portal | `client-portal-handler` | completar |

---

## 4. Matriz de Parâmetros e Redirects

| Identidade | Pode sobreviver | Não pode ocorrer |
|---|---|---|
| `lang` | todas as jornadas públicas e portal | voltar silenciosamente para pt-BR |
| `ref` | fluxos públicos relacionados ao mesmo profissional | perder atribuição em redirect permitido |
| `slug` | jornadas públicas do mesmo profissional | usar `demo` ou slug de outro tenant como fallback |
| token de ação | somente na rota tokenizada correspondente | query string, analytics, logs ou outra jornada |
| token de portal | bootstrap e storage aprovado da sessão | persistência indefinida ou exposição em URL após bootstrap |

---

## 5. Matriz de Acesso e Privacidade

| Capacidade | Público por slug | Público por token | Sessão portal | Auth profissional |
|---|---|---|---|---|
| Ver marca/serviços/slots permitidos | permitido, mínimo | não aplicável | permitido, mínimo | não exigido |
| Criar agendamento | permitido por contrato | não aplicável | permitido | não exigido |
| Cancelar/reagendar | não | somente agendamento tokenizado | somente próprio agendamento | não exigido |
| Enviar anamnese | não | somente ficha tokenizada | fora do escopo inicial | não exigido |
| Ver pacote público | permitido, mínimo | não | próprios pacotes no portal | não exigido |
| Decidir orçamento | não | somente orçamento tokenizado | fora do escopo inicial | não exigido |
| Chat público | permitido com proteção antiabuso | não | fora do escopo inicial | não exigido |
| Histórico | não | não | somente resumo permitido do próprio cliente | não exigido |

---

## 6. Matriz de Segurança dos Handlers

| Handler | Contrato compartilhado | Rate limit comprovado | `verify_jwt=false` explícito | Ação |
|---|---|---|---|---|
| `public-booking-handler` | sim | não comprovado | sim | hardening |
| `client-portal-handler` | existe, mas handler valida manualmente | não comprovado | sim | remover drift e hardening |
| `anamnese-public-handler` | sim | não comprovado | sim | hardening |
| `public-appointment-actions` | sim | não comprovado | sim | hardening |
| `public-package-handler` | sim | não comprovado | não encontrado | bloquear até correção segura |
| `public-quote-handler` | sim | não comprovado | não encontrado | bloquear até correção segura |
| `public-chat-handler` | não | não comprovado | sim | contrato + hardening |

---

## 7. Gaps Bloqueantes

| ID | Gap | Risco | Owner planejado | Bloqueia |
|---|---|---|---|---|
| G25-01 | C25-01 a C25-10 sem aprovação final | decisões implícitas | PR 25.0 | todos os PRs funcionais |
| G25-02 | rate limit público ausente/inconsistente | abuso, custo e indisponibilidade | PR 25.1 | todos os fluxos públicos |
| G25-03 | `public-chat-handler` sem contrato runtime compartilhado | entrada inválida e vazamento de erro | PR 25.1 / 25.5 | chat |
| G25-04 | `client-portal-handler` mantém validação paralela | drift de contrato | PR 25.1 | portal |
| G25-05 | package/quote sem exposição pública explícita no config | rota pública quebrada ou correção insegura | PR 25.1 | pacote/orçamento |
| G25-06 | redirects e parâmetros inconsistentes | perda de idioma, atribuição ou tenant | PR 25.2 | jornadas encadeadas |
| G25-07 | token/cache do portal em `localStorage` sem política | persistência e exposição por XSS | PR 25.2 | portal |
| G25-08 | fallback `/agendar/demo` | tenant incorreto ou rota inválida | PR 25.2 | entrada/not-found |
| G25-09 | payloads públicos sem auditoria campo a campo | vazamento de dados | PR 25.1 | encerramento |
| G25-10 | portal sem ações já suportadas e sem paginação de histórico | experiência incompleta | PR 25.6 | DoD portal |
| G25-11 | i18n/branding incompletos no portal | quebra de experiência | PR 25.7 | DoD idioma/marca |
| G25-12 | erros inválido/expirado não uniformes | mensagens internas ou estados frágeis | PR 25.1 / 25.7 | DoD erros |
| G25-13 | QA negativo, 390px e BDD incompletos | regressão de segurança/UX | PR 25.8 | encerramento |

---

## 8. Gates Antes do PR 25.1

- [x] Ismael aprovou C25-01 a C25-10;
- [x] matriz de rotas e handlers foi aprovada;
- [x] matriz de parâmetros e redirects foi aprovada;
- [x] política de token/cache do portal foi aprovada;
- [x] payload mínimo permitido de cada handler foi classificado;
- [x] estratégia canônica de rate limit passou pelo schema guard, se exigir schema/RPC;
- [x] exposição pública de package/quote foi aprovada após validação runtime e rate limit;
- [x] chat público foi confirmado como única implementação;
- [x] nenhum contrato depende de functions ou schema da v1.

---

## 9. Parecer Final

O app client possui uma base funcional relevante e já evita acesso direto amplo ao banco. A execução deve começar pela fundação pública de segurança e contratos, depois estabilizar jornadas isoladas e somente então completar o portal.

**Recomendação:** aprovar C25-01 a C25-10 e executar PR 25.1 a PR 25.8 na ordem definida no plano. Nenhuma migration, RPC ou Edge Function nova deve ser criada antes da aprovação e do schema guard aplicável.
