# FASE 25 — Relatório de QA

**Status:** aprovado  
**Data:** 2026-06-14  
**Decision Owner:** Ismael

## Build e Qualidade

- `npm run typecheck`: passou em todos os workspaces;
- `npm run lint`: passou em todos os workspaces;
- `npm run build --workspace @iaprafaturar/client`: passou;
- `git diff --check`: passou;
- `supabase db lint --linked --level error`: passou sem erros.

## Deploy

- migration `20260614120000_phase25_public_rate_limit.sql` aplicada; local e remoto sincronizados;
- sete handlers públicos republicados com import map e `--no-verify-jwt`;
- acesso validado com a chave anônima pública do app, sem sessão/JWT profissional;
- nenhum teste automatizado enviou WhatsApp ou mensagem real.

## Segurança

| Verificação | Status |
|---|---|
| Sete handlers usam contrato runtime compartilhado | passou |
| Sete handlers aplicam rate limit canônico | passou |
| Fingerprint antiabuso usa SHA-256 sem PII/token bruto | passou |
| Tabela de rate limit sem grants públicos | passou |
| App client sem `supabase.from` amplo | passou |
| Token do portal removido de `localStorage` | passou |
| Sessão/cache limpos em logout e expiração | passou |
| Package/quote explicitamente públicos após hardening | passou |
| Chat público único, sem segundo handler | passou |
| Rate limit retorna HTTP 429 após o limite | passou |

## Testes Negativos Remotos

| Handler | Cenário | Resultado |
|---|---|---|
| booking | slug inexistente | `not_found` mínimo |
| portal | sessão inválida | HTTP 401 controlado |
| appointment actions | token inexistente | `appointment_not_found` |
| anamnese | token inexistente | `not_found` |
| package | slug inexistente | `not_found` |
| quote | token inexistente | `not_found` |
| chat | slug inexistente | HTTP 404 controlado |

No teste de rate limit do orçamento, as oito primeiras tentativas sintéticas retornaram `not_found` e as seguintes retornaram HTTP 429, sem executar mutação.

## Revalidação Pós-Deploy

- revisão externa identificou que `client-portal-handler`, `anamnese-public-handler` e `public-appointment-actions` ainda serviam bundles anteriores;
- os três handlers foram republicados isoladamente com o import map canônico;
- portal: cursor inválido retorna HTTP 400 e a 13ª mutação sintética retorna HTTP 429;
- anamnese: a 7ª submissão sintética retorna HTTP 429;
- ações de agendamento: a 9ª tentativa sintética retorna HTTP 429;
- `PublicNotFoundPage` teve a descrição duplicada removida.

## UX e Mobile

- todas as rotas foram inventariadas;
- portal e páginas públicas usam layouts com largura limitada, sem tabela horizontal;
- histórico usa cursor/load more;
- portal cobre home, histórico, pacotes, agendamento, perfil/onboarding, cancelamento e reagendamento;
- i18n pt-BR, en-US e es-419 possui paridade garantida pelo typecheck;
- root/not-found não redireciona para tenant `demo`;
- `lang` é preservado nos redirects e na navegação do portal.

## Veredito

Fase 25 aprovada. Não foram encontrados bloqueadores de segurança, build, contrato ou UX no escopo executado.
