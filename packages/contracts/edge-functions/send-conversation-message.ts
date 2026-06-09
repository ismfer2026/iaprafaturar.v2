import { z } from 'zod'

export const SendConversationMessageInputSchema = z.object({
  conversation_id: z.string().uuid(),
  text: z.string().min(1).max(4096),
  dry_run: z.boolean().optional(),
}).strict()

export const SendConversationMessageOutputSchema = z.object({
  sent: z.boolean(),
  dry_run: z.boolean(),
  conversation_id: z.string().uuid(),
  message_event_id: z.string().uuid().optional(),
  skipped_reason: z.string().optional(),
})

export type SendConversationMessageInput = z.infer<typeof SendConversationMessageInputSchema>
export type SendConversationMessageOutput = z.infer<typeof SendConversationMessageOutputSchema>

export function validateSendConversationMessageInput(input: unknown): SendConversationMessageInput {
  return SendConversationMessageInputSchema.parse(input)
}

export function validateSendConversationMessageOutput(input: unknown): SendConversationMessageOutput {
  return SendConversationMessageOutputSchema.parse(input)
}
