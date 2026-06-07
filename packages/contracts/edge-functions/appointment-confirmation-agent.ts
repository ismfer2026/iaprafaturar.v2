import { z } from 'zod'

export const AppointmentConfirmationModeSchema = z.enum(['send_confirmation', 'fallback', 'process_reply'])

export const AppointmentConfirmationAgentInputSchema = z.object({
  mode: AppointmentConfirmationModeSchema,
  appointment_id: z.string().uuid().optional(),
  professional_id: z.string().uuid().optional(),
  message_event_id: z.string().uuid().optional(),
  dry_run: z.boolean().optional(),
}).strict().superRefine((value, ctx) => {
  if (value.mode === 'send_confirmation' && !value.appointment_id) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['appointment_id'],
      message: 'appointment_id is required for send_confirmation',
    })
  }

  if (value.mode === 'process_reply' && !value.message_event_id) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['message_event_id'],
      message: 'message_event_id is required for process_reply',
    })
  }
})

export const AppointmentConfirmationAgentOutputSchema = z.object({
  processed: z.boolean(),
  sent: z.number().int().nonnegative().optional(),
  confirmed: z.boolean().optional(),
  cancelled: z.boolean().optional(),
  skipped_reason: z.string().optional(),
})

export type AppointmentConfirmationMode = z.infer<typeof AppointmentConfirmationModeSchema>
export type AppointmentConfirmationAgentInput = z.infer<typeof AppointmentConfirmationAgentInputSchema>
export type AppointmentConfirmationAgentOutput = z.infer<typeof AppointmentConfirmationAgentOutputSchema>

export function validateAppointmentConfirmationAgentInput(input: unknown): AppointmentConfirmationAgentInput {
  return AppointmentConfirmationAgentInputSchema.parse(input)
}

export function validateAppointmentConfirmationAgentOutput(input: unknown): AppointmentConfirmationAgentOutput {
  return AppointmentConfirmationAgentOutputSchema.parse(input)
}
