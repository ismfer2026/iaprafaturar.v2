import { validateWebhookWhatsappInput } from '@iaprafaturar/contracts/edge-functions/webhook-whatsapp.ts'

import { assertValidWebhookHmac } from '../_shared/hmac.ts'
import { claimIdempotency } from '../_shared/idempotency.ts'
import { insertInboundMessageEvent } from '../_shared/message-events.ts'
import { isDryRun } from '../_shared/dry-run.ts'
import { jsonResponse } from '../_shared/http.ts'
import { normalizeEvolutionPayload } from '../_shared/evolution-payload.ts'
import { publishProcessorJob } from '../_shared/qstash.ts'
import { createServiceClient } from '../_shared/supabase.ts'

Deno.serve(async (request) => {
  const rawBody = await request.text()

  try {
    await assertValidWebhookHmac(request, rawBody, 'PROFESSIONAL_EVOLUTION_WEBHOOK_SECRET')

    const payload = JSON.parse(rawBody)
    validateWebhookWhatsappInput(payload)
    const message = normalizeEvolutionPayload(payload, 'professional')

    if (message.from_me || message.is_group || message.is_broadcast) {
      return jsonResponse({ received: true, ignored: true })
    }

    const supabase = createServiceClient()
    const idempotencyKey = `professional:${message.instance_name}:${message.external_message_id}`
    const claim = await claimIdempotency(supabase, idempotencyKey, payload)

    if (!claim.claimed) {
      return jsonResponse({ received: true, duplicate: true })
    }

    const { data: professional, error: professionalError } = await supabase
      .from('professionals')
      .select('id')
      .eq('evolution_instance_id', message.instance_name)
      .maybeSingle()

    if (professionalError) throw professionalError
    if (!professional?.id) {
      throw new Error(`No professional found for instance ${message.instance_name}`)
    }

    const event = await insertInboundMessageEvent(supabase, message, professional.id)

    await publishProcessorJob(supabase, {
      queueName: 'message-processor',
      payload: {
        source_webhook: 'professional',
        message_event_id: event.id,
        idempotency_key: idempotencyKey,
        dry_run: isDryRun(request),
      },
      messageEventId: event.id,
      professionalId: professional.id,
      dryRun: isDryRun(request),
    })

    return jsonResponse({ received: true, queued: true })
  } catch (error) {
    if (error instanceof Response) return error
    console.error('[webhook-whatsapp] internal_error_after_hmac', error)
    return jsonResponse({
      received: true,
      queued: false,
      internal_error: true,
      error: error instanceof Error ? error.message : 'unknown_error',
    })
  }
})
