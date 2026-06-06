import {
  validateProfessionalWhatsappConnectionInput,
  validateProfessionalWhatsappConnectionOutput,
  type ProfessionalWhatsappConnectionInput,
} from '@iaprafaturar/contracts/edge-functions/professional-whatsapp-connection.ts'
import { createClient } from '@supabase/supabase-js'

import { isDryRun } from '../_shared/dry-run.ts'
import { jsonResponse, readBearerToken } from '../_shared/http.ts'
import { createServiceClient } from '../_shared/supabase.ts'

const corsHeaders = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, apikey, content-type, x-dry-run',
  'access-control-allow-methods': 'POST, OPTIONS',
}

function normalizePhone(phone?: string | null): string | null {
  const digits = String(phone ?? '').replace(/\D/g, '')
  if (!digits) return null
  if (digits.length === 10 || digits.length === 11) return `55${digits}`
  return digits
}

function sanitizeInstanceName(raw: string): string {
  const clean = raw
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 32)

  return clean || `prof_${crypto.randomUUID().slice(0, 8)}`
}

function evolutionCredentials() {
  const baseUrl = Deno.env.get('EVOLUTION_GO_BASE_URL') ?? Deno.env.get('EVOLUTION_GO_URL')
  const apiKey = Deno.env.get('EVOLUTION_GO_API_KEY') ?? Deno.env.get('EVOLUTION_GO_KEY')

  if (!baseUrl || !apiKey) {
    throw new Error('Evolution Go credentials are not configured')
  }

  return { baseUrl: baseUrl.replace(/\/$/, ''), apiKey }
}

type ProfessionalWhatsappRow = {
  provider: 'evolution_go' | 'meta_waba'
  instance_name: string | null
  instance_id: string | null
  instance_token: string | null
  phone_number: string | null
  status: 'disconnected' | 'connecting' | 'connected' | 'error'
  is_connected: boolean
  connection_mode: 'qr' | 'pairing_code' | 'waba'
  number_kind: 'personal' | 'business' | 'unknown' | null
  qr_code: string | null
  qr_expires_at: string | null
  meta_phone_number_id: string | null
  meta_waba_id: string | null
}

