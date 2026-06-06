import { z } from 'zod'

export const WhatsAppMessageReceivedEventSchema = z.object({
  event_id: z.string().uuid(),
  source_webhook: z.enum(['admin', 'professional']),
  instance_name: z.string().nullable(),
  phone: z.string().min(10),
  professional_id: z.string().uuid().nullable(),
  message_preview: z.string(),
  received_at: z.string(),
})

export type WhatsAppMessageReceivedEvent = z.infer<typeof WhatsAppMessageReceivedEventSchema>

export const WhatsAppInstanceConnectedEventSchema = z.object({
  event_id: z.string().uuid(),
  professional_id: z.string().uuid(),
  instance_name: z.string().min(1),
  phone: z.string().nullable(),
  connected_at: z.string(),
})

export type WhatsAppInstanceConnectedEvent = z.infer<typeof WhatsAppInstanceConnectedEventSchema>

export const WhatsAppInstanceDisconnectedEventSchema = z.object({
  event_id: z.string().uuid(),
  professional_id: z.string().uuid(),
  instance_name: z.string().min(1),
  disconnected_at: z.string(),
  reason: z.string().nullable(),
})

export type WhatsAppInstanceDisconnectedEvent = z.infer<typeof WhatsAppInstanceDisconnectedEventSchema>
