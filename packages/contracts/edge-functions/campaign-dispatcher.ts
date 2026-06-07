import { z } from 'zod'

export const CampaignDispatcherInputSchema = z.object({
  campaign_id: z.string().uuid().optional(),
  professional_id: z.string().uuid().optional(),
  limit: z.number().int().min(1).max(200).optional(),
  dry_run: z.boolean().optional(),
}).strict()

export const CampaignDispatcherOutputSchema = z.object({
  processed_campaigns: z.number().int().nonnegative(),
  queued_or_sent: z.number().int().nonnegative(),
  skipped: z.number().int().nonnegative(),
  failed: z.number().int().nonnegative(),
})

export type CampaignDispatcherInput = z.infer<typeof CampaignDispatcherInputSchema>
export type CampaignDispatcherOutput = z.infer<typeof CampaignDispatcherOutputSchema>

export function validateCampaignDispatcherInput(input: unknown): CampaignDispatcherInput {
  return CampaignDispatcherInputSchema.parse(input)
}

export function validateCampaignDispatcherOutput(input: unknown): CampaignDispatcherOutput {
  return CampaignDispatcherOutputSchema.parse(input)
}
