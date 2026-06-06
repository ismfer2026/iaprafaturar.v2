import { z } from 'zod'

export const AdminMessageProcessorInputSchema = z.object({
  source_webhook: z.literal('admin'),
  message_event_id: z.string().uuid(),
  idempotency_key: z.string().min(12),
  dry_run: z.boolean().optional(),
})

export type AdminMessageProcessorInput = z.infer<typeof AdminMessageProcessorInputSchema>

export function validateAdminMessageProcessorInput(input: unknown): AdminMessageProcessorInput {
  return AdminMessageProcessorInputSchema.parse(input)
}