import { z } from 'zod'

export const PublicCreateAccountLocaleSchema = z.enum(['pt-BR', 'en-US', 'es-419'])

export const PublicCreateAccountGetStatusInputSchema = z.object({
  mode: z.literal('get_status'),
  professional_id: z.string().uuid(),
  email: z.string().email(),
  lang: PublicCreateAccountLocaleSchema.optional(),
}).strict()

export const PublicCreateAccountCreatePreaccountInputSchema = z.object({
  mode: z.literal('create_preaccount'),
  email: z.string().email(),
  name: z.string().trim().min(1).max(160).optional(),
  phone_whatsapp: z.string().min(8).max(32).optional(),
  ref: z.string().min(1).max(120).optional(),
  lang: PublicCreateAccountLocaleSchema.optional(),
  conversation: z.string().min(1).max(160).optional(),
  collected_data: z.record(z.unknown()).optional(),
}).strict()

export const PublicCreateAccountCompleteInputSchema = z.object({
  mode: z.literal('complete_account'),
  professional_id: z.string().uuid(),
  email: z.string().email(),
  password: z.string().min(8).max(128),
  lang: PublicCreateAccountLocaleSchema.optional(),
}).strict()

export const PublicCreateAccountInputSchema = z.discriminatedUnion('mode', [
  PublicCreateAccountGetStatusInputSchema,
  PublicCreateAccountCreatePreaccountInputSchema,
  PublicCreateAccountCompleteInputSchema,
])

export const PublicCreateAccountErrorSchema = z.enum([
  'invalid_input',
  'pre_account_not_found',
  'email_already_registered',
  'identity_integrity_incident',
  'invalid_professional_id',
  'invalid_email',
  'weak_password',
  'internal_error',
])

export const PublicCreateAccountStatusOutputSchema = z.object({
  ok: z.literal(true),
  professional_id: z.string().uuid(),
  email: z.string().email(),
  status: z.enum(['pending', 'registered']),
  onboarding_pending: z.boolean(),
  lang: PublicCreateAccountLocaleSchema,
  ref: z.string().nullable(),
  conversation: z.string().nullable(),
}).strict()

export const PublicCreateAccountPreaccountOutputSchema = z.object({
  ok: z.literal(true),
  professional_id: z.string().uuid(),
  email: z.string().email(),
  status: z.enum(['created', 'existing_pending']),
}).strict()

export const PublicCreateAccountCompleteOutputSchema = z.object({
  ok: z.literal(true),
  professional_id: z.string().uuid(),
  auth_user_id: z.string().uuid(),
  email: z.string().email(),
}).strict()

export const PublicCreateAccountErrorOutputSchema = z.object({
  ok: z.literal(false),
  error: PublicCreateAccountErrorSchema,
}).strict()

export type PublicCreateAccountInput = z.infer<typeof PublicCreateAccountInputSchema>
export type PublicCreateAccountStatusOutput = z.infer<typeof PublicCreateAccountStatusOutputSchema>
export type PublicCreateAccountPreaccountOutput = z.infer<typeof PublicCreateAccountPreaccountOutputSchema>
export type PublicCreateAccountCompleteOutput = z.infer<typeof PublicCreateAccountCompleteOutputSchema>
export type PublicCreateAccountErrorOutput = z.infer<typeof PublicCreateAccountErrorOutputSchema>

export function validatePublicCreateAccountInput(input: unknown): PublicCreateAccountInput {
  return PublicCreateAccountInputSchema.parse(input)
}
