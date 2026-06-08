import { z } from 'zod'

export const PlatformHealthAgentInputSchema = z.object({
  mode: z.enum(['daily', 'professional', 'trial_watch']).default('daily'),
  professional_id: z.string().uuid().optional(),
  limit: z.number().int().min(1).max(200).optional(),
  cursor: z.string().uuid().nullable().optional(),
  dry_run: z.boolean().optional(),
  persist_snapshot: z.boolean().optional(),
}).strict()

export const PlatformHealthAgentOutputSchema = z.object({
  processed: z.number().int().nonnegative(),
  next_cursor: z.string().uuid().nullable(),
  dry_run: z.boolean(),
  snapshot_persisted: z.boolean(),
})

export type PlatformHealthAgentInput = z.infer<typeof PlatformHealthAgentInputSchema>
export type PlatformHealthAgentOutput = z.infer<typeof PlatformHealthAgentOutputSchema>

export function validatePlatformHealthAgentInput(input: unknown): PlatformHealthAgentInput {
  return PlatformHealthAgentInputSchema.parse(input)
}

export function validatePlatformHealthAgentOutput(input: unknown): PlatformHealthAgentOutput {
  return PlatformHealthAgentOutputSchema.parse(input)
}
