import { z } from 'zod'

export const PublicAnamneseLocaleSchema = z.enum(['pt-BR', 'en-US', 'es-419'])
export const PublicAnamneseModeSchema = z.enum(['get_form', 'submit_form'])
export const PublicAnamneseStatusSchema = z.enum(['aguardando', 'preenchido', 'revisado', 'expirado'])

const JsonObjectSchema = z.record(z.unknown())

const PublicAnamneseAssetInputSchema = z.object({
  name: z.string().min(1).max(160),
  type: z.enum(['image/jpeg', 'image/png', 'image/webp']),
  size: z.number().int().positive().max(5 * 1024 * 1024),
  data_url: z.string().min(1),
}).strict()

export const PublicAnamneseGetFormInputSchema = z.object({
  mode: z.literal('get_form'),
  token: z.string().uuid(),
  lang: PublicAnamneseLocaleSchema.optional(),
}).strict()

export const PublicAnamneseSubmitFormInputSchema = z.object({
  mode: z.literal('submit_form'),
  token: z.string().uuid(),
  dados_pessoais: JsonObjectSchema.default({}),
  queixas: JsonObjectSchema.default({}),
  historico: JsonObjectSchema.default({}),
  alergias: JsonObjectSchema.default({}),
  habitos: JsonObjectSchema.default({}),
  custom_data: JsonObjectSchema.default({}),
  fotos: z.array(PublicAnamneseAssetInputSchema).max(4).default([]),
  assinatura_url: z.string().min(1).max(7 * 1024 * 1024).nullable().optional(),
  lgpd_aceito: z.literal(true),
  lang: PublicAnamneseLocaleSchema.optional(),
}).strict()

export const PublicAnamneseHandlerInputSchema = z.discriminatedUnion('mode', [
  PublicAnamneseGetFormInputSchema,
  PublicAnamneseSubmitFormInputSchema,
])

export const PublicAnamneseFormOutputSchema = z.object({
  ok: z.literal(true),
  locale: PublicAnamneseLocaleSchema,
  token: z.string().uuid(),
  status: z.literal('aguardando'),
  expires_at: z.string(),
  professional: z.object({
    public_name: z.string().min(1),
    logo_url: z.string().url().nullable(),
    brand_color: z.string().min(1).nullable(),
  }),
  template_fields: JsonObjectSchema,
  sections: z.object({
    dados_pessoais: JsonObjectSchema,
    queixas: JsonObjectSchema,
    historico: JsonObjectSchema,
    alergias: JsonObjectSchema,
    habitos: JsonObjectSchema,
    custom_data: JsonObjectSchema,
  }),
}).strict()

export const PublicAnamneseSubmitOutputSchema = z.object({
  ok: z.literal(true),
  status: z.literal('preenchido'),
  preenchido_em: z.string(),
}).strict()

export const PublicAnamneseErrorOutputSchema = z.object({
  ok: z.literal(false),
  error: z.enum([
    'not_found',
    'expired',
    'already_completed',
    'lgpd_required',
    'invalid_input',
    'internal_error',
  ]),
  status: PublicAnamneseStatusSchema.optional(),
  locale: PublicAnamneseLocaleSchema.optional(),
}).strict()

export type PublicAnamneseLocale = z.infer<typeof PublicAnamneseLocaleSchema>
export type PublicAnamneseMode = z.infer<typeof PublicAnamneseModeSchema>
export type PublicAnamneseStatus = z.infer<typeof PublicAnamneseStatusSchema>
export type PublicAnamneseHandlerInput = z.infer<typeof PublicAnamneseHandlerInputSchema>
export type PublicAnamneseFormOutput = z.infer<typeof PublicAnamneseFormOutputSchema>
export type PublicAnamneseSubmitOutput = z.infer<typeof PublicAnamneseSubmitOutputSchema>
export type PublicAnamneseErrorOutput = z.infer<typeof PublicAnamneseErrorOutputSchema>

export function validatePublicAnamneseHandlerInput(input: unknown): PublicAnamneseHandlerInput {
  return PublicAnamneseHandlerInputSchema.parse(input)
}

export function validatePublicAnamneseFormOutput(input: unknown): PublicAnamneseFormOutput {
  return PublicAnamneseFormOutputSchema.parse(input)
}

export function validatePublicAnamneseSubmitOutput(input: unknown): PublicAnamneseSubmitOutput {
  return PublicAnamneseSubmitOutputSchema.parse(input)
}
