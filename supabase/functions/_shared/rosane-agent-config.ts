import type { SupabaseClient } from '@supabase/supabase-js'

export interface RosaneAgentConfig {
  agentName: string
  shadowMode: boolean
  autoRespond: boolean
  enabledAgents: string[]
  workingHours: Record<string, unknown>
  agentConfigs: Record<string, unknown>
}

export async function getRosaneAgentConfig(
  supabase: SupabaseClient,
  professionalId: string,
): Promise<RosaneAgentConfig> {
  const { data, error } = await supabase
    .from('professional_agents')
    .select('agent_name, shadow_mode, auto_respond, enabled_agents, working_hours, agent_configs')
    .eq('professional_id', professionalId)
    .eq('agent_slug', 'rosane')
    .eq('is_active', true)
    .maybeSingle()

  if (error) throw error

  return {
    agentName: data?.agent_name ?? 'Rosane',
    shadowMode: Boolean(data?.shadow_mode ?? true),
    autoRespond: Boolean(data?.auto_respond ?? true),
    enabledAgents: Array.isArray(data?.enabled_agents) ? data.enabled_agents : [],
    workingHours: (data?.working_hours ?? {}) as Record<string, unknown>,
    agentConfigs: (data?.agent_configs ?? {}) as Record<string, unknown>,
  }
}

export function getPostCareConfig(config: RosaneAgentConfig): {
  googleReviewUrl: string | null
  sendGoogleReviewAfterPositiveNps: boolean
} {
  const postCare = (config.agentConfigs.post_care ?? {}) as Record<string, unknown>
  const url = typeof postCare.google_review_url === 'string' ? postCare.google_review_url.trim() : ''

  return {
    googleReviewUrl: url.length > 0 ? url : null,
    sendGoogleReviewAfterPositiveNps: postCare.send_google_review_after_positive_nps === true,
  }
}
