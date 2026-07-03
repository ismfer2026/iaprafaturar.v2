import {
  validatePublicReferralHandlerInput,
  validatePublicReferralResolveOutput,
  validatePublicReferralSubmitLeadOutput,
  validatePublicReferralWebChatOutput,
} from '@iaprafaturar/contracts/edge-functions/public-referral-handler.ts'

import { jsonResponse } from '../_shared/http.ts'
import { assertPublicRateLimit } from '../_shared/public-rate-limit.ts'
import { createServiceClient } from '../_shared/supabase.ts'

type SupportedLocale = 'pt-BR' | 'en-US' | 'es-419'
type CollectedData = Record<string, unknown>
type ConversationMessage = { role: string; content: string }

const CORS_HEADERS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, x-client-info, apikey, content-type, x-dry-run',
  'access-control-allow-methods': 'POST, OPTIONS',
}

const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY') || ''
const OPENAI_MODEL = Deno.env.get('OPENAI_MODEL') || 'gpt-4o-mini'

function publicJsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return jsonResponse(body, {
    ...init,
    headers: {
      ...CORS_HEADERS,
      ...(init.headers ?? {}),
    },
  })
}

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function normalizePhone(value: unknown): string {
  return stringValue(value).replace(/\D/g, '')
}

function normalizeLocale(value: unknown): SupportedLocale {
  if (value === 'en-US' || value === 'es-419' || value === 'pt-BR') return value
  if (value === 'es-AL') return 'es-419'
  return 'pt-BR'
}

function localeName(locale: SupportedLocale): string {
  if (locale === 'en-US') return 'English (US)'
  if (locale === 'es-419') return 'Spanish for Latin America'
  return 'portugues do Brasil'
}

function isAffirmative(value: unknown): boolean {
  const raw = stringValue(value)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
  return /^(sim|s|ok|okay|certo|correto|confirmo|confirmado|pode|pode finalizar|yes|y|yeah|correct|right|si|dale|listo)\b/.test(raw)
}

function hasEssentials(data: CollectedData): boolean {
  return Boolean(
    stringValue(data['full_name'])
      && normalizePhone(data['phone']).length >= 10
      && stringValue(data['interest_reason']),
  )
}

function mapError(error: unknown): { status: number; body: unknown } {
  if (error instanceof Error && error.name === 'ZodError') {
    return { status: 400, body: { ok: false, error: 'invalid_input' } }
  }

  const message = error instanceof Error ? error.message : String(error)
  if (message.includes('referral_link_not_found')) return { status: 404, body: { ok: false, error: 'not_found' } }
  if (message.includes('invalid_input') || message.includes('lgpd_required')) {
    return { status: 400, body: { ok: false, error: 'invalid_input' } }
  }
  if (message.includes('rate_limited')) return { status: 429, body: { ok: false, error: 'rate_limited' } }
  return { status: 500, body: { ok: false, error: 'internal_error' } }
}

function buildConfirmation(data: CollectedData, locale: SupportedLocale): string {
  const email = stringValue(data['email']) || 'nao informado'
  const note = stringValue(data['note']) || 'nao informado'

  if (locale === 'en-US') {
    return `Perfect. Let me confirm:\n\n- Name: ${stringValue(data['full_name'])}\n- WhatsApp: ${stringValue(data['phone'])}\n- E-mail: ${email}\n- What you are looking for: ${stringValue(data['interest_reason'])}\n- Note: ${note}\n\nIs everything correct so I can send this referral?`
  }
  if (locale === 'es-419') {
    return `Perfecto. Dejame confirmar:\n\n- Nombre: ${stringValue(data['full_name'])}\n- WhatsApp: ${stringValue(data['phone'])}\n- E-mail: ${email}\n- Lo que estas buscando: ${stringValue(data['interest_reason'])}\n- Mensaje: ${note}\n\nEsta todo correcto para enviar esta referencia?`
  }
  return `Perfeito. Deixa eu confirmar:\n\n- Nome: ${stringValue(data['full_name'])}\n- WhatsApp: ${stringValue(data['phone'])}\n- E-mail: ${email}\n- O que voce procura: ${stringValue(data['interest_reason'])}\n- Mensagem: ${note}\n\nEsta tudo certo para eu enviar sua indicacao?`
}

