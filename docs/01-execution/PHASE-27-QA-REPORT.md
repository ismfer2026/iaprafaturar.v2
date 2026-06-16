# FASE 27 - Relatório Final de QA

**Data:** 2026-06-16  
**Resultado técnico:** aprovado; zero crítico/alto conhecido no escopo auditado  
**Fase:** Paridade Percebida v1→v2

---

## PRs Entregues

| PR | Título | Commits | Status |
|---|---|---|---|
| 27.1 | URLs legadas e aliases de compatibilidade | 26ff93c | ✅ concluído |
| 27.2 | Financeiro avançado (Caixa, Fluxo, Conta Cliente, Repasses, Export Contador) | 4cda624 | ✅ concluído |
| 27.3 | WhatsApp self-service profissional (QR + pairing code) | 9cf7f7f | ✅ concluído |
| 27.4 | NFS-e | — | ❌ eliminado — projeto separado (decisão de Ismael) |
| 27.5 | Estoque operacional avançado | — | ⏸️ deferido — Ismael decide escopo |
| 27.6 | Admin parity — campaign_templates library | 893ec38 | ✅ concluído |
| 27.7 | PWA, notificações e offline | 0cba278 | ✅ concluído |

---

## Evidências

| Validação | Resultado |
|---|---|
| `npm run typecheck` — professional | ✅ passou |
| `npm run typecheck` — admin | ✅ passou |
| `npm run typecheck` — client | ✅ passou |
| `npm run lint` — professional | ✅ passou |
| `npm run lint` — admin | ✅ passou (1 erro corrigido durante a PR 27.6) |
| `npm run lint` — client | ✅ passou |
| `npm run build` — professional | ✅ passou |
| `npm run build` — admin | ✅ passou |
| `npm run build` — client | ✅ passou |

---

## Gaps vs V1 — Decisões

### Preservados / Recriados

| Recurso v1 | Destino v2 | Notas |
|---|---|---|
| `/indicacoes`, `/fidelidade` | redirect → `/recompensas` | PR 27.1 |
| `/cadastro/:codigo`, `/convite/:codigo` | redirect → `/criar-conta?ref=` / `?convite=` | PR 27.1 |
| `/admin/metricas` | redirect → `/analytics` | PR 27.1 |
| `/indicacao/:codigo` (público) | `PublicIndicacaoPage` no app client | PR 27.1 — genérica (sem RPC pública para resolver código) |
| Caixa | aba Caixa em FinanceiroPage (groupBy day) | PR 27.2 |
| Conta Cliente | aba Conta Cliente em FinanceiroPage (filtro por cliente) | PR 27.2 |
| Fluxo de Caixa | aba Fluxo em FinanceiroPage (groupBy mês, últimos 12) | PR 27.2 |
| Repasses / Comissões | aba Repasses em FinanceiroPage (team members + %) | PR 27.2 — atribuição por sessão depende de migration futura |
| Export para Contador | botão CSV em ReportsPage | PR 27.2 |
| WhatsApp QR | AgentesPage → botão "Conectar via QR" + polling | PR 27.3 |
| WhatsApp pairing code | AgentesPage → botão "Conectar via código" + phone input | PR 27.3 |
| WhatsApp desconectar | AgentesPage → botão "Desconectar" + confirm | PR 27.3 |
| Admin campaign templates | `/admin/templates` — CRUD via RPCs admin_upsert/toggle | PR 27.6 |
| Notificações (configuração) | `/configuracoes/notificacoes` — funcional desde PR 19.7 | verificado PR 27.7 |
| Status offline | OfflineBanner no AppShell (WifiOff + i18n) | PR 27.7 |
| PWA manifest/SW | VitePWA configurado | verificado PR 27.7 |

### Descartados / Deferidos

| Recurso | Decisão | Motivo |
|---|---|---|
| NFS-e | ❌ fora do projeto | projeto separado — Ismael |
| Estoque avançado (reservas, manutenção, expedição) | ⏸️ deferido | Ismael decide escopo (PR 27.5) |
| Notification bell | ❌ não implementado | sem backend de push real — seria UI cosmética |
| offline-sync ativo | ❌ mantido como infra (desconectado) | evita cache autenticado inseguro (regra Fase 26) |
| Repasses por sessão | ⚠️ parcial | `sessions` sem `team_member_id` — migration futura |

---

## Segurança

- Todas as mutações de `campaign_templates` passam por `admin_assert_master()` (SECURITY DEFINER)
- `professional_id` never from payload em nenhuma PR desta fase
- `campaign_templates` RLS: SELECT para authenticated USING(true); INSERT/UPDATE/DELETE: REVOKE ALL (somente service_role / SECURITY DEFINER RPCs)
- WhatsApp: credenciais (`evolution_instance_token`) nunca expostas no frontend — toda comunicação via Edge Function
- Offline-sync desconectado: nenhum dado autenticado é cacheado localmente (service worker não armazena respostas autenticadas, conforme Fase 26)

---

## Limite Externo

- Validação física (Safari iOS, Android Chrome) permanece como gate de release
- Repasses por sessão: aguarda migration de `team_member_id` em `sessions`
- `/indicacao/:codigo` público: landing genérica — resolução do código para profissional requer RPC pública futura

---

## Veredito

A Fase 27 está tecnicamente concluída nas PRs 27.1, 27.2, 27.3, 27.6 e 27.7.  
PR 27.5 (Estoque) permanece deferida — decisão de Ismael.  
Go/No-Go comercial: decisão de Ismael, condicionada ao gate físico de release.
