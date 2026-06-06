import { z } from 'zod'

export const EvolutionGoInfoSchema = z.object({
  Chat: z.string().min(1),
  ID: z.string().optional().nullable(),
  IsFromMe: z.boolean().optional(),
  FromMe: z.boolean().optional(),
  Instance: z.string().optional().nullable(),
}).passthrough()

export const WebhookAdminInputSchema = z.object({
  event: z.string().optional(),
  instance: z.union([
    z.string(),
    z.object({ instanceName: z.string().optional() }).passthrough(),
  ]).optional(),
  instanceName: z.string().optional(),
  data: z.object({
    Info: EvolutionGoInfoSchema.optional(),
    Message: z.unknown().optional(),
    Body: z.string().optional(),
    Text: z.string().optional(),
    Conversation: z.string().optional(),
    key: z.unknown().optional(),
    messages: z.array(z.unknown()).optional(),
  }).passthrough().optional(),
  key: z.object({
    remoteJid: z.string(),
    fromMe: z.boolean().optional(),
    id: z.string().optional(),
  }).passthrough().optional(),
  message: z.unknown().optional(),
}).passthrough()

export type WebhookAdminInput = z.infer<typeof WebhookAdminInputSchema>

export function validateWebhookAdminInput(input: unknown): WebhookAdminInput {
  return WebhookAdminInputSchema.parse(input)
}
