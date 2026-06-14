import { createServiceClient } from './supabase.ts'

export async function publishBroadcastWorker(input: { broadcastId: string; delaySeconds?: number }): Promise<void> {
  const qstashToken = Deno.env.get('QSTASH_TOKEN')
  const baseUrl = Deno.env.get('FUNCTIONS_BASE_URL')
  const internalToken = Deno.env.get('INTERNAL_FUNCTION_TOKEN')
  if (!qstashToken || !baseUrl || !internalToken) {
    throw new Error('Missing QSTASH_TOKEN, FUNCTIONS_BASE_URL, or INTERNAL_FUNCTION_TOKEN')
  }

  const jobId = crypto.randomUUID()
  const response = await fetch(`https://qstash.upstash.io/v2/publish/${encodeURIComponent(`${baseUrl.replace(/\/$/, '')}/admin-broadcast-worker`)}`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${qstashToken}`,
      'content-type': 'application/json',
      'upstash-forward-authorization': `Bearer ${internalToken}`,
      'upstash-retries': '3',
      ...(input.delaySeconds ? { 'upstash-delay': `${input.delaySeconds}s` } : {}),
    },
    body: JSON.stringify({ broadcast_id: input.broadcastId, job_id: jobId }),
  })

  if (!response.ok) throw new Error(`QStash publish failed: ${response.status} ${await response.text()}`)
  const { error } = await createServiceClient().from('qstash_job_log').insert({
    job_id: jobId,
    queue_name: 'admin-broadcast-worker',
    event_type: 'published',
    published_at: new Date().toISOString(),
  })
  if (error) throw error
}
