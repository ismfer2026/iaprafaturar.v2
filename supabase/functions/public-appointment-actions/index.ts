import {
  validatePublicAppointmentActionsInput,
  validatePublicAppointmentActionsOutput,
} from '@iaprafaturar/contracts/edge-functions/public-appointment-actions.ts'

import { jsonResponse } from '../_shared/http.ts'
import { assertPublicRateLimit } from '../_shared/public-rate-limit.ts'
import { createServiceClient } from '../_shared/supabase.ts'

const CORS_HEADERS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, x-client-info, apikey, content-type, x-dry-run',
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

function mapError(error: unknown): { status: number; body: unknown } {
  if (error instanceof SyntaxError) {
    return { status: 400, body: { ok: false, error: 'invalid_input' } }
  }

  if (
    (error instanceof Error && error.name === 'ZodError')
    || typeof error === 'object' && error !== null && Array.isArray((error as { issues?: unknown }).issues)
  ) {
    return { status: 400, body: { ok: false, error: 'invalid_input' } }
  }

  if (error instanceof Error && error.message.includes('rate_limited')) {
    return { status: 429, body: { ok: false, error: 'rate_limited' } }
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
    const input = validatePublicAppointmentActionsInput(await request.json())
    const supabase = createServiceClient()
    await assertPublicRateLimit({
      supabase,
      request,
      action: `public-appointment-actions:${input.mode}`,
      subject: input.appointment_token,
      limit: 8,
      windowSeconds: 300,
    })

    if (input.mode === 'cancel') {
      const { data, error } = await supabase.rpc('cancel_public_appointment', {
        p_appointment_token: input.appointment_token,
        p_reason: input.reason ?? null,
      })

      if (error) throw error
      return publicJsonResponse(validatePublicAppointmentActionsOutput(data))
    }

    const { data, error } = await supabase.rpc('reschedule_public_appointment', {
      p_appointment_token: input.appointment_token,
      p_new_scheduled_at: input.new_scheduled_at,
    })

    if (error) throw error
    return publicJsonResponse(validatePublicAppointmentActionsOutput(data))
  } catch (error) {
    const mapped = mapError(error)
    return publicJsonResponse(mapped.body, { status: mapped.status })
  }
})
