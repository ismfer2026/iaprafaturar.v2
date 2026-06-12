import { jsonResponse } from '../_shared/http.ts'
import { assertInternalAuth } from '../_shared/internal-auth.ts'
import { createServiceClient } from '../_shared/supabase.ts'

interface AffiliateCommissionCronInput {
  reference_month?: string
  limit?: number
}

function parseInput(value: unknown): AffiliateCommissionCronInput {
  if (!value || typeof value !== 'object') return {}
  const input = value as Record<string, unknown>
  return {
    reference_month: typeof input.reference_month === 'string' ? input.reference_month : undefined,
    limit: typeof input.limit === 'number' ? input.limit : undefined,
  }
}

Deno.serve(async (request) => {
  try {
    assertInternalAuth(request)

    const input = request.method === 'GET'
      ? {}
      : parseInput(await request.json().catch(() => ({})))

    const supabase = createServiceClient()
    const { data, error } = await supabase.rpc('calculate_affiliate_commissions', {
      p_reference_month: input.reference_month ?? null,
      p_limit: input.limit ?? 500,
    })

    if (error) throw error
    return jsonResponse(data ?? { ok: true })
  } catch (error) {
    if (error instanceof Response) return error
    return jsonResponse({ error: error instanceof Error ? error.message : 'unknown_error' }, { status: 500 })
  }
})
