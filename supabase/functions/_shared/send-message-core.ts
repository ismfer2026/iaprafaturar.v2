import type { SupabaseClient } from '@supabase/supabase-js'

import { validateSendMessageInput, type SendMessageInput } from '@iaprafaturar/contracts/edge-functions/send-message.ts'
import { insertOutboundMessageEvent } from './message-events.ts'
import { sendEvolutionGoText } from './evolution-go.ts'

export async function sendMessageCore(
  supabase: SupabaseClient,
  rawInput: unknown,
): Promise<{ dry_run: true; would_send: { instance_name: string; to: string; text: string } } | { sent: true; provider_payload: Record<string, unknown> }> {
  const input: SendMessageInput = validateSendMessageInput(rawInput)

  if (input.dry_run) {
    await insertOutboundMessageEvent(supabase, {
      professionalId: input.professional_id ?? null,
      sourceWebhook: input.source_webhook,
      instanceName: input.instance_name,
      to: input.to,
      text: input.text,
      status: 'dry_run',
      sentBy: input.actor_type === 'ai' ? 'ai' : input.actor_type === 'cron' ? 'cron' : 'human',
      agentSlug: input.agent_slug,
    })

    return {
      dry_run: true,
      would_send: {
        instance_name: input.instance_name,
        to: input.to,
        text: input.text,
      },
    }
  }

  const providerPayload = await sendEvolutionGoText({
    sourceWebhook: input.source_webhook,
    instanceName: input.instance_name,
    to: input.to,
    text: input.text,
  })

  await insertOutboundMessageEvent(supabase, {
    professionalId: input.professional_id ?? null,
    sourceWebhook: input.source_webhook,
    instanceName: input.instance_name,
    to: input.to,
    text: input.text,
    status: 'sent',
    sentBy: input.actor_type === 'ai' ? 'ai' : input.actor_type === 'cron' ? 'cron' : 'human',
    agentSlug: input.agent_slug,
    providerPayload,
  })

  return { sent: true, provider_payload: providerPayload }
}