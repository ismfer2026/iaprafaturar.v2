# Fase 18 — Registro de Decisões

Este documento registra decisões finais de rotas, ownership, consolidação, descarte e prioridade tomadas durante a Fase 18.

## Governança

- Decision Owner final: Ismael, proprietário do produto
- Escalação: conflitos sem resolução objetiva são apresentados com opções, impactos, contratos v2 envolvidos e recomendação. O Decision Owner registra a decisão final.
- Regra: nenhuma decisão crítica da matriz canônica pode permanecer como “a decidir depois”.

## Template de decisão

### DEC-18-XXX — Título

- Status: `proposta` | `aprovada` | `substituída`
- Data:
- Decision Owner:
- Apps/domínios afetados:
- Jornadas afetadas:
- Problema:
- Opções avaliadas:
- Decisão:
- Justificativa:
- Rota canônica:
- Aliases/redirects:
- Contratos DB v2 envolvidos:
- Componentes/hooks reutilizados:
- Fases impactadas:
- Riscos e mitigação:
- PRDs que precisam ser sincronizados:

## Decisões aprovadas

### DEC-18-001 — Registros de rota como fonte de verdade

- Status: `aprovada`
- Data: 2026-06-12
- Decision Owner: Ismael
- Decisão: `apps/professional/src/routes.ts`, `apps/admin/src/routes.ts` e `apps/client/src/routes.ts` são as fontes de verdade de rotas em runtime. Shells e menus devem derivar desses registros.
- Justificativa: elimina declarações paralelas entre router, desktop, mobile e página Mais.
- Fases impactadas: 18-26.

### DEC-18-002 — Rotas profissionais consolidadas

- Status: `aprovada`
- Data: 2026-06-12
- Decision Owner: Ismael
- Decisão: `/growth` é hub; `/campanhas`, `/rfm` e `/recompensas` são URLs canônicas do mesmo domínio. `/documentos/pacotes`, `/documentos/orcamentos`, `/documentos/contratos` e `/documentos/anamnese` são URLs canônicas do hub documental. `/financeiro/conciliacao` e `/financeiro/configuracoes` são URLs canônicas do hub financeiro.
- Aliases: `/documentos-pacotes` e `/pacotes` redirecionam para `/documentos/pacotes`; `/orcamentos` e `/contratos` redirecionam para suas subáreas canônicas.
- Justificativa: mantém navegação direta estável sem duplicar páginas, componentes ou regras.
- Fases impactadas: 19-21.

### DEC-18-003 — Agentes e configurações

- Status: `aprovada`
- Data: 2026-06-12
- Decision Owner: Ismael
- Decisão: `/agentes` é a única rota profissional para configuração da Rosane. `/configuracoes/assistente` redireciona para `/agentes`. `/conversas` mantém somente operação inline, takeover e shadow.
- Justificativa: remove sobreposição entre as Fases 5 e 22.
- Fases impactadas: 19 e 22.

### DEC-18-004 — Fronteiras dos três apps

- Status: `aprovada`
- Data: 2026-06-12
- Decision Owner: Ismael
- Decisão: `/parceiros` é profissional; `/embaixadores` e `/broadcast` são admin; fluxos públicos e do cliente pertencem ao app client. `/afiliados` redireciona para `/embaixadores`; `/campanhas` e `/notificacoes` admin redirecionam para `/broadcast`.
- Justificativa: impede mistura de tenancy, permissões e objetivos entre profissional, plataforma e cliente.
- Fases impactadas: 21, 24 e 25.

### DEC-18-005 — Compatibilidade e falhas de navegação

- Status: `aprovada`
- Data: 2026-06-12
- Decision Owner: Ismael
- Decisão: `/upgrade` redireciona para `/planos`; `/configuracoes/pagamento` para `/financeiro/configuracoes`; `/configuracoes/plano` para `/planos`. Rotas desconhecidas exibem 404 controlado, sem redirecionamento silencioso.
- Justificativa: preserva links existentes e torna erros de rota observáveis.
- Fases impactadas: 18-26.

### DEC-18-006 — Autoridade contratual

- Status: `aprovada`
- Data: 2026-06-12
- Decision Owner: Ismael
- Decisão: somente banco, migrations, RPCs, policies e Functions consolidadas da v2 podem comprovar contratos backend. A v1 serve exclusivamente como evidência de frontend, recurso ou jornada.
- Justificativa: evita reintroduzir duplicidades e inconsistências da v1.
- Fases impactadas: 18-26.
