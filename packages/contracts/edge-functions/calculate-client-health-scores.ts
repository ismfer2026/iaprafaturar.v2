import { z } from 'zod'

export const CalculateClientHealthScoresInputSchema = z.object({
  professional_id: z.string().uuid().optional(),
  professional_cursor: z.string().uuid().optional(),
  client_cursor: z.string().uuid().optional(),
  professional_limit: z.number().int().min(1).max(50).optional(),
  client_limit: z.number().int().min(1).max(1000).optional(),
}).strict()

export const CalculateClientHealthScoresProfessionalResultSchema = z.object({
  professional_id: z.string().uuid(),
  processed: z.number().int().nonnegative(),
  next_cursor: z.string().uuid().nullable(),
})

export const CalculateClientHealthScoresOutputSchema = z.object({
  processed_professionals: z.number().int().nonnegative(),
  processed_clients: z.number().int().nonnegative(),
  next_professional_cursor: z.string().uuid().nullable(),
  results: z.array(CalculateClientHealthScoresProfessionalResultSchema),
})

export type CalculateClientHealthScoresInput = z.infer<typeof CalculateClientHealthScoresInputSchema>
export type CalculateClientHealthScoresOutput = z.infer<typeof CalculateClientHealthScoresOutputSchema>

export function validateCalculateClientHealthScoresInput(input: unknown): CalculateClientHealthScoresInput {
  return CalculateClientHealthScoresInputSchema.parse(input)
}

export function validateCalculateClientHealthScoresOutput(input: unknown): CalculateClientHealthScoresOutput {
  return CalculateClientHealthScoresOutputSchema.parse(input)
}
