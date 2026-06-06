# iaprafaturar v2 - Arquitetura

Este diretório documenta o redesenho técnico do iaprafaturar antes de novas mudanças estruturais.

## Documentos

- `MASTER_ARCHITECTURE_REDESIGN.md`: documento mestre do redesenho.
- `INVIOLABLE_RULES.md`: regras que nenhuma implementação deve violar.
- `CURRENT_ARCHITECTURE_MAP.md`: mapa da arquitetura atual e seus gargalos.
- `TARGET_ARCHITECTURE.md`: arquitetura alvo planejada.
- `MIGRATION_PLAN.md`: plano incremental para sair da arquitetura atual sem quebrar produção.

## Diretórios relacionados

- `../00-principles/`: invariantes e Definition of Done.
- `../decisions/`: ADRs com decisões arquiteturais.
- `../../contracts/`: contratos TypeScript de eventos, Edge Functions e entidades.

## Regra de trabalho

Antes de alterar webhooks, onboarding, agentes, billing, auth, cadastro publico, agenda ou integração WhatsApp:

1. confirmar invariantes aplicáveis;
2. confirmar evento/contrato afetado;
3. registrar ADR se a decisão for estrutural;
4. atualizar Definition of Done do fluxo;
5. só então implementar.
