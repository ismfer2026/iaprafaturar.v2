import { createServiceClient } from '../_shared/supabase.ts'
import { jsonResponse } from '../_shared/http.ts'
import { assertPublicRateLimit } from '../_shared/public-rate-limit.ts'

type SupportedLocale = 'pt-BR' | 'en-US' | 'es-419'
type CollectedData = Record<string, unknown>
type ConversationMessage = { role: string; content: string }

const CORS_HEADERS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, x-client-info, apikey, content-type',
  'access-control-allow-methods': 'POST, OPTIONS',
}

const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY') || ''
const OPENAI_MODEL = Deno.env.get('OPENAI_MODEL') || 'gpt-4o-mini'
const APP_BASE_URL = Deno.env.get('APP_BASE_URL') || 'https://app.iaprafaturar.com.br'

function response(body: unknown, init: ResponseInit = {}) {
  return jsonResponse(body, {
    ...init,
    headers: { ...CORS_HEADERS, ...(init.headers ?? {}) },
  })
}

function normalizeLocale(value: unknown): SupportedLocale {
  if (value === 'pt-BR' || value === 'en-US' || value === 'es-419') return value
  if (value === 'es-AL') return 'es-419'
  return 'pt-BR'
}

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function normalizePhone(value: unknown): string {
  return stringValue(value).replace(/\D/g, '')
}

function normalizeDate(value: unknown): string | null {
  const raw = stringValue(value)
  if (!raw) return null

  let normalized: string | null = null
  const br = raw.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/)
  if (br) {
    const [, day, month, year] = br
    normalized = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`
  } else if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    normalized = raw
  }

  if (!normalized) return null
  const date = new Date(`${normalized}T00:00:00.000Z`)
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== normalized) return null
  return normalized
}

function isAffirmative(value: unknown): boolean {
  const raw = stringValue(value)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
  return /^(sim|s|ok|okay|certo|correto|confirmo|confirmado|pode|pode finalizar|yes|y|yeah|correct|right|si|dale|listo)\b/.test(raw)
}

function hasEssentials(data: CollectedData): boolean {
  const fullName = [stringValue(data['first_name']), stringValue(data['last_name'])].filter(Boolean).join(' ')
  return Boolean(fullName && normalizePhone(data['phone']).length >= 10 && stringValue(data['visit_reason']))
}

function localeName(locale: SupportedLocale): string {
  if (locale === 'en-US') return 'English (US)'
  if (locale === 'es-419') return 'Spanish for Latin America'
  return 'portugues do Brasil'
}

function fallbackStart(clinicName: string, locale: SupportedLocale): string {
  if (locale === 'en-US') return `Hi! I am the virtual assistant for ${clinicName}. Let's create your registration quickly. To start, what is your first name?`
  if (locale === 'es-419') return `Hola! Soy la asistente virtual de ${clinicName}. Vamos a crear tu registro rapidamente. Para empezar, cual es tu nombre?`
  return `Oi! Sou a assistente virtual da ${clinicName}. Vamos fazer seu cadastro rapidinho. Para comecar, qual e o seu nome?`
}

function buildConfirmation(data: CollectedData, locale: SupportedLocale): string {
  const name = [stringValue(data['first_name']), stringValue(data['last_name'])].filter(Boolean).join(' ')
  const email = stringValue(data['email']) || 'nao informado'
  const cpf = stringValue(data['cpf']) || 'nao informado'
  const birth = stringValue(data['birth_date']) || 'nao informado'
  const city = stringValue(data['city']) || 'nao informado'
  const neighborhood = stringValue(data['neighborhood']) || 'nao informado'
  const found = stringValue(data['how_found_us']) || 'nao informado'

  if (locale === 'en-US') {
    return `Perfect. Let me confirm your information:\n\n- Name: ${name}\n- WhatsApp: ${stringValue(data['phone'])}\n- E-mail: ${email}\n- ID: ${cpf}\n- Birth date: ${birth}\n- City/area: ${city} - ${neighborhood}\n- Visit reason: ${stringValue(data['visit_reason'])}\n- How you found us: ${found}\n\nIs everything correct?`
  }
  if (locale === 'es-419') {
    return `Perfecto. Dejame confirmar tus datos:\n\n- Nombre: ${name}\n- WhatsApp: ${stringValue(data['phone'])}\n- E-mail: ${email}\n- Documento: ${cpf}\n- Fecha de nacimiento: ${birth}\n- Ciudad/zona: ${city} - ${neighborhood}\n- Motivo de la visita: ${stringValue(data['visit_reason'])}\n- Como nos encontraste: ${found}\n\nEsta todo correcto?`
  }
  return `Perfeito. Deixa eu confirmar seus dados:\n\n- Nome: ${name}\n- WhatsApp: ${stringValue(data['phone'])}\n- E-mail: ${email}\n- CPF: ${cpf}\n- Data de nascimento: ${birth}\n- Cidade/bairro: ${city} - ${neighborhood}\n- Motivo da visita: ${stringValue(data['visit_reason'])}\n- Como conheceu a clinica: ${found}\n\nEsta tudo certo?`
}

