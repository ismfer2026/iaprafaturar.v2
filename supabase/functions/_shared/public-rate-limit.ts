type RpcClient = {
  rpc: (name: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>
}

function clientIp(request: Request): string {
  return request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    ?? request.headers.get('cf-connecting-ip')
    ?? 'unknown'
}

async function sha256(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

export async function assertPublicRateLimit(input: {
  supabase: RpcClient
  request: Request
  action: string
  subject?: string | null
  limit?: number
  windowSeconds?: number
}): Promise<void> {
  const fingerprint = await sha256(`${clientIp(input.request)}:${input.subject ?? ''}`)
  const { data, error } = await input.supabase.rpc('claim_public_request_rate_limit', {
    p_action: input.action,
    p_fingerprint: fingerprint,
    p_limit: input.limit ?? 30,
    p_window_seconds: input.windowSeconds ?? 60,
  })

  if (error) throw error
  if (data !== true) throw new Error('rate_limited')
}
