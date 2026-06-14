import { assertInternalAuth } from '../_shared/internal-auth.ts'
import { jsonResponse } from '../_shared/http.ts'
import { publishBroadcastWorker } from '../_shared/broadcast-worker-queue.ts'
import { sendMessageCore } from '../_shared/send-message-core.ts'
import { createServiceClient } from '../_shared/supabase.ts'

interface ClaimedRecipient {
  recipient_id: string
  broadcast_id: string
  professional_id: string
  message: string
  phone_whatsapp: string | null
  attempt_count: number
  max_attempts: number
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

Deno.serve(async (request) => {
  try {
    assertInternalAuth(request)
    const input = await request.json() as { broadcast_id?: string; job_id?: string }
    if (!input.broadcast_id) return jsonResponse({ error: 'broadcast_id_required' }, { status: 400 })

    const instanceName = Deno.env.get('ADMIN_WHATSAPP_INSTANCE_NAME')
    if (!instanceName) throw new Error('Missing ADMIN_WHATSAPP_INSTANCE_NAME')

    const supabase = createServiceClient()
    if (input.job_id) {
      const { error: consumedError } = await supabase.from('qstash_job_log').insert({
        job_id: input.job_id,
        queue_name: 'admin-broadcast-worker',
        event_type: 'consumed',
        consumed_at: new Date().toISOString(),
      })
      if (consumedError) throw consumedError
    }
    const lockToken = crypto.randomUUID()
    const { data: claim, error: claimError } = await supabase.rpc('phase24_claim_broadcast_batch', {
      p_broadcast_id: input.broadcast_id,
      p_limit: 10,
      p_lock_token: lockToken,
    })
    if (claimError) throw claimError

    const items = (claim?.items ?? []) as ClaimedRecipient[]
    for (const item of items) {
      let success = false
      let errorMessage: string | null = null
      try {
        if (!item.phone_whatsapp) throw new Error('missing_phone')
        await sendMessageCore(supabase, {
          source_webhook: 'admin',
          professional_id: null,
          instance_name: instanceName,
          to: item.phone_whatsapp,
          text: item.message,
          actor_type: 'ai',
          agent_slug: 'admin-broadcast-worker',
          dry_run: false,
        })
        success = true
      } catch (error) {
        errorMessage = error instanceof Error ? error.message : 'send_failed'
      }

      const { data: completion, error: completeError } = await supabase.rpc('phase24_complete_broadcast_recipient', {
        p_recipient_id: item.recipient_id,
        p_lock_token: lockToken,
        p_success: success,
        p_error: errorMessage,
      })
      if (completeError) throw completeError
      if (!success) {
        const terminal = completion?.recipient_status === 'dead_letter'
        const { error: telemetryError } = await supabase.from('qstash_job_log').insert({
          job_id: input.job_id ?? `broadcast:${item.broadcast_id}:${item.recipient_id}:${item.attempt_count}`,
          queue_name: 'admin-broadcast-worker',
          event_type: terminal ? 'dead_lettered' : 'failed',
          retry_count: item.attempt_count,
          max_retries: item.max_attempts,
          error_type: terminal ? 'recipient_dead_letter' : 'recipient_retry',
          error_message: errorMessage,
          failed_at: terminal ? null : new Date().toISOString(),
          dead_lettered_at: terminal ? new Date().toISOString() : null,
        })
        if (telemetryError) throw telemetryError
      }
      await sleep(350)
    }

    const { data: state, error: stateError } = await supabase.rpc('phase24_get_broadcast_worker_state', {
      p_broadcast_id: input.broadcast_id,
    })
    if (stateError) throw stateError

    if (Number(state?.remaining ?? 0) > 0) {
      await publishBroadcastWorker({
        broadcastId: input.broadcast_id,
        delaySeconds: Number(state?.ready ?? 0) > 0 ? 1 : 15,
      })
    }

    return jsonResponse({ processed: items.length, state })
  } catch (error) {
    if (error instanceof Response) return error
    return jsonResponse({ error: error instanceof Error ? error.message : 'unknown_error' }, { status: 500 })
  }
})
