import { z } from 'zod'

export const PosAtendimentoModeSchema = z.enum(['followup', 'nps_reply', 'd1'])

export const PosAtendimentoAgentInputSchema = z.object({
  mode: PosAtendimentoModeSchema,
  professional_id: z.string().uuid().optional(),
  session_id: z.string().uuid().optional(),
  message_event_id: z.string().uuid().optional(),
  dry_run: z.boolean().optional(),
}).strict().superRefine((value, ctx) => {
  if (value.mode === 'nps_reply' && !value.message_event_id) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['message_event_id'],
      message: 'message_event_id is required for nps_reply',
    })
  }
})

export const PosAtendimentoAgentOutputSchema = z.object({
  processed: z.boolean(),
  nps_captured: z.boolean().optional(),
  skipped_reason: z.string().optional(),
})

export type PosAtendimentoMode = z.infer<typeof PosAtendimentoModeSchema>
export type PosAtendimentoAgentInput = z.infer<typeof PosAtendimentoAgentInputSchema>
export type PosAtendimentoAgentOutput = z.infer<typeof PosAtendimentoAgentOutputSchema>

export function validatePosAtendimentoAgentInput(input: unknown): PosAtendimentoAgentInput {
  return PosAtendimentoAgentInputSchema.parse(input)
}

export function validatePosAtendimentoAgentOutput(input: unknown): PosAtendimentoAgentOutput {
  return PosAtendimentoAgentOutputSchema.parse(input)
}
