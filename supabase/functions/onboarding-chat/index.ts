import { createClient } from '@supabase/supabase-js'
import { jsonResponse } from '../_shared/http.ts'

const STEPS = [
  {
    key: 'profile_basics',
    question: 'Qual o nome do seu negócio? Como seus clientes te encontram?',
  },
  {
    key: 'main_services',
    question: 'Qual o principal serviço que você oferece? (Ex: Fisioterapia, Nutrição, Massagem, Consulta)',
  },
  {
    key: 'business_hours',
    question: 'Quais dias e horários você costuma atender? Pode falar naturalmente — tipo "seg a sex, das 8h às 18h".',
  },
  {
    key: 'rosane_preferences',
    question: 'Qual nome você quer dar para sua assistente de IA? O padrão é Rosane, mas a escolha é sua!',
  },
] as const

type StepKey = typeof STEPS[number]['key']

async function callClaude(apiKey: string, system: string, userText: string): Promise<string | null> {
  try {
    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5',
        max_tokens: 160,
        system,
        messages: [{ role: 'user', content: userText }],
      }),
      signal: AbortSignal.timeout(12000),
    })
    if (!resp.ok) return null
    const data = await resp.json() as { content?: Array<{ type: string; text?: string }> }
    return data.content?.find(c => c.type === 'text')?.text?.trim() ?? null
  } catch {
    return null
  }
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'authorization, content-type, apikey, x-client-info',
      },
    })
  }

  const authHeader = request.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return jsonResponse({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

  // User-scoped client: auth verification + SECURITY DEFINER RPC calls
  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  })

  // Service client: direct table operations (sessions/items not exposed to authenticated role)
  const svc = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const { data: professionalId, error: authError } = await userClient.rpc('auth_professional_id')
  if (authError || !professionalId) {
    return jsonResponse({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data: professional } = await svc
    .from('professionals')
    .select('id, name, business_name')
    .eq('id', professionalId)
    .single()

  if (!professional) return jsonResponse({ error: 'Not found' }, { status: 404 })

  const body = await request.json() as { message: string | null }
  const userMessage = body.message

  // Load or create setup session
  let { data: session } = await svc
    .from('nerissa_setup_sessions')
    .select('id, current_step, completed_steps, status')
    .eq('professional_id', professionalId)
    .maybeSingle()

  if (!session) {
    const { data: newSession, error: insertError } = await svc
      .from('nerissa_setup_sessions')
      .insert({
        professional_id: professionalId,
        status: 'in_progress',
        current_step: STEPS[0].key,
        completed_steps: [],
        started_at: new Date().toISOString(),
        last_contact_at: new Date().toISOString(),
        source: 'webchat',
        completion_percent: 0,
      })
      .select('id, current_step, completed_steps, status')
      .single()

    if (insertError) return jsonResponse({ error: 'Session error' }, { status: 500 })
    session = newSession
  }

  const completedSteps: string[] = (session as { completed_steps: string[] }).completed_steps ?? []
  const currentStepKey = ((session as { current_step: string | null }).current_step ?? STEPS[0].key) as StepKey
  const currentIndex = STEPS.findIndex(s => s.key === currentStepKey)
  const stepIndex = currentIndex < 0 ? 0 : currentIndex

  // ── Initial greeting (message === null) ──────────────────────────
  if (userMessage === null) {
    const isReturning = completedSteps.length > 0
    const currentQuestion = STEPS[stepIndex]?.question ?? STEPS[0].question
    const name = (professional.name as string | null)?.split(' ')[0] ?? 'profissional'

    const reply = isReturning
      ? `Bem-vindo de volta, ${name}! Continuamos de onde paramos.\n\n${currentQuestion}`
      : `Olá, ${name}! Sou a Nerissa. Vou configurar sua conta do IA para Faturar em 4 passos rápidos — é simples e leva menos de 2 minutos!\n\n${currentQuestion}`

    return jsonResponse({ reply, step_index: stepIndex, total_steps: STEPS.length, completed: false })
  }

  // ── Process answer ───────────────────────────────────────────────
  const answer = userMessage.trim()

  // Persist answer in setup_items
  await svc.from('nerissa_setup_items').upsert(
    {
      session_id: (session as { id: string }).id,
      professional_id: professionalId,
      category: currentStepKey,
      item_key: currentStepKey,
      status: 'completed',
      data: { last_answer: answer },
      completed_at: new Date().toISOString(),
    },
    { onConflict: 'session_id,item_key' },
  )

  // Advance session
  const newCompleted = [...new Set([...completedSteps, currentStepKey])]
  const nextStepDef = STEPS[stepIndex + 1]
  const allDone = !nextStepDef

  await svc.from('nerissa_setup_sessions').update({
    current_step: nextStepDef?.key ?? 'whatsapp_connection',
    completed_steps: newCompleted,
    completion_percent: Math.round((newCompleted.length / STEPS.length) * 100),
    status: allDone ? 'completed' : 'in_progress',
    completed_at: allDone ? new Date().toISOString() : null,
    last_contact_at: new Date().toISOString(),
  }).eq('id', (session as { id: string }).id)

  // ── Save data when all done ──────────────────────────────────────
  let reply: string
  if (allDone) {
    const { data: items } = await svc
      .from('nerissa_setup_items')
      .select('item_key, data')
      .eq('session_id', (session as { id: string }).id)

    const answers: Record<string, string> = {}
    for (const item of items ?? []) {
      const d = item.data as Record<string, unknown> | null
      answers[item.item_key as string] = String(d?.last_answer ?? '')
    }

    await userClient.rpc('update_professional_onboarding_essentials', {
      p_business_name: answers['profile_basics'] || null,
      p_phone_whatsapp: null,
      p_business_hours: answers['business_hours'] ? { summary: answers['business_hours'] } : {},
      p_agent_name: answers['rosane_preferences'] || 'Rosane',
    })

    if (answers['main_services']) {
      const { data: existingServices } = await svc
        .from('services')
        .select('id')
        .eq('professional_id', professionalId)
        .is('deleted_at', null)
        .eq('is_active', true)
        .limit(1)

      if (!existingServices?.length) {
        await userClient.rpc('create_service', {
          p_name: answers['main_services'],
          p_duration_minutes: 60,
          p_price: 0,
          p_category_id: null,
          p_description: null,
        })
      }
    }

    const agentName = answers['rosane_preferences'] || 'Rosane'
    reply = `Tudo pronto! ${agentName} está configurada e pronta para atender seus clientes. 🎉\n\nO próximo passo é conectar o WhatsApp — ou explore o dashboard agora e conecte quando quiser!`
  } else {
    // AI-generated acknowledgment + next question
    const nextQuestion = nextStepDef.question
    const apiKey = Deno.env.get('ANTHROPIC_API_KEY')
    const name = (professional.name as string | null)?.split(' ')[0] ?? 'profissional'

    if (apiKey) {
      const system = `Você é Nerissa, assistente de configuração do IA para Faturar. Tom: caloroso, conciso.
O profissional se chama ${name}.
Ele respondeu sobre "${currentStepKey}": "${answer}".
Confirme a resposta de forma personalizada (1-2 frases), depois pergunte EXATAMENTE: "${nextQuestion}"
Não adicione nada além disso. Sem asteriscos, sem listas.`

      const aiReply = await callClaude(apiKey, system, answer)
      reply = aiReply ?? `Anotado! ${nextQuestion}`
    } else {
      reply = `Perfeito, anotado! ${nextQuestion}`
    }
  }

  return jsonResponse({
    reply,
    step_index: allDone ? STEPS.length : stepIndex + 1,
    total_steps: STEPS.length,
    completed: allDone,
  })
})
