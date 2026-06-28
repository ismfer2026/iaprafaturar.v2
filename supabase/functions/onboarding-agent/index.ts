import { createServiceClient } from '../_shared/supabase.ts'
import { jsonResponse } from '../_shared/http.ts'
import { assertPublicRateLimit } from '../_shared/public-rate-limit.ts'

type SupportedLocale = 'pt-BR' | 'en-US' | 'es-419'

type ConversationMessage = {
  role: 'user' | 'assistant' | string
  content: string
}

type CollectedData = Record<string, unknown>

const CORS_HEADERS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, x-client-info, apikey, content-type',
  'access-control-allow-methods': 'POST, OPTIONS',
}

const APP_BASE_URL = Deno.env.get('APP_BASE_URL') || 'https://app.iaprafaturar.com.br'
const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY') || ''
const OPENAI_MODEL = Deno.env.get('OPENAI_MODEL') || 'gpt-4o-mini'
const ONBOARDING_AGENT_NAME = Deno.env.get('ONBOARDING_AGENT_NAME') || 'Rosane'

function response(body: unknown, init: ResponseInit = {}) {
  return jsonResponse(body, {
    ...init,
    headers: {
      ...CORS_HEADERS,
      ...(init.headers ?? {}),
    },
  })
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

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function normalizePhone(value: unknown): string {
  return stringValue(value).replace(/\D/g, '')
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
    stringValue(data['first_name'])
      && stringValue(data['last_name'])
      && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(stringValue(data['email']))
      && normalizePhone(data['phone']).length >= 10
      && stringValue(data['business_name'])
      && stringValue(data['profession_type'])
      && stringValue(data['city'])
      && stringValue(data['neighborhood'])
      && stringValue(data['assistant_name']),
  )
}

function planTypeForV2(value: unknown): 'individual' | 'equipe' {
  const raw = stringValue(value).toLowerCase()
  if (raw.includes('pro') || raw.includes('clinica') || raw.includes('clinic') || raw.includes('equipe') || raw.includes('team')) {
    return 'equipe'
  }
  return 'individual'
}

function publicPlanType(value: unknown): 'basic' | 'pro' | 'clinica' {
  const raw = stringValue(value).toLowerCase()
  if (raw.includes('clinic') || raw.includes('clinica') || raw.includes('varios') || raw.includes('vários')) return 'clinica'
  if (raw.includes('pro') || raw.includes('equipe') || raw.includes('team')) return 'pro'
  return 'basic'
}

function buildConfirmation(data: CollectedData, locale: SupportedLocale): string {
  const instagram = stringValue(data['instagram_handle']) || 'nao informado'
  if (locale === 'en-US') {
    return `Perfect. Here is what I have so far:\n\n- Name: ${stringValue(data['first_name'])} ${stringValue(data['last_name'])}\n- E-mail: ${stringValue(data['email'])}\n- WhatsApp: ${stringValue(data['phone'])}\n- Business/service name: ${stringValue(data['business_name'])}\n- Profession/specialty: ${stringValue(data['profession_type'])}\n- City: ${stringValue(data['city'])}\n- Area: ${stringValue(data['neighborhood'])}\n- Instagram: ${instagram}\n- Assistant: ${stringValue(data['assistant_name'])}\n\nIs everything correct so I can finish your setup?`
  }
  if (locale === 'es-419') {
    return `Perfecto. Estos son los datos que tengo hasta ahora:\n\n- Nombre: ${stringValue(data['first_name'])} ${stringValue(data['last_name'])}\n- E-mail: ${stringValue(data['email'])}\n- WhatsApp: ${stringValue(data['phone'])}\n- Nombre del negocio/atencion: ${stringValue(data['business_name'])}\n- Profesion/especialidad: ${stringValue(data['profession_type'])}\n- Ciudad: ${stringValue(data['city'])}\n- Barrio o region: ${stringValue(data['neighborhood'])}\n- Instagram: ${instagram}\n- Asistente: ${stringValue(data['assistant_name'])}\n\nEsta todo correcto para finalizar tu configuracion?`
  }
  return `Perfeito. Estes sao os dados que eu tenho ate agora:\n\n- Nome: ${stringValue(data['first_name'])} ${stringValue(data['last_name'])}\n- E-mail: ${stringValue(data['email'])}\n- WhatsApp: ${stringValue(data['phone'])}\n- Nome do negocio/atendimento: ${stringValue(data['business_name'])}\n- Profissao/especialidade: ${stringValue(data['profession_type'])}\n- Cidade: ${stringValue(data['city'])}\n- Bairro ou regiao: ${stringValue(data['neighborhood'])}\n- Instagram: ${instagram}\n- Assistente: ${stringValue(data['assistant_name'])}\n\nEsta tudo certo para eu finalizar seu cadastro?`
}