function fallbackStart(professionalName: string, locale: SupportedLocale): string {
  if (locale === 'en-US') return `Hi! ${professionalName} received a referral for you. I will collect a few details to help the team contact you. What is your full name?`
  if (locale === 'es-419') return `Hola! ${professionalName} recibio una referencia para ti. Voy a recopilar algunos datos para que el equipo pueda contactarte. Cual es tu nombre completo?`
  return `Oi! ${professionalName} recebeu uma indicacao para voce. Vou pegar alguns dados para a equipe entrar em contato. Qual e o seu nome completo?`
}

function finalMessage(professionalName: string, locale: SupportedLocale): string {
  if (locale === 'en-US') return `Referral received. ${professionalName}'s team will contact you using the details provided.`
  if (locale === 'es-419') return `Referencia recibida. El equipo de ${professionalName} te contactara con los datos informados.`
  return `Indicacao recebida. A equipe de ${professionalName} vai entrar em contato pelos dados informados.`
}

function buildPrompt(professionalName: string, collectedData: CollectedData, locale: SupportedLocale): string {
  return `Voce e a assistente virtual de ${professionalName}.
Seu objetivo e receber uma indicacao de cliente para a clinica/profissional, em formato humano e conversacional.

REGRAS:
- Faca UMA pergunta por vez.
- Responda exclusivamente em ${localeName(locale)}.
- Seja objetiva e acolhedora.
- Nunca mencione JSON, campos internos, banco de dados ou sistema.
- Nao prometa atendimento imediato, preco, vaga ou resultado.
- Se a pessoa nao quiser informar dado opcional, aceite e prossiga.

DADOS JA COLETADOS:
${JSON.stringify(collectedData, null, 2)}

FLUXO:
1. full_name: nome completo da pessoa indicada.
2. phone: WhatsApp com DDD.
3. interest_reason: o que ela procura ou qual ajuda deseja.
4. email: e-mail, opcional.
5. note: mensagem adicional, opcional.
6. confirmacao: quando tiver nome, WhatsApp e o que procura, confirme os dados.
7. somente apos confirmacao explicita, marque indicacao_confirmada true.

FORMATO DE RESPOSTA, JSON puro:
{
  "reply": "mensagem para o cliente",
  "state": {
    "step": 1,
    "indicacao_confirmada": false,
    "dados": {
      "full_name": "",
      "phone": "",
      "interest_reason": "",
      "email": "",
      "note": ""
    }
  }
}`
}

async function callOpenAI(input: {
  professionalName: string
  message: string
  conversation: ConversationMessage[]
  collectedData: CollectedData
  locale: SupportedLocale
}) {
  if (!OPENAI_API_KEY) throw new Error('missing_openai_api_key')
  const isStart = input.message.toUpperCase() === 'INICIO'
  const messages = [
    { role: 'system', content: buildPrompt(input.professionalName, input.collectedData, input.locale) },
    ...(isStart
      ? [{ role: 'user', content: 'INICIO' }]
      : input.conversation.slice(-16).map((message) => ({
          role: message.role === 'assistant' ? 'assistant' : 'user',
          content: String(message.content || ''),
        }))),
  ]

  const openAiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${OPENAI_API_KEY}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      temperature: 0.2,
      response_format: { type: 'json_object' },
      messages,
    }),
  })

  if (!openAiResponse.ok) throw new Error(`openai_${openAiResponse.status}`)
  const data = await openAiResponse.json()
  const content = data?.choices?.[0]?.message?.content
  if (typeof content !== 'string' || !content.trim()) throw new Error('empty_ai_response')
  return JSON.parse(content)
}

async function rateLimit(input: {
  supabase: ReturnType<typeof createServiceClient>
  request: Request
  action: string
  subject: string
  limit: number
}) {
  await assertPublicRateLimit({
    supabase: {
      rpc: async (name, args) => {
        const { data, error } = await input.supabase.rpc(name, args)
        return { data, error }
      },
    },
    request: input.request,
    action: input.action,
    subject: input.subject,
    limit: input.limit,
    windowSeconds: 60,
  })
}

