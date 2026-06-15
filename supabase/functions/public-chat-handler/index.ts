import {
  validatePublicChatContextOutput,
  validatePublicChatHandlerInput,
  validatePublicChatMessageOutput,
} from '@iaprafaturar/contracts/edge-functions/public-chat-handler.ts'

import { jsonResponse } from '../_shared/http.ts'
import { assertPublicRateLimit } from '../_shared/public-rate-limit.ts'
import { createServiceClient } from '../_shared/supabase.ts'

const CORS_HEADERS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, x-client-info, apikey, content-type',
  'access-control-allow-methods': 'GET, POST, OPTIONS',
}

function respond(body: unknown, status = 200): Response {
  return jsonResponse(body, { status, headers: CORS_HEADERS })
}

function mapError(error: unknown): Response {
  if (error instanceof Error && error.name === 'ZodError') {
    return respond({ ok: false, error: 'invalid_input' }, 400)
  }

  const message = [
    error instanceof Error ? error.message : null,
    typeof error === 'object' && error !== null && 'message' in error ? String(error.message) : null,
    typeof error === 'object' && error !== null && 'details' in error ? String(error.details) : null,
    typeof error === 'object' && error !== null && 'hint' in error ? String(error.hint) : null,
    typeof error === 'object' && error !== null && 'code' in error ? String(error.code) : null,
  ].filter(Boolean).join(' ')
  if (message.includes('rate_limited')) return respond({ ok: false, error: 'rate_limited' }, 429)
  if (message.includes('not_found') || message.includes('professional_not_found')) {
    return respond({ ok: false, error: 'not_found' }, 404)
  }
  if (message.includes('chat_unavailable') || message.includes('chat_disabled')) {
    return respond({ ok: false, error: 'chat_unavailable' }, 409)
  }
  return respond({ ok: false, error: 'internal_error' }, 500)
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS_HEADERS })

  try {
    const supabase = createServiceClient()

    if (request.method === 'GET') {
      const url = new URL(request.url)
      const input = validatePublicChatHandlerInput({
        mode: 'get_context',
        slug: url.searchParams.get('slug'),
      })
      await assertPublicRateLimit({
        supabase,
        request,
        action: 'public-chat:get_context',
        subject: input.slug,
        limit: 60,
      })
      const { data, error } = await supabase.rpc('get_public_chat_context', { p_slug: input.slug })
      if (error) throw error
      return respond(validatePublicChatContextOutput({ ok: true, context: data }))
    }

    if (request.method !== 'POST') return respond({ ok: false, error: 'method_not_allowed' }, 405)

    const input = validatePublicChatHandlerInput({ mode: 'send_message', ...await request.json() })
    await assertPublicRateLimit({
      supabase,
      request,
      action: 'public-chat:send_message',
      subject: input.slug,
      limit: 8,
      windowSeconds: 300,
    })

    const { data, error } = await supabase.rpc('register_public_chat_message', {
      p_slug: input.slug,
      p_name: input.name,
      p_email: input.email ?? null,
      p_phone: input.phone ?? null,
      p_message: input.message,
      p_fingerprint: null,
      p_honeypot: input.website ?? null,
    })
    if (error) throw error
    return respond(validatePublicChatMessageOutput({ ok: true, result: data }))
  } catch (error) {
    return mapError(error)
  }
})
