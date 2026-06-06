import { z } from 'zod'

export const MessageProcessorInputSchema = z.object({
  source_webhook: z.literal('professional'),
  message_event_id: z.string().uuid(),
  idempotency_key: z.string().min(12),
  dry_run: z.boolean().optional(),
})

export type MessageProcessorInput = z.infer<typeof MessageProcessorInputSchema>

export function validateMessageProcessorInput(input: unknown): MessageProcessorInput {
  return MessageProcessorInputSchema.parse(input)
}