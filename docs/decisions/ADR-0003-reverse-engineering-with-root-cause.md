# ADR-0003 - Reverse Engineering Com Causa Raiz

## Contexto

O sistema v1 cresceu de forma incremental, conforme novas ideias surgiam. Apenas documentar "como está hoje" pode transformar bugs em design oficial.

## Opções consideradas

1. Documentar somente o comportamento atual.
2. Documentar comportamento atual e comportamento desejado.
3. Documentar comportamento atual, comportamento desejado e causa raiz da divergência.

## Decisão

Todo reverse engineering deve usar três colunas:

```txt
Como está hoje | Como deveria ser | Por que divergiu
```

## Consequências

- Bugs não viram especificação.
- A causa raiz fica explícita.
- A v2 evita repetir a mesma falha com outra implementação.
- Cada fluxo documentado vira base para teste de regressão e migração.
