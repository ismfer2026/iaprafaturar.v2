# FASE 26 - Runbook Final

## Validacao Pre-Deploy

```bash
npm test
npm run phase26:live
npm run phase26:ui
npm run typecheck
npm run lint
npm run build
supabase db lint --linked --level error
supabase migration list --linked
git diff --check
```

`phase26:live` usa fixtures sintéticas temporárias, busca credenciais operacionais somente durante a execução e limpa os dados principais ao finalizar. Nunca registrar chaves ou tokens no relatório.

`phase26:ui` usa o Chromium já instalado no cache local do Playwright e sobe servidores estáticos internos a partir dos builds. Não executar nova instalação de browser para esse gate.

O build dos apps exige `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` públicos no ambiente, sem persistir os valores em logs.

## Deploy

1. Aplicar migrations somente apos schema guard e backup quando aplicavel.
2. Publicar Edge Functions alteradas individualmente com o import map do projeto.
3. Confirmar funcao em `supabase functions list`.
4. Publicar apps somente apos o build completo.
5. Executar smoke de autenticacao, rotas principais e handlers publicos sem mensagem real.

## Rollback

- Frontend: republicar o artefato anterior.
- Edge Function: republicar a versao anterior do codigo.
- Migration aditiva/hardening: usar migration corretiva; nao editar migration aplicada.
- Mudanca destrutiva: proibida sem backup, janela, prova de zero consumidores e aprovacao especifica de Ismael.

## Incidentes

| Sintoma | Acao inicial |
|---|---|
| vazamento/IDOR suspeito | bloquear contrato afetado, preservar auditoria e revisar RLS/grants |
| mensagem duplicada | pausar worker/cron, verificar claim/idempotencia e dead-letter |
| handler publico abusado | confirmar rate limit, reduzir limite temporariamente e revisar fingerprint |
| funcao com erro | verificar logs sem expor PII, republicar versao anterior se necessario |
| PWA com dado obsoleto | confirmar que nao existe runtime cache de Supabase e atualizar service worker |

## Gate Fisico de Release

- Safari iOS fisico: login, navegacao, formularios, teclado, PWA e logout.
- Android Chrome fisico: mesmos cenarios.
- largura minima 390px: sem sobreposicao, corte ou scroll horizontal indevido.
- registrar dispositivo, versao, data e resultado antes do Go comercial.
