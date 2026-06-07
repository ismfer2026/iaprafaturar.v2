import type { SupabaseClient } from '@supabase/supabase-js'

export type DeterministicContextType = 'appointment_confirmation' | 'post_care' | 'reminder'

export interface ConversationRef {
  id: string
  clientId: string | null
}

export interface ConversationContextRef {
  id: string
  contextType: string
  refType: string | null
  refId: string | null
  metadata: Record<string, unknown>
}

export async function resolveClientByPhone(
  supabase: SupabaseClient,
  professionalId: string,
  phoneWhatsapp: string | null,
): Promise<{ id: string; full_name: string } | null> {
  if (!phoneWhatsapp) return null

  const { data, error } = await supabase
    .from('clients')
    .select('id, full_name')
    .eq('professional_id', professionalId)
    .eq('phone_whatsapp', phoneWhatsapp)
    .is('deleted_at', null)
    .limit(1)
    .maybeSingle()

  if (error) throw error
  return data ?? null
}

export async function resolveOrCreateWhatsappConversation(
  supabase: SupabaseClient,
  input: {
    professionalId: string
    clientId?: string | null
    phone?: string | null
    preview?: string | null
  },
): Promise<ConversationRef> {
  const existingQuery = supabase
    .from('conversations')
    .select('id, client_id')
    .eq('professional_id', input.professionalId)
    .eq('channel', 'whatsapp')
    .order('last_message_at', { ascending: false })
    .limit(1)

  const { data: existing, error: selectError } = input.phone
    ? await existingQuery.eq('phone', input.phone).maybeSingle()
    : input.clientId
      ? await existingQuery.eq('client_id', input.clientId).maybeSingle()
      : { data: null, error: null }

  if (selectError) throw selectError

  if (existing) {
    const { error: updateError } = await supabase
      .from('conversations')
      .update({
        client_id: existing.client_id ?? input.clientId ?? null,
        last_message_at: new Date().toISOString(),
        last_message_preview: input.preview ?? null,
        unread_count: 1,
      })
      .eq('id', existing.id)

    if (updateError) throw updateError

    return {
      id: existing.id,
      clientId: existing.client_id ?? input.clientId ?? null,
    }
  }

  const { data, error } = await supabase
    .from('conversations')
    .insert({
      professional_id: input.professionalId,
      client_id: input.clientId ?? null,
      channel: 'whatsapp',
      phone: input.phone ?? null,
      rosane_status: 'active',
      last_message_at: new Date().toISOString(),
      last_message_preview: input.preview ?? null,
      unread_count: 1,
    })
    .select('id, client_id')
    .single()

  if (error) throw error

  return {
    id: data.id,
    clientId: data.client_id ?? null,
  }
}

export async function linkMessageEventToConversation(
  supabase: SupabaseClient,
  input: {
    messageEventId: string
    conversationId: string
    clientId?: string | null
  },
): Promise<void> {
  const { error } = await supabase
    .from('message_events')
    .update({
      conversation_id: input.conversationId,
      client_id: input.clientId ?? null,
    })
    .eq('id', input.messageEventId)

  if (error) throw error
}

export async function getActiveConversationContext(
  supabase: SupabaseClient,
  input: {
    professionalId: string
    conversationId: string
    contextTypes: DeterministicContextType[]
  },
): Promise<ConversationContextRef | null> {
  const { data, error } = await supabase
    .from('conversation_contexts')
    .select('id, context_type, ref_type, ref_id, metadata')
    .eq('professional_id', input.professionalId)
    .eq('conversation_id', input.conversationId)
    .eq('status', 'active')
    .in('context_type', input.contextTypes)
    .or('expires_at.is.null,expires_at.gt.now()')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) throw error
  if (!data) return null

  return {
    id: data.id,
    contextType: data.context_type,
    refType: data.ref_type ?? null,
    refId: data.ref_id ?? null,
    metadata: (data.metadata ?? {}) as Record<string, unknown>,
  }
}

export async function createConversationContext(
  supabase: SupabaseClient,
  input: {
    professionalId: string
    conversationId: string
    clientId?: string | null
    contextType: DeterministicContextType
    sourceFunction: string
    refType: string
    refId: string
    expiresAt?: string | null
    metadata?: Record<string, unknown>
  },
): Promise<{ id: string }> {
  const { data, error } = await supabase
    .from('conversation_contexts')
    .insert({
      professional_id: input.professionalId,
      conversation_id: input.conversationId,
      client_id: input.clientId ?? null,
      context_type: input.contextType,
      status: 'active',
      source_function: input.sourceFunction,
      ref_type: input.refType,
      ref_id: input.refId,
      privacy_classification: 'business',
      expires_at: input.expiresAt ?? null,
      metadata: input.metadata ?? {},
    })
    .select('id')
    .single()

  if (error) throw error
  return data as { id: string }
}

export function buildAppointmentAgentIdempotencyKey(input: {
  agentSlug: string
  appointmentId: string
  mode: string
}): string {
  return `${input.agentSlug}:appointment:${input.appointmentId}:${input.mode}`
}
