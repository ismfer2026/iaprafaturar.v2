import { z } from 'zod'

export const ClientPortalLocaleSchema = z.enum(['pt-BR', 'en-US', 'es-419'])

export const ClientPortalStartSessionInputSchema = z.object({
  mode: z.literal('start_session'),
  slug: z.string().min(1),
  full_name: z.string().trim().min(1),
  phone_whatsapp: z.string().min(8),
  email: z.string().email().optional(),
  lgpd_accepted: z.literal(true),
  lang: ClientPortalLocaleSchema.optional(),
}).strict()

export const ClientPortalTokenInputSchema = z.object({
  session_token: z.string().min(20),
}).strict()

export const ClientPortalGetContextInputSchema = ClientPortalTokenInputSchema.extend({
  mode: z.literal('get_context'),
  lang: ClientPortalLocaleSchema.optional(),
}).strict()

export const ClientPortalUpdateProfileInputSchema = ClientPortalTokenInputSchema.extend({
  mode: z.literal('update_profile'),
  full_name: z.string().trim().min(1),
  email: z.string().email().optional(),
  contact_preference: z.enum(['whatsapp', 'email', 'both']).default('whatsapp'),
  reminders_opt_in: z.boolean().default(true),
}).strict()

export const ClientPortalCompleteOnboardingInputSchema = ClientPortalUpdateProfileInputSchema.extend({
  mode: z.literal('complete_onboarding'),
  lgpd_accepted: z.literal(true),
}).strict()

export const ClientPortalGetHistoryInputSchema = ClientPortalTokenInputSchema.extend({
  mode: z.literal('get_history'),
  limit: z.number().int().min(1).max(50).optional(),
  cursor: z.string().datetime({ offset: true }).optional(),
}).strict()

export const ClientPortalGetPackagesInputSchema = ClientPortalTokenInputSchema.extend({
  mode: z.literal('get_packages'),
}).strict()

export const ClientPortalGetBookingContextInputSchema = ClientPortalTokenInputSchema.extend({
  mode: z.literal('get_booking_context'),
  lang: ClientPortalLocaleSchema.optional(),
}).strict()

export const ClientPortalCreateAppointmentInputSchema = ClientPortalTokenInputSchema.extend({
  mode: z.literal('create_appointment'),
  service_id: z.string().uuid(),
  scheduled_at: z.string().datetime({ offset: true }),
  use_client_package_id: z.string().uuid().optional().nullable(),
}).strict()

export const ClientPortalCancelAppointmentInputSchema = ClientPortalTokenInputSchema.extend({
  mode: z.literal('cancel_appointment'),
  appointment_id: z.string().uuid(),
  reason: z.string().max(500).optional().nullable(),
}).strict()

export const ClientPortalRescheduleAppointmentInputSchema = ClientPortalTokenInputSchema.extend({
  mode: z.literal('reschedule_appointment'),
  appointment_id: z.string().uuid(),
  new_scheduled_at: z.string().datetime({ offset: true }),
}).strict()

export const ClientPortalLogoutInputSchema = ClientPortalTokenInputSchema.extend({
  mode: z.literal('logout'),
}).strict()

export const ClientPortalHandlerInputSchema = z.discriminatedUnion('mode', [
  ClientPortalStartSessionInputSchema,
  ClientPortalGetContextInputSchema,
  ClientPortalUpdateProfileInputSchema,
  ClientPortalCompleteOnboardingInputSchema,
  ClientPortalGetHistoryInputSchema,
  ClientPortalGetPackagesInputSchema,
  ClientPortalGetBookingContextInputSchema,
  ClientPortalCreateAppointmentInputSchema,
  ClientPortalCancelAppointmentInputSchema,
  ClientPortalRescheduleAppointmentInputSchema,
  ClientPortalLogoutInputSchema,
])

export const ClientPortalProfessionalSchema = z.object({
  slug: z.string().min(1),
  public_name: z.string().min(1),
  logo_url: z.string().url().nullable(),
  brand_color: z.string().min(1).nullable(),
}).passthrough()

export const ClientPortalClientSchema = z.object({
  id: z.string().uuid(),
  full_name: z.string().min(1),
  phone_whatsapp: z.string().nullable().optional(),
  email: z.string().nullable().optional(),
  pwa_onboarded_at: z.string().nullable().optional(),
  lgpd_consent_at: z.string().nullable().optional(),
  onboarding_required: z.boolean().optional(),
}).passthrough()

export const ClientPortalAppointmentSchema = z.object({
  id: z.string().uuid(),
  service_id: z.string().uuid().nullable().optional(),
  service_name: z.string().nullable().optional(),
  scheduled_at: z.string(),
  duration_minutes: z.number().int().positive(),
  status: z.string(),
  can_cancel: z.boolean().optional(),
  can_reschedule: z.boolean().optional(),
}).passthrough()

export const ClientPortalPackageSchema = z.object({
  id: z.string().uuid(),
  service_package_id: z.string().uuid(),
  name: z.string().min(1),
  slug: z.string().nullable().optional(),
  sessions_total: z.number().int().positive(),
  sessions_used: z.number().int().nonnegative(),
  sessions_remaining: z.number().int().nonnegative(),
  purchased_at: z.string(),
  expires_at: z.string().nullable(),
  status: z.string(),
}).passthrough()

