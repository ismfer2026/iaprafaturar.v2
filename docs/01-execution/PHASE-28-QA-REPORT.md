# FASE 28 - QA Report

Data: 2026-06-26

## Status

Fase 28 executada no codigo.

## Decisoes implementadas

- `/cadastro/:codigo` e cliente da clinica, nao profissional.
- `/cadastro/:codigo` reutiliza o contrato existente de `/cliente/:slug`; nao foi criada segunda experiencia paralela de onboarding de cliente.
- `registration_links.code` e resolvido por Edge Function com service role e rate limit publico; RLS anon continua fechada.
- `/convite/:codigo` permanece profissional convidando profissional.
- `/entrar?ref=...` e `/cadastro?ref=...` acessados diretamente voltam para `/convite/:codigo`; somente o CTA de `/convite/:codigo`, marcado com `state.fromInvite`, entra no formulario profissional.
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
- `apps/professional/src/App.tsx`
  - troca `/cadastro/:codigo` da landing profissional para a ponte de cliente.
- `apps/professional/src/pages/auth/PublicClientRegistrationRedirectPage.tsx`
  - resolve o codigo e envia para o app client.
- `apps/professional/src/pages/auth/PublicInviteLandingPage.tsx`
  - CTA de convite profissional vai para `/entrar?ref=...`.
- `apps/professional/src/pages/auth/PublicEntrarPage.tsx`
  - preserva o guard condicional de `ea82931`: acesso direto com `ref` passa pela pagina de captura, mas o CTA de `/convite/:codigo` pode seguir para o formulario.
- `supabase/migrations/20260627090000_phase28_claim_registration_link_use.sql`
  - cria `claim_registration_link_use(p_code, p_slug)` para consumir `uses_count` de forma atomica depois de uma sessao/onboarding de cliente bem-sucedido.
- `supabase/functions/client-portal-handler/index.ts` e `supabase/functions/public-booking-handler/index.ts`
  - chamam `claim_registration_link_use` apos sucesso quando existe `ref`, sem gastar uso apenas por abertura do link.

## Validacao local

- `npm run typecheck`: passou.
- `npm run lint`: passou.
- `npm run build`: passou.
- `git diff --check`: passou.
- `supabase functions deploy public-booking-handler --import-map supabase/functions/deno.json`: passou no projeto `hqjghltqnbhbfoybtrgq`.
- `supabase db push`: aplicou `20260627090000_phase28_claim_registration_link_use.sql` no projeto remoto.
- `supabase functions deploy client-portal-handler --import-map supabase/functions/deno.json`: passou no projeto `hqjghltqnbhbfoybtrgq`.

## Riscos remanescentes

- Validacao live ainda depende de link real em `registration_links` para confirmar status de expiracao e roteamento do dominio de producao.
- `/indicacao/:codigo` permanece isolado, mas a criacao efetiva de lead indicado continua fora do escopo desta correcao se o produto exigir captura ativa nessa tela.
