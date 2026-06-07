import { z } from 'zod'

export const LembreteModeSchema = z.enum(['d1', '1h', 'dia'])

export const LembreteAgentInputSchema = z.object({
  mode: LembreteModeSchema,
  professional_id: z.string().uuid().optional(),
  appointment_id: z.string().uuid().optional(),
  dry_run: z.boolean().optional(),
}).strict()

export const LembreteAgentOutputSchema = z.object({
  processed: z.number().int().nonnegative(),
  sent: z.number().int().nonnegative(),
  skipped: z.number().int().nonnegative(),
  failed: z.number().int().nonnegative(),
})

export type LembreteMode = z.infer<typeof LembreteModeSchema>
export type LembreteAgentInput = z.infer<typeof LembreteAgentInputSchema>
export type LembreteAgentOutput = z.infer<typeof LembreteAgentOutputSchema>

export function validateLembreteAgentInput(input: unknown): LembreteAgentInput {
  return LembreteAgentInputSchema.parse(input)
}

export function validateLembreteAgentOutput(input: unknown): LembreteAgentOutput {
  return LembreteAgentOutputSchema.parse(input)
}
