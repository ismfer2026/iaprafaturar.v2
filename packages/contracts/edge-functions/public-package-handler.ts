import { z } from 'zod'

export const PublicPackageLocaleSchema = z.enum(['pt-BR', 'en-US', 'es-419'])

export const PublicPackageGetContextInputSchema = z.object({
  mode: z.literal('get_context'),
  slug: z.string().trim().min(1),
  lang: PublicPackageLocaleSchema.optional(),
  ref: z.string().trim().min(1).max(120).optional(),
}).strict()

export const PublicPackageRegisterInterestInputSchema = z.object({
  mode: z.literal('register_interest'),
  slug: z.string().trim().min(1),
  full_name: z.string().trim().min(1),
  phone_whatsapp: z.string().trim().min(8),
  email: z.string().email().optional(),
  lang: PublicPackageLocaleSchema.optional(),
  ref: z.string().trim().min(1).max(120).optional(),
}).strict()

export const PublicPackageHandlerInputSchema = z.discriminatedUnion('mode', [
  PublicPackageGetContextInputSchema,
  PublicPackageRegisterInterestInputSchema,
])

export const PublicPackageErrorOutputSchema = z.object({
  ok: z.literal(false),
  error: z.enum([
    'not_found',
    'invalid_input',
    'rate_limited',
    'internal_error',
  ]),
}).strict()

export type PublicPackageHandlerInput = z.infer<typeof PublicPackageHandlerInputSchema>
export type PublicPackageErrorOutput = z.infer<typeof PublicPackageErrorOutputSchema>

export function validatePublicPackageHandlerInput(input: unknown): PublicPackageHandlerInput {
  return PublicPackageHandlerInputSchema.parse(input)
}
