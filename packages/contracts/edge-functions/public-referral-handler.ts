import { z } from 'zod'

export const PublicReferralLocaleSchema = z.enum(['pt-BR', 'en-US', 'es-419'])

export const PublicReferralResolveInputSchema = z.object({
  mode: z.literal('resolve'),
  code: z.string().trim().min(1).max(120),
  lang: PublicReferralLocaleSchema.optional(),
}).strict()

export const PublicReferralSubmitLeadInputSchema = z.object({
  mode: z.literal('submit_lead'),
  code: z.string().trim().min(1).max(120),
  full_name: z.string().trim().min(1).max(160),
  phone_whatsapp: z.string().trim().min(8).max(32),
  email: z.string().trim().email().max(180).optional(),
  note: z.string().trim().max(500).optional(),
  lgpd_accepted: z.literal(true),
  lang: PublicReferralLocaleSchema.optional(),
}).strict()

export const PublicReferralWebChatInputSchema = z.object({
  mode: z.literal('web_chat'),
  code: z.string().trim().min(1).max(120),
  message: z.string().trim().min(1).max(2000),
  conversation: z.array(z.object({
    role: z.string().min(1),
    content: z.string().min(1),
  })).max(40).optional(),
  collected_data: z.record(z.unknown()).optional(),
  locale: PublicReferralLocaleSchema.optional(),
}).strict()

export const PublicReferralHandlerInputSchema = z.discriminatedUnion('mode', [
  PublicReferralResolveInputSchema,
  PublicReferralSubmitLeadInputSchema,
  PublicReferralWebChatInputSchema,
])

export const PublicReferralResolveOutputSchema = z.object({
  ok: z.literal(true),
  code: z.string().min(1),
  locale: PublicReferralLocaleSchema,
  professional: z.object({
    slug: z.string().min(1),
    public_name: z.string().min(1),
  }),
  next_step: z.literal('lead_form'),
}).strict()

export const PublicReferralSubmitLeadOutputSchema = z.object({
  ok: z.literal(true),
  client_id: z.string().uuid(),
  referral_event_id: z.string().uuid(),
  next_step: z.literal('received'),
}).strict()

export const PublicReferralWebChatOutputSchema = z.object({
  ok: z.literal(true),
  reply: z.string().min(1),
  collected_data: z.record(z.unknown()),
  is_complete: z.boolean(),
  client_id: z.string().uuid().optional(),
  referral_event_id: z.string().uuid().optional(),
}).strict()

export const PublicReferralErrorOutputSchema = z.object({
  ok: z.literal(false),
  error: z.enum(['not_found', 'invalid_input', 'rate_limited', 'internal_error']),
  locale: PublicReferralLocaleSchema.optional(),
}).strict()

export type PublicReferralHandlerInput = z.infer<typeof PublicReferralHandlerInputSchema>
export type PublicReferralResolveOutput = z.infer<typeof PublicReferralResolveOutputSchema>
export type PublicReferralSubmitLeadOutput = z.infer<typeof PublicReferralSubmitLeadOutputSchema>
export type PublicReferralWebChatOutput = z.infer<typeof PublicReferralWebChatOutputSchema>
export type PublicReferralErrorOutput = z.infer<typeof PublicReferralErrorOutputSchema>

export function validatePublicReferralHandlerInput(input: unknown): PublicReferralHandlerInput {
  return PublicReferralHandlerInputSchema.parse(input)
}

export function validatePublicReferralResolveOutput(input: unknown): PublicReferralResolveOutput {
  return PublicReferralResolveOutputSchema.parse(input)
}

export function validatePublicReferralSubmitLeadOutput(input: unknown): PublicReferralSubmitLeadOutput {
  return PublicReferralSubmitLeadOutputSchema.parse(input)
}

export function validatePublicReferralWebChatOutput(input: unknown): PublicReferralWebChatOutput {
  return PublicReferralWebChatOutputSchema.parse(input)
}