async function resolveReferralLink(
  supabase: ReturnType<typeof createServiceClient>,
  code: string,
): Promise<{
  id: string
  code: string
  professional_id: string
  client_id: string | null
  expires_at: string | null
  professionals: { slug: string; name: string; business_name: string | null } | Array<{ slug: string; name: string; business_name: string | null }>
}> {
  const { data, error } = await supabase
    .from('referral_links')
    .select('id, code, professional_id, client_id, expires_at, professionals!inner(slug, name, business_name, deleted_at, onboarding_completed)')
    .ilike('code', code.trim())
    .eq('type', 'client_to_client')
    .eq('status', 'active')
    .is('professionals.deleted_at', null)
    .eq('professionals.onboarding_completed', true)
    .limit(1)

  if (error) throw error
  const link = data?.[0] as Awaited<ReturnType<typeof resolveReferralLink>> | undefined
  if (!link) throw new Error('referral_link_not_found')
  if (link.expires_at && new Date(link.expires_at).getTime() <= Date.now()) {
    throw new Error('referral_link_not_found')
  }
  return link
}

async function createReferralLead(input: {
  supabase: ReturnType<typeof createServiceClient>
  link: Awaited<ReturnType<typeof resolveReferralLink>>
  data: CollectedData
  locale: SupportedLocale
}): Promise<{ clientId: string; referralEventId: string }> {
  const phone = normalizePhone(input.data['phone'])
  const email = stringValue(input.data['email']).toLowerCase() || null
  const fullName = stringValue(input.data['full_name'])
  const interestReason = stringValue(input.data['interest_reason'])

  if (!fullName || phone.length < 8 || !interestReason) throw new Error('invalid_input')

  const { data: existingClient, error: existingError } = await input.supabase
    .from('clients')
    .select('id, email, metadata')
    .eq('professional_id', input.link.professional_id)
    .eq('phone_whatsapp', phone)
    .is('deleted_at', null)
    .maybeSingle()

  if (existingError) throw existingError

  let clientId = existingClient?.id as string | undefined
  const referralMetadata = {
    referral: {
      code: input.link.code,
      referral_link_id: input.link.id,
      referrer_client_id: input.link.client_id,
      interest_reason: interestReason,
      note: stringValue(input.data['note']) || null,
      lang: input.locale,
      source: 'public-referral-handler:web_chat',
      submitted_at: new Date().toISOString(),
    },
  }

  if (!clientId) {
    const { data: inserted, error: insertError } = await input.supabase
      .from('clients')
      .insert({
        professional_id: input.link.professional_id,
        full_name: fullName,
        phone_whatsapp: phone,
        email,
        source: 'referral',
        referral_client_id: input.link.client_id,
        lgpd_consent_at: new Date().toISOString(),
        lgpd_consent_source: 'public_referral_webflow',
        internal_notes: interestReason ? `Indicacao publica: ${interestReason}` : null,
        metadata: referralMetadata,
      })
      .select('id')
      .single()

    if (insertError) throw insertError
    clientId = inserted.id as string
  } else {
    const existingMetadata = existingClient?.metadata && typeof existingClient.metadata === 'object'
      ? existingClient.metadata as Record<string, unknown>
      : {}

    const { error: updateError } = await input.supabase
      .from('clients')
      .update({
        full_name: fullName,
        email: email ?? existingClient?.email ?? null,
        source: 'referral',
        referral_client_id: input.link.client_id,
        lgpd_consent_at: new Date().toISOString(),
        lgpd_consent_source: 'public_referral_webflow',
        internal_notes: interestReason ? `Indicacao publica: ${interestReason}` : null,
        metadata: {
          ...existingMetadata,
          ...referralMetadata,
        },
      })
      .eq('id', clientId)
      .eq('professional_id', input.link.professional_id)

    if (updateError) throw updateError
  }

  const { data: event, error: eventError } = await input.supabase.rpc('register_referral_event', {
    p_referral_code: input.link.code,
    p_event_type: 'lead_created',
    p_referred_client_id: clientId,
    p_payload: {
      source: 'public-referral-handler:web_chat',
      interest_reason: interestReason,
      note: stringValue(input.data['note']) || null,
      lang: input.locale,
    },
  })

  if (eventError) throw eventError
  return {
    clientId,
    referralEventId: String((event as Record<string, unknown>)?.['referral_event_id'] ?? ''),
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
    const input = validatePublicReferralHandlerInput(await request.json())
    const supabase = createServiceClient()
    const locale = normalizeLocale(input.mode === 'web_chat' ? input.locale : input.lang)
    const link = await resolveReferralLink(supabase, input.code)
    const professional = Array.isArray(link.professionals) ? link.professionals[0] : link.professionals
    const professionalName = professional.business_name || professional.name || 'profissional'

    await rateLimit({
      supabase,
      request,
      action: `public-referral:${input.mode}`,
      subject: input.code,
      limit: input.mode === 'resolve' ? 60 : 20,
    })

    if (input.mode === 'resolve') {
      return publicJsonResponse(validatePublicReferralResolveOutput({
        ok: true,
        code: link.code,
        locale,
        professional: {
          slug: professional.slug,
          public_name: professionalName,
        },
        next_step: 'lead_form',
      }))
    }

    if (input.mode === 'submit_lead') {
      const result = await createReferralLead({
        supabase,
        link,
        locale,
        data: {
          full_name: input.full_name,
          phone: input.phone_whatsapp,
          email: input.email ?? '',
          note: input.note ?? '',
          interest_reason: input.note ?? 'Indicacao publica',
        },
      })

      return publicJsonResponse(validatePublicReferralSubmitLeadOutput({
        ok: true,
        client_id: result.clientId,
        referral_event_id: result.referralEventId,
        next_step: 'received',
      }))
    }

    const message = input.message || 'INICIO'
    const conversation = input.conversation ?? []
    const collectedData = input.collected_data ?? {}

    if (message.toUpperCase() === 'INICIO' && !OPENAI_API_KEY) {
      return publicJsonResponse(validatePublicReferralWebChatOutput({
        ok: true,
        reply: fallbackStart(professionalName, locale),
        collected_data: collectedData,
        is_complete: false,
      }))
    }

    let aiResult: Record<string, unknown>
    try {
      aiResult = await callOpenAI({ professionalName, message, conversation, collectedData, locale })
    } catch (error) {
      if (hasEssentials(collectedData) && isAffirmative(message)) {
        const result = await createReferralLead({ supabase, link, data: collectedData, locale })
        return publicJsonResponse(validatePublicReferralWebChatOutput({
          ok: true,
          reply: finalMessage(professionalName, locale),
          collected_data: collectedData,
          is_complete: true,
          client_id: result.clientId,
          referral_event_id: result.referralEventId,
        }))
      }

      console.error('[public-referral-handler] ai_error', error)
      return publicJsonResponse(validatePublicReferralWebChatOutput({
        ok: true,
        reply: locale === 'pt-BR'
          ? 'Tive um problema tecnico. Pode repetir sua ultima resposta?'
          : 'I had a technical issue. Can you repeat your last answer?',
        collected_data: collectedData,
        is_complete: false,
      }))
    }

    const state = typeof aiResult['state'] === 'object' && aiResult['state'] !== null ? aiResult['state'] as Record<string, unknown> : {}
    const dados = typeof state['dados'] === 'object' && state['dados'] !== null ? state['dados'] as CollectedData : {}
    const merged = { ...collectedData, ...dados }
    const confirmed = state['indicacao_confirmada'] === true || (hasEssentials(merged) && isAffirmative(message))

    if (!confirmed && hasEssentials(merged)) {
      return publicJsonResponse(validatePublicReferralWebChatOutput({
        ok: true,
        reply: buildConfirmation(merged, locale),
        collected_data: merged,
        is_complete: false,
      }))
    }

    if (confirmed) {
      const result = await createReferralLead({ supabase, link, data: merged, locale })
      return publicJsonResponse(validatePublicReferralWebChatOutput({
        ok: true,
        reply: finalMessage(professionalName, locale),
        collected_data: merged,
        is_complete: true,
        client_id: result.clientId,
        referral_event_id: result.referralEventId,
      }))
    }

    return publicJsonResponse(validatePublicReferralWebChatOutput({
      ok: true,
      reply: stringValue(aiResult['reply']) || fallbackStart(professionalName, locale),
      collected_data: merged,
      is_complete: false,
    }))
  } catch (error) {
    const mapped = mapError(error)
    return publicJsonResponse(mapped.body, { status: mapped.status })
  }
})
