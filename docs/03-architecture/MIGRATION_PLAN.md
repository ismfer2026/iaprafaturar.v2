# Plano De Migração

> **Documento histórico — planejamento da transição v1 → v2.**
> Referências a tabelas v1 como `whatsapp_inbound_events` refletem o estado antes da consolidação.
> Na v2, essas tabelas foram consolidadas em `message_events` (ver `docs/03-product/PRD-SCHEMA.md`).
> **Não usar como roteiro de implementação.** Roteiro atual: `docs/01-execution/EXECUTION-PRD.md`.

## Fase 1: Documentação E Congelamento

- Mapear fluxos críticos.
- Listar functions existentes.
- Listar tabelas críticas.
- Definir regras invioláveis.
- Marcar zonas de risco.
- Registrar ADRs estruturais.
- Criar contratos iniciais em `contracts/`.

## Fase 2: Auth/Tenant E Observabilidade

- Confirmar identidade e isolamento tenant.
- Usar `whatsapp_inbound_events` como log operacional de entrada.
- Padronizar logs de rota e resultado.
- Evitar consultas operacionais em JSON.
- Criar queries rápidas de diagnóstico.
- Nenhum fluxo novo avança sem logs e Definition of Done.

## Fase 3: WhatsApp E Roteamento

- Padronizar parser de Evolution Go.
- Documentar formatos aceitos.
- Separar claramente:
  - Nerissa/plataforma;
  - instância do profissional.
- Garantir que lead desconhecido da plataforma vire lead e não seja rejeitado.
- Garantir que cliente desconhecido dentro da instância do profissional seja tratado no contexto daquele profissional.

## Fase 4: Classificação Com Contexto

- Criar contrato de classificação.
- Ler histórico/contexto ativo quando existir.
- Definir quando silenciar conversa privada.
- Definir quando criar lead/cliente.
- Definir quando acionar agenda.

## Fase 5: Onboarding Profissional

- Revisar onboarding público.
- Revisar criação de conta.
- Revisar Nerissa setup pós-conta.
- Garantir que cadastro de profissional não se misture com cadastro de cliente.

## Fase 6: Agenda E Confirmações

- Mapear estados da agenda.
- Mapear quem pode alterar cada estado.
- Garantir atualização por contexto correto.
- Garantir que confirmação por WhatsApp não busque telefone globalmente.

## Fase 7: Billing, Planos E Créditos

- Consolidar regras de planos.
- Consolidar trial/free.
- Garantir que fluxos pré-conta não dependam de créditos.
- Garantir que cron/agentes usem créditos corretos por profissional.

## Fase 8: Limpeza E Remoção

- Remover fallbacks legados.
- Remover referências a Evolution API.
- Remover funções duplicadas ou mortas.
- Consolidar helpers compartilhados.

## Critério Para Não Reescrever Do Zero

Não reescrever uma área se:

- o contrato pode ser estabilizado;
- os dados atuais podem ser migrados;
- o fluxo pode ser isolado;
- há como validar incrementalmente.

Reescrever apenas se:

- o modelo de dados estiver estruturalmente errado;
- a correção incremental for mais arriscada que substituir;
- a área não tiver contrato recuperável.
