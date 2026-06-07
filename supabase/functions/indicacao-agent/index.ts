import {
  validateIndicacaoAgentInput,
  validateIndicacaoAgentOutput,
} from '@iaprafaturar/contracts/edge-functions/indicacao-agent.ts'

import { startAgentExecution, completeAgentExecution } from '../_shared/agent-executions.ts'
import { isDryRun } from '../_shared/dry-run.ts'
import { jsonResponse } from '../_shared/http.ts'
import { assertInternalAuth } from '../_shared/internal-auth.ts'
import { getConnectedProfessionalWhatsappInstance } from '../_shared/professional-instance.ts'
import { getRosaneAgentConfig } from '../_shared/rosane-agent-config.ts'
import { sendMessageCore } from '../_shared/send-message-core.ts'
import { createServiceClient } from '../_shared/supabase.ts'

const AGENT_SLUG = 'indicacao-agent'

interface SessionRow {
  id: string
  professional_id: string
  client_id: string
  clients: {
    full_name: string
    phone_whatsapp: string | null
    whatsapp_opt_out: boolean
  } | Array<{
    full_name: string
    phone_whatsapp: string | null
    whatsapp_opt_out: boolean
  }> | null
}

function clientFrom(row: SessionRow): { full_name: string; phone_whatsapp: string | null; whatsapp_opt_out: boolean } | null {
  const value = row.clients
  return Array.isArray(value) ? value[0] ?? null : value
}

function referralCode(): string {
  return crypto.randomUUID().replaceAll('-', '').slice(0, 10).toUpperCase()
}

function buildReferralText(input: { assistantName: string; clientName: string; code: string }): string {
  return [
    `Ola, ${input.clientName}. Aqui e ${input.assistantName}.`,
    '',
    'Fico feliz que sua experiencia tenha sido boa. Se conhecer alguem que tambem possa se beneficiar, pode me mandar o contato por aqui.',
    '',
    `Codigo de indicacao: ${input.code}`,
  ].join('\n')
}

Deno.serve(async (request) => {
  let executionId: string | null = null

  try {
    assertInternalAuth(request)
    const input = validateIndicacaoAgentInput(await request.json())
    const dryRun = input.dry_run ?? isDryRun(request)
    const supabase = createServiceClient()
    const limit = input.limit ?? 50
    const recentCutoff = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString()

    const execution = await startAgentExecution(supabase, {
      professionalId: input.professional_id ?? null,
      agentSlug: AGENT_SLUG,
      triggerType: input.client_id ? 'manual' : 'cron',
      triggerRef: input.client_id ?? 'positive_nps',
      triggerPayload: { ...input, dry_run: dryRun },
    })
    executionId = execution.id

    let query = supabase
      .from('sessions')
      .select('id, professional_id, client_id, clients(full_name, phone_whatsapp, whatsapp_opt_out)')
      .gte('nps_score', 4)
      .not('client_id', 'is', null)
      .is('deleted_at', null)
      .order('nps_responded_at', { ascending: false, nullsFirst: false })
      .limit(limit)

    if (input.professional_id) query = query.eq('professional_id', input.professional_id)
    if (input.client_id) query = query.eq('client_id', input.client_id)

    const { data, error } = await query
    if (error) throw error

    const rows = (data ?? []) as SessionRow[]
    let sent = 0
    let skipped = 0
    let failed = 0
    const instanceCache = new Map<string, Awaited<ReturnType<typeof getConnectedProfessionalWhatsappInstance>>>()
    const configCache = new Map<string, Awaited<ReturnType<typeof getRosaneAgentConfig>>>()

    for (const row of rows) {
      const client = clientFrom(row)

      if (!client || client.whatsapp_opt_out || !client.phone_whatsapp) {
        skipped += 1
        continue
      }

      const { count: recentRequests, error: recentError } = await supabase
        .from('referral_events')
        .select('id', { count: 'exact', head: true })
        .eq('professional_id', row.professional_id)
        .eq('referrer_client_id', row.client_id)
        .eq('event_type', 'requested')
        .gte('created_at', recentCutoff)

      if (recentError) throw recentError
      if ((recentRequests ?? 0) > 0) {
        skipped += 1
        continue
      }

      try {
        let link = null as { id: string; code: string } | null
        const { data: existingLink, error: linkError } = await supabase
          .from('referral_links')
          .select('id, code')
          .eq('professional_id', row.professional_id)
          .eq('client_id', row.client_id)
          .eq('type', 'client_to_client')
          .eq('status', 'active')
          .maybeSingle()

        if (linkError) throw linkError
        link = existingLink as { id: string; code: string } | null

        if (!link) {
          for (let attempt = 0; attempt < 3; attempt += 1) {
            const { data: inserted, error: insertError } = await supabase
              .from('referral_links')
              .insert({
                professional_id: row.professional_id,
                client_id: row.client_id,
                code: referralCode(),
                type: 'client_to_client',
                status: 'active',
              })
              .select('id, code')
              .single()

            if (!insertError && inserted) {
              link = inserted as { id: string; code: string }
              break
            }
          }
        }

        if (!link) throw new Error('referral_link_create_failed')

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
          text: buildReferralText({ assistantName: config.agentName, clientName: client.full_name, code: link.code }),
          actor_type: 'ai',
          agent_slug: AGENT_SLUG,
          dry_run: dryRun,
        })

        await supabase.from('referral_events').insert({
          professional_id: row.professional_id,
          referral_link_id: link.id,
          referrer_client_id: row.client_id,
          event_type: 'requested',
          payload: { source: AGENT_SLUG, session_id: row.id, dry_run: dryRun },
        })

        sent += 1
      } catch {
        failed += 1
      }
    }

    await completeAgentExecution(supabase, execution.id, { status: failed > 0 ? 'failed' : 'success' })

    return jsonResponse(validateIndicacaoAgentOutput({
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