export const ClientPortalHistoryItemSchema = z.object({
  id: z.string().uuid(),
  session_date: z.string(),
  service_name: z.string().nullable().optional(),
  status: z.string(),
  summary: z.string().nullable(),
}).passthrough()

export const ClientPortalStartSessionOutputSchema = z.object({
  ok: z.literal(true),
  session_token: z.string().min(20),
  expires_at: z.string(),
  professional: ClientPortalProfessionalSchema,
  client: ClientPortalClientSchema,
  next_step: z.literal('portal'),
}).passthrough()

export const ClientPortalContextOutputSchema = z.object({
  ok: z.literal(true),
  locale: ClientPortalLocaleSchema,
  professional: ClientPortalProfessionalSchema,
  client: ClientPortalClientSchema,
  next_appointment: ClientPortalAppointmentSchema.nullable(),
  packages_summary: z.object({
    active_count: z.number().int().nonnegative(),
    total_remaining: z.number().int().nonnegative(),
  }).passthrough(),
  session: z.object({
    expires_at: z.string(),
  }).passthrough(),
}).passthrough()

export const ClientPortalHistoryOutputSchema = z.object({
  ok: z.literal(true),
  items: z.array(ClientPortalHistoryItemSchema),
  next_cursor: z.string().nullable().optional(),
}).passthrough()

export const ClientPortalPackagesOutputSchema = z.object({
  ok: z.literal(true),
  items: z.array(ClientPortalPackageSchema),
}).passthrough()

export const ClientPortalBookingContextOutputSchema = z.object({
  ok: z.literal(true),
  locale: ClientPortalLocaleSchema,
  services: z.array(z.object({
    id: z.string().uuid(),
    name: z.string().min(1),
    description: z.string().nullable().optional(),
    duration_minutes: z.number().int().positive(),
    price: z.number().nonnegative().optional(),
  }).passthrough()),
  available_slots: z.array(z.object({
    scheduled_at: z.string(),
    label: z.string().min(1),
  }).passthrough()),
}).passthrough()

export const ClientPortalMutationOutputSchema = z.object({
  ok: z.boolean(),
  appointment_id: z.string().uuid().optional(),
  from_appointment_id: z.string().uuid().optional(),
  client_id: z.string().uuid().optional(),
  status: z.string().optional(),
  next_step: z.string().optional(),
  error: z.string().optional(),
  window_hours: z.number().optional(),
}).passthrough()

export const ClientPortalErrorOutputSchema = z.object({
  ok: z.literal(false),
  error: z.enum([
    'invalid_input',
    'invalid_session',
    'session_expired',
    'not_found',
    'lgpd_required',
    'service_not_available',
    'scheduled_at_must_be_future',
    'slot_unavailable',
    'package_not_available',
    'appointment_not_found',
    'rate_limited',
    'already_cancelled',
    'invalid_status',
    'window_closed',
    'internal_error',
  ]),
  locale: ClientPortalLocaleSchema.optional(),
}).passthrough()

export type ClientPortalHandlerInput = z.infer<typeof ClientPortalHandlerInputSchema>
export type ClientPortalStartSessionOutput = z.infer<typeof ClientPortalStartSessionOutputSchema>
export type ClientPortalContextOutput = z.infer<typeof ClientPortalContextOutputSchema>
export type ClientPortalHistoryOutput = z.infer<typeof ClientPortalHistoryOutputSchema>
export type ClientPortalPackagesOutput = z.infer<typeof ClientPortalPackagesOutputSchema>
export type ClientPortalBookingContextOutput = z.infer<typeof ClientPortalBookingContextOutputSchema>
export type ClientPortalMutationOutput = z.infer<typeof ClientPortalMutationOutputSchema>
export type ClientPortalErrorOutput = z.infer<typeof ClientPortalErrorOutputSchema>

export function validateClientPortalHandlerInput(input: unknown): ClientPortalHandlerInput {
  return ClientPortalHandlerInputSchema.parse(input)
}

export function validateClientPortalStartSessionOutput(input: unknown): ClientPortalStartSessionOutput {
  return ClientPortalStartSessionOutputSchema.parse(input)
}

export function validateClientPortalContextOutput(input: unknown): ClientPortalContextOutput {
  return ClientPortalContextOutputSchema.parse(input)
}

export function validateClientPortalHistoryOutput(input: unknown): ClientPortalHistoryOutput {
  return ClientPortalHistoryOutputSchema.parse(input)
}

export function validateClientPortalPackagesOutput(input: unknown): ClientPortalPackagesOutput {
  return ClientPortalPackagesOutputSchema.parse(input)
}

export function validateClientPortalBookingContextOutput(input: unknown): ClientPortalBookingContextOutput {
  return ClientPortalBookingContextOutputSchema.parse(input)
}

export function validateClientPortalMutationOutput(input: unknown): ClientPortalMutationOutput {
  return ClientPortalMutationOutputSchema.parse(input)
}
