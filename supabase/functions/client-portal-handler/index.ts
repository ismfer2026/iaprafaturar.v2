import { isDryRun } from '../_shared/dry-run.ts'
import { jsonResponse } from '../_shared/http.ts'

type ClientPortalInput =
  | {
    mode: 'start_session'
    slug: string
    full_name: string
    phone_whatsapp: string
    email?: string
    lgpd_accepted: true
    lang?: 'pt-BR' | 'en-US' | 'es-419'
  }
  | {
    mode:
      | 'get_context'
      | 'get_history'
      | 'get_packages'
      | 'get_booking_context'
      | 'logout'
    session_token: string
    lang?: 'pt-BR' | 'en-US' | 'es-419'
    limit?: number
    cursor?: string
  }
  | {
    mode: 'update_profile' | 'complete_onboarding'
    session_token: string
    full_name: string
    email?: string
    contact_preference?: 'whatsapp' | 'email' | 'both'
    reminders_opt_in?: boolean
    lgpd_accepted?: true
  }
  | {
    mode: 'create_appointment'
    session_token: string
    service_id: string
    scheduled_at: string
    use_client_package_id?: string | null
  }
  | {
    mode: 'cancel_appointment'
    session_token: string
    appointment_id: string
    reason?: string | null
  }
  | {
    mode: 'reschedule_appointment'
    session_token: string
    appointment_id: string
    new_scheduled_at: string
  }

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

  return { status: 500, body: { ok: false, error: 'internal_error' } }
}

function readString(input: Record<string, unknown>, key: string): string | undefined {
  const value = input[key]
  return typeof value === 'string' && value.trim() ? value : undefined
}

function readLocale(input: Record<string, unknown>): 'pt-BR' | 'en-US' | 'es-419' | undefined {
  const value = readString(input, 'lang')
  if (value === 'pt-BR' || value === 'en-US' || value === 'es-419') return value
  return undefined
}

function validateEmail(value: string | undefined): string | undefined {
  if (!value) return undefined
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) throw new Error('invalid_input')
  return value
}

function assertToken(input: Record<string, unknown>): string {
  const token = readString(input, 'session_token')
  if (!token || token.length < 20) throw new Error('invalid_input')
  return token
}

function validateInput(raw: unknown): ClientPortalInput {
  if (!raw || typeof raw !== 'object') throw new Error('invalid_input')
  const input = raw as Record<string, unknown>
  const mode = readString(input, 'mode')

  if (mode === 'start_session') {
    const slug = readString(input, 'slug')
    const fullName = readString(input, 'full_name')
    const phone = readString(input, 'phone_whatsapp')
    if (!slug || !fullName || !phone || phone.length < 8 || input.lgpd_accepted !== true) {
      throw new Error('invalid_input')
    }
    return {
      mode,
      slug,
      full_name: fullName,
      phone_whatsapp: phone,
      email: validateEmail(readString(input, 'email')),
      lgpd_accepted: true,
      lang: readLocale(input),
    }
  }

  if (mode === 'get_context' || mode === 'get_booking_context' || mode === 'get_packages' || mode === 'logout') {
    return { mode, session_token: assertToken(input), lang: readLocale(input) }
  }

  if (mode === 'get_history') {
    const limit = typeof input.limit === 'number' ? Math.max(1, Math.min(input.limit, 50)) : undefined
    const cursor = readString(input, 'cursor')
    return { mode, session_token: assertToken(input), limit, cursor }
  }

  if (mode === 'update_profile' || mode === 'complete_onboarding') {
    const fullName = readString(input, 'full_name')
    if (!fullName) throw new Error('invalid_input')
    if (mode === 'complete_onboarding' && input.lgpd_accepted !== true) throw new Error('invalid_input')
    const preference = readString(input, 'contact_preference') ?? 'whatsapp'
    if (preference !== 'whatsapp' && preference !== 'email' && preference !== 'both') throw new Error('invalid_input')
    return {
      mode,
      session_token: assertToken(input),
      full_name: fullName,
      email: validateEmail(readString(input, 'email')),
      contact_preference: preference,
      reminders_opt_in: typeof input.reminders_opt_in === 'boolean' ? input.reminders_opt_in : true,
      ...(mode === 'complete_onboarding' ? { lgpd_accepted: true } : {}),
    }
  }

  if (mode === 'create_appointment') {
    const serviceId = readString(input, 'service_id')
    const scheduledAt = readString(input, 'scheduled_at')
    if (!serviceId || !scheduledAt) throw new Error('invalid_input')
    return {
      mode,
      session_token: assertToken(input),
      service_id: serviceId,
      scheduled_at: scheduledAt,
      use_client_package_id: readString(input, 'use_client_package_id') ?? null,
    }
  }

  if (mode === 'cancel_appointment') {
    const appointmentId = readString(input, 'appointment_id')
    if (!appointmentId) throw new Error('invalid_input')
    return {
      mode,
      session_token: assertToken(input),
      appointment_id: appointmentId,
      reason: readString(input, 'reason') ?? null,
    }
  }

  if (mode === 'reschedule_appointment') {
    const appointmentId = readString(input, 'appointment_id')
    const newScheduledAt = readString(input, 'new_scheduled_at')
    if (!appointmentId || !newScheduledAt) throw new Error('invalid_input')
    return {
      mode,
      session_token: assertToken(input),
      appointment_id: appointmentId,
      new_scheduled_at: newScheduledAt,
    }
  }

  throw new Error('invalid_input')
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
    const input = validateInput(await request.json())
    const dryRun = isDryRun(request)
    const ip = clientIp(request)
    const ua = userAgent(request)

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
