import { validateLembreteAgentInput, validateLembreteAgentOutput } from '@iaprafaturar/contracts/edge-functions/lembrete-agent.ts'
import type { SupabaseClient } from '@supabase/supabase-js'

import { startAgentExecution, completeAgentExecution } from '../_shared/agent-executions.ts'
import {
  buildAppointmentAgentIdempotencyKey,
  createConversationContext,
  resolveOrCreateWhatsappConversation,
} from '../_shared/appointment-context.ts'
import { isDryRun } from '../_shared/dry-run.ts'
import { jsonResponse } from '../_shared/http.ts'
import { claimIdempotency } from '../_shared/idempotency.ts'
import { assertInternalAuth } from '../_shared/internal-auth.ts'
import { getConnectedProfessionalWhatsappInstance } from '../_shared/professional-instance.ts'
import { getRosaneAgentConfig } from '../_shared/rosane-agent-config.ts'
import { sendMessageCore } from '../_shared/send-message-core.ts'
import { createServiceClient } from '../_shared/supabase.ts'

const AGENT_SLUG = 'lembrete-agent'

interface AppointmentReminderRow {
  id: string
  professional_id: string
  client_id: string | null
  service_id: string | null
  scheduled_at: string
  status: 'agendado' | 'confirmado'
}

interface ClientRow {
  id: string
  full_name: string
  phone_whatsapp: string | null
}

interface ServiceRow {
  id: string
  name: string
}

function saoPauloDayBounds(offsetDays: number): { start: string; end: string } {
  const now = new Date()
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
  const parts = formatter.formatToParts(now)
  const year = Number(parts.find((part) => part.type === 'year')?.value)
  const month = Number(parts.find((part) => part.type === 'month')?.value)
  const day = Number(parts.find((part) => part.type === 'day')?.value)

  const baseUtc = new Date(Date.UTC(year, month - 1, day + offsetDays, 3, 0, 0))
  const endUtc = new Date(baseUtc.getTime() + 24 * 60 * 60 * 1000)

  return {
    start: baseUtc.toISOString(),
    end: endUtc.toISOString(),
  }
}

function formatWhen(value: string): string {
  return new Intl.DateTimeFormat('pt-BR', {
    weekday: 'long',
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'America/Sao_Paulo',
  }).format(new Date(value))
}

function reminderColumn(mode: 'd1' | '1h' | 'dia'): 'reminder_d1_sent_at' | 'reminder_1h_sent_at' | 'reminder_day_sent_at' {
  if (mode === 'd1') return 'reminder_d1_sent_at'
  if (mode === '1h') return 'reminder_1h_sent_at'
  return 'reminder_day_sent_at'
}

function buildReminderText(input: {
  assistantName: string
  clientName: string
  scheduledAt: string
  serviceName?: string | null
  mode: 'd1' | '1h' | 'dia'
}): string {
  const serviceText = input.serviceName ? ` (${input.serviceName})` : ''
  const intro = input.mode === '1h'
    ? 'passando para lembrar que seu atendimento esta chegando'
    : 'passando para lembrar do seu atendimento'

  return [
    `Ola, ${input.clientName}. Aqui e ${input.assistantName}, ${intro}.`,
    '',
    `Horario: ${formatWhen(input.scheduledAt)}${serviceText}.`,
    '',
    'Se precisar de algo, responda por aqui.',
  ].join('\n')
}

async function loadClientAndService(
  supabase: SupabaseClient,
  appointment: AppointmentReminderRow,
): Promise<{ client: ClientRow | null; service: ServiceRow | null }> {
  let client: ClientRow | null = null
  if (appointment.client_id) {
    const { data, error } = await supabase
      .from('clients')
      .select('id, full_name, phone_whatsapp')
      .eq('id', appointment.client_id)
      .eq('professional_id', appointment.professional_id)
      .is('deleted_at', null)
      .single()

    if (error) throw error
    client = data as ClientRow
  }

  let service: ServiceRow | null = null
  if (appointment.service_id) {
    const { data, error } = await supabase
      .from('services')
      .select('id, name')
      .eq('id', appointment.service_id)
      .eq('professional_id', appointment.professional_id)
      .is('deleted_at', null)
      .maybeSingle()

    if (error) throw error
    service = data as ServiceRow | null
  }

  return { client, service }
}

