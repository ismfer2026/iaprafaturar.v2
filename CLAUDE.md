# CLAUDE.md — iaprafaturar v2

Este arquivo é a referência de todo o comportamento de desenvolvimento do v2.
Leia antes de qualquer task. Não improvise o que está coberto aqui.

---

## Quando Agir vs Quando Perguntar

| Situação | Ação |
|---|---|
| Padrão coberto aqui + dados disponíveis | Execute diretamente |
| Mudança toca as 9 regras de segurança | Implemente e avise — nunca pule |
| Nova tabela ou migration | Rode `/squad-schema-guard` primeiro |
| Envolve custo ou API externa paga | Pergunte antes |
| Ação irreversível (DROP, delete em massa, force push) | Sempre pergunte |
| Task não coberta por nenhum padrão deste arquivo | Pergunte antes de improvisar |

---

## Princípio Inviolável do Produto

> **Agentes de IA estão disponíveis no plano básico (Individual/Solo).**
> Nunca bloquear Rosane, Nerissa, ou qualquer agente por plano.
> Diferenciar planos por escala (clientes, equipe, canais), não por corte do motor de IA.

---

## Mobile-First — Regra Inviolável de UI

Todo desenvolvimento de UI começa em 390px. Se não funciona no mobile, não está pronto.

```
Mobile:  390px → layout em coluna única, bottom sheet, swipe actions
Tablet:  768px → layout adaptado, Kanban colunas visíveis
Desktop: 1280px → layout full
```

Violações imediatas de UX (são bugs, não sugestões):
- Modal centrado onde cabe bottom sheet
- Loading overlay em vez de inline
- Mais de 1 botão primário por tela
- Tabela HTML horizontal em mobile
- Formulário com mais de 6 campos visíveis sem progressão

Referência completa: `docs/03-product/PRD-UX.md`

---

## Commands

```bash
npm run dev        # dev server
npm run build      # produção
npm run build:dev  # development
npm run lint       # lint
npm run preview    # preview do build
```

---

## Stack v2

React 18 + TypeScript + Vite + Tailwind CSS + shadcn/ui (Radix).
Backend: Supabase (auth, DB, realtime, storage, Edge Functions).
State: TanStack Query (server) + Zustand mínimo (UI).
PWA: IndexedDB + fila de sync em `src/lib/offline-sync.ts`.
AI: Anthropic Claude via `supabase/functions/_shared/ai-client.ts`.
WhatsApp: Evolution Go via `supabase/functions/_shared/evolution-go.ts` — único contrato ativo.

---

## Arquitetura

### Cliente Supabase
```typescript
import { supabase } from "@/lib/supabase";        // ✅ SEMPRE
// NUNCA: import de @/integrations/supabase/client (legacy)
// NUNCA: import de @/integrations/supabase/types (desatualizado)
```

### Identidade (AuthContext)
```typescript
import { useAuth } from "@/contexts/AuthContext";

// Sempre desestruturar com nomes canônicos — nunca user.id de forma ambígua
const { professionalId, authUserId } = useAuth();
// professionalId = professionals.id   ← USE em queries e mutations como professional_id
// authUserId     = auth.uid()         ← NUNCA use como professional_id
```

### Queries com professional_id
```typescript
const { professionalId } = useAuth();

// ✅ SEMPRE
.eq("professional_id", professionalId)

// ❌ NUNCA — ambíguo
const { user } = useAuth();
.eq("professional_id", user.id)

// ❌ NUNCA — IDOR
{ professional_id: req.body.professional_id }
```

### Padrão de Hook
```typescript
const { professionalId } = useAuth();

// READ
const { data, isLoading } = useQuery({
  queryKey: ["entidade", professionalId, ...filtros],
  queryFn: async () => { /* fetch */ },
  enabled: !!professionalId,
});

// WRITE
const { mutate, isPending } = useMutation({
  mutationFn: async (input) => { /* save */ },
  onSuccess: () => queryClient.invalidateQueries({ queryKey: ["entidade", professionalId] }),
  onError: (error) => { console.error("contexto:", error); toast.error("..."); },
});
```

---

## Schema v2 — Referências

| Documento | O que contém |
|---|---|
| `docs/03-product/PRD-SCHEMA.md` | DDL completo, RLS, triggers, índices |
| `docs/03-product/PRD-CONSOLIDATION.md` | Consolidações (o que foi fundido, o que foi removido) |
| `docs/03-product/PRD-UX.md` | Sistema de design, padrões de tela, checklist |
| `docs/03-product/PRD-FRONTEND.md` | Componentes e telas do frontend |
| `docs/03-product/PRD-EDGE-FUNCTIONS.md` | Edge Functions e contratos |
| `docs/01-execution/EXECUTION-PRD.md` | Stack, fases, crons, deploy |

### Tabelas principais
| Tabela | Uso |
|---|---|
| `professionals` | Dono da clínica (1 por auth user) |
| `clients` | Pacientes/clientes |
| `team_members` | Colaboradores |
| `sessions` | Sessões de atendimento |
| `appointments` | Agendamentos |
| `financial_transactions` | Financeiro |
| `campaigns` | Toda campanha (broadcast, drip, pipeline, platform) |
| `message_events` | Todo tráfego de mensagem (inbound + outbound) |
| `agent_executions` | Log de execução de agentes |
| `client_analytics` | Scores de cliente (rfm, health, lead) |
| `conversations` | Threads de conversa com cliente |
| `knowledge_nodes` | Knowledge Brain — nós do grafo |

