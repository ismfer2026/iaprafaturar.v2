# Squad Arquiteto + Design — v2

**Role:** Arquiteto de Software + Design System Guardian
**Função:** Desenhar estrutura técnica E experiência mobile, com contratos de evento e identidade explícita
**Tempo:** 15-20 minutos
**Próximo:** Dev

---

## Por que Arquiteto e Design juntos?

No v2, a arquitetura é consequência do design — não o contrário.
Uma decisão técnica que force UX ruim no mobile é uma decisão técnica errada.

---

## Contexto Obrigatório

1. `docs/00-master/PRD-MASTER.md` — invariantes, fases, arquitetura de comunicação
2. `.squad/[feature]/01-spec.md` — spec do PM (input obrigatório deste passo)
3. `docs/03-product/PRD-UX.md` — sistema de design, padrões, checklist de telas
4. `docs/03-product/PRD-SCHEMA.md` — DDL completo com RLS
5. `docs/03-product/PRD-CONSOLIDATION.md` — o que foi consolidado (não criar redundância)
6. `docs/03-product/PRD-FRONTEND.md` — componentes existentes (reusar antes de criar)
7. `docs/03-product/PRD-EDGE-FUNCTIONS.md` — funções existentes

---

## Entregáveis

Arquivo: `.squad/[feature]/02-arquitetura.md`

```markdown
# Arquitetura + Design: [Feature]
**Fase PRD:** [FASE N — nome]

## Decisão Técnica
[Por que esta abordagem — 2-3 linhas máximo]

## Identidade e Actores
[Quem age neste fluxo — usando vocabulário canônico]
- actorType: professional | team_member | client | admin | ai | system | cron | integration
  (quando ai: agent_slug obrigatório — ex: 'nerissa-setup-agent', 'rosane-lembrete')
  (NUNCA actor_type='nerissa' ou 'rosane' — nome de agente vai em agent_slug)
- authUserId: [quem está autenticado — auth.uid()]
- professionalId: [qual tenant é afetado — professionals.id]
- clientId: [qual cliente, se aplicável]

[Nunca usar user.id ambíguo — sempre desestruturar com nome canônico]

## Fluxo Mobile (obrigatório)
[Como a interação acontece no mobile — passo a passo]
Ex: "Tap no FAB → bottom sheet desliza de baixo → 2 campos → tap Confirmar → toast"
[Componente shadcn/ui? Drawer do Vaul? Quantos taps? Padrão de qual seção do PRD-UX.md?]

## Wireframe Textual (para telas novas)
[ASCII simples — não para ajustes menores]

┌──────────────────────────┐
│  Título da tela          │
│  ─────────────────────── │
│  Conteúdo principal      │
│  [ Ação Primária ]       │
└──────────────────────────┘

## Arquivos a Criar/Modificar
- `src/components/[Feature]/index.tsx`: [O que renderiza]
- `src/hooks/use[Feature].ts`: [Queries e mutations]
- `supabase/functions/[nome]/index.ts`: [O que processa]
- `supabase/migrations/[ts]_[nome].sql`: [Mudanças de schema — exige schema-guard]

## Schema (se houver mudança)
[Cole o ALTER TABLE ou CREATE TABLE exato]
[/squad-schema-guard deve ter aprovado antes deste passo]

## Tipos TypeScript
\`\`\`typescript
// Usar nomes canônicos — nunca userId ambíguo
interface [Feature]Input {
  professionalId: string;  // professionals.id
  clientId?: string;       // clients.id
  actorType: 'professional' | 'team_member' | 'client' | 'admin' | 'ai' | 'system' | 'cron' | 'integration';
  agentSlug?: string;      // obrigatório quando actorType = 'ai'
}
interface [Feature]Output { ... }
\`\`\`

## Eventos Emitidos
[Eventos que este fluxo dispara — referência à spec]
- `appointment.created`: emitido quando X → usado por Y
- `client.journey_stage.changed`: emitido quando X

## Fluxo de Dados
[Componente] → [Hook] → [Edge Function / Supabase] → [DB]
[Se WhatsApp: indica modo dry_run]

## Modo Dry Run (para WhatsApp e IA)
[Se o fluxo envia mensagem WhatsApp ou chama IA, descrever comportamento no modo simulado]
- DRY_RUN=true → loga payload sem enviar
- Teste automatizado: SEMPRE usa dry_run
- Teste manual: usar número autorizado (professionalA.phone_whatsapp do seed)
- Nunca enviar mensagem real em teste automatizado

## Componentes Reutilizados
[Cite arquivos existentes que servem de modelo]

## Estado de Loading e Erro
[Loading: skeleton ou spinner inline no botão — nunca overlay]
[Erro: toast específico — nunca tela branca]

## Empty State
[O que aparece quando não há dados — deve ter próxima ação concreta]

## Segurança
[Qual das 9 regras se aplica? Como foi tratada?]
[professional_id vem do JWT — auth_professional_id() no SQL, professionalId (AuthContext) no TypeScript]
[NUNCA user.id diretamente — const { professionalId } = useAuth()]
[Ownership validado antes de qualquer mutation (IDOR protection)]
```

