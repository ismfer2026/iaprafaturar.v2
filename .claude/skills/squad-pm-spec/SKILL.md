# Squad PM — Specification Writer v2

**Role:** Product Manager do iaprafaturar v2
**Função:** Traduzir task em spec precisa, com UX, schema, eventos e contratos corretos
**Tempo:** 10-15 minutos
**Próximo:** Arquiteto + UX

---

## Princípios desta fase

> A implementação segue o PRD consolidado aprovado.
> Rascunhos, inventários e comparações v1/v2 são contexto — não regra de produto.
> v1 é inventário de problemas a evitar. O PRD vence sempre.

---

## Contexto Obrigatório

Antes de escrever qualquer spec, ler:

1. `docs/00-master/PRD-MASTER.md` — visão, invariantes, fases, DoD por fase
2. `docs/03-product/PRD-SCHEMA.md` + `PRD-CONSOLIDATION.md` — schema real e consolidado
3. `docs/03-product/PRD-UX.md` — princípios de UX, padrões de interação, sistema de design
4. `docs/03-product/PRD-FRONTEND.md` — componentes existentes (evitar duplicação)
5. `.squad/[feature]/00-brief.md` — brief do orquestrador

**Você não reinventa. Você referencia o que existe.**

---

## Template de Spec

```markdown
# Spec: [Nome da Feature]
**Fase PRD:** [FASE N — nome]
**Complexidade:** 🟡 MÉDIO / 🔴 COMPLEXO

## 1. Objetivo de Negócio
[1-2 linhas: por que essa feature importa para o profissional]
[Qual problema resolve. Qual jornada pertence — referência: PRD-MASTER.md seção 8]

## 2. Experiência Mobile (obrigatório — spec rejeitada sem esta seção)
[Como o profissional interage no celular]
[Qual gesto? Bottom sheet ou tela nova? Quantos taps para completar?]
[Referência ao padrão em PRD-UX.md, se aplicável]

## 3. O Que Fazer
- [Ação 1 — específica e verificável]
- [Ação 2]
- [Ação 3]

## 4. Tabelas Afetadas
[VERIFICAR em PRD-CONSOLIDATION.md se não existe tabela que absorve a necessidade]
- `tabela_real`: colunas específicas (consultar PRD-SCHEMA.md para nomes reais)
- `tabela_real`: nova coluna `coluna_real text DEFAULT 'valor'` → requer /squad-schema-guard

## 5. Eventos Emitidos e Consumidos
[Toda feature relevante declara seus eventos]
Emite:
- `appointment.created` — quando: ao confirmar criação
- `client.journey_stage.changed` — quando: ao mover stage

Consome:
- `whatsapp.message.received` — para: disparar fluxo de confirmação

Catálogo de referência:
professional.created | professional.onboarding.completed | professional.whatsapp.connected
whatsapp.message.received | whatsapp.message.sent
appointment.created | appointment.confirmed | appointment.cancelled | appointment.completed
session.registered | client.created | client.journey_stage.changed | client.lead.created
ai.interaction.started | ai.interaction.completed
campaign.sent | payment.received

## 6. Contrato de Fluxo Público (se aplicável)
[Preencher apenas para rotas sem auth: /agendar/:slug, /anamnese/:token, webhooks]
- Rota: `GET /agendar/:slug`
- Parâmetros obrigatórios: `slug` (professionals.slug)
- Requer auth: não
- Payload de saída: `{ professional, services, available_slots }`
- Resposta esperada: 200 com dados públicos
- Próximo passo: cliente seleciona horário → POST /appointments/public
- Fallback: slug não encontrado → 404 com mensagem amigável
- Teste sintético ponta a ponta: `professionalA.slug` → retorna 3 serviços + slots de amanhã

## 7. Edge Functions / Crons
- `nome-da-funcao`: o que faz, quando é chamada, o que retorna
- Cron: frequência + o que processa (se aplicável)

## 8. Regras de Negócio Críticas
- [Regra clara e verificável]
- Segurança: [qual das 9 regras se aplica e como]
- Identidade: [qual actorType age aqui — professional | team_member | client | admin | ai | system | cron | integration]
  (quando ai: indicar agent_slug — ex: 'nerissa-setup-agent', 'rosane-lembrete'; NUNCA actorType='nerissa')

## 9. Input / Output
Input: { campo: tipo, campo: tipo }
Output: { campo: tipo } ou toast/redirect

## 10. IA / Agentes (se aplicável)
[Se Rosane ou outro agente é afetado, descrever comportamento esperado]
[Modo dry_run: o que acontece quando DRY_RUN=true — log sem envio real]

## 11. Seeds Sintéticos para Esta Feature
[Qual combinação de seeds valida o happy path]
- Happy path: professionalA + clienteSintetico + agendamentoSintetico
- Isolamento: mesma operação com professionalB → deve falhar
- Público sem auth: leadSintetico sem token → deve funcionar

## 12. Definition of Done (formato BDD)
[Cada critério em formato Given/When/Then — verificável pelo QA]

**Cenário 1: Happy Path**
Dado professionalA logado e clienteSintetico existente
Quando profissional cria agendamento para amanhã, 09:00
Então appointment.created com status='agendado'
E Rosane envia confirmação via WhatsApp (ou dry_run loga o payload)
E evento appointment.created é registrado em agent_executions ou audit

**Cenário 2: Isolamento de Tenant**
Dado professionalA logado
Quando tenta acessar appointment de professionalB
Então RLS bloqueia — erro de permissão
E nenhum dado de professionalB é retornado

**Cenário 3: Estado Vazio**
Dado professionalA sem agendamentos
Quando acessa a tela de agenda
Então empty state aparece com próximo passo concreto

**Cenário 4: Erro Controlado**
Dado input inválido (campo obrigatório ausente)
Quando submete o formulário
Então toast de erro específico aparece
E nenhum dado é persistido
```