async function authUserIdFromRequest(request: Request) {
  const token = readBearerToken(request)
  const url = Deno.env.get('SUPABASE_URL')
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')

  if (!token || !url || !anonKey) {
    throw new Response('Unauthorized', { status: 401, headers: corsHeaders })
  }

  const userClient = createClient(url, anonKey, {
    global: { headers: { authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const { data, error } = await userClient.auth.getUser(token)
  if (error || !data.user) {
    throw new Response('Unauthorized', { status: 401, headers: corsHeaders })
  }

  return data.user.id
}

async function assertOwnProfessional(
  supabase: ReturnType<typeof createServiceClient>,
  authUserId: string,
  professionalId: string,
) {
  const { data, error } = await supabase
    .from('professionals')
    .select('id, user_id, name, business_name, slug, phone_whatsapp')
    .eq('id', professionalId)
    .eq('user_id', authUserId)
    .is('deleted_at', null)
    .single()

  if (error) throw new Response('Forbidden', { status: 403, headers: corsHeaders })
  return data as {
    id: string
    user_id: string
    name: string
    business_name: string | null
    slug: string
    phone_whatsapp: string | null
  }
}

async function recordSetupEvent(
  supabase: ReturnType<typeof createServiceClient>,
  professionalId: string,
  eventType: string,
  data: Record<string, unknown>,
) {
  const { data: session } = await supabase
    .from('nerissa_setup_sessions')
    .select('id')
    .eq('professional_id', professionalId)
    .maybeSingle()

  if (!session?.id) return

  await supabase.from('nerissa_setup_events').insert({
    session_id: session.id,
    professional_id: professionalId,
    event_type: eventType,
    agent_slug: null,
    data,
  })
}

async function loadConnection(
  supabase: ReturnType<typeof createServiceClient>,
  professionalId: string,
  provider: 'evolution_go' | 'meta_waba',
): Promise<ProfessionalWhatsappRow | null> {
  const { data, error } = await supabase
    .from('professional_whatsapp')
    .select(`
      provider,
      instance_name,
      instance_id,
      instance_token,
      phone_number,
      status,
      is_connected,
      connection_mode,
      number_kind,
      qr_code,
      qr_expires_at,
      meta_phone_number_id,
      meta_waba_id
    `)
    .eq('professional_id', professionalId)
    .eq('provider', provider)
    .maybeSingle()

  if (error) throw error
  return (data ?? null) as ProfessionalWhatsappRow | null
}

async function upsertConnection(
  supabase: ReturnType<typeof createServiceClient>,
  input: ProfessionalWhatsappConnectionInput,
  data: {
    instanceName: string | null
    instanceId?: string | null
    instanceToken?: string | null
    phoneNumber: string | null
    status: 'disconnected' | 'connecting' | 'connected' | 'error'
    isConnected: boolean
    qrCode?: string | null
    qrExpiresAt?: string | null
    metaPhoneNumberId?: string | null
    metaWabaId?: string | null
    disconnectionReason?: string | null
  },
) {
  const { error } = await supabase.from('professional_whatsapp').upsert({
    professional_id: input.professional_id,
    provider: input.provider,
    instance_name: data.instanceName,
    instance_id: data.instanceId ?? null,
    instance_token: data.instanceToken ?? null,
    phone_number: data.phoneNumber,
    status: data.status,
    is_connected: data.isConnected,
    last_connected_at: data.isConnected ? new Date().toISOString() : null,
    last_disconnected_at: data.status === 'disconnected' ? new Date().toISOString() : null,
    disconnection_reason: data.disconnectionReason ?? null,
    connection_mode: input.connection_mode,
    number_kind: input.number_kind ?? 'unknown',
    qr_code: data.qrCode ?? null,
    qr_expires_at: data.qrExpiresAt ?? null,
    meta_phone_number_id: data.metaPhoneNumberId ?? input.meta_phone_number_id ?? null,
    meta_waba_id: data.metaWabaId ?? input.meta_waba_id ?? null,
  }, { onConflict: 'professional_id,provider' })

  if (error) throw error

  if (data.isConnected || data.status === 'disconnected') {
    const { error: professionalError } = await supabase
      .from('professionals')
      .update({
        whatsapp_connected: data.isConnected,
        whatsapp_connected_at: data.isConnected ? new Date().toISOString() : null,
      })
      .eq('id', input.professional_id)

    if (professionalError) throw professionalError
  }
}

async function startEvolutionGoConnection(input: ProfessionalWhatsappConnectionInput, professional: {
  name: string
  business_name: string | null
  slug: string
  phone_whatsapp: string | null
}, dryRun: boolean, existing: ProfessionalWhatsappRow | null) {
  const phoneNumber = normalizePhone(input.phone_number ?? professional.phone_whatsapp)
  const instanceName = existing?.instance_name
    ?? input.instance_name
    ?? sanitizeInstanceName(professional.business_name ?? professional.name ?? professional.slug)
  const instanceId = existing?.instance_id ?? crypto.randomUUID()
  const instanceToken = existing?.instance_token ?? crypto.randomUUID()

  if (dryRun) {
    return {
      instanceName,
      instanceId,
      instanceToken,
      phoneNumber,
      status: 'connecting' as const,
      isConnected: false,
      qrCode: input.connection_mode === 'qr' ? `dry-run-qr:${instanceName}` : null,
      pairingCode: input.connection_mode === 'pairing_code' ? '123-456' : null,
      qrExpiresAt: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
    }
  }

  const credentials = evolutionCredentials()

  if (!existing?.instance_name) {
    const createResponse = await fetch(`${credentials.baseUrl}/instance/create`, {
      method: 'POST',
      headers: {
        apikey: credentials.apiKey,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        instanceId,
        name: instanceName,
        token: instanceToken,
        advancedSettings: {
          ignoreGroups: true,
          alwaysOnline: true,
          readMessages: true,
        },
      }),
    })

    if (!createResponse.ok) {
      const body = await createResponse.text()
      throw new Error(`Evolution Go create failed: ${createResponse.status} ${body}`)
    }
  }

  await fetch(`${credentials.baseUrl}/instance/connect`, {
    method: 'POST',
    headers: {
      apikey: instanceToken,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      immediate: true,
      phone: phoneNumber ?? undefined,
      subscribe: ['MESSAGE', 'CONNECTION'],
    }),
  }).catch(() => null)

  let qrCode: string | null = null
  let pairingCode: string | null = null

  if (input.connection_mode === 'pairing_code' && phoneNumber) {
    const pairResponse = await fetch(`${credentials.baseUrl}/instance/pair`, {
      method: 'POST',
      headers: {
        apikey: instanceToken,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ phone: phoneNumber, subscribe: ['MESSAGE', 'CONNECTION'] }),
    })
    const pairBody = await pairResponse.json().catch(() => ({}))
    pairingCode = pairBody?.pairingCode ?? pairBody?.code ?? pairBody?.data?.pairingCode ?? null
  } else {
    const qrResponse = await fetch(`${credentials.baseUrl}/instance/qr`, {
      method: 'GET',
      headers: { apikey: instanceToken },
    })
    const qrBody = await qrResponse.json().catch(() => ({}))
    qrCode = qrBody?.base64 ?? qrBody?.qr ?? qrBody?.qrcode ?? qrBody?.data?.base64 ?? null
  }

  return {
    instanceName,
    instanceId,
    instanceToken,
    phoneNumber,
    status: 'connecting' as const,
    isConnected: false,
    qrCode,
    pairingCode,
    qrExpiresAt: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
  }
}

async function disconnectEvolutionGoConnection(existing: ProfessionalWhatsappRow | null, dryRun: boolean) {
  if (dryRun || !existing?.instance_name || !existing.instance_token) return

  const credentials = evolutionCredentials()
  const response = await fetch(
    `${credentials.baseUrl}/instance/disconnect/${encodeURIComponent(existing.instance_name)}`,
    {
      method: 'POST',
      headers: {
        apikey: existing.instance_token,
        'content-type': 'application/json',
      },
    },
  )

  if (!response.ok) {
    const body = await response.text()
    throw new Error(`Evolution Go disconnect failed: ${response.status} ${body}`)
  }
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const input = validateProfessionalWhatsappConnectionInput(await request.json())
    const dryRun = input.dry_run ?? isDryRun(request)
    const authUserId = await authUserIdFromRequest(request)
    const supabase = createServiceClient()
    const professional = await assertOwnProfessional(supabase, authUserId, input.professional_id)
    const existing = await loadConnection(supabase, input.professional_id, input.provider)

    if (
      input.action === 'start'
      && input.number_kind === 'personal'
      && existing?.number_kind !== 'personal'
    ) {
      await recordSetupEvent(supabase, input.professional_id, 'professional.whatsapp.personal_number_warning', {
        provider: input.provider,
        connection_mode: input.connection_mode,
        message: 'WhatsApp pessoal permitido, mas Business e recomendado para reduzir risco operacional.',
        dry_run: dryRun,
      })
    }

    if (input.action === 'status') {
      const output = validateProfessionalWhatsappConnectionOutput({
        professional_id: input.professional_id,
        provider: input.provider,
        connection_mode: existing?.connection_mode ?? input.connection_mode,
        status: existing?.status ?? 'disconnected',
        is_connected: Boolean(existing?.is_connected),
        instance_name: existing?.instance_name ?? null,
        phone_number: existing?.phone_number ?? normalizePhone(professional.phone_whatsapp),
        number_kind: existing?.number_kind ?? input.number_kind ?? 'unknown',
        qr_code: existing?.qr_code ?? null,
        qr_expires_at: existing?.qr_expires_at ?? null,
        dry_run: dryRun,
      })

      return jsonResponse(output, { headers: corsHeaders })
    }

    if (input.action === 'disconnect') {
      if (input.provider === 'evolution_go') {
        await disconnectEvolutionGoConnection(existing, dryRun)
      }

      if (existing?.instance_name || input.provider === 'meta_waba') {
        await upsertConnection(supabase, input, {
          instanceName: existing?.instance_name ?? input.instance_name ?? null,
          instanceId: existing?.instance_id ?? null,
          instanceToken: existing?.instance_token ?? null,
          phoneNumber: existing?.phone_number ?? normalizePhone(input.phone_number ?? professional.phone_whatsapp),
          status: 'disconnected',
          isConnected: false,
          metaPhoneNumberId: existing?.meta_phone_number_id ?? input.meta_phone_number_id ?? null,
          metaWabaId: existing?.meta_waba_id ?? input.meta_waba_id ?? null,
          disconnectionReason: dryRun ? 'dry_run_disconnect' : 'user_requested',
        })
      }

      await recordSetupEvent(supabase, input.professional_id, 'professional.whatsapp.disconnected', {
        provider: input.provider,
        dry_run: dryRun,
      })

      const output = validateProfessionalWhatsappConnectionOutput({
        professional_id: input.professional_id,
        provider: input.provider,
        connection_mode: input.connection_mode,
        status: 'disconnected',
        is_connected: false,
        instance_name: existing?.instance_name ?? input.instance_name ?? null,
        phone_number: existing?.phone_number ?? normalizePhone(input.phone_number ?? professional.phone_whatsapp),
        number_kind: existing?.number_kind ?? input.number_kind ?? 'unknown',
        dry_run: dryRun,
      })

      return jsonResponse(output, { headers: corsHeaders })
    }

    if (existing?.status === 'connected' && existing.is_connected) {
      const output = validateProfessionalWhatsappConnectionOutput({
        professional_id: input.professional_id,
        provider: input.provider,
        connection_mode: existing.connection_mode,
        status: 'connected',
        is_connected: true,
        instance_name: existing.instance_name,
        phone_number: existing.phone_number ?? normalizePhone(professional.phone_whatsapp),
        number_kind: existing.number_kind ?? input.number_kind ?? 'unknown',
        qr_code: null,
        qr_expires_at: null,
        dry_run: dryRun,
        message: input.number_kind === 'personal'
          ? 'WhatsApp ja conectado. WhatsApp pessoal e permitido, mas Business e recomendado para reduzir risco operacional.'
          : 'WhatsApp already connected',
      })

      return jsonResponse(output, { headers: corsHeaders })
    }

    if (input.provider === 'meta_waba') {
      const isConnected = Boolean(input.meta_phone_number_id && input.meta_waba_id)
      await upsertConnection(supabase, input, {
        instanceName: null,
        phoneNumber: normalizePhone(input.phone_number ?? professional.phone_whatsapp),
        status: isConnected ? 'connected' : 'connecting',
        isConnected,
        metaPhoneNumberId: input.meta_phone_number_id ?? null,
        metaWabaId: input.meta_waba_id ?? null,
      })

      if (isConnected) {
        await recordSetupEvent(supabase, input.professional_id, 'professional.whatsapp.connected', {
          provider: input.provider,
          connection_mode: input.connection_mode,
          dry_run: dryRun,
        })
      }

      const output = validateProfessionalWhatsappConnectionOutput({
        professional_id: input.professional_id,
        provider: input.provider,
        connection_mode: input.connection_mode,
        status: isConnected ? 'connected' : 'connecting',
        is_connected: isConnected,
        instance_name: null,
        phone_number: normalizePhone(input.phone_number ?? professional.phone_whatsapp),
        number_kind: input.number_kind ?? 'business',
        dry_run: dryRun,
        message: input.number_kind === 'personal'
          ? 'WhatsApp pessoal permitido, mas Business e recomendado para reduzir risco operacional.'
          : (isConnected ? 'Meta WABA connected' : 'Meta WABA connection started'),
      })

      return jsonResponse(output, { headers: corsHeaders })
    }

    const result = await startEvolutionGoConnection(input, professional, dryRun, existing)
    await upsertConnection(supabase, input, {
      instanceName: result.instanceName,
      instanceId: result.instanceId,
      instanceToken: result.instanceToken,
      phoneNumber: result.phoneNumber,
      status: result.status,
      isConnected: result.isConnected,
      qrCode: result.qrCode,
      qrExpiresAt: result.qrExpiresAt,
    })

    const output = validateProfessionalWhatsappConnectionOutput({
      professional_id: input.professional_id,
      provider: input.provider,
      connection_mode: input.connection_mode,
      status: result.status,
      is_connected: result.isConnected,
      instance_name: result.instanceName,
      phone_number: result.phoneNumber,
      number_kind: input.number_kind ?? 'unknown',
      qr_code: result.qrCode,
      qr_expires_at: result.qrExpiresAt,
      pairing_code: result.pairingCode,
      dry_run: dryRun,
      message: input.number_kind === 'personal'
        ? 'WhatsApp pessoal permitido, mas Business e recomendado para reduzir risco operacional.'
        : undefined,
    })

    return jsonResponse(output, { headers: corsHeaders })
  } catch (error) {
    if (error instanceof Response) return error
    return jsonResponse(
      { error: error instanceof Error ? error.message : 'unknown_error' },
      { status: 500, headers: corsHeaders },
    )
  }
})