async function selectAppointments(
  supabase: SupabaseClient,
  input: {
    mode: 'd1' | '1h' | 'dia'
    professionalId?: string
    appointmentId?: string
  },
): Promise<AppointmentReminderRow[]> {
  const column = reminderColumn(input.mode)
  let query = supabase
    .from('appointments')
    .select('id, professional_id, client_id, service_id, scheduled_at, status')
    .in('status', ['agendado', 'confirmado'])
    .is('deleted_at', null)
    .is(column, null)
    .order('scheduled_at', { ascending: true })
    .limit(50)

  if (input.appointmentId) {
    query = query.eq('id', input.appointmentId)
  } else if (input.mode === '1h') {
    const now = new Date()
    query = query
      .gte('scheduled_at', now.toISOString())
      .lt('scheduled_at', new Date(now.getTime() + 75 * 60 * 1000).toISOString())
  } else {
    const bounds = saoPauloDayBounds(input.mode === 'd1' ? 1 : 0)
    query = query.gte('scheduled_at', bounds.start).lt('scheduled_at', bounds.end)
  }

  if (input.professionalId) {
    query = query.eq('professional_id', input.professionalId)
  }

  const { data, error } = await query
  if (error) throw error
  return (data ?? []) as AppointmentReminderRow[]
}

async function processAppointment(
  supabase: SupabaseClient,
  appointment: AppointmentReminderRow,
  mode: 'd1' | '1h' | 'dia',
  dryRun: boolean,
): Promise<'sent' | 'skipped'> {
  const { client, service } = await loadClientAndService(supabase, appointment)
  if (!client?.phone_whatsapp) return 'skipped'

  const instance = await getConnectedProfessionalWhatsappInstance(supabase, appointment.professional_id)
  if (!instance) return 'skipped'

  const baseKey = buildAppointmentAgentIdempotencyKey({
    agentSlug: AGENT_SLUG,
    appointmentId: appointment.id,
    mode,
  })

  const claim = await claimIdempotency(
    supabase,
    dryRun ? `dry-run:${baseKey}:${crypto.randomUUID()}` : baseKey,
    { appointment_id: appointment.id, mode, dry_run: dryRun },
  )

  if (!claim.claimed) return 'skipped'

  const config = await getRosaneAgentConfig(supabase, appointment.professional_id)
  const conversation = await resolveOrCreateWhatsappConversation(supabase, {
    professionalId: appointment.professional_id,
    clientId: client.id,
    phone: client.phone_whatsapp,
    preview: 'lembrete de atendimento',
  })

  await createConversationContext(supabase, {
    professionalId: appointment.professional_id,
    conversationId: conversation.id,
    clientId: client.id,
    contextType: 'reminder',
    sourceFunction: AGENT_SLUG,
    refType: 'appointment',
    refId: appointment.id,
    expiresAt: new Date(new Date(appointment.scheduled_at).getTime() + 2 * 60 * 60 * 1000).toISOString(),
    metadata: { mode },
  })

  await sendMessageCore(supabase, {
    source_webhook: 'professional',
    professional_id: appointment.professional_id,
    instance_name: instance.instanceName,
    to: client.phone_whatsapp,
    text: buildReminderText({
      assistantName: config.agentName,
      clientName: client.full_name,
      scheduledAt: appointment.scheduled_at,
      serviceName: service?.name ?? null,
      mode,
    }),
    actor_type: 'ai',
    agent_slug: AGENT_SLUG,
    dry_run: dryRun,
  })

  if (!dryRun) {
    const { error } = await supabase
      .from('appointments')
      .update({ [reminderColumn(mode)]: new Date().toISOString() })
      .eq('id', appointment.id)
      .eq('professional_id', appointment.professional_id)

    if (error) throw error
  }

  return 'sent'
}

Deno.serve(async (request) => {
  let executionId: string | null = null

  try {
    assertInternalAuth(request)
    const input = validateLembreteAgentInput(await request.json())
    const dryRun = input.dry_run ?? isDryRun(request)
    const supabase = createServiceClient()

    const execution = await startAgentExecution(supabase, {
      professionalId: input.professional_id ?? null,
      agentSlug: AGENT_SLUG,
      triggerType: input.appointment_id ? 'manual' : 'cron',
      triggerRef: input.appointment_id ?? input.mode,
      triggerPayload: { ...input, dry_run: dryRun },
    })
    executionId = execution.id

    const appointments = await selectAppointments(supabase, {
      mode: input.mode,
      professionalId: input.professional_id,
      appointmentId: input.appointment_id,
    })

    let sent = 0
    let skipped = 0
    let failed = 0

    for (const appointment of appointments) {
      try {
        const result = await processAppointment(supabase, appointment, input.mode, dryRun)
        if (result === 'sent') sent += 1
        else skipped += 1
      } catch {
        failed += 1
      }
    }

    await completeAgentExecution(supabase, execution.id, { status: failed > 0 ? 'failed' : 'success' })

    return jsonResponse(validateLembreteAgentOutput({
      processed: appointments.length,
      sent,
      skipped,
      failed,
    }))
  } catch (error) {
    if (error instanceof Response) return error

    if (executionId) {
      try {
        await completeAgentExecution(createServiceClient(), executionId, {
          status: 'failed',
          errorMessage: error instanceof Error ? error.message : 'unknown_error',
        })
      } catch {
        // Preserve original error.
      }
    }

    return jsonResponse({ error: error instanceof Error ? error.message : 'unknown_error' }, { status: 500 })
  }
})
