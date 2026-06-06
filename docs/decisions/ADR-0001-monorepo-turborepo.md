# ADR-0001 - Monorepo Com Turborepo

## Contexto

O iaprafaturar possui dois apps principais: CRM do profissional e Admin da plataforma. Eles compartilham banco de dados, Edge Functions, regras de negócio, tipos, contratos, billing, WhatsApp e agentes.

Na v1, separar responsabilidades em estruturas pouco coordenadas criou drift entre frontend, backend e regras de negócio.

## Opções consideradas

1. Dois repositórios separados: um para CRM e outro para Admin.
2. Um repositório único sem orquestrador.
3. Um monorepo com Turborepo.

## Decisão

Usar um único repositório `iaprafaturar-v2` com Turborepo.

Estrutura alvo:

```txt
apps/
  professional/
  admin/
packages/
  domain/
  shared/
  ui/
supabase/
docs/
contracts/
```

## Consequências

- Admin e CRM compartilham a mesma fonte de verdade.
- Tipos, contratos e regras podem ser testados em um só pipeline.
- Deploys continuam separados por app.
- Mudanças em schema, Edge Functions e regras de negócio ficam rastreáveis.
- O setup inicial exige disciplina de workspace, scripts e CI desde o começo.