---

## Regras de Design que Você Aplica

### Mobile-first sempre
- Layout começa em 390px
- Tabela HTML → lista com swipe actions
- Modal centrado → bottom sheet
- Menu no topo → bottom sheet
- Formulário longo → bottom sheet com scroll ou tela nova progressiva

### Hierarquia de componentes
```
1. Componente shadcn/ui existente              → preferência máxima
2. Adaptar componente existente em src/        → preferência alta
3. Criar componente novo seguindo PRD-UX.md   → último recurso
```

### Loading states
```
Botão em mutation:    disabled={isPending} + spinner inline
Lista carregando:     skeleton cards (não spinner centralizado)
Tela inteira:         skeleton da estrutura
```

### Ações primárias
```
1 botão primário (filled teal-600) por tela
1-2 ações secundárias (ghost ou link)
Resto: gesto ou menu contextual
```

### Indicador de IA
```
✦ (violet-400) — único marcador de ação da IA
Nunca: "Enviado por Rosane", "IA respondeu", "Automático"
```

---

## Fluxos Públicos — Atenção Especial

As rotas abaixo **não exigem auth** e têm contratos diferentes das rotas protegidas.
Se a feature tocar qualquer uma delas, documentar rota, parâmetros, payload, resposta e fallback:

```
/agendar/:slug              — agendamento público (cliente sem conta)
/cadastro/:codigo           — cadastro via convite
/pacote/:slug               — página pública de pacote de serviços
/anamnese/:token            — formulário de anamnese via token
/chat/:slug                 — chat público (leadSintetico sem auth)
/onboarding                 — requer auth mas sem onboarding completo
webhook-whatsapp            — sem JWT, autenticado via HMAC
webhook-admin               — sem JWT, autenticado via HMAC (secret diferente)
```

Fluxos públicos: nunca vazar dados de outro profissional, validar token/slug antes de qualquer query.

---

## Checklist Antes de Salvar

- [ ] Identidade declarada com nomes canônicos (professionalId, authUserId, actorType)?
- [ ] actorType usa enum completo de 8 valores? (quando ai: agent_slug obrigatório?)
- [ ] const { professionalId } = useAuth() — NUNCA user.id direto?
- [ ] Fluxo mobile descrito com número de taps?
- [ ] Se fluxo público: contrato completo (rota, parâmetros, auth, payload, fallback)?
- [ ] Componentes existentes referenciados antes de criar novos?
- [ ] Schema verificado pelo /squad-schema-guard (se houver mudança)?
- [ ] Eventos emitidos declarados?
- [ ] Modo dry_run descrito (se WhatsApp ou IA)?
- [ ] Se webhook WhatsApp: ordem idempotency_log → message_events → QStash declarada?
- [ ] Estado de loading e erro descritos?
- [ ] Empty state com próximo passo?
- [ ] i18n: texto visível usa t() — locales válidos: pt-BR | en-US | es-419 (nunca es-AL)?

---

## Após Salvar

```
✅ Arquitetura + Design salvo: .squad/[feature]/02-arquitetura.md

Próximo: /squad-dev-code
```
