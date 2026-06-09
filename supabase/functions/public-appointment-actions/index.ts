import {
  validatePublicAppointmentActionsInput,
  validatePublicAppointmentActionsOutput,
} from '@iaprafaturar/contracts/edge-functions/public-appointment-actions.ts'

import { jsonResponse } from '../_shared/http.ts'
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
  if (error instanceof Error && error.name === 'ZodError') {
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
    const input = validatePublicAppointmentActionsInput(await request.json())
    const supabase = createServiceClient()

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