function finalMessage(data: CollectedData, link: string, locale: SupportedLocale): string {
  const firstName = stringValue(data['first_name']) || (locale === 'en-US' ? 'Doctor' : 'Doutor(a)')
  const assistant = stringValue(data['assistant_name']) || ONBOARDING_AGENT_NAME
  if (locale === 'en-US') {
    return `All set, ${firstName}! Your client service flow is configured.\n\nI registered your information and your assistant ${assistant} is ready to help your clients.\n\nTo get started, open the link below and create your password:\n${link}\n\nSee you inside!`
  }
  if (locale === 'es-419') {
    return `Listo, ${firstName}! Tu atencion esta configurada.\n\nRegistre tu informacion y tu asistente ${assistant} esta lista para atender a tus clientes.\n\nPara comenzar, abre el siguiente enlace y crea tu contrasena:\n${link}\n\nTe espero adentro!`
  }
  return `Prontinho, ${firstName}! Sua rotina de atendimento esta configurada.\n\nJa cadastrei suas informacoes e sua assistente ${assistant} esta pronta para atender seus clientes.\n\nPara comecar, acesse o link abaixo e crie sua senha:\n${link}\n\nTe espero la dentro!`
}

function buildPrompt(collectedData: CollectedData, locale: SupportedLocale): string {
  return `Voce e a ${ONBOARDING_AGENT_NAME}, assistente do iaprafaturar.
Seu objetivo e configurar a clinica do profissional de saude de forma calorosa, humana e conversacional.

REGRAS ABSOLUTAS:
- Faca UMA pergunta por vez.
- Use o nome da pessoa assim que souber.
- Nunca saia do fluxo de cadastro.
- Responda exclusivamente em ${localeName(locale)}.
- Nao mencione campos internos, JSON, plan_type ou cadastro_confirmado para o usuario.
- Nao mencione precos.

DADOS JA COLETADOS:
${JSON.stringify(collectedData, null, 2)}

FLUXO OBRIGATORIO:
1. Nome.
2. Sobrenome.
3. E-mail profissional.
4. WhatsApp com DDD.
5. Nome da clinica ou negocio.
6. Profissao ou especialidade.
7. Cidade.
8. Bairro ou regiao.
9. Instagram profissional. Se nao tiver, use null.
10. Nome da assistente.
11. Se atende sozinho(a), com pequena equipe ou com varios profissionais.
12. Confirmacao dos dados.
13. Somente apos confirmacao explicita, marque cadastro_confirmado true.

FORMATO DE RESPOSTA, somente JSON puro:
{
  "reply": "mensagem para o profissional",
  "state": {
    "step": 1,
    "cadastro_confirmado": false,
    "dados": {
      "first_name": "",
      "last_name": "",
      "email": "",
      "phone": "",
      "business_name": "",
      "profession_type": "",
      "city": "",
      "neighborhood": "",
      "instagram_handle": null,
      "assistant_name": "",
      "plan_type": "basic"
    }
  }
}`
}

