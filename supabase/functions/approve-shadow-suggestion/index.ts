import {
  validateApproveShadowSuggestionFunctionInput,
  validateApproveShadowSuggestionFunctionOutput,
} from '@iaprafaturar/contracts/edge-functions/approve-shadow-suggestion.ts'
import { createClient } from '@supabase/supabase-js'

import { isDryRun } from '../_shared/dry-run.ts'
import { jsonResponse, readBearerToken } from '../_shared/http.ts'
import { getConnectedProfessionalWhatsappInstance } from '../_shared/professional-instance.ts'
import { sendMessageCore } from '../_shared/send-message-core.ts'
import { createServiceClient } from '../_shared/supabase.ts'

const corsHeaders = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, apikey, content-type, x-dry-run',
  'access-control-allow-methods': 'POST, OPTIONS',
}

async function authUserIdFromRequest(request: Request): Promise<string> {
  const token = readBearerToken(request)
  const url = Deno.env.get('SUPABASE_URL')
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')

  if (!token || !url || !anonKey) {
    throw new Response('Unauthorized', { status: 401, headers: corsHeaders })
  }

  const userClient = createClient(url, anonKey, {
    global: { headers: { authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const { data, error } = await userClient.auth.getUser(token)
  if (error || !data.user) {
    throw new Response('Unauthorized', { status: 401, headers: corsHeaders })
  }

  return data.user.id
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const authUserId = await authUserIdFromRequest(request)
    const input = validateApproveShadowSuggestionFunctionInput(await request.json())
    const dryRun = input.dry_run ?? isDryRun(request)
    const supabase = createServiceClient()

    const { data: suggestion, error: suggestionError } = await supabase
      .from('shadow_suggestions')
      .select('id, professional_id, conversation_id, message_event_id, suggested_text, status')
      .eq('id', input.suggestion_id)
      .single()

    if (suggestionError) throw suggestionError
    if (suggestion.status !== 'pending') {
      return jsonResponse(validateApproveShadowSuggestionFunctionOutput({
        approved: false,
        sent: false,
        dry_run: dryRun,
        suggestion_id: suggestion.id,
        conversation_id: suggestion.conversation_id,
        message_event_id: suggestion.message_event_id,
        skipped_reason: 'suggestion_not_pending',
      }), { headers: corsHeaders })
    }

    const { data: professional, error: professionalError } = await supabase
      .from('professionals')
      .select('id, user_id')
      .eq('id', suggestion.professional_id)
      .eq('user_id', authUserId)
      .is('deleted_at', null)
      .single()

    if (professionalError || !professional) {
      throw new Response('Forbidden', { status: 403, headers: corsHeaders })
    }

    const { data: conversation, error: conversationError } = suggestion.conversation_id
      ? await supabase
        .from('conversations')
        .select('id, professional_id, phone')
        .eq('id', suggestion.conversation_id)
        .eq('professional_id', suggestion.professional_id)
        .single()
      : { data: null, error: null }

    if (conversationError) throw conversationError

    const approvedText = input.actual_text?.trim() || suggestion.suggested_text
    const { data: approval, error: approvalError } = await supabase.rpc('approve_shadow_suggestion', {
      p_suggestion_id: suggestion.id,
      p_actual_text: approvedText,
    })

    if (approvalError) throw approvalError

    const textToSend = typeof approval?.text_to_send === 'string' ? approval.text_to_send : approvedText
    const targetPhone = conversation?.phone ?? null

    if (!targetPhone) {
      return jsonResponse(validateApproveShadowSuggestionFunctionOutput({
        approved: true,
        sent: false,
        dry_run: dryRun,
        suggestion_id: suggestion.id,
        conversation_id: suggestion.conversation_id,
        message_event_id: suggestion.message_event_id,
        skipped_reason: 'conversation_phone_missing',
      }), { headers: corsHeaders })
    }

    const instance = await getConnectedProfessionalWhatsappInstance(supabase, suggestion.professional_id)
    if (!instance) {
      return jsonResponse(validateApproveShadowSuggestionFunctionOutput({
        approved: true,
        sent: false,
        dry_run: dryRun,
        suggestion_id: suggestion.id,
        conversation_id: suggestion.conversation_id,
        message_event_id: suggestion.message_event_id,
        skipped_reason: 'professional_instance_not_connected',
      }), { headers: corsHeaders })
    }

    await sendMessageCore(supabase, {
      source_webhook: 'professional',
      professional_id: suggestion.professional_id,
      instance_name: instance.instanceName,
      to: targetPhone,
      text: textToSend,
      actor_type: 'human',
      dry_run: dryRun,
    })

    return jsonResponse(validateApproveShadowSuggestionFunctionOutput({
      approved: true,
      sent: true,
      dry_run: dryRun,
      suggestion_id: suggestion.id,
      conversation_id: suggestion.conversation_id,
      message_event_id: suggestion.message_event_id,
    }), { headers: corsHeaders })
  } catch (error) {
    if (error instanceof Response) return error
    return jsonResponse(
      { error: error instanceof Error ? error.message : 'unknown_error' },
      { status: 500, headers: corsHeaders },
    )
  }
})
