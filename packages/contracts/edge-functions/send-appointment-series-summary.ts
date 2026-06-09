import { z } from 'zod'

export const SendAppointmentSeriesSummaryInputSchema = z.object({
  series_id: z.string().uuid(),
  dry_run: z.boolean().optional(),
}).strict()

export const SendAppointmentSeriesSummaryOutputSchema = z.object({
  sent: z.boolean(),
  dry_run: z.boolean(),
  series_id: z.string().uuid(),
  message_event_id: z.string().uuid().optional(),
  skipped_reason: z.string().optional(),
})

export type SendAppointmentSeriesSummaryInput = z.infer<typeof SendAppointmentSeriesSummaryInputSchema>
export type SendAppointmentSeriesSummaryOutput = z.infer<typeof SendAppointmentSeriesSummaryOutputSchema>

export function validateSendAppointmentSeriesSummaryInput(input: unknown): SendAppointmentSeriesSummaryInput {
  return SendAppointmentSeriesSummaryInputSchema.parse(input)
}

export function validateSendAppointmentSeriesSummaryOutput(input: unknown): SendAppointmentSeriesSummaryOutput {
  return SendAppointmentSeriesSummaryOutputSchema.parse(input)
}
