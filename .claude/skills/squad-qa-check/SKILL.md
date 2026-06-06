# Squad QA — Quality + UX Validator v2

**Role:** QA Engineer + UX Auditor
**Função:** Validar código, cenários sintéticos, segurança, experiência mobile e eventos
**Tempo:** 15-25 minutos
**Próximo:** Deploy (aprovado) ou Dev (críticos encontrados)

---

## Princípio desta fase

> Não há usuários reais. QA valida contra seeds sintéticos e critérios do PRD.
> Um componente que funciona mas viola PRD-UX.md é um bug — não uma sugestão.

---

## Contexto Obrigatório

Ler sem pedir ao usuário:

1. `docs/00-master/PRD-MASTER.md` — invariantes, DoD por fase
2. `.squad/[feature]/01-spec.md` — o que deveria fazer (inclui DoD em BDD)
3. `.squad/[feature]/02-arquitetura.md` — como deveria ser estruturado
4. `.squad/[feature]/03-codigo.md` — resumo do que foi feito
5. `docs/03-product/PRD-UX.md` — padrões de UX (seções 3 e 4)
6. `CLAUDE.md` — 9 regras de segurança

---

## Processo de Validação

### Passo 1: Build + Lint

```bash
npm run lint   # falhou → 🔴 CRÍTICO, parar
npm run build  # falhou → 🔴 CRÍTICO, parar
```

### Passo 2: Spec Compliance (BDD)

Para cada cenário BDD em `01-spec.md`:

```
Given [contexto do seed sintético]
When [ação]
Then [resultado esperado]

Status: ✅ PASS / ⚠️ PARTIAL / ❌ FAIL
```

Verificar obrigatoriamente:

```
□ Cenário happy path com professionalA + seeds corretos?
□ Cenário de isolamento: professionalB não vê dados de professionalA?
□ Cenário de fluxo público (se aplicável): sem auth funciona?
□ Cenário de estado vazio: empty state aparece com próximo passo?
□ Cenário de erro controlado: toast específico, sem tela branca?
□ Cenário de idempotência: operação repetida 2x tem resultado correto?
```

### Passo 3: Identidade e Segurança

```
□ professionalId desestruturado do AuthContext com nome canônico (const { professionalId } = useAuth())?
□ NUNCA user.id usado como professional_id sem desestruturar com nome semântico?
□ authUserId (auth.uid()) nunca usado como professional_id?
□ Toda query tem .eq("professional_id", professionalId) — nunca user.id diretamente?
□ actorType registrado com valor do enum completo:
    'professional' | 'team_member' | 'client' | 'admin' | 'ai' | 'system' | 'cron' | 'integration'?
□ Quando actor_type='ai': agent_slug preenchido (ex: 'nerissa-setup-agent', 'rosane-...')?
□ NUNCA actor_type='nerissa' ou actor_type='rosane' — nome de agente vai em agent_slug?
□ Nova tabela tem RLS com auth_professional_id()?
□ RPC tem validação de ownership antes de agir (IDOR protection)?
□ Dados de professionalB inacessíveis para professionalA?
□ PII não está em plaintext em respostas da API?
□ ON DELETE RESTRICT em dados financeiros?
```

Se qualquer item falhar → 🔴 CRÍTICO.

### Passo 4: Eventos e Fila

```
□ Eventos declarados na spec foram emitidos?
□ message_events registrado para toda mensagem enviada/recebida?
□ message_events.source_webhook e instance_name preenchidos (colunas reais, não JSONB)?
□ agent_executions registrado para toda execução de agente?
□ actorType correto nos registros de evento (enum completo de 8 valores)?
□ Quando actor_type='ai': agent_slug preenchido?
□ Logs imutáveis (nenhuma UPDATE/DELETE em tabelas de log)?
□ Se fluxo usa QStash: qstash_job_log registrado para published/consumed/failed?
□ Se webhook WhatsApp: idempotency_log recebeu claim ANTES de message_events?
    Ordem correta: idempotency_log → message_events → QStash
```

### Passo 5: WhatsApp e IA

```
□ dry_run=true em qualquer teste automatizado?
□ Nenhuma mensagem real enviada durante validação?
□ Payload que seria enviado está logado em DRY_RUN?
□ Números de teste são apenas os do seed sintético?
□ Modo dry_run retorna { dry_run: true, would_send: {...} }?
```

### Passo 6: Auditoria Mobile-UX

Verificar contra `PRD-UX.md`:

```
□ Tela tem exatamente 1 ação primária?
□ Formulário usa bottom sheet (não modal centrado)?
□ Loading é inline (skeleton ou spinner no botão)?
  → Nunca spinner centralizado / overlay de tela
□ Empty state tem próximo passo concreto (não só texto)?
□ Ações da IA usam apenas ✦ violet-400 (sem texto explicativo)?
□ Swipe actions onde a lista tem ações rápidas?
□ Tela funciona em viewport 390px?
□ Sem scroll horizontal?
□ Sem tabela HTML em mobile (usar lista com swipe)?
□ Máx 3 tamanhos de fonte na mesma tela?
```

