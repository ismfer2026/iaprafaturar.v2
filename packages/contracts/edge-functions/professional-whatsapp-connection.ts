import { z } from 'zod'

export const ProfessionalWhatsappProviderSchema = z.enum(['evolution_go', 'meta_waba'])
export const ProfessionalWhatsappConnectionModeSchema = z.enum(['qr', 'pairing_code', 'waba'])
export const ProfessionalWhatsappNumberKindSchema = z.enum(['personal', 'business', 'unknown'])
export const ProfessionalWhatsappStatusSchema = z.enum([
  'disconnected',
  'connecting',
  'connected',
  'error',
])

export const ProfessionalWhatsappConnectionActionSchema = z.enum([
  'start',
  'status',
  'disconnect',
])

export const ProfessionalWhatsappConnectionInputSchema = z.object({
  professional_id: z.string().uuid(),
  action: ProfessionalWhatsappConnectionActionSchema,
  provider: ProfessionalWhatsappProviderSchema,
  connection_mode: ProfessionalWhatsappConnectionModeSchema,
  number_kind: ProfessionalWhatsappNumberKindSchema.optional(),
  phone_number: z.string().min(10).optional(),
  instance_name: z.string().min(1).optional(),
  meta_phone_number_id: z.string().min(1).optional(),
  meta_waba_id: z.string().min(1).optional(),
  dry_run: z.boolean().optional(),
}).strict().superRefine((value, ctx) => {
  if (value.provider === 'meta_waba' && value.connection_mode !== 'waba') {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['connection_mode'],
      message: 'meta_waba provider requires connection_mode waba',
    })
  }

  if (value.provider === 'evolution_go' && value.connection_mode === 'waba') {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['connection_mode'],
      message: 'evolution_go provider supports qr or pairing_code, not waba',
    })
  }

})

export const ProfessionalWhatsappConnectionOutputSchema = z.object({
  professional_id: z.string().uuid(),
  provider: ProfessionalWhatsappProviderSchema,
  connection_mode: ProfessionalWhatsappConnectionModeSchema,
  status: ProfessionalWhatsappStatusSchema,
  is_connected: z.boolean(),
  instance_name: z.string().min(1).nullable(),
  phone_number: z.string().min(10).nullable(),
  number_kind: ProfessionalWhatsappNumberKindSchema.nullable(),
  qr_code: z.string().min(1).nullable().optional(),
  qr_expires_at: z.string().nullable().optional(),
  pairing_code: z.string().min(1).nullable().optional(),
  dry_run: z.boolean().optional(),
  message: z.string().min(1).optional(),
}).strict().superRefine((value, ctx) => {
  if (value.status === 'connected' && !value.is_connected) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['is_connected'],
      message: 'is_connected must be true when status is connected',
    })
  }

  if (value.status !== 'connected' && value.is_connected) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['is_connected'],
      message: 'is_connected must be false unless status is connected',
    })
  }
})

export type ProfessionalWhatsappProvider = z.infer<typeof ProfessionalWhatsappProviderSchema>
export type ProfessionalWhatsappConnectionMode = z.infer<typeof ProfessionalWhatsappConnectionModeSchema>
export type ProfessionalWhatsappNumberKind = z.infer<typeof ProfessionalWhatsappNumberKindSchema>
export type ProfessionalWhatsappStatus = z.infer<typeof ProfessionalWhatsappStatusSchema>
export type ProfessionalWhatsappConnectionAction = z.infer<typeof ProfessionalWhatsappConnectionActionSchema>
export type ProfessionalWhatsappConnectionInput = z.infer<typeof ProfessionalWhatsappConnectionInputSchema>
export type ProfessionalWhatsappConnectionOutput = z.infer<typeof ProfessionalWhatsappConnectionOutputSchema>

export function validateProfessionalWhatsappConnectionInput(
  input: unknown,
): ProfessionalWhatsappConnectionInput {
  return ProfessionalWhatsappConnectionInputSchema.parse(input)
}

export function validateProfessionalWhatsappConnectionOutput(
  input: unknown,
): ProfessionalWhatsappConnectionOutput {
  return ProfessionalWhatsappConnectionOutputSchema.parse(input)
}
