import { z } from 'zod'

export const AdminAiGatewayInputSchema = z.object({
  mode: z.enum(['panel_chat', 'whatsapp_chat']),
  message: z.string().trim().min(1).max(2000),
  channel: z.enum(['panel', 'whatsapp']).default('panel'),
  message_event_id: z.string().uuid().optional(),
  dry_run: z.boolean().optional(),
}).strict()

export const AdminAiGatewayOutputSchema = z.object({
  reply: z.string(),
  data: z.record(z.unknown()).optional(),
  dry_run: z.boolean(),
})

export type AdminAiGatewayInput = z.infer<typeof AdminAiGatewayInputSchema>
export type AdminAiGatewayOutput = z.infer<typeof AdminAiGatewayOutputSchema>

export function validateAdminAiGatewayInput(input: unknown): AdminAiGatewayInput {
  return AdminAiGatewayInputSchema.parse(input)
}

export function validateAdminAiGatewayOutput(input: unknown): AdminAiGatewayOutput {
  return AdminAiGatewayOutputSchema.parse(input)
}
