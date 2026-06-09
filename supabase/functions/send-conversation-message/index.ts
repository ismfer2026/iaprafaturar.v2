import {
  validateSendConversationMessageInput,
  validateSendConversationMessageOutput,
} from '@iaprafaturar/contracts/edge-functions/send-conversation-message.ts'

import { isDryRun } from '../_shared/dry-run.ts'
import { sendEvolutionGoText } from '../_shared/evolution-go.ts'
import { jsonResponse } from '../_shared/http.ts'
import { createServiceClient } from '../_shared/supabase.ts'

const CORS_HEADERS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, x-client-info, apikey, content-type, x-dry-run',
  'access-control-allow-methods': 'POST, OPTIONS',
}

function readBearerToken(request: Request): string | null {
  const header = request.headers.get('authorization')
  if (!header) return null
  const [scheme, token] = header.split(' ')
  return scheme?.toLowerCase() === 'bearer' && token ? token : null
}

function publicJsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return jsonResponse(body, {
    ...init,
    headers: {
      ...CORS_HEADERS,
      ...(init.headers ?? {}),
    },
  })
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS })
  }

  if (request.method !== 'POST') {
    return publicJsonResponse({ sent: false, dry_run: false, error: 'method_not_allowed' }, { status: 405 })
  }

  try {
    const token = readBearerToken(request)
    if (!token) return publicJsonResponse({ sent: false, dry_run: false, error: 'unauthorized' }, { status: 401 })

    const input = validateSendConversationMessageInput(await request.json())
    const supabase = createServiceClient()
    const dryRun = input.dry_run ?? isDryRun(request)

    const { data: userData, error: userError } = await supabase.auth.getUser(token)
    if (userError || !userData.user) {
      return publicJsonResponse({ sent: false, dry_run: dryRun, error: 'unauthorized' }, { status: 401 })
    }

    const { data: professional, error: professionalError } = await supabase
      .from('professionals')
      .select('id')
      .eq('user_id', userData.user.id)
      .single()

    if (professionalError || !professional) {
      return publicJsonResponse({ sent: false, dry_run: dryRun, error: 'professional_not_found' }, { status: 403 })
    }

    const { data: conversation, error: conversationError } = await supabase
      .from('conversations')
      .select('id, professional_id, client_id, phone, channel')
      .eq('id', input.conversation_id)
      .eq('professional_id', professional.id)
      .single()

    if (conversationError || !conversation) {
      return publicJsonResponse({ sent: false, dry_run: dryRun, error: 'conversation_not_found' }, { status: 404 })
    }

    if (conversation.channel !== 'whatsapp' || !conversation.phone) {
      return publicJsonResponse(validateSendConversationMessageOutput({
        sent: false,
        dry_run: dryRun,
        conversation_id: conversation.id,
        skipped_reason: 'conversation_without_whatsapp_phone',
      }))
    }

    const { data: instance, error: instanceError } = await supabase
      .from('professional_whatsapp')
      .select('instance_name')
      .eq('professional_id', professional.id)
      .eq('provider', 'evolution_go')
      .eq('is_connected', true)
      .maybeSingle()

    if (instanceError) throw instanceError
    if (!instance?.instance_name) {
      return publicJsonResponse(validateSendConversationMessageOutput({
        sent: false,
        dry_run: dryRun,
        conversation_id: conversation.id,
        skipped_reason: 'no_professional_instance',
      }))
    }

    let providerPayload: Record<string, unknown> = {}
    if (!dryRun) {
      providerPayload = await sendEvolutionGoText({
        sourceWebhook: 'professional',
        instanceName: instance.instance_name,
        to: conversation.phone,
        text: input.text,
      })
    }

    const { data: messageEvent, error: insertError } = await supabase
      .from('message_events')
      .insert({
        professional_id: professional.id,
        conversation_id: conversation.id,
        client_id: conversation.client_id ?? null,
        direction: 'outbound',
        channel: 'whatsapp',
        message_type: 'text',
        source_webhook: 'professional',
        instance_name: instance.instance_name,
        content: input.text,
        sent_by: 'human',
        status: dryRun ? 'dry_run' : 'sent',
        sent_at: dryRun ? null : new Date().toISOString(),
        metadata: { to: conversation.phone, sent_from: 'send-conversation-message' },
        provider_payload: providerPayload,
      })
      .select('id')
      .single()

    if (insertError) throw insertError

    await supabase
      .from('conversations')
      .update({
        last_message_at: new Date().toISOString(),
        last_message_preview: input.text,
        unread_count: 0,
      })
      .eq('id', conversation.id)
      .eq('professional_id', professional.id)

    return publicJsonResponse(validateSendConversationMessageOutput({
      sent: true,
      dry_run: dryRun,
      conversation_id: conversation.id,
      message_event_id: messageEvent.id,
    }))
  } catch (error) {
    if (error instanceof Error && error.name === 'ZodError') {
      return publicJsonResponse({ sent: false, dry_run: false, error: 'invalid_input' }, { status: 400 })
    }

    return publicJsonResponse({ sent: false, dry_run: false, error: 'internal_error' }, { status: 500 })
  }
})
