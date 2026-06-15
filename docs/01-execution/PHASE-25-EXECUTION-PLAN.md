# FASE 25 — Plano de Execução

## Client App e Portal do Cliente

**Status:** concluída e validada em 2026-06-14  
**Decision Owner:** Ismael  
**Aplicação principal:** `apps/client`  
**Fonte contratual:** banco v2, migrations v2, RPCs v2, Edge Functions v2 e frontend client v2  
**Estimativa:** 2 a 3 semanas após aprovação do preflight  
**Preflight de referência:** `docs/01-execution/PHASE-25-PREFLIGHT.md`

---

## 1. Objetivo

Inventariar, estabilizar e concluir a experiência cliente da v2, garantindo que todas as jornadas públicas sejam seguras, mínimas, responsivas e independentes de autenticação profissional.

A fase deve entregar:

- rotas públicas e portal com ownership canônico;
- validação runtime, rate limit, payload mínimo e erros amigáveis em todos os handlers públicos;
- preservação segura de idioma, referência, slug e token;
- chat público reutilizado sem implementação paralela;
- portal completo com home, histórico permitido, pacotes, agendar e onboarding;
- branding e i18n consistentes;
- QA negativo, privacidade e mobile 390px comprovados.

---

## 2. Condição de Entrada

- [x] Fase 24 concluída;
- [x] rotas, frontend, handlers, contratos e config atuais inventariados;
- [x] ausência de acesso direto amplo no app client confirmada;
- [x] chat público canônico da Fase 16 identificado;
- [x] C25-01 a C25-10 aprovados por Ismael;
- [x] política de token/cache aprovada;
- [x] payloads públicos permitidos aprovados;
- [x] estratégia de rate limit aprovada pelo schema guard quando aplicável.

**Gate:** nenhum PR funcional começa enquanto qualquer decisão contratual acima estiver aberta.

---

## 3. Princípios de Execução

1. O app client não depende de auth profissional.
2. Cada jornada possui uma rota e um handler canônico.
3. O chat público da Fase 16 é reutilizado; não existe segundo chat.
4. O frontend client nunca lê tabelas amplas diretamente.
5. Todo handler público valida runtime, limita abuso e retorna payload mínimo.
6. Tokens nunca aparecem em logs, analytics ou redirects desnecessários.
7. Redirects preservam somente a identidade necessária e segura.
8. Portal não cria um segundo sistema de autenticação.
9. Dados clínicos não entram em respostas públicas sem autorização explícita.
10. Nenhum schema/RPC novo entra sem schema guard.

---

## 4. Contratos Obrigatórios

### C25-01 — Rotas e ownership

- ownership conforme matriz do preflight;
- `/` e not-found usam estado neutro;
- sem aliases ou páginas paralelas;
- todos os handlers canônicos ficam documentados.

### C25-02 — Parâmetros e redirects

- `lang`, `ref` e `slug` preservados somente quando aplicáveis;
- token restrito ao próprio fluxo;
- helper único para redirects públicos;
- testes provam ausência de perda e vazamento.

### C25-03 — Runtime e erros

- contrato compartilhado para entrada e saída;
- erro público enum/minimal;
- nenhuma mensagem SQL/interna;
- client e Edge Function usam o mesmo contrato.

### C25-04 — Rate limit e antiabuso

- rate limit por handler/mode;
- identificadores sensíveis hasheados;
- limites e respostas padronizados;
- honeypot do chat preservado;
- testes negativos e de recuperação.

### C25-05 — Privacidade e sessão

- payloads curados campo a campo;
- token do portal em storage aprovado e com limpeza;
- cache mínimo, temporário e revalidado;
- nenhum dado de outro cliente/tenant.

### C25-06 — Booking e ações

- booking público e portal reutilizam contratos existentes;
- cancelamento/reagendamento ficam disponíveis quando permitidos;
- regras de janela e idempotência preservadas;
- confirmação externa não duplica agendamento.

### C25-07 — Anamnese, pacote e orçamento

- handlers canônicos reutilizados;
- token/slug e estados terminais tratados;
- uploads e decisões respeitam limites;
- sem leitura paralela.

### C25-08 — Chat público

- contrato runtime compartilhado;
- payload mínimo e erros curados;
- rate limit, honeypot e limites de entrada;
- nenhuma exposição de conversa profissional.

