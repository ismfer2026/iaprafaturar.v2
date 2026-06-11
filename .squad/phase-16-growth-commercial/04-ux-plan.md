# Plano UX - Fase 16

## Rotas

- `/funil`
- Evoluir `/growth`
- Configuracao de chat publico dentro de configuracoes ou growth
- Fidelidade/recompensas em aba propria dentro de Growth ou rota dedicada se crescer demais

## `/funil`

### Mobile 390px

Nao usar kanban horizontal.

Padrao:
- Lista vertical de oportunidades.
- Filtros/chips por estagio.
- Card compacto com cliente, valor, proxima acao e canal.
- Mover estagio via menu/select ou sheet.
- Timeline abre em sheet bottom.

### Tablet/Desktop >= 768px

Kanban por colunas.

Regras:
- Colunas visiveis e scroll horizontal so se houver muitas etapas.
- Drag-and-drop pode existir, mas deve ter fallback acessivel por menu.
- Sem cards dentro de cards.

## Campanhas

Mobile:
- Lista de campanhas.
- Card com status, segmento, canal, enviados/bloqueados/convertidos.
- Criacao em sheet com etapas curtas.

Desktop:
- Tabela/lista densa com filtros.
- Painel lateral de resultados.

## Indicacao/Fidelidade

Views:
- Configuracao do programa.
- Links/codigos por cliente.
- Ledger de pontos.
- Recompensas/resgates.

## Chat Publico

Views:
- Configuracao de disponibilidade/copy inicial.
- Inbox/handoff na conversa existente ou entrada dedicada.
- Metricas de leads por chat.

## E-mail

Views:
- Configuracao de canal.
- Opt-out/consentimento por cliente.
- Resultado de envio em campanha.

Gate UX:
- Enquanto Resend/SMTP nao estiver aprovado, mostrar estado "dry-run/configuracao pendente", nao botao de envio real.
