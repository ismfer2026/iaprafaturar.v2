import {
  validateNerissaSetupAgentInput,
  validateNerissaSetupAgentOutput,
  type NerissaSetupAgentInput,
} from '@iaprafaturar/contracts/edge-functions/nerissa-setup-agent.ts'
import type { SupabaseClient } from '@supabase/supabase-js'

import { startAgentExecution, completeAgentExecution } from '../_shared/agent-executions.ts'
import { assertInternalAuth } from '../_shared/internal-auth.ts'
import { isDryRun } from '../_shared/dry-run.ts'
import { jsonResponse } from '../_shared/http.ts'
import { sendMessageCore } from '../_shared/send-message-core.ts'
import { createServiceClient } from '../_shared/supabase.ts'

const AGENT_SLUG = 'nerissa-setup-agent'

const SETUP_ITEMS = [
  {
    category: 'perfil',
    item_key: 'profile_basics',
    question: 'Para eu configurar sua conta corretamente, qual nome do seu negócio deve aparecer para seus clientes?',
  },
  {
    category: 'servicos',
    item_key: 'main_services',
    question: 'Quais são os principais serviços que você oferece hoje?',
  },
  {
    category: 'agenda',
    item_key: 'business_hours',
    question: 'Quais dias e horários você costuma atender?',
  },
  {
    category: 'agentes',
    item_key: 'rosane_preferences',
    question: 'Qual nome e tom você quer para sua assistente de atendimento?',
  },
  {
    category: 'whatsapp',
    item_key: 'whatsapp_connection',
    question: 'Agora falta conectar o WhatsApp que a Rosane usará com seus clientes. Você quer conectar por QR Code, código pareado ou Meta WABA?',
  },
] as const

type SetupItemKey = typeof SETUP_ITEMS[number]['item_key']

interface ProfessionalRow {
  id: string
  name: string
  phone_whatsapp: string | null
  onboarding_completed: boolean
  onboarding_essentials_completed: boolean
  whatsapp_connected: boolean
}

interface SetupSessionRow {
  id: string
  professional_id: string
  status: 'pending' | 'in_progress' | 'paused' | 'completed' | 'abandoned'
  current_step: string | null
  completed_steps: string[]
  completion_percent: number
  started_at?: string | null
}

function adminInstanceName(): string {
  const instanceName = Deno.env.get('ADMIN_WHATSAPP_INSTANCE')
  if (!instanceName) {
    throw new Error('Missing ADMIN_WHATSAPP_INSTANCE')
  }

  return instanceName
}

function itemByKey(itemKey: string | null | undefined) {
  return SETUP_ITEMS.find((item) => item.item_key === itemKey)
}

function calculatePercent(completedCount: number): number {
  return Math.round((completedCount / SETUP_ITEMS.length) * 100)
}

async function loadProfessional(
  supabase: SupabaseClient,
  professionalId: string,
): Promise<ProfessionalRow> {
  const { data, error } = await supabase
    .from('professionals')
    .select('id, name, phone_whatsapp, onboarding_completed, onboarding_essentials_completed, whatsapp_connected')
    .eq('id', professionalId)
    .is('deleted_at', null)
    .single()

  if (error) throw error
  return data as ProfessionalRow
}

async function loadMessageText(
  supabase: SupabaseClient,
  input: NerissaSetupAgentInput,
): Promise<string | null> {
  if (input.message) return input.message
  if (!input.message_event_id) return null

  const { data, error } = await supabase
    .from('message_events')
    .select('content')
    .eq('id', input.message_event_id)
    .eq('professional_id', input.professional_id)
    .eq('source_webhook', 'admin')
    .single()

  if (error) throw error
  return typeof data?.content === 'string' ? data.content : null
}

async function ensureSetupSession(
  supabase: SupabaseClient,
  professional: ProfessionalRow,
): Promise<SetupSessionRow> {
  const { data: existing, error: selectError } = await supabase
    .from('nerissa_setup_sessions')
    .select('id, professional_id, status, current_step, completed_steps, completion_percent, started_at')
    .eq('professional_id', professional.id)
    .maybeSingle()

  if (selectError) throw selectError

  if (existing) {
    const { data, error } = await supabase
      .from('nerissa_setup_sessions')
      .update({
        status: existing.status === 'completed' ? 'completed' : 'in_progress',
        started_at: existing.started_at ?? new Date().toISOString(),
        last_contact_at: new Date().toISOString(),
      })
      .eq('id', existing.id)
      .select('id, professional_id, status, current_step, completed_steps, completion_percent, started_at')
      .single()

    if (error) throw error
    return data as SetupSessionRow
  }

  const firstStep = professional.name && professional.phone_whatsapp ? 'main_services' : 'profile_basics'
  const completedSteps = professional.name && professional.phone_whatsapp ? ['profile_basics'] : []

  const { data, error } = await supabase
    .from('nerissa_setup_sessions')
    .insert({
      professional_id: professional.id,
      status: 'in_progress',
      current_step: firstStep,
      completed_steps: completedSteps,
      started_at: new Date().toISOString(),
      last_contact_at: new Date().toISOString(),
      source: 'nerissa_setup_agent',
      completion_percent: calculatePercent(completedSteps.length),
    })
    .select('id, professional_id, status, current_step, completed_steps, completion_percent, started_at')
    .single()

  if (error) throw error
  return data as SetupSessionRow
}

