import { z } from 'zod'

export const PublicQuoteGetContextInputSchema = z.object({
  mode: z.literal('get_context'),
  token: z.string().uuid(),
}).strict()

export const PublicQuoteDecisionInputSchema = z.object({
  mode: z.literal('decide'),
  token: z.string().uuid(),
  decision: z.enum(['approved', 'rejected']),
  signature: z.object({
    typedName: z.string().trim().min(1).optional(),
    acceptedTerms: z.boolean().optional(),
  }).strict().default({}),
}).strict()

export const PublicQuoteHandlerInputSchema = z.discriminatedUnion('mode', [
  PublicQuoteGetContextInputSchema,
  PublicQuoteDecisionInputSchema,
])

export const PublicQuoteErrorOutputSchema = z.object({
  ok: z.literal(false),
  error: z.enum([
    'not_found',
    'expired',
    'already_approved',
    'already_rejected',
    'already_converted',
    'invalid_input',
    'signature_required',
    'rate_limited',
    'internal_error',
  ]),
}).strict()

export type PublicQuoteHandlerInput = z.infer<typeof PublicQuoteHandlerInputSchema>
export type PublicQuoteErrorOutput = z.infer<typeof PublicQuoteErrorOutputSchema>

export function validatePublicQuoteHandlerInput(input: unknown): PublicQuoteHandlerInput {
  return PublicQuoteHandlerInputSchema.parse(input)
}
