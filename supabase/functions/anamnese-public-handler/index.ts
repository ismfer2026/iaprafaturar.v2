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

interface UploadedAsset {
  path: string
  name: string
  type: string
  size: number
}

function safeFileName(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._-]/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 120)
}

function extensionForMime(type: string): string {
  if (type === 'image/png') return 'png'
  if (type === 'image/webp') return 'webp'
  return 'jpg'
}

function dataUrlToBytes(dataUrl: string): Uint8Array {
  const [, base64] = dataUrl.split(',')
  if (!base64) throw new Error('invalid_input')
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }
  return bytes
}

async function uploadAnamneseAsset(
  supabase: ReturnType<typeof createServiceClient>,
  fichaId: string,
  asset: { name: string; type: string; size: number; data_url: string },
  prefix: 'photo' | 'signature',
): Promise<UploadedAsset> {
  const extension = extensionForMime(asset.type)
  const fileName = `${prefix}-${crypto.randomUUID()}-${safeFileName(asset.name || `asset.${extension}`)}`
  const path = `${fichaId}/${fileName.endsWith(`.${extension}`) ? fileName : `${fileName}.${extension}`}`
  const bytes = dataUrlToBytes(asset.data_url)

  const { error } = await supabase.storage.from('anamnese-assets').upload(path, bytes, {
    contentType: asset.type,
    upsert: false,
  })

  if (error) throw error
  return { path, name: asset.name, type: asset.type, size: asset.size }
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

    const { data: fichaForAssets, error: fichaForAssetsError } = await supabase
      .from('anamnese_fichas')
      .select('id')
      .eq('public_token', input.token)
      .maybeSingle()

    if (fichaForAssetsError) throw fichaForAssetsError
    if (!fichaForAssets?.id) throw new Error('anamnese_not_found')

    const uploadedPhotos: UploadedAsset[] = []
    for (const photo of input.fotos ?? []) {
      uploadedPhotos.push(await uploadAnamneseAsset(supabase, fichaForAssets.id, photo, 'photo'))
    }

    let signaturePath: string | null = null
    if (input.assinatura_url?.startsWith('data:image/')) {
      const signatureAsset = {
        name: 'assinatura.png',
        type: input.assinatura_url.startsWith('data:image/webp') ? 'image/webp' : input.assinatura_url.startsWith('data:image/jpeg') ? 'image/jpeg' : 'image/png',
        size: input.assinatura_url.length,
        data_url: input.assinatura_url,
      }
      signaturePath = (await uploadAnamneseAsset(supabase, fichaForAssets.id, signatureAsset, 'signature')).path
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
      p_fotos: uploadedPhotos,
      p_assinatura_url: signaturePath,
    })

    if (error) throw error
    return publicJsonResponse(validatePublicAnamneseSubmitOutput(data))
  } catch (error) {
    const mapped = mapError(error)
    return publicJsonResponse(mapped.body, { status: mapped.status })
  }
})
