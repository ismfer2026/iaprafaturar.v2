import { z } from 'zod'

export const NerissaSetupAgentModeSchema = z.enum([
  'account_created',
  'reply',
  'status',
  'resume_due_followups',
])

export const NerissaSetupAgentInputSchema = z.object({
  professional_id: z.string().uuid(),
  mode: NerissaSetupAgentModeSchema,
  message: z.string().min(1).max(4096).optional(),
  message_event_id: z.string().uuid().optional(),
  dry_run: z.boolean().optional(),
}).strict().superRefine((value, ctx) => {
  if (value.mode === 'reply' && !value.message && !value.message_event_id) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['message'],
      message: 'message or message_event_id is required when mode is reply',
    })
  }
})

export const NerissaSetupAgentOutputSchema = z.object({
  response_text: z.string().min(1).max(4096),
  next_step: z.string().min(1).optional(),
  completed: z.boolean().optional(),
  dry_run: z.boolean().optional(),
}).strict()

export type NerissaSetupAgentMode = z.infer<typeof NerissaSetupAgentModeSchema>
export type NerissaSetupAgentInput = z.infer<typeof NerissaSetupAgentInputSchema>
export type NerissaSetupAgentOutput = z.infer<typeof NerissaSetupAgentOutputSchema>

export function validateNerissaSetupAgentInput(input: unknown): NerissaSetupAgentInput {
  return NerissaSetupAgentInputSchema.parse(input)
}

export function validateNerissaSetupAgentOutput(input: unknown): NerissaSetupAgentOutput {
  return NerissaSetupAgentOutputSchema.parse(input)
}