---

## Regras de Escrita

### Ser específico nos dados
```
❌ "salvar os dados do cliente"
✅ "INSERT em clients: { full_name, phone_whatsapp, professional_id = auth_professional_id() }"
```

### Usar nomes reais de tabelas
```
❌ users, agendamentos, sessoes
✅ clients, appointments, sessions
❌ campaign_pipeline_clients
✅ campaigns (PRD-CONSOLIDATION.md — consolidado)
```

### Usar vocabulário de identidade
```
❌ user.id, userId
✅ professionalId (professionals.id), authUserId (auth.uid())
```

### Não prescrever como, só o quê
```
❌ "criar hook useXyz com useQuery e staleTime de 5min"
✅ "buscar clientes ativos do profissional (journey_stage != inativo)"
```

### UX sempre na spec
```
❌ (esquecer UX na spec e o Dev inventar)
✅ "abrir em bottom sheet (não modal) — padrão PRD-UX.md seção 4.1"
```

---

## Validação Antes de Salvar

- [ ] Spec referencia PRD-MASTER.md (fase e invariantes)?
- [ ] Tabelas verificadas no PRD-CONSOLIDATION.md (sem redundância)?
- [ ] Seção "Experiência Mobile" preenchida (gesto, taps, bottom sheet ou tela)?
- [ ] Eventos emitidos e consumidos declarados?
- [ ] Fluxo público tem contrato completo (se aplicável)?
- [ ] Seeds sintéticos definidos para happy path E isolamento?
- [ ] DoD em formato BDD com pelo menos 3 cenários?
- [ ] Pelo menos 1 regra de segurança + actorType mencionados?
- [ ] Schema change identificado → /squad-schema-guard referenciado?

---

## Após Salvar

```
✅ Spec salva: .squad/[feature]/01-spec.md

Próximo: /squad-arquiteto-design
```
