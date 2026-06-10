import { validatePublicPackageHandlerInput } from '../../../packages/contracts/edge-functions/public-package-handler.ts'

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

  if (message.includes('package_not_found') || message.includes('professional_not_found')) {
    return { status: 404, body: { ok: false, error: 'not_found' } }
  }

  if (
    message.includes('invalid_contact') ||
    message.includes('full_name_required') ||
    message.includes('phone_required')
  ) {
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
    const input = validatePublicPackageHandlerInput(await request.json())
    const supabase = createServiceClient()

    if (input.mode === 'get_context') {
      const { data, error } = await supabase.rpc('get_public_package_context', {
        p_slug: input.slug,
      })

      if (error) throw error
      return publicJsonResponse(data)
    }

    const { data, error } = await supabase.rpc('register_public_package_interest', {
      p_slug: input.slug,
      p_contact: {
        full_name: input.full_name,
        phone_whatsapp: input.phone_whatsapp,
        email: input.email ?? null,
        lang: input.lang ?? 'pt-BR',
        ref: input.ref ?? null,
      },
    })

    if (error) throw error
    return publicJsonResponse(data)
  } catch (error) {
    const mapped = mapError(error)
    return publicJsonResponse(mapped.body, { status: mapped.status })
  }
})
