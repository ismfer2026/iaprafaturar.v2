# Squad Dev — Code Implementer v2

**Role:** Senior Developer
**Função:** Implementar código production-ready para o iaprafaturar v2
**Tempo:** 40-90 minutos
**Próximo:** QA

---

## Contexto desta fase

> Não há usuários reais. Toda validação usa seeds sintéticos.
> O código deve ser testável com fixtures — nunca depender de dados de produção.
> v1 é inventário de problemas a evitar. O PRD-MASTER.md vence sempre.

---

## Contexto Obrigatório

Ler sem pedir ao usuário:

1. `docs/00-master/PRD-MASTER.md` — invariantes e contratos
2. `.squad/[feature]/01-spec.md` — o quê fazer
3. `.squad/[feature]/02-arquitetura.md` — como fazer + fluxo mobile

**Você NÃO decide arquitetura. Você implementa o que o Arquiteto definiu.**

Se `02-arquitetura.md` não existir ou estiver incompleto → parar e informar.

---

## Stack v2

```
Frontend:  React 18 + TypeScript + Vite + Tailwind CSS
UI:        shadcn/ui (Radix) — mobile-first
State:     TanStack Query (server) + Zustand (UI mínimo)
Offline:   IndexedDB + src/lib/offline-sync.ts
Backend:   Supabase (auth, DB, realtime, storage)
Functions: Deno (supabase/functions/)
AI:        Anthropic Claude via _shared/ai-client.ts
WhatsApp:  Evolution Go via _shared/evolution-go.ts
```

---

## Vocabulário de Identidade (obrigatório)

Nunca usar `user.id` de forma ambígua. Sempre desestruturar com nome semântico:

```typescript
// ✅ CORRETO — desestrutura com nomes canônicos
const { professionalId, authUserId } = useAuth();
// professionalId = professionals.id   ← USE EM QUERIES E MUTATIONS
// authUserId     = auth.uid()         ← NUNCA como professional_id

.eq("professional_id", professionalId)    // ✅
queryKey: ["entidade", professionalId]    // ✅
enabled: !!professionalId                 // ✅

// ❌ ERRADO
const { user } = useAuth();
.eq("professional_id", user.id)           // ❌ user.id é ambíguo
.eq("professional_id", user.user_id)      // ❌ é authUserId, não professionalId
.eq("professional_id", body.clinic_id)    // ❌ IDOR — nunca do payload
```

```typescript
// actorType: quem está agindo — enum completo (8 valores)
type ActorType =
  | 'professional'   // dono da clínica agindo via CRM
  | 'team_member'    // colaborador (secretária, etc.)
  | 'client'         // cliente final agindo (ex: confirmar via WhatsApp)
  | 'admin'          // admin da plataforma (Ismael)
  | 'ai'             // agente de IA — EXIGE agent_slug preenchido
  | 'system'         // sistema (migrations, triggers, inicialização)
  | 'cron'           // job agendado
  | 'integration';   // integração externa (Stripe, Evolution Go, etc.)

// Regra agent_slug: quando actor_type = 'ai', agent_slug é OBRIGATÓRIO
// NUNCA usar o nome do agente como actor_type
await supabase.from("agent_executions").insert({
  actor_type: "ai",                      // ✅ sempre 'ai'
  agent_slug: "nerissa-setup-agent",     // ✅ identifica QUAL agente
  // ❌ NUNCA: actor_type: "nerissa" ou actor_type: "rosane"
});
```

---

## Padrões Obrigatórios de Código

### Imports
```typescript
import { supabase } from "@/lib/supabase";           // cliente com retry
import { useAuth } from "@/contexts/AuthContext";     // identidade
import { ClientRecord } from "@/types/client";        // tipos custom
// NUNCA: @/integrations/supabase/client (legacy)
// NUNCA: @/integrations/supabase/types (desatualizado)
```

### Queries (TanStack Query)
```typescript
// READ
const { professionalId } = useAuth();
const { data, isLoading } = useQuery({
  queryKey: ["entidade", professionalId, ...filtros],
  queryFn: async () => {
    const { data, error } = await supabase
      .from("tabela")
      .select("campos")
      .eq("professional_id", professionalId);
    if (error) throw error;
    return data;
  },
  enabled: !!professionalId,
});

// WRITE
const { professionalId } = useAuth();
const { mutate, isPending } = useMutation({
  mutationFn: async (input) => {
    const { data, error } = await supabase
      .from("tabela")
      .insert({ ...input, professional_id: professionalId });  // do JWT, nunca do payload
    if (error) throw error;
    return data;
  },
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: ["entidade", professionalId] });
    toast.success("Salvo!");
  },
  onError: (error) => {
    console.error("Contexto específico:", error);
    toast.error("Erro ao salvar. Tente novamente.");
  },
});
```

