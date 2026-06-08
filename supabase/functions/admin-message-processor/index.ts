import { validateAdminMessageProcessorInput } from '@iaprafaturar/contracts/edge-functions/admin-message-processor.ts'

import { startAgentExecution, completeAgentExecution } from '../_shared/agent-executions.ts'
import { assertInternalAuth } from '../_shared/internal-auth.ts'
import { isDryRun } from '../_shared/dry-run.ts'
import { jsonResponse } from '../_shared/http.ts'
import { logQstashConsumed } from '../_shared/qstash.ts'
import { createServiceClient } from '../_shared/supabase.ts'
import { sendMessageCore } from '../_shared/send-message-core.ts'

function adminMasterPhones(): Set<string> {
  return new Set((Deno.env.get('ADMIN_MASTER_PHONES') ?? '').split(',').map((phone) => phone.replace(/\D/g, '')).filter(Boolean))
}

function functionsBaseUrl(): string {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  if (!supabaseUrl) throw new Error('Missing SUPABASE_URL')
  return `${supabaseUrl.replace(/\/$/, '')}/functions/v1`
}

async function invokeNerissaSetupAgent(input: {
  professionalId: string
  messageEventId: string
  dryRun: boolean
}) {
  const internalToken = Deno.env.get('INTERNAL_FUNCTION_TOKEN')
  if (!internalToken) throw new Error('Missing INTERNAL_FUNCTION_TOKEN')

  const response = await fetch(`${functionsBaseUrl()}/nerissa-setup-agent`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${internalToken}`,
      'content-type': 'application/json',
      'x-dry-run': input.dryRun ? 'true' : 'false',
    },
    body: JSON.stringify({
      professional_id: input.professionalId,
      mode: 'reply',
      message_event_id: input.messageEventId,
      dry_run: input.dryRun,
    }),
  })

  const body = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(`nerissa-setup-agent failed: ${response.status} ${JSON.stringify(body)}`)
  }

  return body as Record<string, unknown>
}

async function invokeAdminAiGateway(input: {
  message: string
  messageEventId: string
  dryRun: boolean
}) {
  const internalToken = Deno.env.get('INTERNAL_FUNCTION_TOKEN')
  if (!internalToken) throw new Error('Missing INTERNAL_FUNCTION_TOKEN')

  const response = await fetch(`${functionsBaseUrl()}/admin-ai-gateway`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${internalToken}`,
      'content-type': 'application/json',
      'x-dry-run': input.dryRun ? 'true' : 'false',
    },
    body: JSON.stringify({
      mode: 'whatsapp_chat',
      channel: 'whatsapp',
      message: input.message,
      message_event_id: input.messageEventId,
      dry_run: input.dryRun,
    }),
  })

  const body = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(`admin-ai-gateway failed: ${response.status} ${JSON.stringify(body)}`)
  }

  return body as Record<string, unknown>
}

Deno.serve(async (request) => {
  let executionId: string | null = null

  try {
    assertInternalAuth(request)
    const input = validateAdminMessageProcessorInput(await request.json())
    const dryRun = input.dry_run ?? isDryRun(request)
    const supabase = createServiceClient()

    const { data: messageEvent, error } = await supabase
      .from('message_events')
      .select('id, professional_id, instance_name, content, metadata')
      .eq('id', input.message_event_id)
      .eq('source_webhook', 'admin')
      .single()

    if (error) throw error

    const from = typeof messageEvent.metadata?.from === 'string' ? messageEvent.metadata.from : ''
    const isAdminMaster = adminMasterPhones().has(from)
    const professionalId = messageEvent.professional_id as string | null

    let route = 'sales-agent'
    let professionalOnboardingCompleted: boolean | null = null

    if (isAdminMaster) {
      route = 'admin-ai-gateway'
    } else if (professionalId) {
      const { data: professional, error: professionalError } = await supabase
        .from('professionals')
        .select('id, onboarding_completed')
        .eq('id', professionalId)
        .is('deleted_at', null)
        .single()

      if (professionalError) throw professionalError

      professionalOnboardingCompleted = Boolean(professional.onboarding_completed)
      route = professionalOnboardingCompleted ? 'support-agent' : 'nerissa-setup-agent'
    }

    await logQstashConsumed(supabase, {
      jobId: input.idempotency_key,
      queueName: 'admin-message-processor',
      messageEventId: input.message_event_id,
      professionalId: professionalId ?? null,
    })

    const execution = await startAgentExecution(supabase, {
      professionalId: professionalId ?? null,
      agentSlug: route,
      triggerType: 'qstash',
      triggerRef: input.message_event_id,
      triggerPayload: {
        ...input,
        route,
        professional_onboarding_completed: professionalOnboardingCompleted,
      },
      messageEventId: input.message_event_id,
    })
    executionId = execution.id

    if (route === 'nerissa-setup-agent') {
      if (!professionalId) throw new Error('professional_id is required for nerissa-setup-agent route')

      const agentResult = await invokeNerissaSetupAgent({
        professionalId,
        messageEventId: input.message_event_id,
        dryRun,
      })

      await completeAgentExecution(supabase, execution.id, { status: 'success' })
      return jsonResponse({ processed: true, route, dry_run: dryRun, agent_result: agentResult })
    }

    if (route === 'admin-ai-gateway') {
      const agentResult = await invokeAdminAiGateway({
        message: typeof messageEvent.content === 'string' ? messageEvent.content : '',
        messageEventId: input.message_event_id,
        dryRun,
      })

      await completeAgentExecution(supabase, execution.id, { status: 'success' })
      return jsonResponse({ processed: true, route, dry_run: dryRun, agent_result: agentResult })
    }

    if (!dryRun) {
      await completeAgentExecution(supabase, execution.id, { status: 'skipped' })
      return jsonResponse({ processed: true, route, skipped: true, reason: 'route_not_enabled_in_phase_2' })
    }

    await sendMessageCore(supabase, {
      source_webhook: 'admin',
      professional_id: professionalId ?? null,
      instance_name: messageEvent.instance_name,
      to: from,
      text: `DRY_RUN: Nerissa rotearia esta conversa para ${route}.`,
      actor_type: 'ai',
      agent_slug: route,
      dry_run: true,
    })

    await completeAgentExecution(supabase, execution.id, { status: 'success' })
    return jsonResponse({ processed: true, route, dry_run: true })
  } catch (error) {
    if (error instanceof Response) return error

    if (executionId) {
      try {
        await completeAgentExecution(createServiceClient(), executionId, {
          status: 'failed',
          errorMessage: error instanceof Error ? error.message : 'unknown_error',
        })
      } catch {
        // Preserve the original error response.
      }
    }

    return jsonResponse({ processed: false, error: error instanceof Error ? error.message : 'unknown_error' }, { status: 500 })
  }
})
