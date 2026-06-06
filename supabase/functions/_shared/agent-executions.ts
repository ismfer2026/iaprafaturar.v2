import type { SupabaseClient } from '@supabase/supabase-js'

export async function startAgentExecution(
  supabase: SupabaseClient,
  input: {
    professionalId?: string | null
    agentSlug: string
    triggerType: 'webhook' | 'cron' | 'manual' | 'rpc' | 'qstash'
    triggerRef?: string
    triggerPayload?: Record<string, unknown>
    messageEventId?: string
  },
) {
  const { data, error } = await supabase
    .from('agent_executions')
    .insert({
      professional_id: input.professionalId ?? null,
      agent_slug: input.agentSlug,
      trigger_type: input.triggerType,
      trigger_ref: input.triggerRef ?? null,
      trigger_payload: input.triggerPayload ?? {},
      message_event_id: input.messageEventId ?? null,
      status: 'running',
    })
    .select('id')
    .single()

  if (error) throw error
  return data as { id: string }
}

export async function completeAgentExecution(
  supabase: SupabaseClient,
  id: string,
  input: { status: 'success' | 'failed' | 'skipped'; errorMessage?: string },
) {
  const { error } = await supabase
    .from('agent_executions')
    .update({
      status: input.status,
      error_message: input.errorMessage ?? null,
      completed_at: new Date().toISOString(),
    })
    .eq('id', id)

  if (error) throw error
}