import type { SupabaseClient } from '@supabase/supabase-js'

import type { SourceWebhook } from '@iaprafaturar/contracts/events/message-events.ts'
import type { NormalizedEvolutionMessage } from './evolution-payload.ts'

export async function insertInboundMessageEvent(
  supabase: SupabaseClient,
  message: NormalizedEvolutionMessage,
  professionalId: string | null,
) {
  const { data, error } = await supabase
    .from('message_events')
    .insert({
      professional_id: professionalId,
      direction: 'inbound',
      channel: 'whatsapp',
      message_type: message.message_type,
      source_webhook: message.source_webhook,
      instance_name: message.instance_name,
      content: message.text ?? null,
      media_url: message.media_url ?? null,
      external_message_id: message.external_message_id,
      status: 'queued',
      provider_payload: message.raw as Record<string, unknown>,
      metadata: { from: message.from },
    })
    .select('id')
    .single()

  if (error) throw error
  return data as { id: string }
}

export async function insertOutboundMessageEvent(
  supabase: SupabaseClient,
  input: {
    professionalId?: string | null
    sourceWebhook: SourceWebhook
    instanceName: string
    to: string
    text?: string | null
    mediaUrl?: string | null
    messageType?: 'text' | 'image' | 'document' | 'audio' | 'video'
    status: 'dry_run' | 'sent' | 'failed'
    sentBy?: 'ai' | 'human' | 'cron' | 'campaign'
    agentSlug?: string
    providerPayload?: Record<string, unknown>
    errorCode?: string
  },
) {
  const { data, error } = await supabase
    .from('message_events')
    .insert({
      professional_id: input.professionalId ?? null,
      direction: 'outbound',
      channel: 'whatsapp',
      message_type: input.messageType ?? 'text',
      source_webhook: input.sourceWebhook,
      instance_name: input.instanceName,
      content: input.text ?? null,
      media_url: input.mediaUrl ?? null,
      sent_by: input.sentBy ?? null,
      agent_slug: input.agentSlug ?? null,
      status: input.status,
      sent_at: input.status === 'sent' ? new Date().toISOString() : null,
      error_code: input.errorCode ?? null,
      metadata: { to: input.to },
      provider_payload: input.providerPayload ?? {},
    })
    .select('id')
    .single()

  if (error) throw error
  return data as { id: string }
}