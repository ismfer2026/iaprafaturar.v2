import {
  validateReativacaoAgentInput,
  validateReativacaoAgentOutput,
} from '@iaprafaturar/contracts/edge-functions/reativacao-agent.ts'

import { startAgentExecution, completeAgentExecution } from '../_shared/agent-executions.ts'
import { isDryRun } from '../_shared/dry-run.ts'
import { jsonResponse } from '../_shared/http.ts'
import { assertInternalAuth } from '../_shared/internal-auth.ts'
import { getConnectedProfessionalWhatsappInstance } from '../_shared/professional-instance.ts'
import { getRosaneAgentConfig } from '../_shared/rosane-agent-config.ts'
import { sendMessageCore } from '../_shared/send-message-core.ts'
import { createServiceClient } from '../_shared/supabase.ts'

const AGENT_SLUG = 'reativacao-agent'

interface HealthRow {
  id: string
  professional_id: string
  client_id: string
  risk_level: 'risk' | 'churn'
  reactivation_cooldown_until: string | null
  reactivation_attempts_in_cycle: number
  clients: {
    full_name: string
    phone_whatsapp: string | null
    whatsapp_opt_out: boolean
    reactivation_status: 'eligible' | 'paused' | 'closed' | 'lost'
  } | Array<{
    full_name: string
    phone_whatsapp: string | null
    whatsapp_opt_out: boolean
    reactivation_status: 'eligible' | 'paused' | 'closed' | 'lost'
  }> | null
}

type HealthClient = Exclude<HealthRow['clients'], Array<unknown> | null>

function clientFrom(row: HealthRow): HealthClient | null {
  const value = row.clients
  return (Array.isArray(value) ? value[0] : value) ?? null
}

function buildReactivationText(input: { assistantName: string; clientName: string }): string {
  return [
    `Ola, ${input.clientName}. Aqui e ${input.assistantName}.`,
    '',
    'Notei que faz um tempinho que voce nao aparece por aqui e queria saber se esta tudo bem.',
    '',
    'Se fizer sentido retomar seu acompanhamento, me responda por aqui que eu te ajudo a encontrar o melhor horario.',
  ].join('\n')
}

Deno.serve(async (request) => {
  let executionId: string | null = null

  try {
    assertInternalAuth(request)
    const input = validateReativacaoAgentInput(await request.json())
    const dryRun = input.dry_run ?? isDryRun(request)
    const supabase = createServiceClient()
    const limit = input.limit ?? 50
    const now = new Date()

    const execution = await startAgentExecution(supabase, {
      professionalId: input.professional_id ?? null,
      agentSlug: AGENT_SLUG,
      triggerType: 'cron',
      triggerRef: input.professional_id ?? 'risk_clients',
      triggerPayload: { ...input, dry_run: dryRun },
    })
    executionId = execution.id

    let query = supabase
      .from('client_health_scores')
      .select('id, professional_id, client_id, risk_level, reactivation_cooldown_until, reactivation_attempts_in_cycle, clients(full_name, phone_whatsapp, whatsapp_opt_out, reactivation_status)')
      .in('risk_level', ['risk', 'churn'])
      .lt('reactivation_attempts_in_cycle', 3)
      .order('calculated_at', { ascending: true })
      .limit(limit)

    if (input.professional_id) query = query.eq('professional_id', input.professional_id)

    const { data, error } = await query
    if (error) throw error

    const rows = (data ?? []) as HealthRow[]
    let sent = 0
    let skipped = 0
    let failed = 0
    const instanceCache = new Map<string, Awaited<ReturnType<typeof getConnectedProfessionalWhatsappInstance>>>()
    const configCache = new Map<string, Awaited<ReturnType<typeof getRosaneAgentConfig>>>()

    for (const row of rows) {
      const client = clientFrom(row)
      const cooldownUntil = row.reactivation_cooldown_until ? new Date(row.reactivation_cooldown_until) : null

      if (
        !client ||
        client.whatsapp_opt_out ||
        client.reactivation_status !== 'eligible' ||
        !client.phone_whatsapp ||
        (cooldownUntil && cooldownUntil > now)
      ) {
        skipped += 1
        continue
      }

      try {
        let instance = instanceCache.get(row.professional_id)
        if (instance === undefined) {
          instance = await getConnectedProfessionalWhatsappInstance(supabase, row.professional_id)
          instanceCache.set(row.professional_id, instance)
        }

        if (!instance) {
          skipped += 1
          continue
        }

        let config = configCache.get(row.professional_id)
        if (!config) {
          config = await getRosaneAgentConfig(supabase, row.professional_id)
          configCache.set(row.professional_id, config)
        }

        await sendMessageCore(supabase, {
          source_webhook: 'professional',
          professional_id: row.professional_id,
          instance_name: instance.instanceName,
          to: client.phone_whatsapp,
          text: buildReactivationText({ assistantName: config.agentName, clientName: client.full_name }),
          actor_type: 'ai',
          agent_slug: AGENT_SLUG,
          dry_run: dryRun,
        })

        await supabase
          .from('client_health_scores')
          .update({
            reactivation_cooldown_until: new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000).toISOString(),
            reactivation_attempts_in_cycle: row.reactivation_attempts_in_cycle + 1,
            last_reactivation_attempt_at: now.toISOString(),
            last_reactivation_reason: row.risk_level,
          })
          .eq('id', row.id)
          .eq('professional_id', row.professional_id)

        sent += 1
      } catch {
        failed += 1
      }
    }

    await completeAgentExecution(supabase, execution.id, { status: failed > 0 ? 'failed' : 'success' })

    return jsonResponse(validateReativacaoAgentOutput({
      processed: rows.length,
      sent,
      skipped,
      failed,
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
