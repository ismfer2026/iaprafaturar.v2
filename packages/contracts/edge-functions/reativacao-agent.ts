import { z } from 'zod'

export const ReativacaoAgentInputSchema = z.object({
  professional_id: z.string().uuid().optional(),
  limit: z.number().int().min(1).max(100).optional(),
  dry_run: z.boolean().optional(),
}).strict()

export const ReativacaoAgentOutputSchema = z.object({
  processed: z.number().int().nonnegative(),
  sent: z.number().int().nonnegative(),
  skipped: z.number().int().nonnegative(),
  failed: z.number().int().nonnegative(),
})

export type ReativacaoAgentInput = z.infer<typeof ReativacaoAgentInputSchema>
export type ReativacaoAgentOutput = z.infer<typeof ReativacaoAgentOutputSchema>

export function validateReativacaoAgentInput(input: unknown): ReativacaoAgentInput {
  return ReativacaoAgentInputSchema.parse(input)
}

export function validateReativacaoAgentOutput(input: unknown): ReativacaoAgentOutput {
  return ReativacaoAgentOutputSchema.parse(input)
}
