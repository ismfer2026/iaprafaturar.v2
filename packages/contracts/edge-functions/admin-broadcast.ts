import { z } from 'zod'

export const AdminBroadcastInputSchema = z.object({
  target: z.enum(['all_professionals', 'risk_professionals', 'trial_professionals']).default('risk_professionals'),
  message: z.string().trim().min(1).max(2000),
  limit: z.number().int().min(1).max(200).optional(),
  dry_run: z.boolean().optional(),
}).strict()

export const AdminBroadcastOutputSchema = z.object({
  selected: z.number().int().nonnegative(),
  sent_or_dry_run: z.number().int().nonnegative(),
  skipped: z.number().int().nonnegative(),
  dry_run: z.boolean(),
  reason: z.string().optional(),
})

export type AdminBroadcastInput = z.infer<typeof AdminBroadcastInputSchema>
export type AdminBroadcastOutput = z.infer<typeof AdminBroadcastOutputSchema>

export function validateAdminBroadcastInput(input: unknown): AdminBroadcastInput {
  return AdminBroadcastInputSchema.parse(input)
}

export function validateAdminBroadcastOutput(input: unknown): AdminBroadcastOutput {
  return AdminBroadcastOutputSchema.parse(input)
}
