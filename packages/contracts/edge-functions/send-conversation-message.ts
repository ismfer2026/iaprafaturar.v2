import { z } from 'zod'

export const SendConversationMessageInputSchema = z.object({
  conversation_id: z.string().uuid(),
  text: z.string().max(4096).optional(),
  media_url: z.string().url().optional(),
  media_type: z.enum(['image', 'document', 'video', 'audio']).optional(),
  dry_run: z.boolean().optional(),
}).strict().superRefine((val, ctx) => {
  if (!val.text && !val.media_url) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['text'],
      message: 'Either text or media_url is required',
    })
  }
})

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
