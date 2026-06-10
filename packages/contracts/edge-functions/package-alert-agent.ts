import { z } from 'zod'

export const PackageAlertAgentInputSchema = z.object({
  mode: z.enum(['low_balance', 'expiry']),
  limit: z.number().int().positive().max(200).optional(),
  dry_run: z.boolean().optional(),
}).strict()

export const PackageAlertAgentOutputSchema = z.object({
  ok: z.literal(true),
  mode: z.enum(['low_balance', 'expiry']),
  processed: z.number().int().nonnegative(),
  sent: z.number().int().nonnegative(),
  skipped: z.number().int().nonnegative(),
  failed: z.number().int().nonnegative(),
  dry_run: z.boolean(),
})

export type PackageAlertAgentInput = z.infer<typeof PackageAlertAgentInputSchema>
export type PackageAlertAgentOutput = z.infer<typeof PackageAlertAgentOutputSchema>

export function validatePackageAlertAgentInput(input: unknown): PackageAlertAgentInput {
  return PackageAlertAgentInputSchema.parse(input)
}

export function validatePackageAlertAgentOutput(input: unknown): PackageAlertAgentOutput {
  return PackageAlertAgentOutputSchema.parse(input)
}