async function ensureSetupItems(
  supabase: SupabaseClient,
  session: SetupSessionRow,
  professional: ProfessionalRow,
) {
  const connectedWhatsapp = professional.whatsapp_connected

  const rows = SETUP_ITEMS.map((item) => {
    const isProfileDone = item.item_key === 'profile_basics' && Boolean(professional.name && professional.phone_whatsapp)
    const isWhatsappDone = item.item_key === 'whatsapp_connection' && connectedWhatsapp

    return {
      session_id: session.id,
      professional_id: professional.id,
      category: item.category,
      item_key: item.item_key,
      status: isProfileDone || isWhatsappDone
        ? 'completed'
        : item.item_key === session.current_step
          ? 'in_progress'
          : 'pending',
      completed_at: isProfileDone || isWhatsappDone ? new Date().toISOString() : null,
    }
  })

  const { error } = await supabase
    .from('nerissa_setup_items')
    .upsert(rows, { onConflict: 'session_id,item_key', ignoreDuplicates: true })

  if (error) throw error
}

async function setupItemsStatus(supabase: SupabaseClient, sessionId: string) {
  const { data, error } = await supabase
    .from('nerissa_setup_items')
    .select('item_key, status')
    .eq('session_id', sessionId)
    .order('created_at', { ascending: true })

  if (error) throw error
  return (data ?? []) as Array<{ item_key: SetupItemKey; status: 'pending' | 'in_progress' | 'completed' | 'skipped' }>
}

async function recordSetupEvent(
  supabase: SupabaseClient,
  input: {
    sessionId: string
    professionalId: string
    eventType: string
    data?: Record<string, unknown>
  },
) {
  const { error } = await supabase.from('nerissa_setup_events').insert({
    session_id: input.sessionId,
    professional_id: input.professionalId,
    event_type: input.eventType,
    agent_slug: AGENT_SLUG,
    data: input.data ?? {},
  })

  if (error) throw error
}

async function advanceOneStep(
  supabase: SupabaseClient,
  session: SetupSessionRow,
  message: string | null,
) {
  const statuses = await setupItemsStatus(supabase, session.id)
  const currentKey = (session.current_step ?? statuses.find((item) => item.status === 'in_progress')?.item_key ?? 'profile_basics') as SetupItemKey

  if (message && itemByKey(currentKey)) {
    const { error: itemError } = await supabase
      .from('nerissa_setup_items')
      .update({
        status: 'completed',
        data: { last_answer: message },
        completed_at: new Date().toISOString(),
      })
      .eq('session_id', session.id)
      .eq('item_key', currentKey)

    if (itemError) throw itemError
  }

  const updatedStatuses = await setupItemsStatus(supabase, session.id)
  const next = SETUP_ITEMS.find((item) => {
    const status = updatedStatuses.find((row) => row.item_key === item.item_key)?.status
    return status !== 'completed' && status !== 'skipped'
  })

  const completedSteps = updatedStatuses
    .filter((item) => item.status === 'completed')
    .map((item) => item.item_key)

  const completionPercent = calculatePercent(completedSteps.length)

  const { data, error } = await supabase
    .from('nerissa_setup_sessions')
    .update({
      current_step: next?.item_key ?? 'completed',
      completed_steps: completedSteps,
      completion_percent: completionPercent,
      status: next ? 'in_progress' : 'completed',
      completed_at: next ? null : new Date().toISOString(),
      last_contact_at: new Date().toISOString(),
    })
    .eq('id', session.id)
    .select('id, professional_id, status, current_step, completed_steps, completion_percent')
    .single()

  if (error) throw error

  return {
    session: data as SetupSessionRow,
    next,
    completed: !next,
    completionPercent,
  }
}

async function maybeMarkEssentialsComplete(
  supabase: SupabaseClient,
  professionalId: string,
  completedSteps: string[],
) {
  const essentials = ['profile_basics', 'main_services', 'business_hours', 'rosane_preferences']
  const essentialsCompleted = essentials.every((item) => completedSteps.includes(item))

  if (!essentialsCompleted) return

  const { error } = await supabase
    .from('professionals')
    .update({ onboarding_essentials_completed: true })
    .eq('id', professionalId)

  if (error) throw error
}

