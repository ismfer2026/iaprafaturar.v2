import {
  validatePublicCreateAccountInput,
  type PublicCreateAccountErrorOutput,
} from '@iaprafaturar/contracts/edge-functions/public-create-account.ts'

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

function publicError(
  error: PublicCreateAccountErrorOutput['error'],
  status = 400,
): Response {
  return publicJsonResponse({ ok: false, error }, { status })
}

function normalizeRpcError(data: unknown): PublicCreateAccountErrorOutput['error'] | null {
  if (
    typeof data === 'object'
    && data !== null
    && 'ok' in data
    && data.ok === false
    && 'error' in data
    && typeof data.error === 'string'
  ) {
    const error = data.error
    if (
      error === 'pre_account_not_found'
      || error === 'email_already_registered'
      || error === 'identity_integrity_incident'
      || error === 'invalid_professional_id'
      || error === 'invalid_email'
      || error === 'weak_password'
    ) {
      return error
    }
  }

  return null
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS })
  }

  if (request.method !== 'POST') {
    return publicError('invalid_input', 405)
  }

  try {
    const input = validatePublicCreateAccountInput(await request.json())
    const supabase = createServiceClient()

    if (input.mode === 'get_status') {
      const { data, error } = await supabase
        .from('professionals')
        .select('id,email,user_id,onboarding_pending,onboarding_data')
        .eq('id', input.professional_id)
        .eq('email', input.email.toLowerCase())
        .is('deleted_at', null)
        .maybeSingle()

      if (error) {
        return publicError('internal_error', 500)
      }

      if (!data) {
        return publicError('pre_account_not_found', 404)
      }

      if (data.user_id && data.user_id !== data.id) {
        return publicError('identity_integrity_incident', 409)
      }

      const onboardingData = typeof data.onboarding_data === 'object' && data.onboarding_data !== null
        ? data.onboarding_data as Record<string, unknown>
        : {}

      return publicJsonResponse({
        ok: true,
        professional_id: data.id,
        email: data.email,
        status: data.user_id ? 'registered' : 'pending',
        onboarding_pending: Boolean(data.onboarding_pending),
        lang: typeof onboardingData.lang === 'string' ? onboardingData.lang : (input.lang ?? 'pt-BR'),
        ref: typeof onboardingData.ref === 'string' ? onboardingData.ref : null,
        conversation: typeof onboardingData.conversation === 'string' ? onboardingData.conversation : null,
      })
    }

    if (input.mode === 'create_preaccount') {
      const { data, error } = await supabase.rpc('create_public_professional_preaccount', {
        p_email: input.email,
        p_name: input.name ?? null,
        p_phone_whatsapp: input.phone_whatsapp ?? null,
        p_ref: input.ref ?? null,
        p_lang: input.lang ?? 'pt-BR',
        p_conversation: input.conversation ?? null,
        p_collected_data: input.collected_data ?? {},
      })

      if (error) {
        return publicError('internal_error', 500)
      }

      const rpcError = normalizeRpcError(data)
      if (rpcError) {
        return publicError(rpcError, rpcError === 'email_already_registered' ? 409 : 400)
      }

      return publicJsonResponse(data)
    }

    const { data, error } = await supabase.rpc('public_create_account_for_professional', {
      p_professional_id: input.professional_id,
      p_email: input.email,
      p_password: input.password,
    })

    if (error) {
      return publicError('internal_error', 500)
    }

    const rpcError = normalizeRpcError(data)
    if (rpcError) {
      if (rpcError === 'pre_account_not_found') return publicError(rpcError, 404)
      if (rpcError === 'email_already_registered' || rpcError === 'identity_integrity_incident') {
        return publicError(rpcError, 409)
      }
      return publicError(rpcError, 400)
    }

    return publicJsonResponse(data)
  } catch (error) {
    if (error instanceof Error && error.name === 'ZodError') {
      return publicError('invalid_input', 400)
    }

    return publicError('internal_error', 500)
  }
})
