# Fase 18 — Relatório de Validação

Data: 2026-06-12  
Decision Owner: Ismael

## Validações executadas

- `npm run typecheck --workspace=@iaprafaturar/professional`: passou.
- `npm run typecheck --workspace=@iaprafaturar/admin`: passou.
- `npm run typecheck --workspace=@iaprafaturar/client`: passou.
- `npm run lint`: passou em todos os workspaces.
- `npm run build`: passou em todos os workspaces.
- `git diff --check`: passou.
- Busca por links legados fora dos registros: nenhum alias legado remanescente; `/campanhas` aparece apenas como URL canônica no hub Growth.
- Busca por testes Playwright/Vitest existentes: nenhum harness de teste de frontend encontrado.

## Evidências funcionais por implementação

- Menus professional desktop/mobile/Mais e admin consomem registros tipados.
- Client consome registro tipado com tipo de acesso e fase dona.
- Aliases geram `Navigate replace`; rotas desconhecidas geram 404 controlado.
- Hubs financeiro, documentos e growth refletem subárea na URL.
- Recovery envia resposta neutra e reset exige sessão com marcador/evento de recuperação antes de alterar a senha.
- Rotas públicas de cliente permanecem no client; o professional mantém apenas autenticação pública do profissional.

## Limites e dívida registrada

- Não existe suíte E2E no repositório para validar URLs em navegador; a navegação direta foi validada estruturalmente pelo router tipado e pelo build.
- O build reporta chunks principais acima de 500 kB no professional e admin. A Fase 18 preserva lazy loading por página e não adiciona carregamento eager; otimização adicional deve ser medida e tratada na Fase 26.
- O envio real de e-mail e consumo de token de recovery dependem da configuração Supabase do ambiente implantado; a integração foi validada por contrato SDK e compilação.
