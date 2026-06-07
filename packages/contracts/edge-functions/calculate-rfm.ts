import { z } from 'zod'

export const CalculateRfmInputSchema = z.object({
  professional_id: z.string().uuid().optional(),
  professional_cursor: z.string().uuid().optional(),
  client_cursor: z.string().uuid().optional(),
  professional_limit: z.number().int().min(1).max(50).optional(),
  client_limit: z.number().int().min(1).max(1000).optional(),
}).strict()

export const CalculateRfmProfessionalResultSchema = z.object({
  professional_id: z.string().uuid(),
  processed: z.number().int().nonnegative(),
  next_cursor: z.string().uuid().nullable(),
})

export const CalculateRfmOutputSchema = z.object({
  processed_professionals: z.number().int().nonnegative(),
  processed_clients: z.number().int().nonnegative(),
  next_professional_cursor: z.string().uuid().nullable(),
  results: z.array(CalculateRfmProfessionalResultSchema),
})

export type CalculateRfmInput = z.infer<typeof CalculateRfmInputSchema>
export type CalculateRfmOutput = z.infer<typeof CalculateRfmOutputSchema>

export function validateCalculateRfmInput(input: unknown): CalculateRfmInput {
  return CalculateRfmInputSchema.parse(input)
}

export function validateCalculateRfmOutput(input: unknown): CalculateRfmOutput {
  return CalculateRfmOutputSchema.parse(input)
}
