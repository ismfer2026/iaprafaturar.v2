import { isDryRun } from '../_shared/dry-run.ts'
import { jsonResponse } from '../_shared/http.ts'
import { assertPublicRateLimit } from '../_shared/public-rate-limit.ts'
import { createServiceClient } from '../_shared/supabase.ts'
import { validateClientPortalHandlerInput } from '@iaprafaturar/contracts/edge-functions/client-portal-handler.ts'

type ClientPortalMutationOutput = {
  ok: boolean
  appointment_id?: string
  from_appointment_id?: string
  client_id?: string
  status?: string
  next_step?: string
  error?: string
  window_hours?: number
}

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

async function rpc(functionName: string, body: Record<string, unknown>): Promise<{ data: unknown; error: unknown }> {
  const url = Deno.env.get('SUPABASE_URL')
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

  if (!url || !key) {
    throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  }

  const response = await fetch(`${url.replace(/\/$/, '')}/rest/v1/rpc/${functionName}`, {
    method: 'POST',
    headers: {
      apikey: key,
      authorization: `Bearer ${key}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  })

  const text = await response.text()
  const data = text ? JSON.parse(text) : null

  if (!response.ok) {
    return { data: null, error: data }
  }

  return { data, error: null }
}

function clientIp(request: Request): string | null {
  return request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    ?? request.headers.get('cf-connecting-ip')
    ?? null
}

function userAgent(request: Request): string | null {
  return request.headers.get('user-agent')
}

function mapError(error: unknown): { status: number; body: unknown } {
  if (error instanceof SyntaxError) {
    return { status: 400, body: { ok: false, error: 'invalid_input' } }
  }

  if (
    (error instanceof Error && error.name === 'ZodError')
    || (typeof error === 'object' && error !== null && Array.isArray((error as { issues?: unknown }).issues))
  ) {
    return { status: 400, body: { ok: false, error: 'invalid_input' } }
  }

  const message = [
    error instanceof Error ? error.message : null,
    typeof error === 'object' && error !== null && 'message' in error ? String(error.message) : null,
    typeof error === 'object' && error !== null && 'details' in error ? String(error.details) : null,
    typeof error === 'object' && error !== null && 'hint' in error ? String(error.hint) : null,
    typeof error === 'object' && error !== null && 'code' in error ? String(error.code) : null,
  ]
    .filter(Boolean)
    .join(' ')

  if (message.includes('invalid_input')) {
    return { status: 400, body: { ok: false, error: 'invalid_input' } }
  }

  if (message.includes('rate_limited')) {
    return { status: 429, body: { ok: false, error: 'rate_limited' } }
  }

  return { status: 500, body: { ok: false, error: 'internal_error' } }
}

function isRpcErrorOutput(data: unknown): data is { ok: false; error: string } {
  return Boolean(
    data
      && typeof data === 'object'
      && 'ok' in data
      && data.ok === false
      && 'error' in data
      && typeof data.error === 'string',
  )
}

function rpcErrorStatus(error: string): number {
  if (error === 'invalid_session' || error === 'session_expired') return 401
  if (error === 'not_found' || error === 'appointment_not_found') return 404
  return 400
}

function rpcJsonResponse(data: unknown): Response | null {
  if (!isRpcErrorOutput(data)) return null
  return publicJsonResponse(data, { status: rpcErrorStatus(data.error) })
}

async function invokeAppointmentConfirmation(appointmentId: string, dryRun: boolean): Promise<{
  confirmationStatus: 'queued' | 'sent' | 'dry_run' | 'skipped_no_professional_instance'
}> {
  const baseUrl = Deno.env.get('FUNCTIONS_BASE_URL')
  const internalToken = Deno.env.get('INTERNAL_FUNCTION_TOKEN')

  if (!baseUrl || !internalToken) {
    return { confirmationStatus: 'queued' }
  }

  const response = await fetch(`${baseUrl}/appointment-confirmation-agent`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${internalToken}`,
      'content-type': 'application/json',
      ...(dryRun ? { 'x-dry-run': 'true' } : {}),
    },
    body: JSON.stringify({
      mode: 'send_confirmation',
      appointment_id: appointmentId,
      dry_run: dryRun,
    }),
  })

  if (!response.ok) {
    return { confirmationStatus: 'queued' }
  }

  const data = await response.json()

  if (data?.skipped_reason === 'no_professional_instance') {
    return { confirmationStatus: 'skipped_no_professional_instance' }
  }

  if (dryRun) return { confirmationStatus: 'dry_run' }
  if (data?.sent > 0) return { confirmationStatus: 'sent' }
  return { confirmationStatus: 'queued' }
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS })
  }

  if (request.method !== 'POST') {
    return publicJsonResponse({ ok: false, error: 'method_not_allowed' }, { status: 405 })
  }

  try {
    const input = validateClientPortalHandlerInput(await request.json())
    const dryRun = isDryRun(request)
    const ip = clientIp(request)
    const ua = userAgent(request)
    const rateLimitClient = createServiceClient()
    await assertPublicRateLimit({
      supabase: rateLimitClient,
      request,
      action: `client-portal:${input.mode}`,
      subject: 'session_token' in input ? input.session_token : input.slug,
      limit: input.mode === 'get_context' || input.mode === 'get_history' || input.mode === 'get_packages' || input.mode === 'get_booking_context' ? 80 : 12,
      windowSeconds: input.mode === 'start_session' ? 300 : 60,
    })

    if (input.mode === 'start_session') {
      const { data, error } = await rpc('create_client_portal_session', {
        p_slug: input.slug,
        p_phone_whatsapp: input.phone_whatsapp,
        p_full_name: input.full_name,
        p_email: input.email ?? null,
        p_lgpd_accepted: input.lgpd_accepted,
        p_lang: input.lang ?? 'pt-BR',
        p_ip: ip,
        p_user_agent: ua,
      })

      if (error) throw error
      const rpcError = rpcJsonResponse(data)
      if (rpcError) return rpcError
      return publicJsonResponse(data)
    }

    if (input.mode === 'get_context') {
      const { data, error } = await rpc('get_client_portal_context', {
        p_session_token: input.session_token,
        p_lang: input.lang ?? 'pt-BR',
      })

      if (error) throw error
      const rpcError = rpcJsonResponse(data)
      if (rpcError) return rpcError
      return publicJsonResponse(data)
    }

    if (input.mode === 'update_profile') {
      const { data, error } = await rpc('update_client_portal_profile', {
        p_session_token: input.session_token,
        p_payload: {
          full_name: input.full_name,
          ...(input.email ? { email: input.email } : {}),
          contact_preference: input.contact_preference,
          reminders_opt_in: input.reminders_opt_in,
        },
        p_ip: ip,
        p_user_agent: ua,
      })

      if (error) throw error
      return publicJsonResponse(data)
    }

    if (input.mode === 'complete_onboarding') {
      const { data, error } = await rpc('complete_client_portal_onboarding', {
        p_session_token: input.session_token,
        p_payload: {
          full_name: input.full_name,
          ...(input.email ? { email: input.email } : {}),
          contact_preference: input.contact_preference,
          reminders_opt_in: input.reminders_opt_in,
          lgpd_accepted: input.lgpd_accepted,
        },
        p_ip: ip,
        p_user_agent: ua,
      })

      if (error) throw error
      return publicJsonResponse(data)
    }

    if (input.mode === 'get_history') {
      const { data, error } = await rpc('get_client_portal_history', {
        p_session_token: input.session_token,
        p_limit: input.limit ?? 20,
        p_cursor: input.cursor ?? null,
      })

      if (error) throw error
      const rpcError = rpcJsonResponse(data)
      if (rpcError) return rpcError
      return publicJsonResponse(data)
    }

    if (input.mode === 'get_packages') {
      const { data, error } = await rpc('get_client_portal_packages', {
        p_session_token: input.session_token,
      })

      if (error) throw error
      const rpcError = rpcJsonResponse(data)
      if (rpcError) return rpcError
      return publicJsonResponse(data)
    }

    if (input.mode === 'get_booking_context') {
      const { data, error } = await rpc('get_client_portal_booking_context', {
        p_session_token: input.session_token,
        p_lang: input.lang ?? 'pt-BR',
      })

      if (error) throw error
      const rpcError = rpcJsonResponse(data)
      if (rpcError) return rpcError
      return publicJsonResponse(data)
    }

    if (input.mode === 'create_appointment') {
      const { data, error } = await rpc('create_client_portal_appointment', {
        p_session_token: input.session_token,
        p_service_id: input.service_id,
        p_scheduled_at: input.scheduled_at,
        p_use_client_package_id: input.use_client_package_id ?? null,
      })

      if (error) throw error

      let output = data as ClientPortalMutationOutput & {
        confirmation_status?: 'queued' | 'sent' | 'dry_run' | 'skipped_no_professional_instance'
        dry_run?: boolean
      }

      if (output.ok && output.appointment_id) {
        const confirmation = await invokeAppointmentConfirmation(output.appointment_id, dryRun)
        output = {
          ...output,
          confirmation_status: confirmation.confirmationStatus,
          dry_run: dryRun,
        }
      }

      return publicJsonResponse(output)
    }

    if (input.mode === 'cancel_appointment') {
      const { data, error } = await rpc('cancel_client_portal_appointment', {
        p_session_token: input.session_token,
        p_appointment_id: input.appointment_id,
        p_reason: input.reason ?? null,
      })

      if (error) throw error
      return publicJsonResponse(data)
    }

    if (input.mode === 'reschedule_appointment') {
      const { data, error } = await rpc('reschedule_client_portal_appointment', {
        p_session_token: input.session_token,
        p_appointment_id: input.appointment_id,
        p_new_scheduled_at: input.new_scheduled_at,
      })

      if (error) throw error
      return publicJsonResponse(data)
    }

    const { data, error } = await rpc('revoke_client_portal_session', {
      p_session_token: input.session_token,
    })

    if (error) throw error
    return publicJsonResponse(data)
  } catch (error) {
    const mapped = mapError(error)
    return publicJsonResponse(mapped.body, { status: mapped.status })
  }
})
