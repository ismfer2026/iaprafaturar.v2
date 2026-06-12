# Security e QA Checklist - Fase 17

## Schema Guard

- [ ] Diff contra migrations v2 atuais.
- [ ] Diff contra inventarios v1/producao.
- [ ] Nenhuma tabela duplicada sem justificativa.
- [ ] `REVOKE ALL` antes de grants em tabela nova.
- [ ] RLS habilitado.
- [ ] Policies SELECT/WRITE separadas.
- [ ] FKs financeiras/assinatura com `ON DELETE RESTRICT`.
- [ ] Ledgers/eventos/webhooks append-only.
- [ ] Indices para ownership, status, Stripe ids e idempotency keys.

## Billing / Stripe

- [ ] Webhook valida assinatura Stripe.
- [ ] Stripe event id idempotente.
- [ ] Checkout nao aceita `free_internal`.
- [ ] Planos publicos nao exibem `free_internal`.
- [ ] Upgrade/downgrade nao cobra sem consentimento explicito.
- [ ] Trial/read-only preserva dados.

## Admin / Service Role

- [ ] Toda RPC admin chama `admin_assert_master()`.
- [ ] Toda acao admin grava `audit_log`.
- [ ] Impersonacao, se entrar, e read-only.
- [ ] Acoes destrutivas fora do escopo ou exigem dupla confirmacao.

## AI Credits

- [ ] Reserva/commit/release idempotentes.
- [ ] Falha de agente libera reserva.
- [ ] Credito zerado bloqueia automacao IA, nao leitura dos dados.
- [ ] Admin add credits registra motivo e audit_log.

## Nexus

- [ ] Nexus nao acessa dado clinico privado.
- [ ] Nexus cria proposta antes de escrita.
- [ ] Confirmacao explicita exigida para escrita.
- [ ] Execucao idempotente.
- [ ] Audit log contem proposal, confirmation e result.

## Frontend

- [ ] Mobile 390px sem scroll horizontal.
- [ ] Maximo 1 CTA primario por tela/aba.
- [ ] i18n completo.
- [ ] Read-only bloqueia formularios com mensagem clara.
- [ ] Build profissional e admin passam.

## Deploy / Versionamento

- [ ] Commit no GitHub antes de considerar deploy completo.
- [ ] `supabase db push` aplicado.
- [ ] Edge functions deployadas quando houver.
- [ ] Producao responde 200 apos fluxo GitHub/Vercel.
