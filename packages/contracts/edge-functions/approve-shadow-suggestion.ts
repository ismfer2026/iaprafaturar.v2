import { z } from 'zod'

export const ApproveShadowSuggestionFunctionInputSchema = z.object({
  suggestion_id: z.string().uuid(),
  actual_text: z.string().min(1).max(4096).optional(),
  dry_run: z.boolean().optional(),
}).strict()

export const ApproveShadowSuggestionFunctionOutputSchema = z.object({
  approved: z.boolean(),
  sent: z.boolean().optional(),
  dry_run: z.boolean(),
  suggestion_id: z.string().uuid(),
  conversation_id: z.string().uuid().nullable().optional(),
  message_event_id: z.string().uuid().nullable().optional(),
  skipped_reason: z.string().optional(),
})

export type ApproveShadowSuggestionFunctionInput = z.infer<typeof ApproveShadowSuggestionFunctionInputSchema>
export type ApproveShadowSuggestionFunctionOutput = z.infer<typeof ApproveShadowSuggestionFunctionOutputSchema>

export function validateApproveShadowSuggestionFunctionInput(input: unknown): ApproveShadowSuggestionFunctionInput {
  return ApproveShadowSuggestionFunctionInputSchema.parse(input)
}

export function validateApproveShadowSuggestionFunctionOutput(input: unknown): ApproveShadowSuggestionFunctionOutput {
  return ApproveShadowSuggestionFunctionOutputSchema.parse(input)
}
