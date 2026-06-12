import {
  validateRelationshipAgentInput,
  validateRelationshipAgentOutput,
} from '@iaprafaturar/contracts/edge-functions/relationship-agent.ts'

import { startAgentExecution, completeAgentExecution } from '../_shared/agent-executions.ts'
import { createConversationContext, resolveOrCreateWhatsappConversation } from '../_shared/appointment-context.ts'
import { isDryRun } from '../_shared/dry-run.ts'
import { jsonResponse } from '../_shared/http.ts'
import { claimIdempotency } from '../_shared/idempotency.ts'
import { assertInternalAuth } from '../_shared/internal-auth.ts'
import { getConnectedProfessionalWhatsappInstance } from '../_shared/professional-instance.ts'
import { getRosaneAgentConfig, isWithinWorkingHours } from '../_shared/rosane-agent-config.ts'
import { sendMessageCore } from '../_shared/send-message-core.ts'
import { createServiceClient } from '../_shared/supabase.ts'

const AGENT_SLUG = 'relationship-agent'
const DEFAULT_INTERVAL_DAYS = 45

interface ClientRow {
  id: string
  professional_id: string
  full_name: string
  phone_whatsapp: string | null
  whatsapp_opt_out: boolean
  journey_stage: string
}

interface ProfessionalSettingsRow {
  id: string
  settings: Record<string, unknown> | null
}

function configuredIntervalDays(settings: Record<string, unknown> | null): number {
  const rules = (settings?.appointment_rules ?? {}) as Record<string, unknown>
  const enabled = rules.relationship_checkins_enabled
  if (enabled === false) return 0

  const value = Number(rules.relationship_checkin_interval_days ?? DEFAULT_INTERVAL_DAYS)
  if (!Number.isFinite(value)) return DEFAULT_INTERVAL_DAYS
  return Math.min(Math.max(Math.trunc(value), 7), 180)
}

function buildCheckinText(input: { assistantName: string; clientName: string }): string {
  return [
    `Ola, ${input.clientName}. Aqui e ${input.assistantName}.`,
    '',
    'Passando para saber como voce esta e se precisa de algum apoio no seu acompanhamento.',
    '',
    'Se quiser falar com a equipe, pode me responder por aqui.',
  ].join('\n')
}

async function hasRecentRelationshipMessage(
  supabase: ReturnType<typeof createServiceClient>,
  input: { professionalId: string; clientId: string; since: string },
): Promise<boolean> {
  const { count, error } = await supabase
    .from('message_events')
    .select('id', { count: 'exact', head: true })
    .eq('professional_id', input.professionalId)
    .eq('client_id', input.clientId)
    .eq('direction', 'outbound')
    .eq('agent_slug', AGENT_SLUG)
    .gte('created_at', input.since)

  if (error) throw error
  return (count ?? 0) > 0
}

