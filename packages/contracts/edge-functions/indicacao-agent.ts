import { z } from 'zod'

export const IndicacaoAgentInputSchema = z.object({
  professional_id: z.string().uuid().optional(),
  client_id: z.string().uuid().optional(),
  limit: z.number().int().min(1).max(100).optional(),
  dry_run: z.boolean().optional(),
}).strict()

export const IndicacaoAgentOutputSchema = z.object({
  processed: z.number().int().nonnegative(),
  sent: z.number().int().nonnegative(),
  skipped: z.number().int().nonnegative(),
  failed: z.number().int().nonnegative(),
})

export type IndicacaoAgentInput = z.infer<typeof IndicacaoAgentInputSchema>
export type IndicacaoAgentOutput = z.infer<typeof IndicacaoAgentOutputSchema>

export function validateIndicacaoAgentInput(input: unknown): IndicacaoAgentInput {
  return IndicacaoAgentInputSchema.parse(input)
}

export function validateIndicacaoAgentOutput(input: unknown): IndicacaoAgentOutput {
  return IndicacaoAgentOutputSchema.parse(input)
}
