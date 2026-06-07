import {
  validateCampaignDispatcherInput,
  validateCampaignDispatcherOutput,
} from '@iaprafaturar/contracts/edge-functions/campaign-dispatcher.ts'
import type { SupabaseClient } from '@supabase/supabase-js'

import { startAgentExecution, completeAgentExecution } from '../_shared/agent-executions.ts'
import { isDryRun } from '../_shared/dry-run.ts'
import { jsonResponse } from '../_shared/http.ts'
import { assertInternalAuth } from '../_shared/internal-auth.ts'
import { getConnectedProfessionalWhatsappInstance } from '../_shared/professional-instance.ts'
import { sendMessageCore } from '../_shared/send-message-core.ts'
import { createServiceClient } from '../_shared/supabase.ts'

const AGENT_SLUG = 'campaign-dispatcher'

interface CampaignRow {
  id: string
  professional_id: string
  name: string
  segment_type: string
  message_template: string
}

interface ClientRow {
  id: string
  full_name: string
  phone_whatsapp: string | null
  whatsapp_opt_out: boolean
}

interface RecipientRow {
  id: string
  campaign_id: string
  professional_id: string
  client_id: string
  phone_whatsapp: string | null
  status: string
  clients: { full_name: string } | { full_name: string }[] | null
}

async function selectSegmentClientIds(
  supabase: SupabaseClient,
  campaign: CampaignRow,
  limit: number,
): Promise<string[] | null> {
  if (campaign.segment_type === 'risk') {
    const { data, error } = await supabase
      .from('client_health_scores')
      .select('client_id')
      .eq('professional_id', campaign.professional_id)
      .in('risk_level', ['risk', 'churn'])
      .limit(limit)

    if (error) throw error
    return (data ?? []).map((row: { client_id: string }) => row.client_id)
  }

  if (campaign.segment_type === 'champions') {
    const { data, error } = await supabase
      .from('rfm_scores')
      .select('client_id')
      .eq('professional_id', campaign.professional_id)
      .eq('segment', 'champions')
      .limit(limit)

    if (error) throw error
    return (data ?? []).map((row: { client_id: string }) => row.client_id)
  }

  if (campaign.segment_type === 'all' || campaign.segment_type === 'inactive') return null

  // Unknown/custom segment definitions must not degrade into a broadcast.
  return []
}

function renderTemplate(template: string, clientName: string): string {
  return template
    .replaceAll('{{client_name}}', clientName)
    .replaceAll('{{nome_cliente}}', clientName)
}

async function selectCampaigns(
  supabase: SupabaseClient,
  input: { campaignId?: string; professionalId?: string; limit: number },
): Promise<CampaignRow[]> {
  let query = supabase
    .from('campaigns')
    .select('id, professional_id, name, segment_type, message_template')
    .in('status', ['scheduled', 'failed'])
    .limit(input.limit)

  if (input.campaignId) query = query.eq('id', input.campaignId)
  else query = query.lte('scheduled_at', new Date().toISOString())

  if (input.professionalId) query = query.eq('professional_id', input.professionalId)

  const { data, error } = await query
  if (error) throw error
  return (data ?? []) as CampaignRow[]
}

async function ensureRecipients(supabase: SupabaseClient, campaign: CampaignRow, limit: number): Promise<void> {
  const { count, error: countError } = await supabase
    .from('campaign_recipients')
    .select('id', { count: 'exact', head: true })
    .eq('campaign_id', campaign.id)

  if (countError) throw countError
  if ((count ?? 0) > 0) return

  const segmentClientIds = await selectSegmentClientIds(supabase, campaign, limit)
  if (segmentClientIds && segmentClientIds.length === 0) return

  let query = supabase
    .from('clients')
    .select('id, full_name, phone_whatsapp, whatsapp_opt_out')
    .eq('professional_id', campaign.professional_id)
    .eq('is_active', true)
    .is('deleted_at', null)
    .limit(limit)

  if (campaign.segment_type === 'inactive') query = query.eq('journey_stage', 'inativo')
  if (segmentClientIds) query = query.in('id', segmentClientIds)

  const { data, error } = await query
  if (error) throw error

  const clients = (data ?? []) as ClientRow[]
  if (clients.length === 0) return

  const recipients = clients.map((client) => ({
    professional_id: campaign.professional_id,
    campaign_id: campaign.id,
    client_id: client.id,
    phone_whatsapp: client.phone_whatsapp,
    status: client.whatsapp_opt_out ? 'opted_out' : client.phone_whatsapp ? 'pending' : 'skipped',
    skip_reason: client.whatsapp_opt_out ? 'whatsapp_opt_out' : client.phone_whatsapp ? null : 'missing_phone',
  }))

  const { error: upsertError } = await supabase
    .from('campaign_recipients')
    .upsert(recipients, { onConflict: 'campaign_id,client_id', ignoreDuplicates: true })

  if (upsertError) throw upsertError
}

