import type { SupabaseClient } from '@supabase/supabase-js'

export interface RosaneAgentConfig {
  agentName: string
  shadowMode: boolean
  autoRespond: boolean
  enabledAgents: string[]
  workingHours: Record<string, unknown>
  respondOutsideHours: boolean
  agentConfigs: Record<string, unknown>
}

export async function getRosaneAgentConfig(
  supabase: SupabaseClient,
  professionalId: string,
): Promise<RosaneAgentConfig> {
  const { data, error } = await supabase
    .from('professional_agents')
    .select(
      'agent_name, shadow_mode, auto_respond, enabled_agents, working_hours, respond_outside_hours, agent_configs',
    )
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
    respondOutsideHours: Boolean(data?.respond_outside_hours ?? false),
    agentConfigs: (data?.agent_configs ?? {}) as Record<string, unknown>,
  }
}

const WEEKDAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const

interface WorkingHoursWindow {
  start?: unknown
  end?: unknown
}

function parseMinutesOfDay(value: unknown): number | null {
  if (typeof value !== 'string') return null
  const match = /^(\d{2}):(\d{2})$/.exec(value)
  if (!match) return null

  const hours = Number(match[1])
  const minutes = Number(match[2])
  if (hours > 23 || minutes > 59) return null

  return hours * 60 + minutes
}

/**
 * `working_hours` no formato `{ mon: { start: '08:00', end: '18:00' }, ... }` (chaves de dia
 * abreviadas em inglês, comparadas em UTC). `{}` (não configurado) ou
 * `respondOutsideHours=true` significam "sem restrição".
 */
export function isWithinWorkingHours(
  workingHours: Record<string, unknown>,
  respondOutsideHours: boolean,
  now: Date = new Date(),
): boolean {
  if (respondOutsideHours) return true
  if (Object.keys(workingHours).length === 0) return true

  const dayKey = WEEKDAY_KEYS[now.getUTCDay()]
  const window = workingHours[dayKey] as WorkingHoursWindow | undefined
  if (!window || typeof window !== 'object') return false

  const start = parseMinutesOfDay(window.start)
  const end = parseMinutesOfDay(window.end)
  if (start === null || end === null) return false

  const nowMinutes = now.getUTCHours() * 60 + now.getUTCMinutes()
  return nowMinutes >= start && nowMinutes < end
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
