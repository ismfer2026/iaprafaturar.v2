# Checklist Seguranca e QA - Fase 16

## Schema Guard

- [ ] Nenhuma tabela nova duplica nome da Fase 8.
- [ ] Toda tabela nova tem RLS ligado.
- [ ] Toda tabela nova tem `REVOKE ALL FROM anon, authenticated`.
- [ ] Mutacoes diretas via PostgREST bloqueadas.
- [ ] Mutacoes acontecem via RPC/Edge Function auditada.
- [ ] Eventos historicos append-only tem trigger contra update/delete.
- [ ] FKs usam `ON DELETE RESTRICT` salvo justificativa explicita.

## Opt-out, Consentimento e Cooldown

- [ ] WhatsApp respeita `clients.whatsapp_opt_out`.
- [ ] E-mail tem opt-out proprio antes de envio real.
- [ ] Campanhas registram bloqueios por opt-out/cooldown.
- [ ] Reativacao respeita cooldown e limite de tentativas.
- [ ] Upsell respeita canal permitido, cooldown, sugestao pendente e pagamentos pendentes.
- [ ] Mensagem promocional nao sai sem base legal/consentimento registrado.

## DRY_RUN

- [ ] `dry_run` bloqueia envio externo.
- [ ] Persistencia interna/auditoria ocorre quando esse for o padrao da funcao.
- [ ] Retorno indica `dry_run: true`.
- [ ] Testes/smokes nao enviam WhatsApp/e-mail real.

## E-mail Gate

- [ ] Usuario aprovou uso de Resend/SMTP antes de deploy com envio real.
- [ ] Credenciais estao em secrets/Vault, nunca no repo.
- [ ] Opt-out por e-mail implementado antes de qualquer envio real.

## Upsell

- [ ] Diagnostico da reversao anterior documentado.
- [ ] Elegibilidade usa dados existentes: pacotes, RFM, pagamentos, opt-out, cooldown.
- [ ] Shadow suggestion continua sendo default antes de envio.
- [ ] Metricas cobrem ciclo completo.

## Frontend

- [ ] `/funil` funciona em 390px sem kanban horizontal obrigatorio.
- [ ] Kanban desktop tem fallback por menu/select.
- [ ] Textos nao estouram cards/botoes.
- [ ] i18n completo pt-BR/en-US/es-419.
- [ ] Empty/loading/error states.

## Validacoes

- [ ] `npm run typecheck --workspace @iaprafaturar/domain`
- [ ] `npm run typecheck --workspace @iaprafaturar/professional`
- [ ] `npm run build --workspace @iaprafaturar/professional`
- [ ] `deno check` para cada Edge Function alterada/criada.
- [ ] `npx supabase migration list`
- [ ] `npx supabase db push` somente apos review.
- [ ] Deploy das functions com import map quando usarem `@iaprafaturar/contracts`.
- [ ] Deploy Vercel somente apos build local passar.