async function selectPendingRecipients(
  supabase: SupabaseClient,
  campaign: CampaignRow,
  limit: number,
): Promise<RecipientRow[]> {
  const { data, error } = await supabase
    .from('campaign_recipients')
    .select('id, campaign_id, professional_id, client_id, phone_whatsapp, status, clients(full_name)')
    .eq('campaign_id', campaign.id)
    .eq('professional_id', campaign.professional_id)
    .eq('status', 'pending')
    .limit(limit)

  if (error) throw error
  return (data ?? []) as RecipientRow[]
}

Deno.serve(async (request) => {
  let executionId: string | null = null

  try {
    assertInternalAuth(request)
    const input = validateCampaignDispatcherInput(await request.json())
    const dryRun = input.dry_run ?? isDryRun(request)
    const supabase = createServiceClient()
    const limit = input.limit ?? 50

    const execution = await startAgentExecution(supabase, {
      professionalId: input.professional_id ?? null,
      agentSlug: AGENT_SLUG,
      triggerType: input.campaign_id ? 'manual' : 'cron',
      triggerRef: input.campaign_id ?? 'scheduled_campaigns',
      triggerPayload: { ...input, dry_run: dryRun },
    })
    executionId = execution.id

    const campaigns = await selectCampaigns(supabase, {
      campaignId: input.campaign_id,
      professionalId: input.professional_id,
      limit,
    })

    let queuedOrSent = 0
    let skipped = 0
    let failed = 0

    for (const campaign of campaigns) {
      const instance = await getConnectedProfessionalWhatsappInstance(supabase, campaign.professional_id)

      await supabase
        .from('campaigns')
        .update({ status: 'sending' })
        .eq('id', campaign.id)
        .eq('professional_id', campaign.professional_id)

      await ensureRecipients(supabase, campaign, limit)
      const recipients = await selectPendingRecipients(supabase, campaign, limit)

      for (const recipient of recipients) {
        const clientRow = Array.isArray(recipient.clients) ? recipient.clients[0] : recipient.clients
        const clientName = clientRow?.full_name ?? 'cliente'

        if (!instance || !recipient.phone_whatsapp) {
          skipped += 1
          await supabase
            .from('campaign_recipients')
            .update({ status: 'skipped', skip_reason: !instance ? 'no_professional_instance' : 'missing_phone' })
            .eq('id', recipient.id)

          await supabase.from('campaign_dispatches').insert({
            professional_id: campaign.professional_id,
            campaign_id: campaign.id,
            recipient_id: recipient.id,
            status: 'skipped',
            error_message: !instance ? 'no_professional_instance' : 'missing_phone',
          })
          continue
        }

        try {
          await sendMessageCore(supabase, {
            source_webhook: 'professional',
            professional_id: campaign.professional_id,
            instance_name: instance.instanceName,
            to: recipient.phone_whatsapp,
            text: renderTemplate(campaign.message_template, clientName),
            actor_type: 'ai',
            agent_slug: AGENT_SLUG,
            dry_run: dryRun,
          })

          queuedOrSent += 1
          await supabase
            .from('campaign_recipients')
            .update({ status: dryRun ? 'dry_run' : 'sent' })
            .eq('id', recipient.id)

          await supabase.from('campaign_dispatches').insert({
            professional_id: campaign.professional_id,
            campaign_id: campaign.id,
            recipient_id: recipient.id,
            status: dryRun ? 'dry_run' : 'sent',
          })
        } catch (error) {
          failed += 1
          await supabase
            .from('campaign_recipients')
            .update({ status: 'failed', skip_reason: error instanceof Error ? error.message : 'unknown_error' })
            .eq('id', recipient.id)

          await supabase.from('campaign_dispatches').insert({
            professional_id: campaign.professional_id,
            campaign_id: campaign.id,
            recipient_id: recipient.id,
            status: 'failed',
            error_message: error instanceof Error ? error.message : 'unknown_error',
          })
        }
      }

      const { count } = await supabase
        .from('campaign_recipients')
        .select('id', { count: 'exact', head: true })
        .eq('campaign_id', campaign.id)
        .eq('status', 'pending')

      if ((count ?? 0) === 0) {
        await supabase
          .from('campaigns')
          .update({ status: failed > 0 ? 'failed' : 'sent' })
          .eq('id', campaign.id)
          .eq('professional_id', campaign.professional_id)
      }
    }

    await completeAgentExecution(supabase, execution.id, { status: failed > 0 ? 'failed' : 'success' })

    return jsonResponse(validateCampaignDispatcherOutput({
      processed_campaigns: campaigns.length,
      queued_or_sent: queuedOrSent,
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
