import { z } from 'zod'

export const PublicLocaleSchema = z.enum(['pt-BR', 'en-US', 'es-419'])

export const PublicBookingModeSchema = z.enum(['get_context', 'create_appointment', 'complete_client_onboarding'])

export const PublicBookingGetContextInputSchema = z.object({
  mode: z.literal('get_context'),
  slug: z.string().min(1),
  lang: PublicLocaleSchema.optional(),
  ref: z.string().min(1).max(120).optional(),
}).strict()

export const PublicBookingCreateAppointmentInputSchema = z.object({
  mode: z.literal('create_appointment'),
  slug: z.string().min(1),
  service_id: z.string().uuid(),
  scheduled_at: z.string().datetime({ offset: true }),
  full_name: z.string().trim().min(1),
  phone_whatsapp: z.string().min(8),
  email: z.string().email().optional(),
  lang: PublicLocaleSchema.optional(),
  ref: z.string().min(1).max(120).optional(),
}).strict()

export const PublicBookingCompleteClientOnboardingInputSchema = z.object({
  mode: z.literal('complete_client_onboarding'),
  slug: z.string().min(1),
  full_name: z.string().trim().min(1),
  phone_whatsapp: z.string().min(8),
  email: z.string().email().optional(),
  lgpd_accepted: z.literal(true),
  contact_preference: z.enum(['whatsapp', 'email', 'both']).default('whatsapp'),
  reminders_opt_in: z.boolean().default(true),
  lang: PublicLocaleSchema.optional(),
  ref: z.string().min(1).max(120).optional(),
}).strict()

export const PublicBookingHandlerInputSchema = z.discriminatedUnion('mode', [
  PublicBookingGetContextInputSchema,
  PublicBookingCreateAppointmentInputSchema,
  PublicBookingCompleteClientOnboardingInputSchema,
])

export const PublicBookingContextOutputSchema = z.object({
  ok: z.literal(true),
  locale: PublicLocaleSchema,
  ref: z.string().nullable().optional(),
  professional: z.object({
    slug: z.string().min(1),
    public_name: z.string().min(1),
    logo_url: z.string().url().nullable(),
    brand_color: z.string().min(1).nullable(),
  }),
  services: z.array(z.object({
    id: z.string().uuid(),
    name: z.string().min(1),
    description: z.string().nullable().optional(),
    duration_minutes: z.number().int().positive(),
    price: z.number().nonnegative().optional(),
  })),
  available_slots: z.array(z.object({
    scheduled_at: z.string(),
    label: z.string().min(1),
  })),
}).strict()

export const PublicBookingCreateAppointmentOutputSchema = z.object({
  appointment_id: z.string().uuid(),
  client_id: z.string().uuid(),
  registration_session_id: z.string().uuid(),
  confirmation_status: z.enum(['queued', 'sent', 'dry_run', 'skipped_no_professional_instance']),
  dry_run: z.boolean(),
  next_step: z.literal('confirmation_page'),
}).strict()

export const PublicBookingCompleteClientOnboardingOutputSchema = z.object({
  ok: z.literal(true),
  client_id: z.string().uuid(),
  professional_slug: z.string().min(1),
  next_step: z.literal('booking'),
}).strict()

export const PublicBookingErrorOutputSchema = z.object({
  ok: z.literal(false),
  error: z.enum([
    'not_found',
    'invalid_input',
    'service_not_available',
    'scheduled_at_must_be_future',
    'rate_limited',
    'internal_error',
  ]),
  locale: PublicLocaleSchema.optional(),
}).strict()

export type PublicLocale = z.infer<typeof PublicLocaleSchema>
export type PublicBookingMode = z.infer<typeof PublicBookingModeSchema>
export type PublicBookingHandlerInput = z.infer<typeof PublicBookingHandlerInputSchema>
export type PublicBookingContextOutput = z.infer<typeof PublicBookingContextOutputSchema>
export type PublicBookingCreateAppointmentOutput = z.infer<typeof PublicBookingCreateAppointmentOutputSchema>
export type PublicBookingCompleteClientOnboardingOutput = z.infer<typeof PublicBookingCompleteClientOnboardingOutputSchema>
export type PublicBookingErrorOutput = z.infer<typeof PublicBookingErrorOutputSchema>

export function validatePublicBookingHandlerInput(input: unknown): PublicBookingHandlerInput {
  return PublicBookingHandlerInputSchema.parse(input)
}

export function validatePublicBookingContextOutput(input: unknown): PublicBookingContextOutput {
  return PublicBookingContextOutputSchema.parse(input)
}

export function validatePublicBookingCreateAppointmentOutput(
  input: unknown,
): PublicBookingCreateAppointmentOutput {
  return PublicBookingCreateAppointmentOutputSchema.parse(input)
}

export function validatePublicBookingCompleteClientOnboardingOutput(
  input: unknown,
): PublicBookingCompleteClientOnboardingOutput {
  return PublicBookingCompleteClientOnboardingOutputSchema.parse(input)
}
