# Definition Of Done Por Fluxo

Cada fluxo de produto deve terminar com critérios verificáveis.

Uma feature não está pronta apenas porque compila. Ela está pronta quando o fluxo funciona ponta a ponta e pode ser diagnosticado.

## Critérios Obrigatórios

- O fluxo tem documento em `docs/product-flows`.
- As invariantes aplicáveis foram listadas.
- Os eventos emitidos foram definidos.
- Inputs e outputs dos componentes foram descritos.
- Estados alterados foram listados.
- Logs obrigatórios foram definidos.
- Testes ou comandos de validação foram descritos.
- Cenários de falha foram considerados.

## Template

```md
## Definition Of Done

- [ ] Evento `x.y.z` registrado.
- [ ] Estado esperado atualizado.
- [ ] Nenhuma invariante violada.
- [ ] Nenhum log de erro inesperado.
- [ ] Query SQL de validação retorna o resultado esperado.
- [ ] Teste manual/mobile definido.
- [ ] Rollback/fallback documentado.
```

## Regra De Portão

Nenhum fluxo avança para a próxima fase sem logs e Definition Of Done aprovados.