### Colunas críticas de clients
- `full_name` — NOT NULL (nunca use `name` legado)
- `journey_stage` — enum: `lead | agendado | em_tratamento | pos_tratamento | cliente_fiel | inativo`
- `phone_whatsapp` — E.164 sem + (normalizado por trigger)

---

## 🔒 9 Regras de Segurança — ABSOLUTAS

> Violação = bloqueio automático. Aplicar em dev, arquitetura e QA.

### 1. RLS: `= auth_professional_id()` (nunca `auth.uid() IS NOT NULL`)
```sql
-- ✅
USING (professional_id = auth_professional_id())
-- ❌
USING (auth.uid() IS NOT NULL)
```

### 2. PII/Credenciais: nunca plaintext (Vault ou security_invoker=on)
Tokens, chaves API, CPF, email, telefone → Supabase Vault.
Audit logs → sempre `mask_pii()`.

### 3. RPCs: validar ownership (IDOR)
```sql
IF NOT EXISTS (SELECT 1 FROM tabela WHERE id = p_id AND professional_id = auth_professional_id())
THEN RAISE EXCEPTION 'Unauthorized';
```

### 4. RLS: sem subqueries (usa STABLE function)
```sql
-- ❌ trava CPU
IN (SELECT id FROM professionals WHERE user_id = auth.uid())
-- ✅ 0ms
= auth_professional_id()
```

### 5. Audit Logs: imutáveis
```sql
CREATE TRIGGER prevent_[tabela]_change BEFORE UPDATE OR DELETE ON [tabela]
  FOR EACH ROW EXECUTE FUNCTION fn_log_immutable();
REVOKE UPDATE, DELETE ON [tabela] FROM authenticated;
```

### 6. Views com filtro de clínica: `WITH (security_invoker = on)`
```sql
CREATE VIEW minhaview WITH (security_invoker = on) AS
  SELECT * FROM tabela WHERE professional_id = auth_professional_id();
```

### 7. Dados financeiros: `ON DELETE RESTRICT` (nunca CASCADE)
```sql
REFERENCES professionals(id) ON DELETE RESTRICT  -- ✅
REFERENCES professionals(id) ON DELETE CASCADE   -- ❌ crime contábil
```

### 8. Permissões: `REVOKE ALL` + GRANT específico (nunca GRANT ALL)
```sql
REVOKE ALL ON tabela FROM authenticated;
GRANT SELECT ON tabela TO authenticated;
```

### 9. Client-side: `professional_id` do AuthContext (nunca do payload)
```typescript
const { professionalId } = useAuth();
professional_id: professionalId   // ✅ do AuthContext
professional_id: body.clinic_id   // ❌ IDOR — nunca do payload
professional_id: user.id          // ❌ ambíguo — desestruturar com nome canônico
```

---

## Squad de Desenvolvimento

### Skills disponíveis

| Skill | Quando usar |
|---|---|
| `/squad-orquestrador` | **Sempre primeiro** — classifica e encaminha |
| `/squad-pm-spec` | Para 🟡 MÉDIO ou 🔴 COMPLEXO — escreve spec |
| `/squad-arquiteto-design` | Depois do PM — define estrutura + fluxo mobile |
| `/squad-dev-code` | Implementa o que arquiteto definiu |
| `/squad-qa-check` | Valida código + segurança + UX mobile |
| `/squad-schema-guard` | Antes de qualquer migration ou tabela nova |

### Fluxo Padrão
```
/squad-orquestrador [task]
  ↓
🟢 SIMPLES:   → /squad-dev-code → /squad-qa-check
🟡 MÉDIO:     → /squad-pm-spec → /squad-arquiteto-design → /squad-dev-code → /squad-qa-check
🔴 COMPLEXO:  → quebra em sub-tasks → repete fluxo por sub-task
```

### Workspace de tasks
```
.squad/[nome-da-feature]/
  ├── 00-brief.md      (orquestrador)
  ├── 01-spec.md       (PM)
  ├── 02-arquitetura.md (arquiteto)
  ├── 03-codigo.md     (dev)
  └── 04-qa-report.md  (QA)
```

`.squad/` não vai para o GitHub (ignorado pelo .gitignore).

---

## Rotas Públicas vs Protegidas

- **Públicas** (sem auth): `/`, `/login`, `/cadastro`, `/agendar/:slug`, `/pacote/:slug`, `/anamnese/:token`
- **Requer auth mas sem onboarding**: `/onboarding`
- **Protegidas** (auth + onboarding + role): tudo mais

---

## PWA — Regras Absolutas

> ⛔ PROIBIDO alterar qualquer item abaixo:
> 1. `display: "standalone"` no manifest
> 2. `theme_color` sem sincronizar em index.html + manifest.json + vite.config.ts
> 3. `apple-mobile-web-app-capable` ou similar
>
> `theme_color` atual: `#0D6E6E` (teal primário — migrado de `#7C3AED` em 2026-06-20).

---

## Arquivos que NÃO vão para o GitHub

```
docs/**         (PRDs, análises, inventários — local only)
.claude/        (skills, memórias — local only)
.squad/         (workspaces de task — local only)
```

Configurado no `.gitignore`. Não commitar acidentalmente.
