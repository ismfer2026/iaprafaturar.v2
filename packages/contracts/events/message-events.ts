import { z } from 'zod'

export const SourceWebhookSchema = z.enum(['admin', 'professional'])
export const ActorTypeSchema = z.enum([
  'professional',
  'team_member',
  'client',
  'admin',
  'ai',
  'system',
  'cron',
  'integration',
])
export const MessageDirectionSchema = z.enum(['inbound', 'outbound'])
export const MessageChannelSchema = z.enum(['whatsapp', 'instagram', 'messenger', 'email', 'push'])
export const MessageTypeSchema = z.enum(['text', 'audio', 'image', 'document', 'template', 'button', 'unknown'])
export const MessageStatusSchema = z.enum([
  'queued',
  'processing',
  'processed',
  'sent',
  'delivered',
  'read',
  'failed',
  'dead_lettered',
  'dry_run',
  'skipped',
])
export const MessageContextTypeSchema = z.enum([
  'conversation',
  'confirmation',
  'reminder',
  'campaign',
  'follow_up',
  'post_care',
  'reactivation',
  'onboarding',
  'support',
])

export const MessageEventSchema = z.object({
  id: z.string().uuid(),
  professional_id: z.string().uuid().nullable(),
  conversation_id: z.string().uuid().nullable(),
  direction: MessageDirectionSchema,
  channel: MessageChannelSchema,
  message_type: MessageTypeSchema,
  source_webhook: SourceWebhookSchema.nullable(),
  instance_name: z.string().min(1).nullable(),
  content: z.string().nullable(),
  media_url: z.string().url().nullable(),
  media_size_bytes: z.number().int().nonnegative().nullable(),
  sent_by: z.enum(['ai', 'human', 'cron', 'campaign']).nullable(),
  agent_slug: z.string().min(1).nullable(),
  context_type: MessageContextTypeSchema.nullable(),
  external_message_id: z.string().min(1).nullable(),
  status: MessageStatusSchema,
  error_code: z.string().nullable(),
  metadata: z.record(z.unknown()),
  provider_payload: z.record(z.unknown()),
  created_at: z.string(),
  sent_at: z.string().nullable(),
  delivered_at: z.string().nullable(),
  read_at: z.string().nullable(),
})

export type SourceWebhook = z.infer<typeof SourceWebhookSchema>
export type ActorType = z.infer<typeof ActorTypeSchema>
export type MessageDirection = z.infer<typeof MessageDirectionSchema>
export type MessageChannel = z.infer<typeof MessageChannelSchema>
export type MessageType = z.infer<typeof MessageTypeSchema>
export type MessageStatus = z.infer<typeof MessageStatusSchema>
export type MessageContextType = z.infer<typeof MessageContextTypeSchema>
export type MessageEvent = z.infer<typeof MessageEventSchema>

export function validateMessageEvent(input: unknown): MessageEvent {
  return MessageEventSchema.parse(input)
}