### C25-09 — Portal, idioma e marca

- home, histórico, pacotes, agendar e onboarding completos;
- perfil, cancelamento e reagendamento usando handler existente;
- histórico paginado por cursor;
- marca e três idiomas em todas as subrotas.

### C25-10 — QA e observabilidade

- 390px e desktop;
- token inválido/expirado, slug inexistente e rate limit;
- testes BDD por jornada;
- logs sem tokens/dados sensíveis;
- prova de ausência de acesso direto paralelo.

---

## 5. Sequência de Execução

### PR 25.0 — Preflight documental e aprovação

- [x] inventariar rotas, páginas, handlers, contratos e config;
- [x] registrar C25-01 a C25-10;
- [x] registrar G25-01 a G25-13;
- [x] registrar matrizes de rotas, parâmetros, acesso e segurança;
- [x] comprovar ausência de acesso direto amplo no app client;
- [x] obter aprovação explícita de Ismael;
- [x] aprovar política de token/cache;
- [x] aprovar payloads mínimos e rate limit.

**Gate:** PR 25.1 só começa com contratos e decisões aprovados.

### PR 25.1 — Fundação pública de segurança

- criar contrato compartilhado do `public-chat-handler`;
- fazer `client-portal-handler` usar seu contrato compartilhado;
- padronizar validação de entrada, saída e envelope de erro;
- implementar rate limit canônico após schema guard;
- hashear identificadores usados para antiabuso;
- auditar payloads públicos campo a campo;
- configurar exposição pública de package/quote somente após gates;
- aplicar testes negativos de slug, token, tenant e limite.

**Gate:** nenhum handler público permanece sem runtime validation, rate limit, resposta mínima e teste inválido.

### PR 25.2 — Identidade, redirects e sessão do portal

- criar helper único de parâmetros e redirects;
- preservar `lang`, `ref` e `slug` quando permitido;
- impedir propagação indevida de tokens;
- substituir `/agendar/demo` por entrada neutra;
- aplicar política aprovada de token/cache;
- limpar sessão/cache em logout, inválido, expirado e troca de identidade;
- testar redirects e ausência de token em logs/URLs indevidas.

**Gate:** toda transição preserva contexto necessário sem vazar identidade sensível.

### PR 25.3 — Booking, onboarding e ações de agendamento

- estabilizar `/cliente/:slug` e `/agendar/:slug`;
- estabilizar `/agendamento/:token`;
- validar disponibilidade, criação, cancelamento e reagendamento;
- preservar idioma, referência, marca e slug;
- mapear falhas para mensagens amigáveis;
- validar idempotência e tenant isolation.

**Gate:** agendamento e ações funcionam sem auth profissional e sem duplicidade.

### PR 25.4 — Anamnese, pacote e orçamento

- estabilizar `/anamnese/:token`, `/pacote/:slug` e `/orcamento/:token`;
- validar expirado, inexistente, já decidido e input inválido;
- preservar limites de upload e assinatura;
- garantir payload mínimo e marca/idioma;
- provar ausência de acesso direto paralelo.

**Gate:** cada jornada usa somente seu handler canônico e retorna somente dados permitidos.

### PR 25.5 — Chat público canônico

- manter `/chat/:slug` sobre o handler da Fase 16;
- aplicar contrato compartilhado, rate limit e erros mínimos;
- validar honeypot, tamanho e campos opcionais;
- impedir retorno de detalhes internos;
- validar estados loading, empty, error e success;
- testar que não existe segundo chat/handler.

**Gate:** chat está seguro e reutilizado, sem duplicação contratual.

### PR 25.6 — Portal completo

- completar `/portal/home`, `/portal/historico`, `/portal/pacotes`, `/portal/agendar` e `/portal/onboarding`;
- expor atualização de perfil, cancelamento e reagendamento já suportados;
- implementar histórico com cursor/load more;
- manter ações e dados limitados ao próprio cliente;
- tratar expiração e logout automaticamente;
- eliminar fallback para tenant demo.

**Gate:** portal cobre o escopo do PRD com sessão mínima e isolamento comprovado.

### PR 25.7 — Branding, i18n, UX e mobile

