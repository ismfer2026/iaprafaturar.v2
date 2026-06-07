import type { SupabaseClient } from '@supabase/supabase-js'

export interface ProfessionalWhatsappInstance {
  instanceName: string
  phoneNumber: string | null
  status: string
  isConnected: boolean
}

export async function getConnectedProfessionalWhatsappInstance(
  supabase: SupabaseClient,
  professionalId: string,
): Promise<ProfessionalWhatsappInstance | null> {
  const { data, error } = await supabase
    .from('professional_whatsapp')
    .select('instance_name, phone_number, status, is_connected')
    .eq('professional_id', professionalId)
    .eq('provider', 'evolution_go')
    .eq('is_connected', true)
    .maybeSingle()

  if (error) throw error
  if (!data) return null

  return {
    instanceName: data.instance_name,
    phoneNumber: data.phone_number ?? null,
    status: data.status,
    isConnected: Boolean(data.is_connected),
  }
}

export function normalizeWhatsappPhone(value: string | null | undefined): string | null {
  const digits = String(value ?? '').replace(/\D/g, '')
  return digits.length > 0 ? digits : null
}
