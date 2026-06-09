import { z } from 'zod'

export const RelationshipAgentInputSchema = z.object({
  professional_id: z.string().uuid().optional(),
  client_id: z.string().uuid().optional(),
  limit: z.number().int().min(1).max(100).optional(),
  dry_run: z.boolean().optional(),
}).strict()

export const RelationshipAgentOutputSchema = z.object({
  processed: z.number().int().nonnegative(),
  sent: z.number().int().nonnegative(),
  skipped: z.number().int().nonnegative(),
  failed: z.number().int().nonnegative(),
})

export type RelationshipAgentInput = z.infer<typeof RelationshipAgentInputSchema>
export type RelationshipAgentOutput = z.infer<typeof RelationshipAgentOutputSchema>

export function validateRelationshipAgentInput(input: unknown): RelationshipAgentInput {
  return RelationshipAgentInputSchema.parse(input)
}

export function validateRelationshipAgentOutput(input: unknown): RelationshipAgentOutput {
  return RelationshipAgentOutputSchema.parse(input)
}
