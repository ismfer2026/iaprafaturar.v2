import { z } from 'zod'

export const QuoteDispatcherInputSchema = z.object({
  mode: z.enum(['expire_quotes', 'followup_quotes']),
  limit: z.number().int().positive().max(200).optional(),
  dry_run: z.boolean().optional(),
}).strict()

export const QuoteDispatcherOutputSchema = z.object({
  ok: z.literal(true),
  mode: z.enum(['expire_quotes', 'followup_quotes']),
  processed: z.number().int().nonnegative(),
  sent: z.number().int().nonnegative(),
  skipped: z.number().int().nonnegative(),
  failed: z.number().int().nonnegative(),
  dry_run: z.boolean(),
})

export type QuoteDispatcherInput = z.infer<typeof QuoteDispatcherInputSchema>
export type QuoteDispatcherOutput = z.infer<typeof QuoteDispatcherOutputSchema>

export function validateQuoteDispatcherInput(input: unknown): QuoteDispatcherInput {
  return QuoteDispatcherInputSchema.parse(input)
}

export function validateQuoteDispatcherOutput(input: unknown): QuoteDispatcherOutput {
  return QuoteDispatcherOutputSchema.parse(input)
}
