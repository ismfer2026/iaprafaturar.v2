import { validateMessageProcessorInput } from '@iaprafaturar/contracts/edge-functions/message-processor.ts'

import { startAgentExecution, completeAgentExecution } from '../_shared/agent-executions.ts'
import { assertInternalAuth } from '../_shared/internal-auth.ts'
import { isDryRun } from '../_shared/dry-run.ts'
import { jsonResponse } from '../_shared/http.ts'
import { logQstashConsumed } from '../_shared/qstash.ts'
import { createServiceClient } from '../_shared/supabase.ts'
import { sendMessageCore } from '../_shared/send-message-core.ts'

Deno.serve(async (request) => {
  try {
    assertInternalAuth(request)
    const input = validateMessageProcessorInput(await request.json())
    const dryRun = input.dry_run ?? isDryRun(request)
    const supabase = createServiceClient()

    const { data: messageEvent, error } = await supabase
      .from('message_events')
      .select('id, professional_id, instance_name, content, metadata')
      .eq('id', input.message_event_id)
      .eq('source_webhook', 'professional')
      .single()

    if (error) throw error

    await logQstashConsumed(supabase, {
      jobId: input.idempotency_key,
      queueName: 'message-processor',
      messageEventId: input.message_event_id,
      professionalId: messageEvent.professional_id,
    })

    const execution = await startAgentExecution(supabase, {
      professionalId: messageEvent.professional_id,
      agentSlug: 'rosane-duvidas-agent',
      triggerType: 'qstash',
      triggerRef: input.message_event_id,
      triggerPayload: input,
      messageEventId: input.message_event_id,
    })

    if (!dryRun) {
      await completeAgentExecution(supabase, execution.id, { status: 'skipped' })
      return jsonResponse({ processed: true, skipped: true, reason: 'real_agent_not_enabled_in_phase_1' })
    }

    const to = typeof messageEvent.metadata?.from === 'string' ? messageEvent.metadata.from : ''
    await sendMessageCore(supabase, {
      source_webhook: 'professional',
      professional_id: messageEvent.professional_id,
      instance_name: messageEvent.instance_name,
      to,
      text: 'DRY_RUN: Rosane recebeu a mensagem e processaria este atendimento.',
      actor_type: 'ai',
      agent_slug: 'rosane-duvidas-agent',
      dry_run: true,
    })

    await completeAgentExecution(supabase, execution.id, { status: 'success' })
    return jsonResponse({ processed: true, dry_run: true })
  } catch (error) {
    if (error instanceof Response) return error
    return jsonResponse({ processed: false, error: error instanceof Error ? error.message : 'unknown_error' }, { status: 500 })
  }
})