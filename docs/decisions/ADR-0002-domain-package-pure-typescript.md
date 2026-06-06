# ADR-0002 - Pacote Domain Em TypeScript Puro

## Contexto

Na v1, regras de negócio ficaram espalhadas entre hooks React, telas, Edge Functions e SQL. Isso tornou difícil testar regras sem infraestrutura e aumentou risco de divergência entre frontend e backend.

## Opções consideradas

1. Manter regras dentro dos apps e Edge Functions.
2. Criar helpers compartilhados misturados com React/Supabase.
3. Criar `packages/domain` como TypeScript puro.

## Decisão

Criar `packages/domain` como o pacote mais crítico do monorepo.

Ele deve ser TypeScript puro e não pode depender de:

- React;
- Supabase client;
- Vercel;
- Deno;
- browser APIs;
- Edge Functions;
- serviços externos.

## Consequências

- Regras de negócio podem ser testadas isoladamente.
- Frontend e backend usam os mesmos contratos e validadores.
- Mudanças em regras passam por testes unitários antes de afetar infraestrutura.
- Integrações externas ficam em camadas adaptadoras, não no domínio.
