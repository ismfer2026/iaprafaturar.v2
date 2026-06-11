# Fase 16 - Growth Comercial Completo

## Fonte

PRD: `docs/00-master/PRD-MASTER.md`, Fase 16, linhas 1148-1174.

## Objetivo

Transformar Growth de campanhas isoladas em sistema comercial completo para o profissional: funil, campanhas segmentadas, indicacao, reativacao, upsell, fidelidade, e-mail e chat publico, sempre com opt-out, cooldown, auditoria e handoff.

## DoD Obrigatorio

- [ ] Lead entra no funil e evolui por estagios com historico.
- [ ] Campanha segmentada respeita opt-out/cooldown e mostra resultado.
- [ ] Upsell so dispara quando elegivel e com canal permitido.
- [ ] Chat publico cria conversa rastreavel e permite handoff.
- [ ] E-mail respeita consentimento/opt-out e registra auditoria.

## Decisao Central

A Fase 16 nao parte do zero. A Fase 8 ja entregou `rfm_scores`, `client_health_scores`, `campaigns`, `campaign_recipients`, `campaign_dispatches`, `referral_links`, `referral_events`, opt-out WhatsApp e reativacao inicial. Portanto, a Fase 16 deve estender esse sistema, nao duplicar tabelas.

## Skills Aplicadas

- `revops`: funil comercial, lifecycle, estagios, handoff, metricas.
- `referrals`: programa de indicacao e recompensas.
- `churn-prevention`: health score, reativacao, cooldown e intervencoes.
- `emails`: e-mail como canal, sequencias e opt-out.

## Gates Antes de Codigo

1. Schema guard deve validar o diff contra Fase 8 antes de qualquer migration.
2. Nao criar tabelas com nomes existentes (`referral_events`, `campaigns`, `client_health_scores`, etc.).
3. Resend/SMTP exige checkpoint explicito com o usuario antes de envio real por API externa paga.
4. Upsell-agent exige diagnostico da reversao nao documentada antes de alteracao comportamental.

## Subfases Propostas

1. `phase16a_funil_revops`
2. `phase16b_campaigns_extension`
3. `phase16c_referral_loyalty`
4. `phase16d_health_reactivation`
5. `phase16e_upsell_metrics`
6. `phase16f_email_channel`
7. `phase16g_public_chat`

Cada subfase deve ter migration propria, validacao propria e deploy proprio quando houver Edge Function.
