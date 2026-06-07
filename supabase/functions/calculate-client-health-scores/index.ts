import {
  validateCalculateClientHealthScoresInput,
  validateCalculateClientHealthScoresOutput,
} from '@iaprafaturar/contracts/edge-functions/calculate-client-health-scores.ts'
import type { SupabaseClient } from '@supabase/supabase-js'

import { startAgentExecution, completeAgentExecution } from '../_shared/agent-executions.ts'
import { jsonResponse } from '../_shared/http.ts'
import { assertInternalAuth } from '../_shared/internal-auth.ts'
import { createServiceClient } from '../_shared/supabase.ts'

const AGENT_SLUG = 'calculate-client-health-scores'

interface ProfessionalRow {
  id: string
}

async function selectProfessionals(
  supabase: SupabaseClient,
  input: {
    professionalId?: string
    professionalCursor?: string
    limit: number
  },
): Promise<ProfessionalRow[]> {
  if (input.professionalId) {
    const { data, error } = await supabase
      .from('professionals')
      .select('id')
      .eq('id', input.professionalId)
      .maybeSingle()

    if (error) throw error
    return data ? [data as ProfessionalRow] : []
  }

  let query = supabase
    .from('professionals')
    .select('id')
    .order('id', { ascending: true })
    .limit(input.limit)

  if (input.professionalCursor) {
    query = query.gt('id', input.professionalCursor)
  }

  const { data, error } = await query
  if (error) throw error
  return (data ?? []) as ProfessionalRow[]
}

Deno.serve(async (request) => {
  let executionId: string | null = null

  try {
    assertInternalAuth(request)
    const input = validateCalculateClientHealthScoresInput(await request.json())
    const supabase = createServiceClient()
    const professionalLimit = input.professional_limit ?? 25
    const clientLimit = input.client_limit ?? 500

    const execution = await startAgentExecution(supabase, {
      professionalId: input.professional_id ?? null,
      agentSlug: AGENT_SLUG,
      triggerType: 'cron',
      triggerRef: input.professional_id ?? input.professional_cursor ?? 'batch_start',
      triggerPayload: input,
    })
    executionId = execution.id

    const professionals = await selectProfessionals(supabase, {
      professionalId: input.professional_id,
      professionalCursor: input.professional_cursor,
      limit: professionalLimit,
    })

    const results: Array<{ professional_id: string; processed: number; next_cursor: string | null }> = []
    let processedClients = 0

    for (const professional of professionals) {
      const { data, error } = await supabase.rpc('calculate_client_health_for_professional', {
        p_professional_id: professional.id,
        p_limit: clientLimit,
        p_cursor: input.professional_id ? (input.client_cursor ?? null) : null,
      })

      if (error) throw error

      const processed = Number(data?.processed ?? 0)
      processedClients += processed
      results.push({
        professional_id: professional.id,
        processed,
        next_cursor: data?.next_cursor ?? null,
      })
    }

    const nextProfessionalCursor = professionals.length === professionalLimit
      ? professionals[professionals.length - 1]?.id ?? null
      : null

    await completeAgentExecution(supabase, execution.id, { status: 'success' })

    return jsonResponse(validateCalculateClientHealthScoresOutput({
      processed_professionals: professionals.length,
      processed_clients: processedClients,
      next_professional_cursor: nextProfessionalCursor,
      results,
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
