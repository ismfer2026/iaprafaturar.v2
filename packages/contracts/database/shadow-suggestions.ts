import { z } from 'zod'

export const ApproveShadowSuggestionInputSchema = z.object({
  suggestion_id: z.string().uuid(),
  actual_text: z.string().min(1).max(4096).optional(),
}).strict()

export const RejectShadowSuggestionInputSchema = z.object({
  suggestion_id: z.string().uuid(),
  reason: z.string().max(500).optional(),
}).strict()

export type ApproveShadowSuggestionInput = z.infer<typeof ApproveShadowSuggestionInputSchema>
export type RejectShadowSuggestionInput = z.infer<typeof RejectShadowSuggestionInputSchema>

export function validateApproveShadowSuggestionInput(input: unknown): ApproveShadowSuggestionInput {
  return ApproveShadowSuggestionInputSchema.parse(input)
}

export function validateRejectShadowSuggestionInput(input: unknown): RejectShadowSuggestionInput {
  return RejectShadowSuggestionInputSchema.parse(input)
}
