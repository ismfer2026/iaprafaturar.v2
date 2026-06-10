import { z } from 'zod'

export const UpsellAgentInputSchema = z.object({
  mode: z.literal('shadow_scan').default('shadow_scan'),
  limit: z.number().int().positive().max(200).optional(),
  dry_run: z.boolean().optional(),
}).strict()

export const UpsellAgentOutputSchema = z.object({
  ok: z.literal(true),
  processed: z.number().int().nonnegative(),
  suggested: z.number().int().nonnegative(),
  skipped: z.number().int().nonnegative(),
  failed: z.number().int().nonnegative(),
  dry_run: z.boolean(),
})

export type UpsellAgentInput = z.infer<typeof UpsellAgentInputSchema>
export type UpsellAgentOutput = z.infer<typeof UpsellAgentOutputSchema>

export function validateUpsellAgentInput(input: unknown): UpsellAgentInput {
  return UpsellAgentInputSchema.parse(input)
}

export function validateUpsellAgentOutput(input: unknown): UpsellAgentOutput {
  return UpsellAgentOutputSchema.parse(input)
}