Violação de UX-inviolável → 🔴 CRÍTICO.
Violação de padrão (não quebra experiência) → ⚠️ WARNING.

### Passo 7: Edge Cases

```
□ Input vazio / null: toast de erro específico?
□ Usuário sem dados (novo): empty state aparece?
□ Offline: queue ou bloqueio com mensagem?
□ Double tap no botão: protegido com disabled={isPending}?
□ Lista com muitos itens (50+): paginada ou virtual scroll?
□ Fluxo público sem auth: não vaza dados de outra clínica?
```

---

## Severidade

### 🔴 CRÍTICO — bloqueia merge
- Build ou lint falha
- Spec BDD não atendida (funcionalidade ausente ou errada)
- Qualquer das 9 regras de segurança violada
- `user.id` usado diretamente sem desestruturar como `professionalId`
- authUserId usado como professionalId
- actorType incorreto, ausente, ou fora do enum de 8 valores
- actor_type='nerissa' ou actor_type='rosane' (nome de agente como actorType)
- actor_type='ai' sem agent_slug preenchido
- Locale inválido: es-AL, es_AL, ou qualquer variante não-IETF (correto: es-419)
- Mensagem WhatsApp real enviada em teste (dry_run ignorado)
- Webhook WhatsApp sem claim de idempotência antes de message_events
- UX inviolável violada: modal onde deveria ser bottom sheet; overlay de loading; múltiplos botões primários

### ⚠️ WARNING — não bloqueia, Dev decide
- Padrão de código desalinhado com CLAUDE.md (mas funciona)
- UX subótima: falta animação, texto pouco claro
- Evento emitido com campos incompletos
- Seed não atualizado para nova coluna

### 🟢 OTIMIZAÇÃO — próxima iteração
- Tipo TypeScript mais específico possível
- Componente poderia ser mais reutilizável
- Índice de query poderia ser melhorado

---

## Template do QA Report

Arquivo: `.squad/[feature]/04-qa-report.md`

```markdown
# QA Report: [Feature]
**Data:** [data]

## Build
✅ lint: PASSOU
✅ build: PASSOU

## Spec BDD
| Cenário | Status |
|---|---|
| Happy path: professionalA + seeds | ✅ PASS |
| Isolamento: professionalB bloqueado | ✅ PASS |
| Estado vazio | ✅ PASS |
| Erro controlado | ⚠️ PARTIAL |

## Identidade e Segurança
| Verificação | Status |
|---|---|
| professionalId do AuthContext (não user.id direto) | ✅ |
| authUserId não usado como professionalId | ✅ |
| actorType registrado | ✅ |
| RLS com auth_professional_id() | ✅ |
| IDOR na RPC | ✅ |
| ON DELETE RESTRICT (financeiro) | N/A |

## Eventos
| Verificação | Status |
|---|---|
| appointment.created emitido | ✅ |
| agent_executions registrado | ✅ |
| Logs imutáveis | ✅ |

## WhatsApp / IA
| Verificação | Status |
|---|---|
| dry_run=true em teste automatizado | ✅ |
| Nenhuma mensagem real enviada | ✅ |
| Payload logado em DRY_RUN | ✅ |

## UX Mobile
| Critério | Status |
|---|---|
| 1 ação primária por tela | ✅ |
| Bottom sheet (não modal) | ✅ |
| Loading inline | ⚠️ usa overlay em 1 caso |
| Empty state com próximo passo | ✅ |
| ✦ para IA (sem texto) | ✅ |
| Funciona em 390px | ✅ |

## Bugs Críticos (🔴)
### [Se houver]
- **Onde:** src/components/Feature/index.tsx:45
- **Problema:** Loading overlay ao invés de inline spinner
- **Impacto:** Viola PRD-UX.md — usuário perde contexto durante save
- **Fix:** disabled={isPending} + <Loader2> no botão
- **Bloqueador:** SIM

## Warnings (⚠️)
### [Se houver]
- **Onde:** src/hooks/useFeature.ts:23
- **Sugestão:** staleTime poderia ser configurado para 30s
- **Bloqueador:** NÃO

## Otimizações (🟢)
[Lista]

## Veredito

**Status:** [✅ APROVADO | ❌ REPROVADO — X críticos]

**Próximo:**
- [Deploy / Dev fixa críticos e QA re-testa]
```

---

## QA Não Corrige Código Crítico

```
❌ QA encontra → QA corrige → re-testa
✅ QA encontra → documenta com precisão → Dev corrige → QA re-testa
```

Dev precisa entender o erro. Auto-fix esconde o problema.

---

## Após o Report

```
✅ APROVADO:
  "QA aprovado. Código pronto para merge."

❌ REPROVADO:
  "X bugs críticos. Dev fixa e chama /squad-qa-check novamente."
```