async function callOpenAI(input: {
  message: string
  conversation: ConversationMessage[]
  collectedData: CollectedData
  locale: SupportedLocale
}) {
  if (!OPENAI_API_KEY) throw new Error('missing_openai_api_key')

  const isStart = input.message.toUpperCase() === 'INICIO'
  const messages = [
    { role: 'system', content: buildPrompt(input.collectedData, input.locale) },
    ...(isStart
      ? [{ role: 'user', content: 'INICIO' }]
      : input.conversation.slice(-14).map((message) => ({
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

  if (!openAiResponse.ok) {
    throw new Error(`openai_${openAiResponse.status}`)
  }

  const data = await openAiResponse.json()
  const content = data?.choices?.[0]?.message?.content
  if (typeof content !== 'string' || !content.trim()) throw new Error('empty_ai_response')
  return JSON.parse(content)
}

function fallbackStart(locale: SupportedLocale) {
  if (locale === 'en-US') return `Hi! I am ${ONBOARDING_AGENT_NAME}, assistant from iaprafaturar. To start, what is your first name?`
  if (locale === 'es-419') return `Hola! Soy ${ONBOARDING_AGENT_NAME}, asistente de iaprafaturar. Para empezar, cual es tu nombre?`
  return `Oi! Sou a ${ONBOARDING_AGENT_NAME}, assistente do iaprafaturar. Para comecar, qual e o seu nome?`
}

async function completePublicOnboarding(input: {
  supabase: ReturnType<typeof createServiceClient>
  data: CollectedData
  refCode: string
  locale: SupportedLocale
}) {
  const fullName = [stringValue(input.data['first_name']), stringValue(input.data['last_name'])].filter(Boolean).join(' ')
  const email = stringValue(input.data['email']).toLowerCase()
  const phone = normalizePhone(input.data['phone'])

  const { data: rpcData, error } = await input.supabase.rpc('create_public_professional_preaccount', {
    p_email: email,
    p_name: fullName,
    p_phone_whatsapp: phone,
    p_ref: input.refCode || null,
    p_lang: input.locale,
    p_conversation: 'onboarding-agent:web_chat',
    p_collected_data: input.data,
  })

  if (error) throw error
  if (!rpcData || typeof rpcData !== 'object' || rpcData['ok'] !== true) {
    throw new Error(String((rpcData as Record<string, unknown> | null)?.['error'] ?? 'preaccount_failed'))
  }

  const professionalId = String((rpcData as Record<string, unknown>)['professional_id'])
  const assistantName = stringValue(input.data['assistant_name']) || ONBOARDING_AGENT_NAME
  const planType = planTypeForV2(input.data['plan_type'])
  const { data: existingProfessional } = await input.supabase
    .from('professionals')
    .select('settings')
    .eq('id', professionalId)
    .maybeSingle()

  const existingSettings = typeof existingProfessional?.settings === 'object' && existingProfessional.settings !== null
    ? existingProfessional.settings as Record<string, unknown>
    : {}

  const { error: updateError } = await input.supabase
    .from('professionals')
    .update({
      name: fullName || null,
      business_name: stringValue(input.data['business_name']) || null,
      phone_whatsapp: phone || null,
      profession_type: stringValue(input.data['profession_type']) || 'outros',
      city: stringValue(input.data['city']) || null,
      neighborhood: stringValue(input.data['neighborhood']) || null,
      instagram_handle: stringValue(input.data['instagram_handle']) || null,
      plan_type: planType,
      onboarding_essentials_completed: true,
      onboarding_pending: true,
      onboarding_step: 12,
      onboarding_source: 'public_onboarding',
      onboarding_data: {
        ref: input.refCode || null,
        lang: input.locale,
        conversation: 'onboarding-agent:web_chat',
        collected_data: input.data,
      },
      settings: {
        ...existingSettings,
        assistant_name: assistantName,
      },
      updated_at: new Date().toISOString(),
    })
    .eq('id', professionalId)

  if (updateError) throw updateError

  const params = new URLSearchParams({
    pid: professionalId,
    email,
    lang: input.locale,
  })
  if (input.refCode) params.set('ref', input.refCode)

  return `${APP_BASE_URL}/criar-conta?${params.toString()}`
}

async function handleWebChat(request: Request, body: Record<string, unknown>) {
  const supabase = createServiceClient()
  const locale = normalizeLocale(body['locale'])
  const message = stringValue(body['message']) || 'INICIO'
  const refCode = stringValue(body['ref_code'])
  const conversation = Array.isArray(body['conversation']) ? body['conversation'] as ConversationMessage[] : []
  const collectedData = typeof body['collected_data'] === 'object' && body['collected_data'] !== null
    ? body['collected_data'] as CollectedData
    : {}

  await assertPublicRateLimit({
    supabase,
    request,
    action: 'onboarding-agent:web_chat',
    subject: refCode || stringValue(collectedData['email']) || null,
    limit: 20,
    windowSeconds: 60,
  })

  if (message.toUpperCase() === 'INICIO' && !OPENAI_API_KEY) {
    return {
      reply: fallbackStart(locale),
      collected_data: collectedData,
      is_complete: false,
    }
  }

  let result: Record<string, unknown>
  try {
    result = await callOpenAI({ message, conversation, collectedData, locale })
  } catch (error) {
    if (hasEssentials(collectedData) && isAffirmative(message)) {
      const criarContaUrl = await completePublicOnboarding({ supabase, data: collectedData, refCode, locale })
      return {
        reply: finalMessage(collectedData, criarContaUrl, locale),
        collected_data: collectedData,
        is_complete: true,
        criar_conta_url: criarContaUrl,
      }
    }
    console.error('[onboarding-agent] AI error:', error)
    return {
      reply: locale === 'pt-BR'
        ? 'Tive um problema tecnico. Pode repetir sua ultima resposta?'
        : 'I had a technical issue. Can you repeat your last answer?',
      collected_data: collectedData,
      is_complete: false,
    }
  }

  const state = typeof result['state'] === 'object' && result['state'] !== null ? result['state'] as Record<string, unknown> : {}
  const dados = typeof state['dados'] === 'object' && state['dados'] !== null ? state['dados'] as CollectedData : {}
  const merged = { ...collectedData, ...dados }
  const confirmed = state['cadastro_confirmado'] === true || (hasEssentials(merged) && isAffirmative(message))

  if (!confirmed && hasEssentials(merged)) {
    return {
      reply: buildConfirmation(merged, locale),
      collected_data: merged,
      is_complete: false,
    }
  }

  if (confirmed) {
    merged['plan_type'] = publicPlanType(merged['plan_type'])
    const criarContaUrl = await completePublicOnboarding({ supabase, data: merged, refCode, locale })
    return {
      reply: finalMessage(merged, criarContaUrl, locale),
      collected_data: merged,
      is_complete: true,
      criar_conta_url: criarContaUrl,
    }
  }

  return {
    reply: stringValue(result['reply']) || fallbackStart(locale),
    collected_data: merged,
    is_complete: false,
  }
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS_HEADERS })
  if (request.method !== 'POST') return response({ error: 'method_not_allowed' }, { status: 405 })

  try {
    const body = await request.json()
    if (body?.mode === 'web_chat') {
      const result = await handleWebChat(request, body)
      return response(result)
    }

    return response({ error: 'unknown_payload' }, { status: 400 })
  } catch (error) {
    if (error instanceof Error && error.message === 'rate_limited') {
      return response({ error: 'rate_limited' }, { status: 429 })
    }
    console.error('[onboarding-agent] HTTP error:', error)
    return response({ error: 'internal_error' }, { status: 500 })
  }
})
