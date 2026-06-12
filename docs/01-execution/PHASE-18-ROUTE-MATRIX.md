# Fase 18 — Matriz Canônica de Rotas

Data de aprovação: 2026-06-12  
Decision Owner: Ismael

## Fontes de verdade em runtime

- Professional: `apps/professional/src/routes.ts`
- Admin: `apps/admin/src/routes.ts`
- Client: `apps/client/src/routes.ts`
- Contratos backend: `docs/01-execution/supabase-contract-map-v2.md`

`implementada` significa que a URL existe em runtime. `planejada` significa que a rota é canônica, mas sua fase dona deve entregar a tela após preflight contratual.

## Professional

| Rota canônica | Jornada/domínio | Implementação ou fase dona | Estado |
|---|---|---|---|
| `/onboarding` | J1 | `OnboardingPage`, F11 | implementada |
| `/dashboard` | J27 | `DashboardPage`, F19 amplia | implementada |
| `/agenda` | J4 | `AgendaPage`, F19 amplia | implementada |
| `/clientes`, `/clientes/:id` | J12, J14 | `ClientsPage`, `ClientProfilePage`, F19 amplia | implementada |
| `/clientes/:id/anamnese` | J5 | F19 | planejada |
| `/servicos`, `/servicos/novo` | J4, J6 | `ServicesPage`; F19 fecha ação direta | parcial |
| `/financeiro` | J7 | `FinanceiroPage`, F20 amplia | implementada |
| `/financeiro/conciliacao`, `/financeiro/configuracoes` | J63, J65 | `FinanceiroPage`, F20 fecha | implementada |
| `/conversas` | J3 | `ConversasPage`; configuração de agentes excluída | implementada |
| `/funil` | J55 | `FunilPage`, F19 fecha | implementada |
| `/documentos/pacotes`, `/documentos/orcamentos`, `/documentos/contratos`, `/documentos/anamnese` | J24, J54, J26, J5 | `DocumentsPackagesPage`, F19 fecha | implementada |
| `/relatorios` | J36 | `ReportsPage` | implementada |
| `/growth`, `/campanhas`, `/rfm`, `/recompensas` | J19, J37, J9, J16 | `GrowthPage`, F21 fecha | implementada |
| `/aniversariantes`, `/parceiros` | J58, J48 | F21 | planejada |
| `/agentes` | J20, J21 | configuração existente reutilizada; F22 fecha UX | parcial |
| `/estoque` | J22 | F20 | planejada |
| `/planos` | J11 | `PlanosPage` | implementada |
| `/configuracoes` | J18 | `ConfiguracoesPage`, F19 fecha subáreas | implementada |
| `/mais` | navegação | `MorePage` derivada do registro | implementada |

Aliases profissionais: `/upgrade`, `/documentos-pacotes`, `/pacotes`, `/orcamentos`, `/contratos`, `/configuracoes/assistente`, `/configuracoes/pagamento` e `/configuracoes/plano`.

## Admin

| Rota canônica | Domínio | Implementação ou fase dona | Estado |
|---|---|---|---|
| `/dashboard` | visão plataforma | `AdminDashboardPage`; F23 amplia | implementada |
| `/profissionais` | operação SaaS | `ProfessionalsPage` | implementada |
| `/planos` | billing | `PlanosPage`; F23 amplia | implementada |
| `/embaixadores` | afiliados/parceiros plataforma | `EmbaixadoresPage`; F24 amplia | implementada |
| `/agentes` | agentes globais | `AgentesPage`; F23 amplia | implementada |
| `/melhorias` | feedback | `MelhoriasPage` | implementada |
| `/broadcast` | comunicação plataforma | `BroadcastPage`; F24 amplia | implementada |
| `/nexus` | ações auditáveis | `NexusPage` | implementada |
| `/analytics`, `/configuracoes`, `/leads` | plataforma | F23/F24 após preflight | planejada |

Aliases admin: `/afiliados` para `/embaixadores`; `/campanhas` e `/notificacoes` para `/broadcast`.

## Client e público

Todas as rotas client/públicas existentes são declaradas em `apps/client/src/routes.ts`, com tipo de acesso e fase dona. Nenhuma delas pode ser recriada no professional. Expansões da experiência client pertencem à Fase 25.

## Gates

- Toda rota planejada precisa de preflight aprovado antes da implementação.
- Rota desconhecida gera 404 controlado.
- Hubs usam URL canônica ou query param estável; não mantêm estado importante apenas em memória.
- Toda mudança de rota deve atualizar o registro tipado, esta matriz e o PRD-FRONTEND.
