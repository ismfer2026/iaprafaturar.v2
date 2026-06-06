import { validateWebhookAdminInput } from '@iaprafaturar/contracts/edge-functions/webhook-admin.ts'

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
    await assertValidWebhookHmac(request, rawBody, 'ADMIN_EVOLUTION_WEBHOOK_SECRET')

    const payload = JSON.parse(rawBody)
    validateWebhookAdminInput(payload)
    const message = normalizeEvolutionPayload(payload, 'admin')

    if (message.from_me || message.is_group || message.is_broadcast) {
      return jsonResponse({ received: true, ignored: true })
    }

    const supabase = createServiceClient()
    const idempotencyKey = `admin:${message.instance_name}:${message.external_message_id}`
    const claim = await claimIdempotency(supabase, idempotencyKey, payload)

    if (!claim.claimed) {
      return jsonResponse({ received: true, duplicate: true })
    }

    const { data: professionalId, error: professionalLookupError } = await supabase
      .rpc('find_professional_by_whatsapp_phone', { p_phone: message.from })

    if (professionalLookupError) throw professionalLookupError

    const event = await insertInboundMessageEvent(supabase, message, professionalId ?? null)

    await publishProcessorJob(supabase, {
      queueName: 'admin-message-processor',
      payload: {
        source_webhook: 'admin',
        message_event_id: event.id,
        idempotency_key: idempotencyKey,
        dry_run: isDryRun(request),
      },
      messageEventId: event.id,
      professionalId: professionalId ?? null,
      dryRun: isDryRun(request),
    })

    return jsonResponse({ received: true, queued: true })
  } catch (error) {
    if (error instanceof Response) return error
    console.error('[webhook-admin] internal_error_after_hmac', error)
    return jsonResponse({
      received: true,
      queued: false,
      internal_error: true,
      error: error instanceof Error ? error.message : 'unknown_error',
    })
  }
})
