import {
  validateAdminAiGatewayInput,
  validateAdminAiGatewayOutput,
} from '@iaprafaturar/contracts/edge-functions/admin-ai-gateway.ts'

import { startAgentExecution, completeAgentExecution } from '../_shared/agent-executions.ts'
import { isDryRun } from '../_shared/dry-run.ts'
import { jsonResponse } from '../_shared/http.ts'
import { createServiceClient } from '../_shared/supabase.ts'
import { sendMessageCore } from '../_shared/send-message-core.ts'

const AGENT_SLUG = 'admin-ai-gateway'

function readBearerToken(request: Request): string | null {
  const header = request.headers.get('authorization')
  if (!header) return null
  const [scheme, token] = header.split(' ')
  return scheme?.toLowerCase() === 'bearer' && token ? token : null
}

async function assertAdminOrInternal(request: Request): Promise<'internal' | 'admin'> {
  const token = readBearerToken(request)
  const internalToken = Deno.env.get('INTERNAL_FUNCTION_TOKEN')
  if (token && internalToken && token === internalToken) return 'internal'
  if (!token) throw new Response('Unauthorized', { status: 401 })

  const supabase = createServiceClient()
  const { data: userData, error: userError } = await supabase.auth.getUser(token)
  if (userError || !userData.user) throw new Response('Unauthorized', { status: 401 })

  const { data, error } = await supabase
    .from('master_admins')
    .select('id')
    .eq('user_id', userData.user.id)
    .maybeSingle()

  if (error) throw error
  if (!data) throw new Response('Forbidden', { status: 403 })
  return 'admin'
}

function buildReply(input: {
  message: string
  snapshot: Record<string, unknown>
  health: Record<string, unknown>
}) {
  const mrr = input.snapshot?.mrr ?? 0
  const totalProfessionals = input.snapshot?.total_professionals ?? 0
  const activeProfessionals = input.snapshot?.active_professionals ?? 0
  const critical = input.health?.critico ?? 0

  return [
    `MRR atual: R$ ${Number(mrr).toFixed(2)}.`,
    `Profissionais: ${totalProfessionals} no total, ${activeProfessionals} ativos no ultimo snapshot.`,
    `Risco critico de plataforma: ${critical}.`,
  ].join(' ')
}

Deno.serve(async (request) => {
  let executionId: string | null = null

  try {
    await assertAdminOrInternal(request)
    const input = validateAdminAiGatewayInput(await request.json())
    const dryRun = input.dry_run ?? isDryRun(request)
    const supabase = createServiceClient()

    const execution = await startAgentExecution(supabase, {
      professionalId: null,
      agentSlug: AGENT_SLUG,
      triggerType: input.channel === 'whatsapp' ? 'webhook' : 'manual',
      triggerRef: input.message_event_id ?? input.channel,
      triggerPayload: { ...input, dry_run: dryRun },
      messageEventId: input.message_event_id,
    })
    executionId = execution.id

    const [
      { data: metrics, error: metricsError },
      { data: healthRows, error: healthError },
    ] = await Promise.all([
      supabase
        .from('platform_metrics_daily')
        .select('*')
        .order('date', { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from('professional_platform_health_scores')
        .select('health_level'),
    ])

    if (metricsError) throw metricsError
    if (healthError) throw healthError

    const health = (healthRows ?? []).reduce((acc: Record<string, number>, row: { health_level: string }) => {
      acc[row.health_level] = (acc[row.health_level] ?? 0) + 1
      return acc
    }, {})
    const reply = buildReply({ message: input.message, snapshot: metrics ?? {}, health })

    if (input.mode === 'whatsapp_chat' && input.message_event_id) {
      const { data: messageEvent, error: messageError } = await supabase
        .from('message_events')
        .select('id, instance_name, metadata')
        .eq('id', input.message_event_id)
        .eq('source_webhook', 'admin')
        .single()

      if (messageError) throw messageError

      const to = typeof messageEvent.metadata?.from === 'string' ? messageEvent.metadata.from : ''
      if (to && messageEvent.instance_name) {
        await sendMessageCore(supabase, {
          source_webhook: 'admin',
          professional_id: null,
          instance_name: messageEvent.instance_name,
          to,
          text: reply,
          actor_type: 'ai',
          agent_slug: AGENT_SLUG,
          dry_run: dryRun,
        })
      }
    }

    await completeAgentExecution(supabase, execution.id, { status: 'success' })

    return jsonResponse(validateAdminAiGatewayOutput({
      reply,
      data: { snapshot: metrics ?? {}, health },
      dry_run: dryRun,
    }))
  } catch (error) {
    if (error instanceof Response) return error

    if (executionId) {
      try {
        await completeAgentExecution(createServiceClient(), executionId, {
          status: 'failed',
          errorMessage: error instanceof Error ? error.message : 'unknown_error',
        })
      } catch {
        // Preserve original error.
      }
    }

    return jsonResponse({ error: error instanceof Error ? error.message : 'unknown_error' }, { status: 500 })
  }
})
