import { validatePublicQuoteHandlerInput } from '../../../packages/contracts/edge-functions/public-quote-handler.ts'

import { jsonResponse } from '../_shared/http.ts'
import { createServiceClient } from '../_shared/supabase.ts'

const CORS_HEADERS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, x-client-info, apikey, content-type',
  'access-control-allow-methods': 'POST, OPTIONS',
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

function errorMessage(error: unknown): string {
  return [
    error instanceof Error ? error.message : null,
    typeof error === 'object' && error !== null && 'message' in error ? String(error.message) : null,
    typeof error === 'object' && error !== null && 'details' in error ? String(error.details) : null,
    typeof error === 'object' && error !== null && 'hint' in error ? String(error.hint) : null,
    typeof error === 'object' && error !== null && 'code' in error ? String(error.code) : null,
  ].filter(Boolean).join(' ')
}

function mapError(error: unknown): { status: number; body: unknown } {
  if (error instanceof Error && error.name === 'ZodError') {
    return { status: 400, body: { ok: false, error: 'invalid_input' } }
  }

  const message = errorMessage(error)

  if (message.includes('quote_not_found')) {
    return { status: 404, body: { ok: false, error: 'not_found' } }
  }

  if (message.includes('expired')) {
    return { status: 410, body: { ok: false, error: 'expired' } }
  }

  if (message.includes('already_approved')) {
    return { status: 409, body: { ok: false, error: 'already_approved' } }
  }

  if (message.includes('already_rejected')) {
    return { status: 409, body: { ok: false, error: 'already_rejected' } }
  }

  if (message.includes('already_converted')) {
    return { status: 409, body: { ok: false, error: 'already_converted' } }
  }

  if (message.includes('signature_required')) {
    return { status: 400, body: { ok: false, error: 'signature_required' } }
  }

  if (message.includes('invalid_decision') || message.includes('quote_not_open')) {
    return { status: 400, body: { ok: false, error: 'invalid_input' } }
  }

  return { status: 500, body: { ok: false, error: 'internal_error' } }
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS })
  }

  if (request.method !== 'POST') {
    return publicJsonResponse({ ok: false, error: 'method_not_allowed' }, { status: 405 })
  }

  try {
    const input = validatePublicQuoteHandlerInput(await request.json())
    const supabase = createServiceClient()

    if (input.mode === 'get_context') {
      const { data, error } = await supabase.rpc('get_public_quote_context', {
        p_token: input.token,
      })

      if (error) throw error
      return publicJsonResponse(data)
    }

    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null
    const userAgent = request.headers.get('user-agent')

    const { data, error } = await supabase.rpc('decide_public_quote', {
      p_token: input.token,
      p_decision: input.decision,
      p_signature: input.signature,
      p_ip: ip,
      p_user_agent: userAgent,
    })

    if (error) throw error
    return publicJsonResponse(data)
  } catch (error) {
    const mapped = mapError(error)
    return publicJsonResponse(mapped.body, { status: mapped.status })
  }
})
