import {
  validateAdminBroadcastInput,
  validateAdminBroadcastOutput,
} from '@iaprafaturar/contracts/edge-functions/admin-broadcast.ts'

import { startAgentExecution, completeAgentExecution } from '../_shared/agent-executions.ts'
import { isDryRun } from '../_shared/dry-run.ts'
import { jsonResponse } from '../_shared/http.ts'
import { sendMessageCore } from '../_shared/send-message-core.ts'
import { createServiceClient } from '../_shared/supabase.ts'

const AGENT_SLUG = 'admin-broadcast'

const corsHeaders = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, x-client-info, apikey, content-type, x-dry-run',
  'access-control-allow-methods': 'POST, OPTIONS',
}

interface ProfessionalTarget {
  id: string
  phone_whatsapp: string | null
  health_level?: string | null
}

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
  if (!token) throw new Response('Unauthorized', { status: 401, headers: corsHeaders })

  const supabase = createServiceClient()
  const { data: userData, error: userError } = await supabase.auth.getUser(token)
  if (userError || !userData.user) throw new Response('Unauthorized', { status: 401, headers: corsHeaders })

  const { data, error } = await supabase
    .from('master_admins')
    .select('id')
    .eq('user_id', userData.user.id)
    .maybeSingle()

  if (error) throw error
  if (!data) throw new Response('Forbidden', { status: 403, headers: corsHeaders })
  return 'admin'
}

async function selectTargets(input: { target: string; limit: number }): Promise<ProfessionalTarget[]> {
  const supabase = createServiceClient()

  if (input.target === 'risk_professionals') {
    const { data, error } = await supabase
      .from('professional_platform_health_scores')
      .select('professional_id, health_level, professionals(id, phone_whatsapp)')
      .in('health_level', ['critico', 'baixo'])
      .limit(input.limit)

    if (error) throw error
    return (data ?? []).map((row: Record<string, unknown>) => {
      const professional = Array.isArray(row.professionals) ? row.professionals[0] : row.professionals
      return {
        id: (professional as { id: string }).id,
        phone_whatsapp: (professional as { phone_whatsapp: string | null }).phone_whatsapp,
        health_level: row.health_level as string,
      }
    })
  }

  let query = supabase
    .from('professionals')
    .select('id, phone_whatsapp, plan_type, trial_ends_at')
    .is('deleted_at', null)
    .limit(input.limit)

  if (input.target === 'trial_professionals') query = query.eq('plan_type', 'trial')

  const { data, error } = await query
  if (error) throw error
  return (data ?? []) as ProfessionalTarget[]
}

Deno.serve(async (request) => {
  let executionId: string | null = null

  try {
    if (request.method === 'OPTIONS') {
      return new Response('ok', { headers: corsHeaders })
    }

    const caller = await assertAdminOrInternal(request)
    const input = validateAdminBroadcastInput(await request.json())
    const dryRun = input.dry_run ?? isDryRun(request)
    const limit = input.limit ?? 50
    const supabase = createServiceClient()

    const execution = await startAgentExecution(supabase, {
      professionalId: null,
      agentSlug: AGENT_SLUG,
      triggerType: 'manual',
      triggerRef: input.target,
      triggerPayload: { ...input, dry_run: dryRun, caller },
    })
    executionId = execution.id

    const instanceName = Deno.env.get('ADMIN_WHATSAPP_INSTANCE_NAME')
    const targets = await selectTargets({ target: input.target, limit })

    if (!dryRun && !instanceName) {
      await completeAgentExecution(supabase, execution.id, { status: 'skipped' })
      return jsonResponse(validateAdminBroadcastOutput({
        selected: targets.length,
        sent_or_dry_run: 0,
        skipped: targets.length,
        dry_run: false,
        reason: 'no_admin_instance',
      }), { headers: corsHeaders })
    }

    let sentOrDryRun = 0
    let skipped = 0

    for (const target of targets) {
      if (!target.phone_whatsapp) {
        skipped += 1
        continue
      }

      await sendMessageCore(supabase, {
        source_webhook: 'admin',
        professional_id: null,
        instance_name: instanceName ?? 'admin-dry-run',
        to: target.phone_whatsapp,
        text: input.message,
        actor_type: 'ai',
        agent_slug: AGENT_SLUG,
        dry_run: dryRun,
      })
      sentOrDryRun += 1
    }

    await completeAgentExecution(supabase, execution.id, { status: 'success' })

    return jsonResponse(validateAdminBroadcastOutput({
      selected: targets.length,
      sent_or_dry_run: sentOrDryRun,
      skipped,
      dry_run: dryRun,
    }), { headers: corsHeaders })
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

    return jsonResponse(
      { error: error instanceof Error ? error.message : 'unknown_error' },
      { status: 500, headers: corsHeaders },
    )
  }
})
