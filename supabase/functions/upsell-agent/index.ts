import {
  validateUpsellAgentInput,
  validateUpsellAgentOutput,
} from '../../../packages/contracts/edge-functions/upsell-agent.ts'

import { isDryRun } from '../_shared/dry-run.ts'
import { jsonResponse } from '../_shared/http.ts'
import { assertInternalAuth } from '../_shared/internal-auth.ts'
import { createServiceClient } from '../_shared/supabase.ts'

const AGENT_SLUG = 'upsell-agent'
const COOLDOWN_DAYS = 30

interface ClientRow {
  id: string
  professional_id: string
  full_name: string
  phone_whatsapp: string | null
  whatsapp_opt_out: boolean
  journey_stage: string
  metadata: Record<string, unknown> | null
}

interface PackageNearEndRow {
  id: string
  sessions_remaining: number
  expires_at: string | null
}

function hasCooldown(metadata: Record<string, unknown> | null): boolean {
  const value = metadata?.last_upsell_attempt_at
  if (typeof value !== 'string') return false
  const timestamp = new Date(value).getTime()
  if (!Number.isFinite(timestamp)) return false
  return timestamp > Date.now() - COOLDOWN_DAYS * 24 * 60 * 60 * 1000
}

function buildSuggestion(clientName: string): string {
  return [
    `Ola, ${clientName}.`,
    '',
    'Percebi que voce pode se beneficiar de um pacote de acompanhamento para manter a regularidade dos atendimentos.',
    'Se fizer sentido, posso te mostrar as opcoes disponiveis.',
  ].join('\n')
}

async function recordMetric(
  supabase: ReturnType<typeof createServiceClient>,
  clientId: string,
  eventType: 'eligible' | 'suggested' | 'skipped',
  reason: string,
  payload: Record<string, unknown>,
  suggestionId: string | null = null,
) {
  await supabase.rpc('record_upsell_metric', {
    p_client_id: clientId,
    p_event_type: eventType,
    p_reason: reason,
    p_payload: payload,
    p_suggestion_id: suggestionId,
  })
}

Deno.serve(async (request) => {
  try {
    assertInternalAuth(request)
    const input = validateUpsellAgentInput(await request.json())
    const dryRun = input.dry_run ?? isDryRun(request)
    const supabase = createServiceClient()
    const limit = input.limit ?? 50

    const { data, error } = await supabase
      .from('clients')
      .select('id, professional_id, full_name, phone_whatsapp, whatsapp_opt_out, journey_stage, metadata')
      .eq('is_active', true)
      .is('deleted_at', null)
      .eq('journey_stage', 'em_tratamento')
      .not('phone_whatsapp', 'is', null)
      .order('updated_at', { ascending: true })
      .limit(limit)

    if (error) throw error

    const clients = (data ?? []) as ClientRow[]
    let suggested = 0
    let skipped = 0
    let failed = 0

    for (const client of clients) {
      try {
        if (client.whatsapp_opt_out || !client.phone_whatsapp) {
          await recordMetric(supabase, client.id, 'skipped', 'channel_not_allowed', { source: AGENT_SLUG })
          skipped += 1
          continue
        }

        if (hasCooldown(client.metadata)) {
          await recordMetric(supabase, client.id, 'skipped', 'cooldown', { source: AGENT_SLUG })
          skipped += 1
          continue
        }

        const { data: nearEndPackages, error: packagesError } = await supabase
          .from('client_packages')
          .select('id, sessions_remaining, expires_at')
          .eq('professional_id', client.professional_id)
          .eq('client_id', client.id)
          .eq('status', 'ativo')
          .or(`sessions_remaining.lte.2,expires_at.lte.${new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString()}`)
          .limit(5)

        if (packagesError) throw packagesError

        const { count: recentSessions, error: sessionsError } = await supabase
          .from('sessions')
          .select('id', { count: 'exact', head: true })
          .eq('professional_id', client.professional_id)
          .eq('client_id', client.id)
          .gte('session_date', new Date(Date.now() - 45 * 24 * 60 * 60 * 1000).toISOString())

        if (sessionsError) throw sessionsError

        const packages = (nearEndPackages ?? []) as PackageNearEndRow[]
        const hasNearEndPackage = packages.length > 0
        const hasHighFrequency = (recentSessions ?? 0) >= 4

        if (!hasNearEndPackage && !hasHighFrequency) {
          await recordMetric(supabase, client.id, 'skipped', 'not_eligible', {
            source: AGENT_SLUG,
            recent_sessions: recentSessions ?? 0,
          })
          skipped += 1
          continue
        }

        await recordMetric(supabase, client.id, 'eligible', hasNearEndPackage ? 'package_near_end' : 'high_frequency', {
          source: AGENT_SLUG,
          near_end_packages: packages.map((item) => item.id),
          recent_sessions: recentSessions ?? 0,
        })

        const { count: pendingPayments, error: paymentsError } = await supabase
          .from('financial_transactions')
          .select('id', { count: 'exact', head: true })
          .eq('professional_id', client.professional_id)
          .eq('client_id', client.id)
          .eq('type', 'receita')
          .eq('status', 'pendente')

        if (paymentsError) throw paymentsError
        if ((pendingPayments ?? 0) > 0) {
          await recordMetric(supabase, client.id, 'skipped', 'pending_payment', { source: AGENT_SLUG })
          skipped += 1
          continue
        }

        const { count: recentSuggestions, error: suggestionsError } = await supabase
          .from('shadow_suggestions')
          .select('id', { count: 'exact', head: true })
          .eq('professional_id', client.professional_id)
          .eq('status', 'pending')
          .eq('metadata->>source', AGENT_SLUG)
          .eq('metadata->>client_id', client.id)

        if (suggestionsError) throw suggestionsError
        if ((recentSuggestions ?? 0) > 0) {
          await recordMetric(supabase, client.id, 'skipped', 'pending_suggestion', { source: AGENT_SLUG })
          skipped += 1
          continue
        }

        const { data: suggestion, error: suggestionError } = await supabase.from('shadow_suggestions').insert({
          professional_id: client.professional_id,
          suggested_text: buildSuggestion(client.full_name),
          status: 'pending',
          metadata: {
            source: AGENT_SLUG,
            client_id: client.id,
            mode: 'shadow',
            dry_run: dryRun,
            eligibility_reason: hasNearEndPackage ? 'package_near_end' : 'high_frequency',
          },
        }).select('id').single()

        if (suggestionError) throw suggestionError

        const { error: markError } = await supabase.rpc('mark_upsell_attempt', {
          p_client_id: client.id,
          p_payload: {
            source: AGENT_SLUG,
            mode: 'shadow',
            dry_run: dryRun,
            eligibility_reason: hasNearEndPackage ? 'package_near_end' : 'high_frequency',
          },
        })
        if (markError) throw markError

        await recordMetric(
          supabase,
          client.id,
          'suggested',
          hasNearEndPackage ? 'package_near_end' : 'high_frequency',
          { source: AGENT_SLUG, dry_run: dryRun },
          suggestion?.id ?? null,
        )

        suggested += 1
      } catch {
        failed += 1
      }
    }

    return jsonResponse(validateUpsellAgentOutput({
      ok: true,
      processed: clients.length,
      suggested,
      skipped,
      failed,
      dry_run: dryRun,
    }))
  } catch (error) {
    if (error instanceof Response) return error
    return jsonResponse(
      { ok: false, error: error instanceof Error ? error.message : 'internal_error' },
      { status: 500 },
    )
  }
})