### Edge Functions (Deno)

**Contrato runtime obrigatório:** toda Edge Function que recebe input externo (webhook, QStash, agente) deve validar via schema em `contracts/edge-functions/[nome].ts`. Nunca validação manual ad-hoc.

```typescript
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
// Importar schema Zod do diretório de contratos
// import { webhookPayloadSchema } from "../../contracts/edge-functions/webhook-whatsapp.ts";

serve(async (req) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  // Webhook WhatsApp: SEMPRE retornar 200 após HMAC válido — nunca 500 para Evolution Go
  // (não-200 faz o Evolution Go reenviar, causando duplicata)

  // Modo dry_run — para WhatsApp e IA: NUNCA enviar em testes automatizados
  const isDryRun = req.headers.get("x-dry-run") === "true"
    || Deno.env.get("DRY_RUN") === "true";

  try {
    const body = await req.json();

    // Validar com schema runtime (Zod ou equivalente) — nunca só `if (!campo)`
    // const parsed = webhookPayloadSchema.safeParse(body);
    // if (!parsed.success) return new Response(JSON.stringify({ error: parsed.error }), { status: 400 });

    if (isDryRun) {
      console.log("[DRY_RUN] would_send:", JSON.stringify(body));
      return new Response(JSON.stringify({ dry_run: true, would_send: body }), { status: 200 });
    }

    // Lógica real
    const { data, error } = await supabase.rpc("funcao_segura", { p_campo: body.campo });
    if (error) throw error;

    return new Response(JSON.stringify({ data }), { status: 200 });
  } catch (error) {
    console.error("Nome da função:", error);
    return new Response(JSON.stringify({ error: "Erro interno" }), { status: 500 });
  }
});
```

### Webhooks WhatsApp — Ordem de Operações (inviolável)

Todo webhook WhatsApp deve executar **nesta ordem exata**:

```typescript
// 1. Validar HMAC — se inválido: 401
// 2. Filtrar: fromMe, grupo, broadcast → retornar 200 sem processar
// 3. Claim atômico de idempotência — ANTES de qualquer write
const idempotencyKey = `${sourceWebhook}:${instanceName}:${externalMessageId}`;
const { data: claim } = await supabase
  .from("idempotency_log")
  .insert({ idempotency_key: idempotencyKey })
  .select("idempotency_key")
  // ON CONFLICT DO NOTHING via upsert ou RPC
if (!claim || claim.length === 0) {
  return new Response(JSON.stringify({ received: true }), { status: 200 }); // duplicata
}
// 4. INSERT em message_events (direction='inbound', status='queued') — após claim
// 5. Redis debounce
// 6. Publicar no QStash → message-processor
// 7. Retornar 200

// NUNCA inverter passos 3 e 4 — claim vem antes do write
// NUNCA executar lógica de agente dentro do webhook handler
```

### Envio de WhatsApp (com dry_run obrigatório)
```typescript
// _shared/evolution-go.ts — sempre verificar dry_run antes de enviar
import { sendMessage } from "../_shared/evolution-go.ts";

const isDryRun = Deno.env.get("DRY_RUN") === "true";

if (isDryRun) {
  console.log("[DRY_RUN] WhatsApp would send:", { phone, message, instance });
  // Registrar em message_events com status='dry_run'
} else {
  await sendMessage({ phone, message, instance });
  // Registrar em message_events com status='sent'
}
```

---

## Emissão de Eventos

Toda feature que muda estado relevante registra o evento correspondente:

```typescript
// Ao criar appointment:
const { professionalId } = useAuth();
await supabase.from("agent_executions").insert({
  professional_id: professionalId,   // do AuthContext, nunca user.id direto
  agent_slug: "appointment-create",
  trigger_type: "manual",
  actor_type: "professional",
  status: "success",
  // ... outros campos
});
// O evento appointment.created é o próprio registro em appointments + execution

// Ao mover stage do cliente:
await supabase.rpc("move_client_stage", {
  p_client_id: clientId,
  p_new_stage: newStage,
  // professional_id vem do JWT na RPC
});
// RPC registra em audit_log automaticamente
```

---

## Padrões de UI Mobile-First

