import {
  validatePublicBookingHandlerInput,
  validatePublicBookingCreateAppointmentOutput,
  validatePublicBookingCompleteClientOnboardingOutput,
  validatePublicBookingResolveRegistrationLinkOutput,
  type PublicBookingCreateAppointmentOutput,
} from '@iaprafaturar/contracts/edge-functions/public-booking-handler.ts'

import { isDryRun } from '../_shared/dry-run.ts'
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
  if (error instanceof Error && error.name === 'ZodError') {
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

  if (message.includes('professional_not_found')) {
    return { status: 404, body: { ok: false, error: 'not_found' } }
  }

  if (message.includes('service_not_available')) {
    return { status: 400, body: { ok: false, error: 'service_not_available' } }
  }

  if (message.includes('scheduled_at_must_be_future')) {
    return { status: 400, body: { ok: false, error: 'scheduled_at_must_be_future' } }
  }

  if (message.includes('full_name_required') || message.includes('phone_whatsapp_required')) {
    return { status: 400, body: { ok: false, error: 'invalid_input' } }
  }

  if (message.includes('invalid_input') || message.includes('lgpd_required')) {
    return { status: 400, body: { ok: false, error: 'invalid_input' } }
  }

  if (message.includes('rate_limited')) {
    return { status: 429, body: { ok: false, error: 'rate_limited' } }
  }

  return { status: 500, body: { ok: false, error: 'internal_error' } }
}

async function invokeAppointmentConfirmation(appointmentId: string, dryRun: boolean): Promise<{
  confirmationStatus: PublicBookingCreateAppointmentOutput['confirmation_status']
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

async function claimRegistrationLinkUse(
  supabase: ReturnType<typeof createServiceClient>,
  code: string | undefined,
  slug: string,
): Promise<void> {
  if (!code) return
  const { error } = await supabase.rpc('claim_registration_link_use', {
    p_code: code,
    p_slug: slug,
  })
  if (error) {
    console.warn('claim_registration_link_use_failed', error)
  }
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS })
  }

  if (request.method !== 'POST') {
    return publicJsonResponse({ ok: false, error: 'method_not_allowed' }, { status: 405 })
  }

  try {
    const input = validatePublicBookingHandlerInput(await request.json())
    const supabase = createServiceClient()
    const dryRun = isDryRun(request)
    await assertPublicRateLimit({
      supabase,
      request,
      action: `public-booking:${input.mode}`,
      subject: 'slug' in input ? input.slug : input.code,
      limit: input.mode === 'get_context' ? 60 : 10,
    })

    if (input.mode === 'resolve_registration_link') {
      const code = input.code.trim()
      const locale = input.lang ?? 'pt-BR'
      const { data: links, error: linkError } = await supabase
        .from('registration_links')
        .select('code, is_active, expires_at, uses_count, max_uses, professionals!inner(slug, deleted_at, onboarding_completed)')
        .ilike('code', code)
        .eq('is_active', true)
        .is('professionals.deleted_at', null)
        .eq('professionals.onboarding_completed', true)
        .limit(1)

      if (linkError) throw linkError

      const link = links?.[0] as {
        code: string
        expires_at: string | null
        uses_count: number
        max_uses: number | null
        professionals: { slug: string } | Array<{ slug: string }>
      } | undefined

      const professional = Array.isArray(link?.professionals)
        ? link?.professionals[0]
        : link?.professionals

      const isExpired = link?.expires_at ? new Date(link.expires_at).getTime() <= Date.now() : false
      const isExhausted = link?.max_uses !== null && link?.max_uses !== undefined
        ? link.uses_count >= link.max_uses
        : false

      if (!link || !professional?.slug || isExpired || isExhausted) {
        return publicJsonResponse({ ok: false, error: 'not_found', locale }, { status: 404 })
      }

      return publicJsonResponse(validatePublicBookingResolveRegistrationLinkOutput({
        ok: true,
        registration_link_code: link.code,
        professional_slug: professional.slug,
        locale,
        ref: input.ref ?? link.code,
        next_step: 'client_onboarding',
      }))
    }

    if (input.mode === 'get_context') {
      const { data, error } = await supabase.rpc('get_public_booking_context', {
        p_slug: input.slug,
        p_lang: input.lang ?? 'pt-BR',
        p_ref: input.ref ?? null,
      })

      if (error) throw error
      if (data?.ok === false && data?.error === 'not_found') {
        return publicJsonResponse(data, { status: 404 })
      }
      return publicJsonResponse(data)
    }

    if (input.mode === 'complete_client_onboarding') {
      const { data, error } = await supabase.rpc('complete_public_client_onboarding', {
        p_slug: input.slug,
        p_full_name: input.full_name,
        p_phone_whatsapp: input.phone_whatsapp,
        p_email: input.email ?? null,
        p_lgpd_accepted: input.lgpd_accepted,
        p_contact_preference: input.contact_preference,
        p_reminders_opt_in: input.reminders_opt_in,
        p_lang: input.lang ?? 'pt-BR',
        p_ref: input.ref ?? null,
      })

      if (error) throw error
      const output = validatePublicBookingCompleteClientOnboardingOutput(data)
      await claimRegistrationLinkUse(supabase, input.ref, input.slug)
      return publicJsonResponse(output)
    }

    const { data, error } = await supabase.rpc('create_public_appointment', {
      p_slug: input.slug,
      p_service_id: input.service_id,
      p_scheduled_at: input.scheduled_at,
      p_full_name: input.full_name,
      p_phone_whatsapp: input.phone_whatsapp,
      p_email: input.email ?? null,
      p_lang: input.lang ?? 'pt-BR',
      p_ref: input.ref ?? null,
    })

    if (error) throw error

    const appointmentId = data?.appointment_id
    if (!appointmentId) {
      throw new Error('missing_appointment_id')
    }

    const confirmation = await invokeAppointmentConfirmation(appointmentId, dryRun)
    const output = validatePublicBookingCreateAppointmentOutput({
      ...data,
      confirmation_status: confirmation.confirmationStatus,
      dry_run: dryRun,
    })

    return publicJsonResponse(output)
  } catch (error) {
    const mapped = mapError(error)
    return publicJsonResponse(mapped.body, { status: mapped.status })
  }
})
