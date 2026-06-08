import {
  validatePlatformHealthAgentInput,
  validatePlatformHealthAgentOutput,
} from '@iaprafaturar/contracts/edge-functions/platform-health-agent.ts'

import { startAgentExecution, completeAgentExecution } from '../_shared/agent-executions.ts'
import { isDryRun } from '../_shared/dry-run.ts'
import { jsonResponse } from '../_shared/http.ts'
import { assertInternalAuth } from '../_shared/internal-auth.ts'
import { createServiceClient } from '../_shared/supabase.ts'

const AGENT_SLUG = 'platform-health-agent'

Deno.serve(async (request) => {
  let executionId: string | null = null

  try {
    assertInternalAuth(request)
    const input = validatePlatformHealthAgentInput(await request.json())
    const dryRun = input.dry_run ?? isDryRun(request)
    const supabase = createServiceClient()

    const execution = await startAgentExecution(supabase, {
      professionalId: input.professional_id ?? null,
      agentSlug: AGENT_SLUG,
      triggerType: input.mode === 'professional' ? 'manual' : 'cron',
      triggerRef: input.professional_id ?? input.cursor ?? input.mode,
      triggerPayload: { ...input, dry_run: dryRun },
    })
    executionId = execution.id

    const { data, error } = await supabase.rpc('calculate_platform_health_scores_batch', {
      p_limit: input.professional_id ? 1 : (input.limit ?? 50),
      p_cursor: input.professional_id ? null : (input.cursor ?? null),
      p_dry_run: dryRun,
      p_professional_id: input.professional_id ?? null,
    })

    if (error) throw error

    if (input.mode === 'daily' && !dryRun) {
      const { error: metricsError } = await supabase.rpc('refresh_platform_metrics_daily', {
        p_date: new Date().toISOString().slice(0, 10),
        p_dry_run: false,
      })
      if (metricsError) throw metricsError
    }

    await completeAgentExecution(supabase, execution.id, { status: 'success' })

    return jsonResponse(validatePlatformHealthAgentOutput({
      processed: Number(data?.processed ?? 0),
      next_cursor: data?.next_cursor ?? null,
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