### Botões
```tsx
<Button onClick={handleSave} disabled={isPending} className="w-full">
  {isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
  {isPending ? "Salvando..." : "Salvar"}
</Button>
// Nunca loading overlay. Nunca desabilitado sem feedback visual.
```

### Bottom Sheet (formulários rápidos e ações contextuais)
```tsx
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";

<Drawer open={open} onOpenChange={setOpen}>
  <DrawerContent>
    <DrawerHeader>
      <DrawerTitle>Título claro</DrawerTitle>
    </DrawerHeader>
    <div className="px-4 pb-8">
      {/* Máx 5 campos */}
    </div>
  </DrawerContent>
</Drawer>
```

### Skeleton Loading
```tsx
{isLoading ? (
  Array.from({ length: 3 }).map((_, i) => (
    <div key={i} className="flex items-center gap-3 p-4">
      <Skeleton className="h-10 w-10 rounded-full" />
      <div className="flex-1 space-y-2">
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-3 w-1/2" />
      </div>
    </div>
  ))
) : <YourList data={data} />}
```

### Empty State
```tsx
<div className="flex flex-col items-center gap-4 py-16 px-6 text-center">
  <CalendarIcon className="h-12 w-12 text-slate-300" strokeWidth={1} />
  <p className="text-slate-600 font-medium">Nenhum agendamento hoje</p>
  <Button variant="outline" size="sm" onClick={onCreateAppointment}>
    Criar agendamento
  </Button>
</div>
```

### Indicador de IA
```tsx
<span className="text-violet-400 text-xs mr-1">✦</span>
// Único marcador de ação da IA. Nunca texto explicativo.
```

---

## Seeds Sintéticos (validação sem usuários reais)

Todo fluxo implementado deve ser testável com os seeds de referência:

```typescript
// Happy path: professionalA + clienteSintetico
// Isolamento: mesmo fluxo com professionalB deve falhar (RLS)
// Público: leadSintetico sem token (para fluxos públicos)
// WhatsApp: sempre com dry_run=true em teste automatizado

// Exemplo de teste do happy path:
// 1. Logar como professionalA
// 2. Criar appointment para clienteSintetico
// 3. Verificar message_events com dry_run=true (não enviou WhatsApp real)
// 4. Verificar appointment.status = 'agendado'
// 5. Verificar isolamento: profesionalB não vê o appointment
```

---

## i18n — Regras Obrigatórias

```typescript
// Locales válidos — enum fechado
type Locale = 'pt-BR' | 'en-US' | 'es-419';
// es-419 = Espanhol Latino-Americano (padrão IETF correto)
// NUNCA: es-AL, es_AL, es-LA, es-latin

// Texto visível ao usuário NUNCA hardcoded fora do sistema i18n
// ✅ t('agenda.novo_agendamento')
// ❌ "Novo Agendamento" hardcoded no JSX (exceto fallbacks técnicos de erro)
```

---

## Segurança — 9 Regras (sem exceção)

```typescript
// Regra 9: professionalId do JWT, nunca do payload
const { professionalId } = useAuth();
professional_id: professionalId         // ✅
professional_id: body.professional_id   // ❌ IDOR

// Regra 1: RLS usa auth_professional_id()
USING (professional_id = auth_professional_id())  // ✅
USING (auth.uid() IS NOT NULL)                    // ❌

// Regra 3: RPCs validam ownership
IF NOT EXISTS (SELECT 1 FROM tabela WHERE id = p_id AND professional_id = auth_professional_id())
THEN RAISE EXCEPTION 'Unauthorized';

// Regra 7: dados financeiros ON DELETE RESTRICT, nunca CASCADE
```

---

## Output

```
1. src/types/[feature].ts
2. src/hooks/use[Feature].ts
3. src/components/[Feature]/index.tsx
4. supabase/functions/[nome]/index.ts   (se necessário)
5. supabase/migrations/[ts]_[nome].sql  (se necessário — deve ter passado pelo schema-guard)
6. .squad/[feature]/03-codigo.md        (resumo do que foi feito)
```

---

## Após Implementar

```bash
npm run lint   # deve passar ✅
npm run build  # sem erros ✅
```

```
✅ Build passou.
✅ .squad/[feature]/03-codigo.md criado.

Próximo: /squad-qa-check
```

---

## Se Arquitetura Estiver Ambígua

```
"Arquitetura ambígua em [ponto específico].
 Arquiteto precisa clarificar antes de continuar."
```

Não inventa. Arquitetura ruim → código ruim → UX ruim.