- remover strings hardcoded e completar pt-BR, en-US e es-419;
- aplicar marca profissional em todas as jornadas;
- garantir uma ação primária clara por tela;
- completar loading, empty, error, expired, unauthorized e success;
- validar acessibilidade básica, foco, teclado e contraste;
- validar layout em 390px e desktop sem sobreposição.

**Gate:** idioma, marca e contexto sobrevivem a toda jornada aprovada.

### PR 25.8 — QA, segurança e encerramento

- executar typecheck, lint, build e `git diff --check`;
- executar `supabase db lint` e testes negativos de handlers/RPCs;
- validar token inválido, expirado, slug inexistente e rate limit;
- validar isolamento de tenant e payloads mínimos;
- validar que automação não envia WhatsApp real;
- executar cenários BDD de sucesso/falha por rota;
- validar 390px e desktop;
- confirmar ausência de acesso direto paralelo e segundo chat;
- sincronizar PRD-MASTER, PRD-FRONTEND, PRD-SCHEMA e PRD-EDGE-FUNCTIONS;
- registrar dívidas reais sem marcar critérios incompletos.

**Gate:** a fase só fecha com todos os critérios de encerramento comprovados.

---

## 6. Cenários BDD Mínimos

### Jornada por slug

```gherkin
Given um slug inexistente
When o cliente abre uma rota pública
Then recebe estado amigável sem dados de outro tenant
And nenhum erro interno é exposto
```

### Jornada por token

```gherkin
Given um token inválido ou expirado
When o cliente abre a ação correspondente
Then recebe estado amigável e localizado
And o token não aparece em logs ou redirects indevidos
```

### Rate limit

```gherkin
Given repetidas requisições públicas acima do limite
When o limite é atingido
Then o handler responde com erro público estável
And nenhuma mutação adicional é executada
```

### Isolamento do portal

```gherkin
Given uma sessão válida do cliente A
When o portal consulta histórico, pacotes ou agendamentos
Then retorna somente dados permitidos do cliente A
And nunca retorna dados clínicos ou do cliente B
```

### Redirects

```gherkin
Given uma jornada com lang, ref e slug válidos
When ocorre um redirect permitido
Then os parâmetros necessários sobrevivem
And nenhum token é propagado para rota indevida
```

---

## 7. Critérios de Encerramento

- [x] todas as rotas client foram inventariadas e testadas em 390px;
- [x] nenhum fluxo depende de auth profissional;
- [x] token inválido, expirado e slug inexistente geram erros amigáveis;
- [x] cliente vê somente dados permitidos;
- [x] idioma, marca e parâmetros sobrevivem ao fluxo;
- [x] chat, agendamento, anamnese, pacote e orçamento reutilizam handlers canônicos;
- [x] todos os handlers públicos possuem runtime validation, rate limit e resposta mínima;
- [x] portal cobre home, histórico permitido, pacotes, agendar e onboarding;
- [x] token/cache seguem política aprovada e são limpos corretamente;
- [x] nenhum acesso direto amplo ou segundo chat foi introduzido;
- [x] typecheck, lint, build, db lint, testes negativos e BDD passam;
- [x] PRDs e relatório de QA estão sincronizados.

---

## 8. Riscos e Mitigações

| Risco | Mitigação |
|---|---|
| tornar handler público antes do hardening | bloquear config até runtime validation, rate limit e payload auditado |
| rate limit criar segunda fonte de verdade | schema guard e contrato único compartilhado |
| token persistente vazar por XSS/log | storage mínimo, limpeza, hashing e testes de observabilidade |
| redirects perderem tenant/idioma | helper único e matriz de parâmetros |
| portal crescer como segundo auth | manter sessão tokenizada existente e escopo mínimo |
| chat ser recriado | ownership explícito da Fase 16 e teste anti-duplicidade |
| payload público expor dados | auditoria campo a campo e testes tenant/privacy |
| QA enviar mensagem real | dry-run/mocks obrigatórios em automação |

---

## 9. Aprovação Necessária

Ismael deve aprovar C25-01 a C25-10 antes do PR 25.1. A aprovação confirma especialmente:

- política de token/cache do portal;
- estratégia de rate limit;
- exposição pública segura de package/quote;
- matrizes de rotas, parâmetros e payloads;
- completude funcional esperada do portal;
- manutenção do chat público da Fase 16 como única implementação.
