import { z } from 'zod'

export const PublicChatGetContextInputSchema = z.object({
  mode: z.literal('get_context'),
  slug: z.string().trim().min(1).max(120),
}).strict()

export const PublicChatSendMessageInputSchema = z.object({
  mode: z.literal('send_message'),
  slug: z.string().trim().min(1).max(120),
  name: z.string().trim().min(1).max(160),
  email: z.string().trim().email().max(254).optional(),
  phone: z.string().trim().min(8).max(30).optional(),
  message: z.string().trim().min(1).max(2000),
  website: z.string().max(200).optional(),
}).strict()

export const PublicChatHandlerInputSchema = z.discriminatedUnion('mode', [
  PublicChatGetContextInputSchema,
  PublicChatSendMessageInputSchema,
])

export const PublicChatContextOutputSchema = z.object({
  ok: z.literal(true),
  context: z.object({
    professional: z.object({
      name: z.string().min(1),
      slug: z.string().min(1),
    }).passthrough(),
    config: z.object({
      enabled: z.boolean(),
      welcome_message: z.string(),
      require_contact: z.boolean(),
    }).passthrough(),
  }).passthrough(),
}).passthrough()

export const PublicChatMessageOutputSchema = z.object({
  ok: z.literal(true),
  result: z.object({
    conversation_id: z.string().uuid(),
    message_event_id: z.string().uuid(),
    client_id: z.string().uuid(),
    opportunity_id: z.string().uuid(),
    handoff_mode: z.string(),
  }).passthrough(),
}).passthrough()

export const PublicChatErrorOutputSchema = z.object({
  ok: z.literal(false),
  error: z.enum(['invalid_input', 'not_found', 'chat_unavailable', 'rate_limited', 'internal_error']),
}).strict()

export type PublicChatContextOutput = z.infer<typeof PublicChatContextOutputSchema>
export type PublicChatMessageOutput = z.infer<typeof PublicChatMessageOutputSchema>
export type PublicChatErrorOutput = z.infer<typeof PublicChatErrorOutputSchema>

export function validatePublicChatHandlerInput(input: unknown) {
  return PublicChatHandlerInputSchema.parse(input)
}

export function validatePublicChatContextOutput(input: unknown): PublicChatContextOutput {
  return PublicChatContextOutputSchema.parse(input)
}

export function validatePublicChatMessageOutput(input: unknown): PublicChatMessageOutput {
  return PublicChatMessageOutputSchema.parse(input)
}