Deno.serve(async (request) => {
  let executionId: string | null = null

  try {
    assertInternalAuth(request)
    const input = validateRelationshipAgentInput(await request.json())
    const dryRun = input.dry_run ?? isDryRun(request)
    const supabase = createServiceClient()
    const limit = input.limit ?? 50

    const execution = await startAgentExecution(supabase, {
      professionalId: input.professional_id ?? null,
      agentSlug: AGENT_SLUG,
      triggerType: input.client_id ? 'manual' : 'cron',
      triggerRef: input.client_id ?? 'relationship_checkin',
      triggerPayload: { ...input, dry_run: dryRun },
    })
    executionId = execution.id

    let query = supabase
      .from('clients')
      .select('id, professional_id, full_name, phone_whatsapp, whatsapp_opt_out, journey_stage')
      .eq('is_active', true)
      .is('deleted_at', null)
      .in('journey_stage', ['em_tratamento', 'pos_tratamento', 'cliente_fiel'])
      .not('phone_whatsapp', 'is', null)
      .order('updated_at', { ascending: true })
      .limit(limit)

    if (input.professional_id) query = query.eq('professional_id', input.professional_id)
    if (input.client_id) query = query.eq('id', input.client_id)

    const { data, error } = await query
    if (error) throw error

    const rows = (data ?? []) as ClientRow[]
    let sent = 0
    let skipped = 0
    let failed = 0
    const instanceCache = new Map<string, Awaited<ReturnType<typeof getConnectedProfessionalWhatsappInstance>>>()
    const configCache = new Map<string, Awaited<ReturnType<typeof getRosaneAgentConfig>>>()
    const settingsCache = new Map<string, ProfessionalSettingsRow | null>()

    for (const client of rows) {
      if (client.whatsapp_opt_out || !client.phone_whatsapp) {
        skipped += 1
        continue
      }

      try {
        let config = configCache.get(client.professional_id)
        if (!config) {
          config = await getRosaneAgentConfig(supabase, client.professional_id)
          configCache.set(client.professional_id, config)
        }

        if (!isWithinWorkingHours(config.workingHours, config.respondOutsideHours)) {
          skipped += 1
          continue
        }

        let settings = settingsCache.get(client.professional_id)
        if (settings === undefined) {
          const { data: professionalSettings, error: settingsError } = await supabase
            .from('professionals')
            .select('id, settings')
            .eq('id', client.professional_id)
            .maybeSingle()

          if (settingsError) throw settingsError
          settings = professionalSettings as ProfessionalSettingsRow | null
          settingsCache.set(client.professional_id, settings)
        }

        const intervalDays = configuredIntervalDays(settings?.settings ?? null)
        if (intervalDays <= 0) {
          skipped += 1
          continue
        }

        const since = new Date(Date.now() - intervalDays * 24 * 60 * 60 * 1000).toISOString()
        if (await hasRecentRelationshipMessage(supabase, {
          professionalId: client.professional_id,
          clientId: client.id,
          since,
        })) {
          skipped += 1
          continue
        }

        let instance = instanceCache.get(client.professional_id)
        if (instance === undefined) {
          instance = await getConnectedProfessionalWhatsappInstance(supabase, client.professional_id)
          instanceCache.set(client.professional_id, instance)
        }

        if (!instance) {
          skipped += 1
          continue
        }

        const baseKey = `${AGENT_SLUG}:client:${client.id}:${since.slice(0, 10)}`
        const claim = await claimIdempotency(
          supabase,
          dryRun ? `dry-run:${baseKey}:${crypto.randomUUID()}` : baseKey,
          { client_id: client.id, professional_id: client.professional_id, dry_run: dryRun },
        )

        if (!claim.claimed) {
          skipped += 1
          continue
        }

        const conversation = await resolveOrCreateWhatsappConversation(supabase, {
          professionalId: client.professional_id,
          clientId: client.id,
          phone: client.phone_whatsapp,
          preview: 'check-in',
        })

        await createConversationContext(supabase, {
          professionalId: client.professional_id,
          conversationId: conversation.id,
          clientId: client.id,
          contextType: 'relationship',
          sourceFunction: AGENT_SLUG,
          refType: 'client',
          refId: client.id,
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
          metadata: { mode: 'checkin', dry_run: dryRun },
        })

        await sendMessageCore(supabase, {
          source_webhook: 'professional',
          professional_id: client.professional_id,
          instance_name: instance.instanceName,
          to: client.phone_whatsapp,
          text: buildCheckinText({ assistantName: config.agentName, clientName: client.full_name }),
          actor_type: 'ai',
          agent_slug: AGENT_SLUG,
          dry_run: dryRun,
        })

        await supabase.from('audit_log').insert({
          professional_id: client.professional_id,
          actor_type: 'ai',
          event_type: 'relationship.checkin.sent',
          entity_type: 'client',
          entity_id: client.id,
          payload: { source: AGENT_SLUG, conversation_id: conversation.id, dry_run: dryRun },
        })

        sent += 1
      } catch {
        failed += 1
      }
    }

    await completeAgentExecution(supabase, execution.id, { status: failed > 0 ? 'failed' : 'success' })

    return jsonResponse(validateRelationshipAgentOutput({
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
