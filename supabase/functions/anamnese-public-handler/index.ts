import {
  validatePublicAnamneseHandlerInput,
  validatePublicAnamneseSubmitOutput,
} from '@iaprafaturar/contracts/edge-functions/anamnese-public-handler.ts'

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

  if (message.includes('anamnese_not_found')) {
    return { status: 404, body: { ok: false, error: 'not_found' } }
  }

  if (message.includes('anamnese_expired')) {
    return { status: 410, body: { ok: false, error: 'expired' } }
  }

  if (message.includes('anamnese_already_completed')) {
    return { status: 409, body: { ok: false, error: 'already_completed' } }
  }

  if (message.includes('lgpd_required')) {
    return { status: 400, body: { ok: false, error: 'lgpd_required' } }
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
    const input = validatePublicAnamneseHandlerInput(await request.json())
    const supabase = createServiceClient()

    if (input.mode === 'get_form') {
      const { data, error } = await supabase.rpc('get_public_anamnese_form', {
        p_token: input.token,
        p_lang: input.lang ?? 'pt-BR',
      })

      if (error) throw error
      return publicJsonResponse(data)
    }

    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null
    const { data, error } = await supabase.rpc('complete_public_anamnese', {
      p_token: input.token,
      p_dados_pessoais: input.dados_pessoais,
      p_queixas: input.queixas,
      p_historico: input.historico,
      p_alergias: input.alergias,
      p_habitos: input.habitos,
      p_custom_data: input.custom_data,
      p_lgpd_aceito: input.lgpd_aceito,
      p_lgpd_ip: ip,
      p_lang: input.lang ?? 'pt-BR',
    })

    if (error) throw error
    return publicJsonResponse(validatePublicAnamneseSubmitOutput(data))
  } catch (error) {
    const mapped = mapError(error)
    return publicJsonResponse(mapped.body, { status: mapped.status })
  }
})
