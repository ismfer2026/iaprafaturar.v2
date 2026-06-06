import type { SupabaseClient } from '@supabase/supabase-js'

export async function publishProcessorJob(
  supabase: SupabaseClient,
  input: {
    queueName: 'message-processor' | 'admin-message-processor'
    payload: Record<string, unknown>
    messageEventId: string
    professionalId?: string | null
    dryRun: boolean
  },
) {
  const jobId = input.dryRun ? `dry-run:${crypto.randomUUID()}` : crypto.randomUUID()

  if (!input.dryRun) {
    const token = Deno.env.get('QSTASH_TOKEN')
    const baseUrl = Deno.env.get('FUNCTIONS_BASE_URL')
    const internalToken = Deno.env.get('INTERNAL_FUNCTION_TOKEN')

    if (!token || !baseUrl || !internalToken) {
      throw new Error('Missing QSTASH_TOKEN, FUNCTIONS_BASE_URL, or INTERNAL_FUNCTION_TOKEN')
    }

    const targetUrl = `${baseUrl.replace(/\/$/, '')}/${input.queueName}`
    const response = await fetch(`https://qstash.upstash.io/v2/publish/${encodeURIComponent(targetUrl)}`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
        'upstash-forward-authorization': `Bearer ${internalToken}`,
      },
      body: JSON.stringify(input.payload),
    })

    if (!response.ok) {
      throw new Error(`QStash publish failed: ${response.status} ${await response.text()}`)
    }
  }

  const { error } = await supabase.from('qstash_job_log').insert({
    job_id: jobId,
    queue_name: input.queueName,
    event_type: 'published',
    message_event_id: input.messageEventId,
    professional_id: input.professionalId ?? null,
    published_at: new Date().toISOString(),
  })

  if (error) throw error
  return { jobId }
}

export async function logQstashConsumed(
  supabase: SupabaseClient,
  input: { jobId: string; queueName: string; messageEventId?: string; professionalId?: string | null },
) {
  const { error } = await supabase.from('qstash_job_log').insert({
    job_id: input.jobId,
    queue_name: input.queueName,
    event_type: 'consumed',
    message_event_id: input.messageEventId ?? null,
    professional_id: input.professionalId ?? null,
    consumed_at: new Date().toISOString(),
  })

  if (error) throw error
}