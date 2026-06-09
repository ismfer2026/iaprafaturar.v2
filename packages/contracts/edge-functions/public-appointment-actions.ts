import { z } from 'zod'

export const PublicAppointmentActionsInputSchema = z.discriminatedUnion('mode', [
  z.object({
    mode: z.literal('cancel'),
    appointment_token: z.string().min(10),
    reason: z.string().max(500).optional().nullable(),
  }).strict(),
  z.object({
    mode: z.literal('reschedule'),
    appointment_token: z.string().min(10),
    new_scheduled_at: z.string().datetime({ offset: true }),
  }).strict(),
])

export const PublicAppointmentActionsOutputSchema = z.object({
  ok: z.boolean(),
  appointment_id: z.string().uuid().optional(),
  from_appointment_id: z.string().uuid().optional(),
  status: z.string().optional(),
  error: z.string().optional(),
  window_hours: z.number().optional(),
})

export type PublicAppointmentActionsInput = z.infer<typeof PublicAppointmentActionsInputSchema>
export type PublicAppointmentActionsOutput = z.infer<typeof PublicAppointmentActionsOutputSchema>

export function validatePublicAppointmentActionsInput(input: unknown): PublicAppointmentActionsInput {
  return PublicAppointmentActionsInputSchema.parse(input)
}

export function validatePublicAppointmentActionsOutput(input: unknown): PublicAppointmentActionsOutput {
  return PublicAppointmentActionsOutputSchema.parse(input)
}