function buildFinalMessage(clinicName: string, portalUrl: string, locale: SupportedLocale): string {
  if (locale === 'en-US') return `Registration completed. ${clinicName} now has your information.\n\nYou can open your client portal here:\n${portalUrl}`
  if (locale === 'es-419') return `Registro concluido. ${clinicName} ya tiene tus datos.\n\nPuedes abrir tu portal aqui:\n${portalUrl}`
  return `Cadastro concluido. A ${clinicName} ja recebeu seus dados.\n\nVoce pode abrir seu portal do cliente aqui:\n${portalUrl}`
}

function buildPrompt(clinicName: string, collectedData: CollectedData, locale: SupportedLocale): string {
  return `Voce e a assistente virtual de ${clinicName}.
Seu objetivo e cadastrar um cliente/paciente novo de forma humana, curta e conversacional.

REGRAS:
- Faca UMA pergunta por vez.
- Responda exclusivamente em ${localeName(locale)}.
- Seja calorosa, mas objetiva.
- Nunca mencione JSON, campos internos, banco de dados ou sistema.
- Nao invente dados.
- Se o cliente nao quiser informar dado opcional, aceite e prossiga.

DADOS JA COLETADOS:
${JSON.stringify(collectedData, null, 2)}

FLUXO:
1. first_name: primeiro nome.
2. last_name: sobrenome.
3. phone: WhatsApp com DDD.
4. visit_reason: motivo da visita/atendimento.
5. is_new_client: primeira vez ou ja e cliente.
6. birth_date: data de nascimento, opcional.
7. cpf: CPF/documento, opcional.
8. email: e-mail, opcional.
9. city: cidade, opcional.
10. neighborhood: bairro/regiao, opcional.
11. how_found_us: como conheceu a clinica, opcional.
12. confirmacao: quando tiver pelo menos nome, WhatsApp e motivo da visita, confirme os dados.
13. somente apos confirmacao explicita, marque cadastro_confirmado true.

FORMATO DE RESPOSTA, JSON puro:
{
  "reply": "mensagem para o cliente",
  "state": {
    "step": 1,
    "cadastro_confirmado": false,
    "dados": {
      "first_name": "",
      "last_name": "",
      "phone": "",
      "visit_reason": "",
      "is_new_client": "",
      "birth_date": "",
      "cpf": "",
      "email": "",
      "city": "",
      "neighborhood": "",
      "how_found_us": ""
    }
  }
}`
}

