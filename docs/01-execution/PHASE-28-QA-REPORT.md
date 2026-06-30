# FASE 28 - QA Report

Data: 2026-06-26

## Status

Fase 28 executada no codigo.

## Decisoes implementadas

- `/cadastro/:codigo` e cliente da clinica, nao profissional.
- `/cadastro/:codigo` reutiliza o contrato existente de `/cliente/:slug`; nao foi criada segunda experiencia paralela de onboarding de cliente.
- `/cliente/:slug` voltou a usar experiencia conversacional com IA via `cadastro-agent`, preservando a inteligencia da v1 e finalizando pelo portal/sessao v2.
- `registration_links.code` e resolvido por Edge Function com service role e rate limit publico; RLS anon continua fechada.
- `/convite/:codigo` permanece profissional convidando profissional.
- `/entrar?ref=...` e o destino aprovado do CTA de `/convite/:codigo` e abre o onboarding publico profissional em formato conversacional.
- `/cadastro?ref=...` acessado diretamente continua voltando para `/convite/:codigo`, evitando pular a pagina de captura do convite profissional.
- `/indicacao/:codigo` foi validado como rota isolada do app client e nao foi reconstruido nesta fase.

## Implementacao

- `packages/contracts/edge-functions/public-booking-handler.ts`
  - adiciona o modo `resolve_registration_link`;
  - adiciona schema de entrada e saida publica minima.
- `supabase/functions/public-booking-handler/index.ts`
  - resolve `registration_links.code` com `service_role`;
  - valida link ativo, nao expirado, nao esgotado e profissional ativo/onboardado;
  - retorna apenas `registration_link_code`, `professional_slug`, `locale`, `ref` e `next_step`.
- `apps/client/src/routes.ts`
  - adiciona `/cadastro/:codigo` apontando para `PublicRegistrationLinkRedirectPage`.
- `apps/client/src/pages/PublicRegistrationLinkRedirectPage.tsx`
  - resolve o codigo e redireciona para `/cliente/:slug`.
- `apps/client/src/pages/PublicClientOnboardingPage.tsx`
  - substitui o formulario seco por onboarding publico conversacional de cliente;
  - chama `cadastro-agent` com `mode=web_chat`, preservando `slug`, `lang` e `ref`;
  - ao concluir, abre o portal do cliente criado pela sessao v2.
- `supabase/functions/cadastro-agent/index.ts`
  - recria o agente publico de cadastro de clientes da v1;
  - coleta dados por conversa IA e conclui via `create_client_portal_session`;
  - complementa `clients` com CPF, nascimento, cidade/bairro, motivo e metadata do onboarding;
  - consome `registration_links.uses_count` depois do sucesso, sem gastar uso apenas por abertura do link.
- `apps/professional/src/App.tsx`
  - troca `/cadastro/:codigo` da landing profissional para a ponte de cliente.
- `apps/professional/src/pages/auth/PublicClientRegistrationRedirectPage.tsx`
  - resolve o codigo e envia para o app client.
- `apps/professional/src/pages/auth/PublicInviteLandingPage.tsx`
  - CTA de convite profissional vai para `/entrar?ref=...`.
- `apps/professional/src/pages/auth/PublicProfessionalOnboardingFlowPage.tsx`
  - restaura `/entrar?ref=...` como onboarding publico profissional conversacional, chamando `onboarding-agent` como na v1.
- `supabase/functions/onboarding-agent/index.ts`
  - recria o modo publico `web_chat`, coleta dados via IA, finaliza via `create_public_professional_preaccount` e atualiza o cadastro profissional com os dados coletados.
- `apps/professional/src/pages/auth/PublicEntrarPage.tsx`
  - permanece como formulario/fallback de `/cadastro` e preserva o guard de `/cadastro?ref=...` para a pagina de captura.
- `supabase/migrations/20260627090000_phase28_claim_registration_link_use.sql`
  - cria `claim_registration_link_use(p_code, p_slug)` para consumir `uses_count` de forma atomica depois de uma sessao/onboarding de cliente bem-sucedido.
- `supabase/functions/client-portal-handler/index.ts` e `supabase/functions/public-booking-handler/index.ts`
  - chamam `claim_registration_link_use` apos sucesso quando existe `ref`, sem gastar uso apenas por abertura do link.

## Validacao local

- `npm run typecheck`: passou.
- `npm run lint`: passou.
- `npm run build`: passou.
- `git diff --check`: passou.
- `2026-06-28`: restauracao de `/entrar?ref=...` como onboarding publico profissional real validada com `npm run typecheck`, `npm run lint`, `npm run build`, `git diff --check`, deploy de `onboarding-agent` e chamada live `mode=web_chat/message=INICIO`.
- `2026-06-29`: restauracao de `/cliente/:slug` como onboarding publico inteligente de cliente validada com `npm run typecheck`, `npm run lint`, `npm run build`, `git diff --check`, deploy de `cadastro-agent` e chamada live `mode=web_chat/message=INICIO` para `professional-a`/`PROFA-PUBLIC`.
- `2026-06-29`: validacao live de `/cadastro/:codigo` pelo contrato `resolve_registration_link` confirmou `PROFA-PUBLIC -> professional-a -> client_onboarding`.
- `supabase functions deploy public-booking-handler --import-map supabase/functions/deno.json`: passou no projeto `hqjghltqnbhbfoybtrgq`.
- `supabase db push`: aplicou `20260627090000_phase28_claim_registration_link_use.sql` no projeto remoto.
- `supabase functions deploy client-portal-handler --import-map supabase/functions/deno.json`: passou no projeto `hqjghltqnbhbfoybtrgq`.

## Riscos remanescentes

- Validacao live ainda depende de link real em `registration_links` para confirmar status de expiracao e roteamento do dominio de producao.
- `/indicacao/:codigo` permanece isolado, mas a criacao efetiva de lead indicado continua fora do escopo desta correcao se o produto exigir captura ativa nessa tela.