function responseFor(input: {
  mode: NerissaSetupAgentInput['mode']
  professional: ProfessionalRow
  nextStep: string | null
  completed: boolean
}) {
  if (input.mode === 'status') {
    return input.completed
      ? 'Seu setup essencial está concluído. Se precisar, posso revisar configurações ou ajudar com o WhatsApp.'
      : `Seu setup ainda está em andamento. Próximo passo: ${input.nextStep ?? 'continuar configuração'}.`
  }

  if (input.mode === 'account_created') {
    const next = itemByKey(input.nextStep)
    return `Oi, ${input.professional.name}! Aqui é a Nerissa, do IA para Faturar.\n\nVou te ajudar a configurar sua conta para a Rosane atender seus clientes com segurança.\n\n${next?.question ?? 'Podemos começar pelo seu perfil?'}`
  }

  if (input.completed) {
    return 'Perfeito. Tenho os dados essenciais do seu setup. Agora o próximo passo é manter o WhatsApp da Rosane conectado para ela atender seus clientes.'
  }

  const next = itemByKey(input.nextStep)
  return `Perfeito, anotei. ${next?.question ?? 'Qual é o próximo detalhe importante para deixar sua conta pronta?'}`
}

Deno.serve(async (request) => {
  let executionId: string | null = null
  const startedAt = performance.now()

  try {
    assertInternalAuth(request)

    const input = validateNerissaSetupAgentInput(await request.json())
    const dryRun = input.dry_run ?? isDryRun(request)
    const supabase = createServiceClient()

    const professional = await loadProfessional(supabase, input.professional_id)
    const message = await loadMessageText(supabase, input)
    let session = await ensureSetupSession(supabase, professional)

    await ensureSetupItems(supabase, session, professional)

    const execution = await startAgentExecution(supabase, {
      professionalId: professional.id,
      agentSlug: AGENT_SLUG,
      triggerType: input.message_event_id ? 'qstash' : 'manual',
      triggerRef: input.message_event_id ?? input.mode,
      triggerPayload: { ...input, dry_run: dryRun },
      messageEventId: input.message_event_id,
    })
    executionId = execution.id

    await recordSetupEvent(supabase, {
      sessionId: session.id,
      professionalId: professional.id,
      eventType: input.mode === 'account_created'
        ? 'professional.onboarding.started'
        : input.mode === 'reply'
          ? 'ai.interaction.started'
          : `nerissa.${input.mode}`,
      data: { mode: input.mode, message_event_id: input.message_event_id ?? null },
    })

    let nextStep = session.current_step
    let completed = session.status === 'completed'

    if (input.mode === 'reply') {
      const result = await advanceOneStep(supabase, session, message)
      session = result.session
      nextStep = result.next?.item_key ?? null
      completed = result.completed
      await maybeMarkEssentialsComplete(supabase, professional.id, result.session.completed_steps)
    }

    if (input.mode === 'resume_due_followups' && session.status === 'paused') {
      const { data, error } = await supabase
        .from('nerissa_setup_sessions')
        .update({ status: 'in_progress', last_contact_at: new Date().toISOString() })
        .eq('id', session.id)
        .select('id, professional_id, status, current_step, completed_steps, completion_percent')
        .single()

      if (error) throw error
      session = data as SetupSessionRow
      nextStep = session.current_step
    }

    const responseText = responseFor({
      mode: input.mode,
      professional,
      nextStep,
      completed,
    })

    if (input.mode !== 'status') {
      if (!professional.phone_whatsapp) {
        throw new Error('Professional phone_whatsapp is required for Nerissa setup outreach')
      }

      await sendMessageCore(supabase, {
        source_webhook: 'admin',
        professional_id: professional.id,
        instance_name: adminInstanceName(),
        to: professional.phone_whatsapp,
        text: responseText,
        actor_type: 'ai',
        agent_slug: AGENT_SLUG,
        dry_run: dryRun,
      })
    }

    await recordSetupEvent(supabase, {
      sessionId: session.id,
      professionalId: professional.id,
      eventType: input.mode === 'reply' ? 'ai.interaction.completed' : 'nerissa.response.ready',
      data: {
        mode: input.mode,
        next_step: nextStep,
        completed,
        dry_run: dryRun,
        duration_ms: Math.round(performance.now() - startedAt),
      },
    })

    await completeAgentExecution(supabase, executionId, { status: 'success' })

    const output = validateNerissaSetupAgentOutput({
      response_text: responseText,
      next_step: nextStep ?? undefined,
      completed,
      dry_run: dryRun,
    })

    return jsonResponse(output)
  } catch (error) {
    if (error instanceof Response) return error

    if (executionId) {
      try {
        await completeAgentExecution(createServiceClient(), executionId, {
          status: 'failed',
          errorMessage: error instanceof Error ? error.message : 'unknown_error',
        })
      } catch {
        // Preserve the original error response.
      }
    }

    return jsonResponse({ error: error instanceof Error ? error.message : 'unknown_error' }, { status: 500 })
  }
})