async function callOpenAI(input: {
  clinicName: string
  message: string
  conversation: ConversationMessage[]
  collectedData: CollectedData
  locale: SupportedLocale
}) {
  if (!OPENAI_API_KEY) throw new Error('missing_openai_api_key')
  const isStart = input.message.toUpperCase() === 'INICIO'
  const messages = [
    { role: 'system', content: buildPrompt(input.clinicName, input.collectedData, input.locale) },
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

async function rpc(functionName: string, body: Record<string, unknown>): Promise<{ data: unknown; error: unknown }> {
  const url = Deno.env.get('SUPABASE_URL')
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!url || !key) throw new Error('missing_supabase_env')

  const rpcResponse = await fetch(`${url.replace(/\/$/, '')}/rest/v1/rpc/${functionName}`, {
    method: 'POST',
    headers: {
      apikey: key,
      authorization: `Bearer ${key}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  })
  const text = await rpcResponse.text()
  const data = text ? JSON.parse(text) : null
  if (!rpcResponse.ok) return { data: null, error: data }
  return { data, error: null }
}

async function claimRegistrationLinkUse(code: string | undefined, slug: string): Promise<void> {
  if (!code) return
  const { error } = await rpc('claim_registration_link_use', { p_code: code, p_slug: slug })
  if (error) console.warn('[cadastro-agent] claim_registration_link_use_failed', error)
}

async function loadProfessional(slug: string) {
  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('professionals')
    .select('id, slug, name, business_name, logo_url, settings')
    .eq('slug', slug)
    .is('deleted_at', null)
    .eq('onboarding_completed', true)
    .maybeSingle()

  if (error) throw error
  return data
}

async function completeRegistration(input: {
  slug: string
  ref?: string
  locale: SupportedLocale
  data: CollectedData
  ip: string | null
  userAgent: string | null
}) {
  const fullName = [stringValue(input.data['first_name']), stringValue(input.data['last_name'])].filter(Boolean).join(' ')
  const phone = normalizePhone(input.data['phone'])
  const email = stringValue(input.data['email']).toLowerCase() || null

  const { data: sessionData, error } = await rpc('create_client_portal_session', {
    p_slug: input.slug,
    p_phone_whatsapp: phone,
    p_full_name: fullName,
    p_email: email,
    p_lgpd_accepted: true,
    p_lang: input.locale,
    p_ip: input.ip,
    p_user_agent: input.userAgent,
  })

  if (error) throw error
  if (!sessionData || typeof sessionData !== 'object' || sessionData['ok'] !== true) {
    throw new Error(String((sessionData as Record<string, unknown> | null)?.['error'] ?? 'client_portal_session_failed'))
  }

  const sessionOutput = sessionData as Record<string, unknown>
  const clientOutput = typeof sessionOutput['client'] === 'object' && sessionOutput['client'] !== null
    ? sessionOutput['client'] as Record<string, unknown>
    : {}
  const clientId = stringValue(clientOutput['id'])
  const supabase = createServiceClient()
  if (clientId) {
    const { data: existingClient, error: loadClientError } = await supabase
      .from('clients')
      .select('metadata')
      .eq('id', clientId)
      .maybeSingle()
    if (loadClientError) throw loadClientError

    const existingMetadata = typeof existingClient?.metadata === 'object' && existingClient.metadata !== null
      ? existingClient.metadata as Record<string, unknown>
      : {}
    const metadata = {
      ...existingMetadata,
      public_client_onboarding: {
        source: 'cadastro-agent:web_chat',
        ref: input.ref ?? null,
        collected_data: input.data,
        completed_at: new Date().toISOString(),
      },
    }
    const updatePayload: Record<string, unknown> = {
      cpf: stringValue(input.data['cpf']) || null,
      birth_date: normalizeDate(input.data['birth_date']),
      gender: stringValue(input.data['gender']) || null,
      city: stringValue(input.data['city']) || null,
      neighborhood: stringValue(input.data['neighborhood']) || null,
      internal_notes: stringValue(input.data['visit_reason'])
        ? `Motivo do cadastro publico: ${stringValue(input.data['visit_reason'])}`
        : null,
      metadata,
    }
    const { error: updateClientError } = await supabase.from('clients').update(updatePayload).eq('id', clientId)
    if (updateClientError) throw updateClientError
  }

  await claimRegistrationLinkUse(input.ref, input.slug)

  const token = stringValue(sessionOutput['session_token'])
  return {
    ...sessionOutput,
    portal_url: `${APP_BASE_URL}/portal/${token}?lang=${encodeURIComponent(input.locale)}${input.ref ? `&ref=${encodeURIComponent(input.ref)}` : ''}`,
  }
}

function clientIp(request: Request): string | null {
  return request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    ?? request.headers.get('cf-connecting-ip')
    ?? null
}

function userAgent(request: Request): string | null {
  return request.headers.get('user-agent')
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS_HEADERS })
  if (request.method !== 'POST') return response({ ok: false, error: 'method_not_allowed' }, { status: 405 })

  try {
    const body = await request.json()
    if (body?.mode !== 'web_chat') return response({ ok: false, error: 'unknown_payload' }, { status: 400 })

    const slug = stringValue(body.slug).toLowerCase()
    const locale = normalizeLocale(body.locale)
    const message = stringValue(body.message) || 'INICIO'
    const ref = stringValue(body.ref)
    const conversation = Array.isArray(body.conversation) ? body.conversation as ConversationMessage[] : []
    const collectedData = typeof body.collected_data === 'object' && body.collected_data !== null
      ? body.collected_data as CollectedData
      : {}

    if (!slug) return response({ ok: false, error: 'invalid_input', locale }, { status: 400 })

    const rateLimitClient = createServiceClient()
    await assertPublicRateLimit({
      supabase: rateLimitClient,
      request,
      action: 'cadastro-agent:web_chat',
      subject: `${slug}:${ref || stringValue(collectedData['phone'])}`,
      limit: 24,
      windowSeconds: 60,
    })

    const professional = await loadProfessional(slug)
    if (!professional) return response({ ok: false, error: 'not_found', locale }, { status: 404 })
    const clinicName = stringValue(professional.business_name) || stringValue(professional.name) || 'clinica'

    if (message.toUpperCase() === 'INICIO' && !OPENAI_API_KEY) {
      return response({ ok: true, reply: fallbackStart(clinicName, locale), collected_data: collectedData, is_complete: false })
    }

    let aiResult: Record<string, unknown>
    try {
      aiResult = await callOpenAI({ clinicName, message, conversation, collectedData, locale })
    } catch (error) {
      if (hasEssentials(collectedData) && isAffirmative(message)) {
        const completion = await completeRegistration({
          slug,
          ref,
          locale,
          data: collectedData,
          ip: clientIp(request),
          userAgent: userAgent(request),
        })
        return response({
          ok: true,
          reply: buildFinalMessage(clinicName, String(completion.portal_url), locale),
          collected_data: collectedData,
          is_complete: true,
          portal_url: completion.portal_url,
          session_token: completion.session_token,
          client: completion.client,
        })
      }

      console.error('[cadastro-agent] ai_error', error)
      return response({
        ok: true,
        reply: locale === 'pt-BR'
          ? 'Tive um problema tecnico. Pode repetir sua ultima resposta?'
          : 'I had a technical issue. Can you repeat your last answer?',
        collected_data: collectedData,
        is_complete: false,
      })
    }

    const state = typeof aiResult['state'] === 'object' && aiResult['state'] !== null ? aiResult['state'] as Record<string, unknown> : {}
    const dados = typeof state['dados'] === 'object' && state['dados'] !== null ? state['dados'] as CollectedData : {}
    const merged = { ...collectedData, ...dados }
    const confirmed = state['cadastro_confirmado'] === true || (hasEssentials(merged) && isAffirmative(message))

    if (!confirmed && hasEssentials(merged)) {
      return response({ ok: true, reply: buildConfirmation(merged, locale), collected_data: merged, is_complete: false })
    }

    if (confirmed) {
      const completion = await completeRegistration({
        slug,
        ref,
        locale,
        data: merged,
        ip: clientIp(request),
        userAgent: userAgent(request),
      })
      return response({
        ok: true,
        reply: buildFinalMessage(clinicName, String(completion.portal_url), locale),
        collected_data: merged,
        is_complete: true,
        portal_url: completion.portal_url,
        session_token: completion.session_token,
        client: completion.client,
      })
    }

    return response({
      ok: true,
      reply: stringValue(aiResult['reply']) || fallbackStart(clinicName, locale),
      collected_data: merged,
      is_complete: false,
    })
  } catch (error) {
    if (error instanceof Error && error.message === 'rate_limited') {
      return response({ ok: false, error: 'rate_limited' }, { status: 429 })
    }

    console.error('[cadastro-agent] http_error', error)
    return response({ ok: false, error: 'internal_error' }, { status: 500 })
  }
})
