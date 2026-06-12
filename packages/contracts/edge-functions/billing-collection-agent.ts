import { z } from 'zod'

export const BillingCollectionAgentInputSchema = z.object({
  transaction_id: z.string().uuid(),
  dry_run: z.boolean().optional(),
}).strict()

export const BillingCollectionAgentOutputSchema = z.object({
  ok: z.literal(true),
  transaction_id: z.string().uuid(),
  status: z.enum(['sent', 'dry_run', 'skipped_no_instance', 'skipped_no_phone', 'collection_already_sent']),
  message_event_id: z.string().uuid().nullable().optional(),
  dry_run: z.boolean(),
})

export type BillingCollectionAgentInput = z.infer<typeof BillingCollectionAgentInputSchema>
export type BillingCollectionAgentOutput = z.infer<typeof BillingCollectionAgentOutputSchema>

export function validateBillingCollectionAgentInput(input: unknown): BillingCollectionAgentInput {
  return BillingCollectionAgentInputSchema.parse(input)
}

export function validateBillingCollectionAgentOutput(input: unknown): BillingCollectionAgentOutput {
  return BillingCollectionAgentOutputSchema.parse(input)
}
