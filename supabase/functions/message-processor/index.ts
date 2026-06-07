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
import { createServiceClient } from '../_shared/supabase.ts'
import { normalizeWhatsappPhone } from '../_shared/professional-instance.ts'
import { getRosaneAgentConfig } from '../_shared/rosane-agent-config.ts'

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

function buildShadowSuggestion(text: string | null | undefined): string {
  const trimmed = String(text ?? '').trim()
  if (trimmed.length === 0) {
    return 'Oi, recebi sua mensagem. Vou verificar e ja te respondo.'
  }

  return 'Oi, recebi sua mensagem. Vou verificar com atencao e ja te respondo por aqui.'
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
      .select('id, professional_id, conversation_id, client_id, instance_name, content, metadata')
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

    const activeContext = await getActiveConversationContext(supabase, {
      professionalId: messageEvent.professional_id,
      conversationId: conversation.id,
      contextTypes: ['appointment_confirmation', 'post_care', 'reminder'],
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

    if (config.shadowMode) {
      const { data: suggestion, error: suggestionError } = await supabase
        .from('shadow_suggestions')
        .insert({
          professional_id: messageEvent.professional_id,
          conversation_id: conversation.id,
          message_event_id: messageEvent.id,
          suggested_text: buildShadowSuggestion(messageEvent.content),
          status: 'pending',
          expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
          metadata: {
            source: 'message-processor',
            client_id: conversation.clientId ?? resolvedClient?.id ?? null,
          },
        })
        .select('id')
        .single()

      if (suggestionError) throw suggestionError

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
