import { validateMessageProcessorInput } from '@iaprafaturar/contracts/edge-functions/message-processor.ts'

import { startAgentExecution, completeAgentExecution } from '../_shared/agent-executions.ts'
import {
  getActiveConversationContext,
  linkMessageEventToConversation,
  resolveClientByPhone,
  resolveOrCreateWhatsappConversation,
} from '../_shared/appointment-context.ts'
import { assertInternalAuth } from '../_shared/internal-auth.ts'
import { isDryRun } from '../_shared/dry-run.ts'
import { jsonResponse } from '../_shared/http.ts'
import { logQstashConsumed } from '../_shared/qstash.ts'
import { sendMessageCore } from '../_shared/send-message-core.ts'
import { createServiceClient } from '../_shared/supabase.ts'
import { normalizeWhatsappPhone } from '../_shared/professional-instance.ts'
import { getRosaneAgentConfig } from '../_shared/rosane-agent-config.ts'

type OperationalRoute = 'general_info' | 'appointment_intake' | 'reschedule_intake' | 'cancellation_intake' | 'unknown'
type ServiceOption = { id: string; name: string; price: number | string | null; duration_minutes: number | null }
type SlotOption = { index: number; scheduled_at: string; label: string }
type AppointmentOption = {
  id: string
  scheduled_at: string
  duration_minutes: number
  service_id: string | null
  services?: { name?: string | null } | null
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

function normalizeIntentText(text: string | null | undefined): string {
  return String(text ?? '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
}

function classifyOperationalRoute(text: string | null | undefined): OperationalRoute {
  const normalized = normalizeIntentText(text)

  if (/\b(cancelar|cancela|desmarcar|nao posso|nao vou)\b/.test(normalized)) return 'cancellation_intake'
  if (/\b(remarcar|reagendar|mudar horario|outro horario|outro dia)\b/.test(normalized)) return 'reschedule_intake'
  if (/\b(agendar|marcar|horario|agenda|consulta|sessao|atendimento)\b/.test(normalized)) return 'appointment_intake'
  if (/\b(preco|valor|quanto custa|custa|servico|servicos|procedimento|procedimentos|duracao)\b/.test(normalized)) return 'general_info'

  return 'unknown'
}

function buildShadowSuggestion(text: string | null | undefined): string {
  const trimmed = String(text ?? '').trim()
  if (trimmed.length === 0) {
    return 'Oi, recebi sua mensagem. Vou verificar e ja te respondo.'
  }

  return 'Oi, recebi sua mensagem. Vou verificar com atencao e ja te respondo por aqui.'
}

function buildServiceInfoText(input: {
  agentName: string
  services: Array<{ name: string; price: number | string | null; duration_minutes: number | null }>
}): string {
  const lines = input.services.slice(0, 5).map((service) => {
    const price = Number(service.price ?? 0)
    const formattedPrice = price > 0
      ? price.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
      : 'valor a confirmar'
    const duration = service.duration_minutes ? `${service.duration_minutes} min` : 'duracao a confirmar'
    return `- ${service.name}: ${formattedPrice} (${duration})`
  })

  return `Oi, aqui e ${input.agentName}. Estes sao os servicos ativos que encontrei:\n\n${lines.join('\n')}\n\nSe quiser, me diga qual servico e o melhor dia/horario para eu seguir com o agendamento.`
}

function buildOperationalPrompt(input: { route: OperationalRoute; agentName: string }): string {
  if (input.route === 'appointment_intake') {
    return `Oi, aqui e ${input.agentName}. Para agendar, me diga qual servico voce quer e quais dias/horarios funcionam melhor.`
  }

  if (input.route === 'reschedule_intake') {
    return `Oi, aqui e ${input.agentName}. Posso ajudar com a remarcacao. Me diga qual agendamento voce quer remarcar e quais novos horarios funcionam melhor.`
  }

  if (input.route === 'cancellation_intake') {
    return `Oi, aqui e ${input.agentName}. Posso ajudar com o cancelamento. Me diga qual agendamento voce quer cancelar.`
  }

  return `Oi, aqui e ${input.agentName}. Recebi sua mensagem e vou verificar.`
}

function parseSelectedIndex(text: string | null | undefined, max: number): number | null {
  const match = normalizeIntentText(text).match(/\b([1-9][0-9]?)\b/)
  if (!match) return null

  const value = Number(match[1])
  if (!Number.isInteger(value) || value < 1 || value > max) return null
  return value
}

function isExplicitConfirmation(text: string | null | undefined): boolean {
  return /\b(confirmo|confirmar|pode marcar|pode agendar|sim|ok|fechado)\b/.test(normalizeIntentText(text))
}

function isNegativeReply(text: string | null | undefined): boolean {
  return /\b(nao|cancelar|cancela|deixa|desistir|parar)\b/.test(normalizeIntentText(text))
}

function formatSlotLabel(iso: string): string {
  return new Intl.DateTimeFormat('pt-BR', {
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'America/Sao_Paulo',
  }).format(new Date(iso))
}

function buildServiceSelectionText(input: { agentName: string; services: ServiceOption[] }): string {
  const serviceLines = input.services.slice(0, 8).map((service, index) => {
    const price = Number(service.price ?? 0)
    const formattedPrice = price > 0
      ? price.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
      : 'valor a confirmar'
    return `${index + 1}. ${service.name} - ${formattedPrice}`
  })

  return `Oi, aqui e ${input.agentName}. Para agendar, escolha um servico:\n\n${serviceLines.join('\n')}\n\nResponda com o numero do servico.`
}

function buildSlotSelectionText(input: { serviceName: string; slots: SlotOption[] }): string {
  const slotLines = input.slots.map((slot) => `${slot.index}. ${slot.label}`)
  return `Para ${input.serviceName}, encontrei estes horarios disponiveis:\n\n${slotLines.join('\n')}\n\nResponda "confirmar 1", "confirmar 2" ou "confirmar 3".`
}

function buildAppointmentCreatedText(input: { agentName: string; serviceName: string; scheduledAt: string }): string {
  return `Pronto, agendamento confirmado para ${input.serviceName} em ${formatSlotLabel(input.scheduledAt)}. ${input.agentName} vai te lembrar por aqui.`
}

function buildAppointmentSelectionText(input: { action: 'cancel' | 'reschedule'; appointments: AppointmentOption[] }): string {
  const verb = input.action === 'cancel' ? 'cancelar' : 'remarcar'
  const lines = input.appointments.map((appointment, index) => {
    const serviceName = appointment.services?.name ?? 'Atendimento'
    return `${index + 1}. ${formatSlotLabel(appointment.scheduled_at)} - ${serviceName}`
  })

  return `Qual agendamento voce quer ${verb}?\n\n${lines.join('\n')}\n\nResponda com o numero.`
}

function buildCancellationConfirmationText(input: { appointment: AppointmentOption }): string {
  const serviceName = input.appointment.services?.name ?? 'atendimento'
  return `Voce quer cancelar ${serviceName} em ${formatSlotLabel(input.appointment.scheduled_at)}? Responda "confirmar cancelamento" para concluir.`
}

async function listActiveServices(
  supabase: ReturnType<typeof createServiceClient>,
  professionalId: string,
): Promise<ServiceOption[]> {
  const { data, error } = await supabase
    .from('services')
    .select('id, name, price, duration_minutes')
    .eq('professional_id', professionalId)
    .eq('is_active', true)
    .is('deleted_at', null)
    .order('name', { ascending: true })
    .limit(8)

  if (error) throw error
  return (data ?? []) as ServiceOption[]
}

function selectServiceFromText(text: string | null | undefined, services: ServiceOption[]): ServiceOption | null {
  const selectedIndex = parseSelectedIndex(text, services.length)
  if (selectedIndex) return services[selectedIndex - 1] ?? null

  const normalized = normalizeIntentText(text)
  return services.find((service) => normalized.includes(normalizeIntentText(service.name))) ?? null
}

async function listUpcomingClientAppointments(
  supabase: ReturnType<typeof createServiceClient>,
  input: {
    professionalId: string
    clientId: string
  },
): Promise<AppointmentOption[]> {
  const { data, error } = await supabase
    .from('appointments')
    .select('id, scheduled_at, duration_minutes, service_id, services(name)')
    .eq('professional_id', input.professionalId)
    .eq('client_id', input.clientId)
    .in('status', ['agendado', 'confirmado'])
    .is('deleted_at', null)
    .gte('scheduled_at', new Date().toISOString())
    .order('scheduled_at', { ascending: true })
    .limit(5)

  if (error) throw error
  return (data ?? []) as AppointmentOption[]
}

async function buildAvailableSlots(
  supabase: ReturnType<typeof createServiceClient>,
  input: {
    professionalId: string
    durationMinutes: number
    excludeAppointmentId?: string | null
  },
): Promise<SlotOption[]> {
  const slots: SlotOption[] = []
  const now = new Date()
  const candidateHours = [9, 11, 14, 16]

  for (let dayOffset = 1; dayOffset <= 14 && slots.length < 3; dayOffset += 1) {
    for (const hour of candidateHours) {
      if (slots.length >= 3) break

      const candidate = new Date(now)
      candidate.setDate(now.getDate() + dayOffset)
      candidate.setHours(hour, 0, 0, 0)

      const weekday = candidate.getDay()
      if (weekday === 0) continue

      const { data, error } = await supabase.rpc('phase12_appointment_conflicts', {
        p_professional_id: input.professionalId,
        p_scheduled_at: candidate.toISOString(),
        p_duration_minutes: input.durationMinutes,
        p_exclude_appointment_id: input.excludeAppointmentId ?? null,
      })

      if (error) throw error
      if (data === true) continue

      slots.push({
        index: slots.length + 1,
        scheduled_at: candidate.toISOString(),
        label: formatSlotLabel(candidate.toISOString()),
      })
    }
  }

  return slots
}

async function sendAiReply(
  supabase: ReturnType<typeof createServiceClient>,
  input: {
    professionalId: string
    instanceName: string | null
    to: string | null
    text: string
    dryRun: boolean
  },
): Promise<unknown> {
  if (!input.to || !input.instanceName) {
    return {
      skipped: true,
      reason: !input.to ? 'missing_inbound_phone' : 'missing_instance_name',
    }
  }

  return await sendMessageCore(supabase, {
    source_webhook: 'professional',
    professional_id: input.professionalId,
    instance_name: input.instanceName,
    to: input.to,
    text: input.text,
    actor_type: 'ai',
    agent_slug: 'rosane-operational-agent',
    dry_run: input.dryRun,
  })
}

async function updateConversationContextMetadata(
  supabase: ReturnType<typeof createServiceClient>,
  input: {
    contextId: string
    metadata: Record<string, unknown>
    status?: 'active' | 'closed'
  },
): Promise<void> {
  const update: Record<string, unknown> = {
    metadata: input.metadata,
  }

  if (input.status === 'closed') {
    update.status = 'closed'
    update.closed_at = new Date().toISOString()
  }

  const { error } = await supabase
    .from('conversation_contexts')
    .update(update)
    .eq('id', input.contextId)

  if (error) throw error
}

async function createOperationalConversationContext(
  supabase: ReturnType<typeof createServiceClient>,
  input: {
    professionalId: string
    conversationId: string
    clientId?: string | null
    route: OperationalRoute
    messageEventId: string
  },
): Promise<{ id: string } | null> {
  if (input.route === 'general_info' || input.route === 'unknown') return null

  const { data, error } = await supabase
    .from('conversation_contexts')
    .insert({
      professional_id: input.professionalId,
      conversation_id: input.conversationId,
      client_id: input.clientId ?? null,
      context_type: 'conversation',
      status: 'active',
      source_function: 'message-processor',
      ref_type: 'message_event',
      ref_id: input.messageEventId,
      privacy_classification: 'business',
      expires_at: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
      metadata: {
        operational_route: input.route,
        step: input.route === 'appointment_intake' ? 'awaiting_service' : 'awaiting_details',
        message_event_id: input.messageEventId,
      },
    })
    .select('id')
    .single()

  if (error) throw error
  return data as { id: string }
}

async function handleCancellationIntakeContext(
  supabase: ReturnType<typeof createServiceClient>,
  input: {
    messageEvent: {
      id: string
      professional_id: string
      instance_name: string | null
      content: string | null
    }
    clientId: string | null
    inboundPhone: string | null
    context: { id: string; metadata: Record<string, unknown> }
    dryRun: boolean
  },
): Promise<{ action: string; sendResult?: unknown; appointmentId?: string }> {
  const currentMetadata = input.context.metadata ?? {}
  const step = typeof currentMetadata.step === 'string' ? currentMetadata.step : 'awaiting_appointment'

  if (!input.clientId) {
    const sendResult = await sendAiReply(supabase, {
      professionalId: input.messageEvent.professional_id,
      instanceName: input.messageEvent.instance_name,
      to: input.inboundPhone,
      text: 'Para cancelar, preciso localizar seu cadastro. Vou deixar sua mensagem para o profissional conferir.',
      dryRun: input.dryRun,
    })
    return { action: 'needs_client', sendResult }
  }

  const appointments = await listUpcomingClientAppointments(supabase, {
    professionalId: input.messageEvent.professional_id,
    clientId: input.clientId,
  })

  if (appointments.length === 0) {
    const sendResult = await sendAiReply(supabase, {
      professionalId: input.messageEvent.professional_id,
      instanceName: input.messageEvent.instance_name,
      to: input.inboundPhone,
      text: 'Nao encontrei agendamentos futuros ativos no seu cadastro. Vou deixar sua mensagem para o profissional conferir.',
      dryRun: input.dryRun,
    })
    return { action: 'no_upcoming_appointments', sendResult }
  }

  if (step === 'awaiting_appointment') {
    const selectedIndex = parseSelectedIndex(input.messageEvent.content, appointments.length)
    const selectedAppointment = selectedIndex ? appointments[selectedIndex - 1] : null

    if (!selectedAppointment) {
      const metadata = {
        ...currentMetadata,
        step: 'awaiting_appointment',
        appointment_options: appointments.map((appointment, index) => ({
          index: index + 1,
          id: appointment.id,
          scheduled_at: appointment.scheduled_at,
        })),
      }
      await updateConversationContextMetadata(supabase, { contextId: input.context.id, metadata })
      const sendResult = await sendAiReply(supabase, {
        professionalId: input.messageEvent.professional_id,
        instanceName: input.messageEvent.instance_name,
        to: input.inboundPhone,
        text: buildAppointmentSelectionText({ action: 'cancel', appointments }),
        dryRun: input.dryRun,
      })
      return { action: 'appointment_options_sent', sendResult }
    }

    const metadata = {
      ...currentMetadata,
      step: 'awaiting_cancellation_confirmation',
      appointment_id: selectedAppointment.id,
      appointment_label: formatSlotLabel(selectedAppointment.scheduled_at),
    }
    await updateConversationContextMetadata(supabase, { contextId: input.context.id, metadata })
    const sendResult = await sendAiReply(supabase, {
      professionalId: input.messageEvent.professional_id,
      instanceName: input.messageEvent.instance_name,
      to: input.inboundPhone,
      text: buildCancellationConfirmationText({ appointment: selectedAppointment }),
      dryRun: input.dryRun,
    })
    return { action: 'cancellation_confirmation_requested', sendResult, appointmentId: selectedAppointment.id }
  }

  if (step === 'awaiting_cancellation_confirmation') {
    const appointmentId = typeof currentMetadata.appointment_id === 'string' ? currentMetadata.appointment_id : null
    if (!appointmentId) {
      await updateConversationContextMetadata(supabase, { contextId: input.context.id, metadata: { ...currentMetadata, step: 'awaiting_appointment' } })
      return await handleCancellationIntakeContext(supabase, {
        ...input,
        context: { id: input.context.id, metadata: { ...currentMetadata, step: 'awaiting_appointment' } },
      })
    }

    if (!isExplicitConfirmation(input.messageEvent.content)) {
      const sendResult = await sendAiReply(supabase, {
        professionalId: input.messageEvent.professional_id,
        instanceName: input.messageEvent.instance_name,
        to: input.inboundPhone,
        text: 'Para concluir, responda "confirmar cancelamento".',
        dryRun: input.dryRun,
      })
      return { action: 'needs_cancellation_confirmation', sendResult, appointmentId }
    }

    const { data, error } = await supabase.rpc('cancel_appointment_from_conversation', {
      p_message_event_id: input.messageEvent.id,
      p_appointment_id: appointmentId,
      p_reason: 'Cancelado por confirmacao em conversa WhatsApp.',
      p_confirmed: true,
    })

    if (error) throw error

    await updateConversationContextMetadata(supabase, {
      contextId: input.context.id,
      metadata: { ...currentMetadata, step: 'appointment_cancelled', result: data },
      status: data?.ok ? 'closed' : 'active',
    })

    const sendResult = await sendAiReply(supabase, {
      professionalId: input.messageEvent.professional_id,
      instanceName: input.messageEvent.instance_name,
      to: input.inboundPhone,
      text: data?.ok
        ? 'Cancelamento confirmado. O profissional sera avisado por aqui.'
        : data?.error === 'window_closed'
          ? 'Esse agendamento esta fora da janela de cancelamento automatico. Vou deixar sua mensagem para o profissional acompanhar.'
          : 'Nao consegui concluir o cancelamento automatico. Vou deixar sua mensagem para o profissional acompanhar.',
      dryRun: input.dryRun,
    })
    return { action: data?.ok ? 'appointment_cancelled' : String(data?.error ?? 'not_cancelled'), sendResult, appointmentId }
  }

  return { action: 'unhandled_cancellation_step' }
}

async function handleRescheduleIntakeContext(
  supabase: ReturnType<typeof createServiceClient>,
  input: {
    messageEvent: {
      id: string
      professional_id: string
      instance_name: string | null
      content: string | null
    }
    clientId: string | null
    inboundPhone: string | null
    context: { id: string; metadata: Record<string, unknown> }
    dryRun: boolean
  },
): Promise<{ action: string; sendResult?: unknown; appointmentId?: string }> {
  const currentMetadata = input.context.metadata ?? {}
  const step = typeof currentMetadata.step === 'string' ? currentMetadata.step : 'awaiting_appointment'

  if (!input.clientId) {
    const sendResult = await sendAiReply(supabase, {
      professionalId: input.messageEvent.professional_id,
      instanceName: input.messageEvent.instance_name,
      to: input.inboundPhone,
      text: 'Para remarcar, preciso localizar seu cadastro. Vou deixar sua mensagem para o profissional conferir.',
      dryRun: input.dryRun,
    })
    return { action: 'needs_client', sendResult }
  }

  const appointments = await listUpcomingClientAppointments(supabase, {
    professionalId: input.messageEvent.professional_id,
    clientId: input.clientId,
  })

  if (appointments.length === 0) {
    const sendResult = await sendAiReply(supabase, {
      professionalId: input.messageEvent.professional_id,
      instanceName: input.messageEvent.instance_name,
      to: input.inboundPhone,
      text: 'Nao encontrei agendamentos futuros ativos no seu cadastro. Vou deixar sua mensagem para o profissional conferir.',
      dryRun: input.dryRun,
    })
    return { action: 'no_upcoming_appointments', sendResult }
  }

  if (step === 'awaiting_appointment') {
    const selectedIndex = parseSelectedIndex(input.messageEvent.content, appointments.length)
    const selectedAppointment = selectedIndex ? appointments[selectedIndex - 1] : null

    if (!selectedAppointment) {
      const metadata = {
        ...currentMetadata,
        step: 'awaiting_appointment',
        appointment_options: appointments.map((appointment, index) => ({
          index: index + 1,
          id: appointment.id,
          scheduled_at: appointment.scheduled_at,
        })),
      }
      await updateConversationContextMetadata(supabase, { contextId: input.context.id, metadata })
      const sendResult = await sendAiReply(supabase, {
        professionalId: input.messageEvent.professional_id,
        instanceName: input.messageEvent.instance_name,
        to: input.inboundPhone,
        text: buildAppointmentSelectionText({ action: 'reschedule', appointments }),
        dryRun: input.dryRun,
      })
      return { action: 'appointment_options_sent', sendResult }
    }

    const slots = await buildAvailableSlots(supabase, {
      professionalId: input.messageEvent.professional_id,
      durationMinutes: selectedAppointment.duration_minutes,
      excludeAppointmentId: selectedAppointment.id,
    })

    if (slots.length === 0) {
      const sendResult = await sendAiReply(supabase, {
        professionalId: input.messageEvent.professional_id,
        instanceName: input.messageEvent.instance_name,
        to: input.inboundPhone,
        text: 'Nao encontrei novos horarios disponiveis nos proximos dias. Vou deixar sua mensagem para o profissional acompanhar.',
        dryRun: input.dryRun,
      })
      return { action: 'no_slots', sendResult, appointmentId: selectedAppointment.id }
    }

    const metadata = {
      ...currentMetadata,
      step: 'awaiting_reschedule_confirmation',
      appointment_id: selectedAppointment.id,
      available_slots: slots,
    }
    await updateConversationContextMetadata(supabase, { contextId: input.context.id, metadata })
    const sendResult = await sendAiReply(supabase, {
      professionalId: input.messageEvent.professional_id,
      instanceName: input.messageEvent.instance_name,
      to: input.inboundPhone,
      text: buildSlotSelectionText({ serviceName: 'remarcacao', slots }),
      dryRun: input.dryRun,
    })
    return { action: 'reschedule_slots_sent', sendResult, appointmentId: selectedAppointment.id }
  }

  if (step === 'awaiting_reschedule_confirmation') {
    const appointmentId = typeof currentMetadata.appointment_id === 'string' ? currentMetadata.appointment_id : null
    const slots = Array.isArray(currentMetadata.available_slots) ? currentMetadata.available_slots as SlotOption[] : []
    const selectedIndex = parseSelectedIndex(input.messageEvent.content, slots.length)
    const selectedSlot = selectedIndex ? slots.find((slot) => slot.index === selectedIndex) : null

    if (!appointmentId || !selectedSlot || !isExplicitConfirmation(input.messageEvent.content)) {
      const sendResult = await sendAiReply(supabase, {
        professionalId: input.messageEvent.professional_id,
        instanceName: input.messageEvent.instance_name,
        to: input.inboundPhone,
        text: 'Para concluir, responda "confirmar 1", "confirmar 2" ou "confirmar 3".',
        dryRun: input.dryRun,
      })
      return { action: 'needs_reschedule_confirmation', sendResult, appointmentId: appointmentId ?? undefined }
    }

    const { data, error } = await supabase.rpc('reschedule_appointment_from_conversation', {
      p_message_event_id: input.messageEvent.id,
      p_appointment_id: appointmentId,
      p_new_scheduled_at: selectedSlot.scheduled_at,
      p_confirmed: true,
    })

    if (error) throw error

    await updateConversationContextMetadata(supabase, {
      contextId: input.context.id,
      metadata: { ...currentMetadata, step: 'appointment_rescheduled', result: data },
      status: data?.ok ? 'closed' : 'active',
    })

    const sendResult = await sendAiReply(supabase, {
      professionalId: input.messageEvent.professional_id,
      instanceName: input.messageEvent.instance_name,
      to: input.inboundPhone,
      text: data?.ok
        ? `Remarcacao confirmada para ${formatSlotLabel(selectedSlot.scheduled_at)}.`
        : data?.error === 'window_closed'
          ? 'Esse agendamento esta fora da janela de remarcacao automatica. Vou deixar sua mensagem para o profissional acompanhar.'
          : 'Nao consegui concluir a remarcacao automatica. Vou deixar sua mensagem para o profissional acompanhar.',
      dryRun: input.dryRun,
    })
    return { action: data?.ok ? 'appointment_rescheduled' : String(data?.error ?? 'not_rescheduled'), sendResult, appointmentId }
  }

  return { action: 'unhandled_reschedule_step' }
}

async function handleAppointmentIntakeContext(
  supabase: ReturnType<typeof createServiceClient>,
  input: {
    messageEvent: {
      id: string
      professional_id: string
      instance_name: string | null
      content: string | null
    }
    conversationId: string
    clientId: string | null
    inboundPhone: string | null
    context: { id: string; metadata: Record<string, unknown> }
    agentName: string
    dryRun: boolean
  },
): Promise<{ action: string; sendResult?: unknown; appointmentId?: string; contextMetadata?: Record<string, unknown> }> {
  const currentMetadata = input.context.metadata ?? {}
  const step = typeof currentMetadata.step === 'string' ? currentMetadata.step : 'awaiting_service'

  if (!input.clientId) {
    const text = `Para agendar, preciso identificar seu cadastro primeiro. Me envie seu nome completo para eu pedir ao profissional conferir por aqui.`
    const sendResult = await sendAiReply(supabase, {
      professionalId: input.messageEvent.professional_id,
      instanceName: input.messageEvent.instance_name,
      to: input.inboundPhone,
      text,
      dryRun: input.dryRun,
    })
    return { action: 'needs_client', sendResult }
  }

  const services = await listActiveServices(supabase, input.messageEvent.professional_id)
  if (services.length === 0) {
    const sendResult = await sendAiReply(supabase, {
      professionalId: input.messageEvent.professional_id,
      instanceName: input.messageEvent.instance_name,
      to: input.inboundPhone,
      text: `Ainda nao encontrei servicos ativos para agendar por aqui. Vou deixar sua mensagem para o profissional responder.`,
      dryRun: input.dryRun,
    })
    return { action: 'no_services', sendResult }
  }

  if (step === 'awaiting_service') {
    const selectedService = selectServiceFromText(input.messageEvent.content, services)

    if (!selectedService) {
      const metadata = {
        ...currentMetadata,
        step: 'awaiting_service',
        service_options: services.map((service, index) => ({ index: index + 1, id: service.id, name: service.name })),
      }
      await updateConversationContextMetadata(supabase, { contextId: input.context.id, metadata })
      const sendResult = await sendAiReply(supabase, {
        professionalId: input.messageEvent.professional_id,
        instanceName: input.messageEvent.instance_name,
        to: input.inboundPhone,
        text: buildServiceSelectionText({ agentName: input.agentName, services }),
        dryRun: input.dryRun,
      })
      return { action: 'service_options_sent', sendResult, contextMetadata: metadata }
    }

    const slots = await buildAvailableSlots(supabase, {
      professionalId: input.messageEvent.professional_id,
      durationMinutes: selectedService.duration_minutes ?? 60,
    })

    if (slots.length === 0) {
      const sendResult = await sendAiReply(supabase, {
        professionalId: input.messageEvent.professional_id,
        instanceName: input.messageEvent.instance_name,
        to: input.inboundPhone,
        text: `Nao encontrei horarios disponiveis nos proximos dias para ${selectedService.name}. Vou deixar sua mensagem para o profissional acompanhar.`,
        dryRun: input.dryRun,
      })
      return { action: 'no_slots', sendResult }
    }

    const metadata = {
      ...currentMetadata,
      step: 'awaiting_slot_confirmation',
      service_id: selectedService.id,
      service_name: selectedService.name,
      available_slots: slots,
    }
    await updateConversationContextMetadata(supabase, { contextId: input.context.id, metadata })
    const sendResult = await sendAiReply(supabase, {
      professionalId: input.messageEvent.professional_id,
      instanceName: input.messageEvent.instance_name,
      to: input.inboundPhone,
      text: buildSlotSelectionText({ serviceName: selectedService.name, slots }),
      dryRun: input.dryRun,
    })
    return { action: 'slot_options_sent', sendResult, contextMetadata: metadata }
  }

  if (step === 'awaiting_slot_confirmation') {
    const slots = Array.isArray(currentMetadata.available_slots) ? currentMetadata.available_slots as SlotOption[] : []
    const serviceId = typeof currentMetadata.service_id === 'string' ? currentMetadata.service_id : null
    const serviceName = typeof currentMetadata.service_name === 'string' ? currentMetadata.service_name : 'servico'
    const selectedIndex = parseSelectedIndex(input.messageEvent.content, slots.length)
    const selectedSlot = selectedIndex ? slots.find((slot) => slot.index === selectedIndex) : null

    if (!serviceId || slots.length === 0) {
      await updateConversationContextMetadata(supabase, {
        contextId: input.context.id,
        metadata: { ...currentMetadata, step: 'awaiting_service' },
      })
      return await handleAppointmentIntakeContext(supabase, {
        ...input,
        context: { id: input.context.id, metadata: { ...currentMetadata, step: 'awaiting_service' } },
      })
    }

    if (!selectedSlot || !isExplicitConfirmation(input.messageEvent.content)) {
      const sendResult = await sendAiReply(supabase, {
        professionalId: input.messageEvent.professional_id,
        instanceName: input.messageEvent.instance_name,
        to: input.inboundPhone,
        text: `Para confirmar, responda com "confirmar 1", "confirmar 2" ou "confirmar 3".`,
        dryRun: input.dryRun,
      })
      return { action: 'needs_slot_confirmation', sendResult }
    }

    const { data, error } = await supabase.rpc('create_appointment_from_conversation', {
      p_message_event_id: input.messageEvent.id,
      p_service_id: serviceId,
      p_scheduled_at: selectedSlot.scheduled_at,
      p_confirmed: true,
      p_notes: 'Agendamento criado por conversa WhatsApp.',
    })

    if (error) throw error

    if (data?.status !== 'appointment_created') {
      const sendResult = await sendAiReply(supabase, {
        professionalId: input.messageEvent.professional_id,
        instanceName: input.messageEvent.instance_name,
        to: input.inboundPhone,
        text: data?.error === 'slot_unavailable'
          ? `Esse horario acabou de ficar indisponivel. Quer que eu te envie novas opcoes?`
          : `Ainda preciso confirmar alguns dados antes de marcar.`,
        dryRun: input.dryRun,
      })
      return { action: data?.status ?? 'not_created', sendResult }
    }

    const appointmentId = String(data.appointment_id)
    await invokeInternalFunction('appointment-confirmation-agent', {
      mode: 'send_confirmation',
      appointment_id: appointmentId,
      dry_run: input.dryRun,
    }).catch(() => null)

    await updateConversationContextMetadata(supabase, {
      contextId: input.context.id,
      metadata: {
        ...currentMetadata,
        step: 'appointment_created',
        appointment_id: appointmentId,
        selected_slot: selectedSlot,
      },
      status: 'closed',
    })

    const sendResult = await sendAiReply(supabase, {
      professionalId: input.messageEvent.professional_id,
      instanceName: input.messageEvent.instance_name,
      to: input.inboundPhone,
      text: buildAppointmentCreatedText({
        agentName: input.agentName,
        serviceName,
        scheduledAt: selectedSlot.scheduled_at,
      }),
      dryRun: input.dryRun,
    })

    return { action: 'appointment_created', sendResult, appointmentId }
  }

  if (isNegativeReply(input.messageEvent.content)) {
    await updateConversationContextMetadata(supabase, {
      contextId: input.context.id,
      metadata: { ...currentMetadata, step: 'closed_by_client' },
      status: 'closed',
    })
    return { action: 'closed_by_client' }
  }

  const sendResult = await sendAiReply(supabase, {
    professionalId: input.messageEvent.professional_id,
    instanceName: input.messageEvent.instance_name,
    to: input.inboundPhone,
    text: buildServiceSelectionText({ agentName: input.agentName, services }),
    dryRun: input.dryRun,
  })
  return { action: 'fallback_service_options_sent', sendResult }
}

async function createShadowSuggestion(
  supabase: ReturnType<typeof createServiceClient>,
  input: {
    professionalId: string
    conversationId: string
    messageEventId: string
    suggestedText: string
    clientId?: string | null
    source?: string
  },
): Promise<{ id: string }> {
  const { data, error } = await supabase
    .from('shadow_suggestions')
    .insert({
      professional_id: input.professionalId,
      conversation_id: input.conversationId,
      message_event_id: input.messageEventId,
      suggested_text: input.suggestedText,
      status: 'pending',
      expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      metadata: {
        source: input.source ?? 'message-processor',
        client_id: input.clientId ?? null,
      },
    })
    .select('id')
    .single()

  if (error) throw error
  return data as { id: string }
}

async function interpretImageWithAI(mediaUrl: string, clientName: string): Promise<string> {
  const apiKey = Deno.env.get('ANTHROPIC_API_KEY')
  if (!apiKey) return `[Imagem recebida de ${clientName}]`

  try {
    const imageResp = await fetch(mediaUrl, { signal: AbortSignal.timeout(8000) })
    if (!imageResp.ok) return `[Imagem recebida de ${clientName}]`

    const buffer = await imageResp.arrayBuffer()
    const bytes = new Uint8Array(buffer)
    let binary = ''
    for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i])
    const base64 = btoa(binary)
    const mimeType = imageResp.headers.get('content-type')?.split(';')[0] ?? 'image/jpeg'

    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5',
        max_tokens: 256,
        messages: [{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: mimeType, data: base64 } },
            {
              type: 'text',
              text: `Esta imagem foi enviada via WhatsApp por um cliente chamado ${clientName} para um profissional de saúde. Descreva o que está na imagem em português de forma objetiva e profissional (máximo 2 frases). Se for um documento médico, prescrição ou exame, mencione isso.`,
            },
          ],
        }],
      }),
      signal: AbortSignal.timeout(15000),
    })

    if (!resp.ok) return `[Imagem recebida de ${clientName}]`
    const data = await resp.json() as { content?: Array<{ type: string; text?: string }> }
    const text = data.content?.find((c) => c.type === 'text')?.text?.trim() ?? ''
    return text ? `📷 ${clientName} enviou uma imagem: ${text}` : `[Imagem recebida de ${clientName}]`
  } catch {
    return `[Imagem recebida de ${clientName}]`
  }
}

