import type { SupabaseClient } from '@supabase/supabase-js'

export interface IdempotencyClaimResult {
  claimed: boolean
  idempotencyKey: string
}

export async function claimIdempotency(
  supabase: SupabaseClient,
  idempotencyKey: string,
  payload: unknown,
): Promise<IdempotencyClaimResult> {
  const { data, error } = await supabase
    .from('idempotency_log')
    .insert({ idempotency_key: idempotencyKey, payload })
    .select('idempotency_key')
    .maybeSingle()

  if (error) {
    if (error.code === '23505') {
      return { claimed: false, idempotencyKey }
    }
    throw error
  }

  return { claimed: Boolean(data), idempotencyKey }
}