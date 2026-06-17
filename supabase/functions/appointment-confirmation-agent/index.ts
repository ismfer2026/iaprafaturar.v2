import {
  validateAppointmentConfirmationAgentInput,
  validateAppointmentConfirmationAgentOutput,
  type AppointmentConfirmationAgentInput,
} from '@iaprafaturar/contracts/edge-functions/appointment-confirmation-agent.ts'
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

const AGENT_SLUG = 'appointment-confirmation-agent'

interface AppointmentRow {
  id: string
  professional_id: string
  client_id: string | null
  service_id: string | null
  scheduled_at: string
  duration_minutes: number
  status: 'agendado' | 'confirmado' | 'cancelado' | 'reagendado' | 'realizado' | 'falta'
  confirmation_sent_at: string | null
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

function buildConfirmationText(input: {
  assistantName: string
  clientName: string
  scheduledAt: string
  serviceName?: string | null
}): string {
  const serviceText = input.serviceName ? ` para ${input.serviceName}` : ''
  return [
    `Ola, ${input.clientName}. Aqui e ${input.assistantName}.`,
    '',
    `Seu atendimento${serviceText} esta agendado para ${formatWhen(input.scheduledAt)}.`,
    '',
    'Responda SIM para confirmar ou NAO para cancelar.',
  ].join('\n')
}

function buildCancellationText(input: {
  assistantName: string
  clientName: string
  scheduledAt: string
  serviceName?: string | null
}): string {
  const serviceText = input.serviceName ? ` de ${input.serviceName}` : ''
  return [
    `Ola, ${input.clientName}. Aqui e ${input.assistantName}.`,
    '',
    `Seu atendimento${serviceText} agendado para ${formatWhen(input.scheduledAt)} foi cancelado.`,
    '',
    'Entre em contato caso queira reagendar.',
  ].join('\n')
}

function classifyAppointmentReply(text: string | null | undefined): 'confirm' | 'cancel' | 'reschedule' | 'unknown' {
  const normalized = String(text ?? '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()

  if (/\b(remarcar|reagendar|outro horario|outro dia|mudar horario)\b/.test(normalized)) return 'reschedule'
  if (/\b(sim|confirmo|confirmado|ok|certo|estarei|vou sim|pode confirmar)\b/.test(normalized)) return 'confirm'
  if (/\b(nao|cancelar|cancela|nao posso|nao vou|desmarcar)\b/.test(normalized)) return 'cancel'
  return 'unknown'
}

async function loadAppointmentBundle(
  supabase: SupabaseClient,
  appointmentId: string,
): Promise<{ appointment: AppointmentRow; client: ClientRow | null; service: ServiceRow | null }> {
  const { data: appointment, error: appointmentError } = await supabase
    .from('appointments')
    .select('id, professional_id, client_id, service_id, scheduled_at, duration_minutes, status, confirmation_sent_at')
    .eq('id', appointmentId)
    .is('deleted_at', null)
    .single()

  if (appointmentError) throw appointmentError

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

  return {
    appointment: appointment as AppointmentRow,
    client,
    service,
  }
}

async function sendConfirmationForAppointment(
  supabase: SupabaseClient,
  appointmentId: string,
  dryRun: boolean,
): Promise<{ sent: boolean; skippedReason?: string }> {
  const { appointment, client, service } = await loadAppointmentBundle(supabase, appointmentId)

  if (appointment.status !== 'agendado') {
    return { sent: false, skippedReason: `invalid_status:${appointment.status}` }
  }

  if (appointment.confirmation_sent_at) {
    return { sent: false, skippedReason: 'confirmation_already_sent' }
  }

  if (!client?.phone_whatsapp) {
    return { sent: false, skippedReason: 'missing_client_phone' }
  }

  const instance = await getConnectedProfessionalWhatsappInstance(supabase, appointment.professional_id)
  if (!instance) {
    return { sent: false, skippedReason: 'no_professional_instance' }
  }

  const baseIdempotencyKey = buildAppointmentAgentIdempotencyKey({
      agentSlug: AGENT_SLUG,
      appointmentId: appointment.id,
      mode: 'send_confirmation',
    })

  const claim = await claimIdempotency(
    supabase,
    dryRun ? `dry-run:${baseIdempotencyKey}:${crypto.randomUUID()}` : baseIdempotencyKey,
    { appointment_id: appointment.id, dry_run: dryRun },
  )

  if (!claim.claimed) {
    return { sent: false, skippedReason: 'duplicate_confirmation_claim' }
  }

  const config = await getRosaneAgentConfig(supabase, appointment.professional_id)
  const conversation = await resolveOrCreateWhatsappConversation(supabase, {
    professionalId: appointment.professional_id,
    clientId: client.id,
    phone: client.phone_whatsapp,
    preview: 'confirmacao de agendamento',
  })

  await createConversationContext(supabase, {
    professionalId: appointment.professional_id,
    conversationId: conversation.id,
    clientId: client.id,
    contextType: 'appointment_confirmation',
    sourceFunction: AGENT_SLUG,
    refType: 'appointment',
    refId: appointment.id,
    expiresAt: new Date(new Date(appointment.scheduled_at).getTime() + 2 * 60 * 60 * 1000).toISOString(),
    metadata: { mode: 'send_confirmation' },
  })

  await sendMessageCore(supabase, {
    source_webhook: 'professional',
    professional_id: appointment.professional_id,
    instance_name: instance.instanceName,
    to: client.phone_whatsapp,
    text: buildConfirmationText({
      assistantName: config.agentName,
      clientName: client.full_name,
      scheduledAt: appointment.scheduled_at,
      serviceName: service?.name ?? null,
    }),
    actor_type: 'ai',
    agent_slug: AGENT_SLUG,
    dry_run: dryRun,
  })

  if (!dryRun) {
    const { error } = await supabase
      .from('appointments')
      .update({ confirmation_sent_at: new Date().toISOString() })
      .eq('id', appointment.id)
      .eq('professional_id', appointment.professional_id)

    if (error) throw error
  }

  return { sent: true }
}

async function sendCancellationForAppointment(
  supabase: SupabaseClient,
  appointmentId: string,
  dryRun: boolean,
): Promise<{ sent: boolean; skippedReason?: string }> {
  const { appointment, client, service } = await loadAppointmentBundle(supabase, appointmentId)

  if (appointment.status !== 'cancelado' && appointment.status !== 'reagendado') {
    return { sent: false, skippedReason: `invalid_status:${appointment.status}` }
  }

  if (!client?.phone_whatsapp) {
    return { sent: false, skippedReason: 'missing_client_phone' }
  }

  const instance = await getConnectedProfessionalWhatsappInstance(supabase, appointment.professional_id)
  if (!instance) {
    return { sent: false, skippedReason: 'no_professional_instance' }
  }

  const baseIdempotencyKey = buildAppointmentAgentIdempotencyKey({
    agentSlug: AGENT_SLUG,
    appointmentId: appointment.id,
    mode: 'send_cancellation',
  })

  const claim = await claimIdempotency(
    supabase,
    dryRun ? `dry-run:${baseIdempotencyKey}:${crypto.randomUUID()}` : baseIdempotencyKey,
    { appointment_id: appointment.id, dry_run: dryRun },
  )

  if (!claim.claimed) {
    return { sent: false, skippedReason: 'duplicate_cancellation_claim' }
  }

  const config = await getRosaneAgentConfig(supabase, appointment.professional_id)
  const conversation = await resolveOrCreateWhatsappConversation(supabase, {
    professionalId: appointment.professional_id,
    clientId: client.id,
    phone: client.phone_whatsapp,
    preview: 'cancelamento de agendamento',
  })

  await createConversationContext(supabase, {
    professionalId: appointment.professional_id,
    conversationId: conversation.id,
    clientId: client.id,
    contextType: 'appointment_confirmation',
    sourceFunction: AGENT_SLUG,
    refType: 'appointment',
    refId: appointment.id,
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    metadata: { mode: 'send_cancellation' },
  })

  await sendMessageCore(supabase, {
    source_webhook: 'professional',
    professional_id: appointment.professional_id,
    instance_name: instance.instanceName,
    to: client.phone_whatsapp,
    text: buildCancellationText({
      assistantName: config.agentName,
      clientName: client.full_name,
      scheduledAt: appointment.scheduled_at,
      serviceName: service?.name ?? null,
    }),
    actor_type: 'ai',
    agent_slug: AGENT_SLUG,
    dry_run: dryRun,
  })

  return { sent: true }
}

async function processFallback(
  supabase: SupabaseClient,
  input: AppointmentConfirmationAgentInput,
  dryRun: boolean,
): Promise<{ processed: number; sent: number; skipped: number }> {
  let query = supabase
    .from('appointments')
    .select('id')
    .eq('status', 'agendado')
    .is('deleted_at', null)
    .is('confirmation_sent_at', null)
    .gte('scheduled_at', new Date().toISOString())
    .order('scheduled_at', { ascending: true })
    .limit(20)

  if (input.professional_id) {
    query = query.eq('professional_id', input.professional_id)
  }

  const { data, error } = await query
  if (error) throw error

  let sent = 0
  let skipped = 0

  for (const row of data ?? []) {
    const result = await sendConfirmationForAppointment(supabase, row.id, dryRun)
    if (result.sent) sent += 1
    else skipped += 1
  }

  return {
    processed: data?.length ?? 0,
    sent,
    skipped,
  }
}

async function processReply(
  supabase: SupabaseClient,
  messageEventId: string,
): Promise<{ confirmed?: boolean; cancelled?: boolean; skippedReason?: string }> {
  const { data: messageEvent, error } = await supabase
    .from('message_events')
    .select('id, content')
    .eq('id', messageEventId)
    .single()

  if (error) throw error

  const classification = classifyAppointmentReply(messageEvent.content)

  if (classification === 'confirm') {
    const { error: rpcError } = await supabase.rpc('confirm_appointment_from_whatsapp', {
      p_message_event_id: messageEventId,
      p_response_text: messageEvent.content,
    })
    if (rpcError) throw rpcError
    return { confirmed: true }
  }

  if (classification === 'cancel') {
    const { error: rpcError } = await supabase.rpc('cancel_appointment_from_whatsapp', {
      p_message_event_id: messageEventId,
      p_response_text: messageEvent.content,
    })
    if (rpcError) throw rpcError
    return { cancelled: true }
  }

  if (classification === 'reschedule') {
    return { skippedReason: 'reschedule_manual_required' }
  }

  return { skippedReason: 'reply_not_understood' }
}

Deno.serve(async (request) => {
  let executionId: string | null = null

  try {
    assertInternalAuth(request)
    const input = validateAppointmentConfirmationAgentInput(await request.json())
    const dryRun = input.dry_run ?? isDryRun(request)
    const supabase = createServiceClient()

    const execution = await startAgentExecution(supabase, {
      professionalId: input.professional_id ?? null,
      agentSlug: AGENT_SLUG,
      triggerType: input.mode === 'fallback' ? 'cron' : input.message_event_id ? 'qstash' : 'manual',
      triggerRef: input.appointment_id ?? input.message_event_id ?? input.mode,
      triggerPayload: { ...input, dry_run: dryRun },
      messageEventId: input.message_event_id,
    })
    executionId = execution.id

    if (input.mode === 'fallback') {
      const result = await processFallback(supabase, input, dryRun)
      await completeAgentExecution(supabase, execution.id, { status: 'success' })
      return jsonResponse(validateAppointmentConfirmationAgentOutput({
        processed: true,
        sent: result.sent,
        skipped_reason: result.skipped > 0 ? `skipped:${result.skipped}` : undefined,
      }))
    }

    if (input.mode === 'send_confirmation') {
      const result = await sendConfirmationForAppointment(supabase, input.appointment_id!, dryRun)
      await completeAgentExecution(supabase, execution.id, { status: result.sent ? 'success' : 'skipped' })
      return jsonResponse(validateAppointmentConfirmationAgentOutput({
        processed: result.sent,
        sent: result.sent ? 1 : 0,
        skipped_reason: result.skippedReason,
      }))
    }

    if (input.mode === 'send_cancellation') {
      const result = await sendCancellationForAppointment(supabase, input.appointment_id!, dryRun)
      await completeAgentExecution(supabase, execution.id, { status: result.sent ? 'success' : 'skipped' })
      return jsonResponse(validateAppointmentConfirmationAgentOutput({
        processed: result.sent,
        sent: result.sent ? 1 : 0,
        skipped_reason: result.skippedReason,
      }))
    }

    const result = await processReply(supabase, input.message_event_id!)
    await completeAgentExecution(supabase, execution.id, { status: result.skippedReason ? 'skipped' : 'success' })
    return jsonResponse(validateAppointmentConfirmationAgentOutput({
      processed: !result.skippedReason,
      confirmed: result.confirmed,
      cancelled: result.cancelled,
      skipped_reason: result.skippedReason,
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
