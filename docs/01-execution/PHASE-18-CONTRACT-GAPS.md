# Fase 18 — Lacunas Contratuais v2

Data: 2026-06-12  
Regra: evidência backend vem somente da v2.

| Capacidade | Evidência v2 atual | Lacuna/tarefa contratual | Owner | Prioridade | Bloqueio |
|---|---|---|---|---|---|
| Recovery de senha | Supabase Auth SDK | nenhuma migration; validar fluxo real de redirect/token | F18 | crítica | fechamento F18 |
| Parceiros profissional | contratos `platform_affiliate_*` existem para plataforma | definir contrato profissional sem expor domínio admin | F21 | alta | `/parceiros` |
| Estoque mínimo | `products`, `product_stock_movements`, `upsert_product` | provar saldos, reservas, vencimentos e manutenção antes de ampliar | F20 | alta | `/estoque` completo |
| Conciliação | `finance_reconciliation_items`, importação e confirmação | validar UX, RLS e idempotência; matching nunca automático | F20 | alta | fechamento financeiro |
| Documentos/anamnese | tabelas e RPCs documentados no mapa v2 | implementar C19-01 de versionamento sem sobrescrever fichas históricas | F19/PR 19.5 | alta | builder e paridade operacional |
| Gestão de equipe e roles | `team_members` e `user_roles`; escrita direta atual não diferencia role adequadamente | implementar C19-02 e revogar escrita direta insegura | F19/PR 19.1 | crítica | roles, serviços e configurações |
| Notificações profissionais | `team_members.notifications` e `professionals.settings` | implementar C19-03 sem tabela paralela | F19/PR 19.7 | alta | `/configuracoes/notificacoes` |
| Business hours | `professionals.settings.business_hours` e `team_members.business_hours` | implementar C19-04 com schema/RPC canônicos | F19/PR 19.7 | alta | `/configuracoes/agenda` e agenda por membro |
| Analytics admin | `get_admin_dashboard_rpc`, `get_admin_phase17_dashboard` | métricas detalhadas exigem prova/contrato específico | F23 | média | `/analytics` |
| Configurações plataforma | nenhuma `platform_settings` comprovada | desenhar contrato auditável somente após PRD-SCHEMA | F23 | alta | `/configuracoes` admin |
| Broadcast admin | contratos parciais existentes | provar histórico, canais e auditoria | F24 | média | expansão `/broadcast` |
| Leads plataforma | contrato não comprovado | definir origem, tenancy, acesso e auditoria | F24 | alta | `/leads` |

Nenhuma lacuna desta lista autoriza copiar schema, RPC, policy ou Function da v1.