async function invokeInternalFunction(functionName: string, payload: Record<string, unknown>): Promise<unknown> {
  const baseUrl = Deno.env.get('FUNCTIONS_BASE_URL')
  const internalToken = Deno.env.get('INTERNAL_FUNCTION_TOKEN')

  if (!baseUrl || !internalToken) {
    throw new Error('Missing FUNCTIONS_BASE_URL or INTERNAL_FUNCTION_TOKEN')
  }

  const response = await fetch(`${baseUrl.replace(/\/$/, '')}/${functionName}`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${internalToken}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(payload),
  })

  const body = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(`${functionName} failed: ${response.status} ${JSON.stringify(body)}`)
  }

  return body
}

Deno.serve(async (request) => {
  try {
    assertInternalAuth(request)
    const input = validateMessageProcessorInput(await request.json())
    const dryRun = input.dry_run ?? isDryRun(request)
    const supabase = createServiceClient()

    const { data: messageEvent, error } = await supabase
      .from('message_events')
      .select('id, professional_id, conversation_id, client_id, instance_name, content, message_type, media_url, metadata')
      .eq('id', input.message_event_id)
      .eq('source_webhook', 'professional')
      .eq('direction', 'inbound')
      .single()

    if (error) throw error
    if (!messageEvent.professional_id) {
      return jsonResponse({ processed: false, skipped: true, reason: 'missing_professional_id' })
    }

    await logQstashConsumed(supabase, {
      jobId: input.idempotency_key,
      queueName: 'message-processor',
      messageEventId: input.message_event_id,
      professionalId: messageEvent.professional_id,
    })

    const execution = await startAgentExecution(supabase, {
      professionalId: messageEvent.professional_id,
      agentSlug: 'message-processor',
      triggerType: 'qstash',
      triggerRef: input.message_event_id,
      triggerPayload: input,
      messageEventId: input.message_event_id,
    })

    const metadata = (messageEvent.metadata ?? {}) as Record<string, unknown>
    const inboundPhone = normalizeWhatsappPhone(typeof metadata.from === 'string' ? metadata.from : null)
    const resolvedClient = messageEvent.client_id
      ? { id: messageEvent.client_id, full_name: '' }
      : await resolveClientByPhone(supabase, messageEvent.professional_id, inboundPhone)

    const conversation = messageEvent.conversation_id
      ? { id: messageEvent.conversation_id, clientId: messageEvent.client_id ?? resolvedClient?.id ?? null }
      : await resolveOrCreateWhatsappConversation(supabase, {
        professionalId: messageEvent.professional_id,
        clientId: resolvedClient?.id ?? null,
        phone: inboundPhone,
        preview: messageEvent.content,
      })

    if (!messageEvent.conversation_id || (!messageEvent.client_id && resolvedClient?.id)) {
      await linkMessageEventToConversation(supabase, {
        messageEventId: messageEvent.id,
        conversationId: conversation.id,
        clientId: conversation.clientId ?? resolvedClient?.id ?? null,
      })
    }

    const { data: conversationState, error: conversationStateError } = await supabase
      .from('conversations')
      .select('id, rosane_status, human_takeover_at, metadata')
      .eq('id', conversation.id)
      .eq('professional_id', messageEvent.professional_id)
      .single()

    if (conversationStateError) throw conversationStateError

    if (conversationState.rosane_status === 'human_takeover') {
      await completeAgentExecution(supabase, execution.id, { status: 'skipped' })
      return jsonResponse({
        processed: true,
        skipped: true,
        route: 'human_takeover',
        reason: 'conversation_in_human_takeover',
        dry_run: dryRun,
        message_event_id: messageEvent.id,
        professional_id: messageEvent.professional_id,
        client_id: conversation.clientId ?? resolvedClient?.id ?? null,
        conversation_id: conversation.id,
        human_takeover_at: conversationState.human_takeover_at,
      })
    }

    const activeContext = await getActiveConversationContext(supabase, {
      professionalId: messageEvent.professional_id,
      conversationId: conversation.id,
      contextTypes: ['appointment_confirmation', 'post_care', 'reminder', 'conversation'],
    })

    if (activeContext?.contextType === 'appointment_confirmation') {
      const reply = classifyAppointmentReply(messageEvent.content)

      if (reply === 'confirm') {
        const { error: rpcError } = await supabase.rpc('confirm_appointment_from_whatsapp', {
          p_message_event_id: messageEvent.id,
          p_response_text: messageEvent.content,
        })
        if (rpcError) throw rpcError

        await completeAgentExecution(supabase, execution.id, { status: 'success' })
        return jsonResponse({
          processed: true,
          route: 'appointment_confirmation',
          action: 'confirmed',
          dry_run: dryRun,
          message_event_id: messageEvent.id,
          professional_id: messageEvent.professional_id,
          client_id: conversation.clientId ?? resolvedClient?.id ?? null,
          conversation_id: conversation.id,
          context_id: activeContext.id,
          ref_type: activeContext.refType,
          ref_id: activeContext.refId,
        })
      }

      if (reply === 'cancel') {
        const { error: rpcError } = await supabase.rpc('cancel_appointment_from_whatsapp', {
          p_message_event_id: messageEvent.id,
          p_response_text: messageEvent.content,
        })
        if (rpcError) throw rpcError

        await completeAgentExecution(supabase, execution.id, { status: 'success' })
        return jsonResponse({
          processed: true,
          route: 'appointment_confirmation',
          action: 'cancelled',
          dry_run: dryRun,
          message_event_id: messageEvent.id,
          professional_id: messageEvent.professional_id,
          client_id: conversation.clientId ?? resolvedClient?.id ?? null,
          conversation_id: conversation.id,
          context_id: activeContext.id,
          ref_type: activeContext.refType,
          ref_id: activeContext.refId,
        })
      }

      if (reply === 'reschedule') {
        await completeAgentExecution(supabase, execution.id, { status: 'skipped' })
        return jsonResponse({
          processed: true,
          skipped: true,
          route: 'appointment_confirmation',
          reason: 'reschedule_manual_required',
          dry_run: dryRun,
          message_event_id: messageEvent.id,
          professional_id: messageEvent.professional_id,
          client_id: conversation.clientId ?? resolvedClient?.id ?? null,
          conversation_id: conversation.id,
          context_id: activeContext.id,
          ref_type: activeContext.refType,
          ref_id: activeContext.refId,
        })
      }

      await completeAgentExecution(supabase, execution.id, { status: 'success' })
      return jsonResponse({
        processed: true,
        route: 'appointment_confirmation',
        action: 'unhandled',
        dry_run: dryRun,
        message_event_id: messageEvent.id,
        professional_id: messageEvent.professional_id,
        client_id: conversation.clientId ?? resolvedClient?.id ?? null,
        conversation_id: conversation.id,
        context_id: activeContext.id,
        ref_type: activeContext.refType,
        ref_id: activeContext.refId,
      })
    }

    if (activeContext?.contextType === 'post_care') {
      const agentResult = await invokeInternalFunction('pos-atendimento-agent', {
        mode: 'nps_reply',
        message_event_id: messageEvent.id,
        dry_run: dryRun,
      })

      await completeAgentExecution(supabase, execution.id, { status: 'success' })
      return jsonResponse({
        processed: true,
        route: 'post_care',
        action: 'nps_reply_processed',
        agent_result: agentResult,
        dry_run: dryRun,
        message_event_id: messageEvent.id,
        professional_id: messageEvent.professional_id,
        client_id: conversation.clientId ?? resolvedClient?.id ?? null,
        conversation_id: conversation.id,
        context_id: activeContext.id,
      })
    }

    if (activeContext?.contextType === 'reminder') {
      await completeAgentExecution(supabase, execution.id, { status: 'success' })
      return jsonResponse({
        processed: true,
        route: 'reminder',
        dry_run: dryRun,
        message_event_id: messageEvent.id,
        professional_id: messageEvent.professional_id,
        client_id: conversation.clientId ?? resolvedClient?.id ?? null,
        conversation_id: conversation.id,
        context_id: activeContext.id,
      })
    }

    const config = await getRosaneAgentConfig(supabase, messageEvent.professional_id)

    if (
      activeContext?.contextType === 'conversation'
      && activeContext.metadata?.operational_route === 'appointment_intake'
    ) {
      const result = await handleAppointmentIntakeContext(supabase, {
        messageEvent: {
          id: messageEvent.id,
          professional_id: messageEvent.professional_id,
          instance_name: messageEvent.instance_name,
          content: messageEvent.content,
        },
        conversationId: conversation.id,
        clientId: conversation.clientId ?? resolvedClient?.id ?? null,
        inboundPhone,
        context: { id: activeContext.id, metadata: activeContext.metadata },
        agentName: config.agentName,
        dryRun,
      })

      await completeAgentExecution(supabase, execution.id, { status: 'success' })
      return jsonResponse({
        processed: true,
        route: 'appointment_intake',
        action: result.action,
        appointment_id: result.appointmentId,
        send_result: result.sendResult,
        dry_run: dryRun,
        message_event_id: messageEvent.id,
        professional_id: messageEvent.professional_id,
        client_id: conversation.clientId ?? resolvedClient?.id ?? null,
        conversation_id: conversation.id,
        context_id: activeContext.id,
      })
    }

    if (
      activeContext?.contextType === 'conversation'
      && activeContext.metadata?.operational_route === 'cancellation_intake'
    ) {
      const result = await handleCancellationIntakeContext(supabase, {
        messageEvent: {
          id: messageEvent.id,
          professional_id: messageEvent.professional_id,
          instance_name: messageEvent.instance_name,
          content: messageEvent.content,
        },
        clientId: conversation.clientId ?? resolvedClient?.id ?? null,
        inboundPhone,
        context: { id: activeContext.id, metadata: activeContext.metadata },
        dryRun,
      })

      await completeAgentExecution(supabase, execution.id, { status: 'success' })
      return jsonResponse({
        processed: true,
        route: 'cancellation_intake',
        action: result.action,
        appointment_id: result.appointmentId,
        send_result: result.sendResult,
        dry_run: dryRun,
        message_event_id: messageEvent.id,
        professional_id: messageEvent.professional_id,
        client_id: conversation.clientId ?? resolvedClient?.id ?? null,
        conversation_id: conversation.id,
        context_id: activeContext.id,
      })
    }

    if (
      activeContext?.contextType === 'conversation'
      && activeContext.metadata?.operational_route === 'reschedule_intake'
    ) {
      const result = await handleRescheduleIntakeContext(supabase, {
        messageEvent: {
          id: messageEvent.id,
          professional_id: messageEvent.professional_id,
          instance_name: messageEvent.instance_name,
          content: messageEvent.content,
        },
        clientId: conversation.clientId ?? resolvedClient?.id ?? null,
        inboundPhone,
        context: { id: activeContext.id, metadata: activeContext.metadata },
        dryRun,
      })

      await completeAgentExecution(supabase, execution.id, { status: 'success' })
      return jsonResponse({
        processed: true,
        route: 'reschedule_intake',
        action: result.action,
        appointment_id: result.appointmentId,
        send_result: result.sendResult,
        dry_run: dryRun,
        message_event_id: messageEvent.id,
        professional_id: messageEvent.professional_id,
        client_id: conversation.clientId ?? resolvedClient?.id ?? null,
        conversation_id: conversation.id,
        context_id: activeContext.id,
      })
    }

    if (messageEvent.message_type === 'image') {
      const mediaUrl = typeof messageEvent.media_url === 'string' ? messageEvent.media_url : null
      const clientName = resolvedClient?.full_name || 'Cliente'
      const suggestionText = mediaUrl
        ? await interpretImageWithAI(mediaUrl, clientName)
        : `📷 ${clientName} enviou uma imagem (sem URL disponível).`

      const suggestion = await createShadowSuggestion(supabase, {
        professionalId: messageEvent.professional_id,
        conversationId: conversation.id,
        messageEventId: messageEvent.id,
        suggestedText: suggestionText,
        clientId: conversation.clientId ?? resolvedClient?.id ?? null,
        source: 'message-processor:image',
      })

      await completeAgentExecution(supabase, execution.id, { status: 'success' })
      return jsonResponse({
        processed: true,
        route: 'image_vision',
        shadow_suggestion_id: suggestion.id,
        dry_run: dryRun,
        message_event_id: messageEvent.id,
        professional_id: messageEvent.professional_id,
        client_id: conversation.clientId ?? resolvedClient?.id ?? null,
        conversation_id: conversation.id,
      })
    }

    const operationalRoute = classifyOperationalRoute(messageEvent.content)

    if (operationalRoute !== 'unknown') {
      let replyText: string | null = null

      if (operationalRoute === 'general_info') {
        const { data: services, error: servicesError } = await supabase
          .from('services')
          .select('name, price, duration_minutes')
          .eq('professional_id', messageEvent.professional_id)
          .eq('is_active', true)
          .is('deleted_at', null)
          .order('name', { ascending: true })
          .limit(5)

        if (servicesError) throw servicesError

        if (!services || services.length === 0) {
          await completeAgentExecution(supabase, execution.id, { status: 'skipped' })
          return jsonResponse({
            processed: true,
            skipped: true,
            route: 'general_info',
            reason: 'no_active_services',
            dry_run: dryRun,
            message_event_id: messageEvent.id,
            professional_id: messageEvent.professional_id,
            client_id: conversation.clientId ?? resolvedClient?.id ?? null,
            conversation_id: conversation.id,
          })
        }

        replyText = buildServiceInfoText({
          agentName: config.agentName,
          services: services as Array<{ name: string; price: number | string | null; duration_minutes: number | null }>,
        })
      } else if (operationalRoute === 'appointment_intake') {
        const newContext = await createOperationalConversationContext(supabase, {
          professionalId: messageEvent.professional_id,
          conversationId: conversation.id,
          clientId: conversation.clientId ?? resolvedClient?.id ?? null,
          route: operationalRoute,
          messageEventId: messageEvent.id,
        })

        const result = await handleAppointmentIntakeContext(supabase, {
          messageEvent: {
            id: messageEvent.id,
            professional_id: messageEvent.professional_id,
            instance_name: messageEvent.instance_name,
            content: messageEvent.content,
          },
          conversationId: conversation.id,
          clientId: conversation.clientId ?? resolvedClient?.id ?? null,
          inboundPhone,
          context: { id: newContext?.id ?? '', metadata: { operational_route: 'appointment_intake', step: 'awaiting_service' } },
          agentName: config.agentName,
          dryRun,
        })

        await completeAgentExecution(supabase, execution.id, { status: 'success' })
        return jsonResponse({
          processed: true,
          route: 'appointment_intake',
          action: result.action,
          send_result: result.sendResult,
          dry_run: dryRun,
          message_event_id: messageEvent.id,
          professional_id: messageEvent.professional_id,
          client_id: conversation.clientId ?? resolvedClient?.id ?? null,
          conversation_id: conversation.id,
          context_id: newContext?.id ?? null,
        })
      } else if (operationalRoute === 'cancellation_intake') {
        const newContext = await createOperationalConversationContext(supabase, {
          professionalId: messageEvent.professional_id,
          conversationId: conversation.id,
          clientId: conversation.clientId ?? resolvedClient?.id ?? null,
          route: operationalRoute,
          messageEventId: messageEvent.id,
        })

        const result = await handleCancellationIntakeContext(supabase, {
          messageEvent: {
            id: messageEvent.id,
            professional_id: messageEvent.professional_id,
            instance_name: messageEvent.instance_name,
            content: messageEvent.content,
          },
          clientId: conversation.clientId ?? resolvedClient?.id ?? null,
          inboundPhone,
          context: { id: newContext?.id ?? '', metadata: { operational_route: 'cancellation_intake', step: 'awaiting_appointment' } },
          dryRun,
        })

        await completeAgentExecution(supabase, execution.id, { status: 'success' })
        return jsonResponse({
          processed: true,
          route: 'cancellation_intake',
          action: result.action,
          appointment_id: result.appointmentId,
          send_result: result.sendResult,
          dry_run: dryRun,
          message_event_id: messageEvent.id,
          professional_id: messageEvent.professional_id,
          client_id: conversation.clientId ?? resolvedClient?.id ?? null,
          conversation_id: conversation.id,
          context_id: newContext?.id ?? null,
        })
      } else if (operationalRoute === 'reschedule_intake') {
        const newContext = await createOperationalConversationContext(supabase, {
          professionalId: messageEvent.professional_id,
          conversationId: conversation.id,
          clientId: conversation.clientId ?? resolvedClient?.id ?? null,
          route: operationalRoute,
          messageEventId: messageEvent.id,
        })

        const result = await handleRescheduleIntakeContext(supabase, {
          messageEvent: {
            id: messageEvent.id,
            professional_id: messageEvent.professional_id,
            instance_name: messageEvent.instance_name,
            content: messageEvent.content,
          },
          clientId: conversation.clientId ?? resolvedClient?.id ?? null,
          inboundPhone,
          context: { id: newContext?.id ?? '', metadata: { operational_route: 'reschedule_intake', step: 'awaiting_appointment' } },
          dryRun,
        })

        await completeAgentExecution(supabase, execution.id, { status: 'success' })
        return jsonResponse({
          processed: true,
          route: 'reschedule_intake',
          action: result.action,
          appointment_id: result.appointmentId,
          send_result: result.sendResult,
          dry_run: dryRun,
          message_event_id: messageEvent.id,
          professional_id: messageEvent.professional_id,
          client_id: conversation.clientId ?? resolvedClient?.id ?? null,
          conversation_id: conversation.id,
          context_id: newContext?.id ?? null,
        })
      } else {
        await createOperationalConversationContext(supabase, {
          professionalId: messageEvent.professional_id,
          conversationId: conversation.id,
          clientId: conversation.clientId ?? resolvedClient?.id ?? null,
          route: operationalRoute,
          messageEventId: messageEvent.id,
        })

        replyText = buildOperationalPrompt({ route: operationalRoute, agentName: config.agentName })
      }

      if (config.shadowMode) {
        const suggestion = await createShadowSuggestion(supabase, {
          professionalId: messageEvent.professional_id,
          conversationId: conversation.id,
          messageEventId: messageEvent.id,
          suggestedText: replyText,
          clientId: conversation.clientId ?? resolvedClient?.id ?? null,
          source: `message-processor:${operationalRoute}`,
        })

        await completeAgentExecution(supabase, execution.id, { status: 'success' })
        return jsonResponse({
          processed: true,
          route: 'shadow_suggestion',
          operational_route: operationalRoute,
          dry_run: dryRun,
          message_event_id: messageEvent.id,
          professional_id: messageEvent.professional_id,
          client_id: conversation.clientId ?? resolvedClient?.id ?? null,
          conversation_id: conversation.id,
          shadow_suggestion_id: suggestion.id,
        })
      }

      if (!inboundPhone || !messageEvent.instance_name) {
        await completeAgentExecution(supabase, execution.id, { status: 'skipped' })
        return jsonResponse({
          processed: true,
          skipped: true,
          route: operationalRoute,
          reason: !inboundPhone ? 'missing_inbound_phone' : 'missing_instance_name',
          dry_run: dryRun,
          message_event_id: messageEvent.id,
          professional_id: messageEvent.professional_id,
          client_id: conversation.clientId ?? resolvedClient?.id ?? null,
          conversation_id: conversation.id,
        })
      }

      const sendResult = await sendMessageCore(supabase, {
        source_webhook: 'professional',
        professional_id: messageEvent.professional_id,
        instance_name: messageEvent.instance_name,
        to: inboundPhone,
        text: replyText,
        actor_type: 'ai',
        agent_slug: 'rosane-operational-agent',
        dry_run: dryRun,
      })

      await completeAgentExecution(supabase, execution.id, { status: 'success' })
      return jsonResponse({
        processed: true,
        route: operationalRoute,
        action: 'replied',
        send_result: sendResult,
        dry_run: dryRun,
        message_event_id: messageEvent.id,
        professional_id: messageEvent.professional_id,
        client_id: conversation.clientId ?? resolvedClient?.id ?? null,
        conversation_id: conversation.id,
      })
    }

    if (config.shadowMode) {
      const suggestion = await createShadowSuggestion(supabase, {
        professionalId: messageEvent.professional_id,
        conversationId: conversation.id,
        messageEventId: messageEvent.id,
        suggestedText: buildShadowSuggestion(messageEvent.content),
        clientId: conversation.clientId ?? resolvedClient?.id ?? null,
      })

      await completeAgentExecution(supabase, execution.id, { status: 'success' })
      return jsonResponse({
        processed: true,
        route: 'shadow_suggestion',
        dry_run: dryRun,
        message_event_id: messageEvent.id,
        professional_id: messageEvent.professional_id,
        client_id: conversation.clientId ?? resolvedClient?.id ?? null,
        conversation_id: conversation.id,
        shadow_suggestion_id: suggestion.id,
      })
    }

    await completeAgentExecution(supabase, execution.id, { status: 'skipped' })
    return jsonResponse({
      processed: true,
      skipped: true,
      reason: 'no_deterministic_context_enabled_yet',
      dry_run: dryRun,
      message_event_id: messageEvent.id,
      professional_id: messageEvent.professional_id,
      client_id: conversation.clientId ?? resolvedClient?.id ?? null,
      conversation_id: conversation.id,
    })
  } catch (error) {
    if (error instanceof Response) return error
    return jsonResponse({ processed: false, error: error instanceof Error ? error.message : 'unknown_error' }, { status: 500 })
  }
})
