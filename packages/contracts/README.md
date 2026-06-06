# Contracts

Esta pasta conecta documentação e código.

Contratos devem ser TypeScript com validação runtime, preferencialmente Zod.

Interfaces TypeScript sozinhas não bastam porque somem no build. Toda borda do sistema deve validar entrada e saída em runtime.

Contratos devem representar:

- eventos;
- inputs/outputs de Edge Functions;
- entidades de domínio;
- erros esperados.

## Regra

Se um contrato mudar no código, o arquivo correspondente em `contracts/` deve mudar junto.

No futuro, o CI deve validar que apps, packages e Edge Functions respeitam estes contratos.

## Padrão

Cada contrato de borda deve expor:

```ts
export const SomeInputSchema = z.object({})
export type SomeInput = z.infer<typeof SomeInputSchema>
export function validateSomeInput(input: unknown): SomeInput {
  return SomeInputSchema.parse(input)
}
```

Validações devem acontecer:

- quando o webhook recebe payload;
- quando QStash entrega payload;
- quando uma Edge Function é chamada;
- quando um agent retorna resposta;
- antes de persistir estado crítico.
