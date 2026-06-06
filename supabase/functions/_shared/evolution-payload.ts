import { z } from 'zod'

import type { SourceWebhook } from '@iaprafaturar/contracts/events/message-events.ts'

export const NormalizedEvolutionMessageSchema = z.object({
  source_webhook: z.enum(['admin', 'professional']),
  instance_name: z.string().min(1),
  external_message_id: z.string().min(1),
  from: z.string().min(8),
  from_me: z.boolean(),
  is_group: z.boolean(),
  is_broadcast: z.boolean(),
  message_type: z.enum(['text', 'audio', 'image', 'document', 'unknown']),
  text: z.string().optional(),
  timestamp: z.string(),
  raw: z.unknown(),
})

export type NormalizedEvolutionMessage = z.infer<typeof NormalizedEvolutionMessageSchema>

type AnyRecord = Record<string, unknown>

function asRecord(value: unknown): AnyRecord {
  return value && typeof value === 'object' ? value as AnyRecord : {}
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

function booleanValue(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined
}

function normalizePhone(jidOrPhone: string): string {
  return jidOrPhone.replace(/@.+$/, '').replace(/\D/g, '')
}

function pickText(data: AnyRecord, message: AnyRecord): string | undefined {
  const direct = stringValue(data.Body) ?? stringValue(data.Text) ?? stringValue(data.Conversation)
  if (direct) return direct

  const conversation = stringValue(message.conversation)
  if (conversation) return conversation

  const extended = asRecord(message.extendedTextMessage)
  return stringValue(extended.text)
}

function pickMessageType(message: AnyRecord, text?: string): NormalizedEvolutionMessage['message_type'] {
  if (text) return 'text'
  if (message.audioMessage) return 'audio'
  if (message.imageMessage) return 'image'
  if (message.documentMessage) return 'document'
  return 'unknown'
}

export function normalizeEvolutionPayload(payload: unknown, sourceWebhook: SourceWebhook): NormalizedEvolutionMessage {
  const root = asRecord(payload)
  const data = asRecord(root.data)
  const info = asRecord(data.Info)
  const key = asRecord(root.key ?? data.key)
  const message = asRecord(root.message ?? data.Message)
  const instanceObject = asRecord(root.instance)

  const rawChat = stringValue(info.Chat) ?? stringValue(key.remoteJid)
  if (!rawChat) throw new Error('Evolution payload missing chat/remoteJid')

  const instanceName =
    stringValue(root.instanceName) ??
    stringValue(root.instance) ??
    stringValue(instanceObject.instanceName) ??
    stringValue(info.Instance)
  if (!instanceName) throw new Error('Evolution payload missing instanceName')

  const externalMessageId = stringValue(info.ID) ?? stringValue(key.id)
  if (!externalMessageId) throw new Error('Evolution payload missing external message id')

  const fromMe = booleanValue(info.FromMe) ?? booleanValue(info.IsFromMe) ?? booleanValue(key.fromMe) ?? false
  const text = pickText(data, message)
  const isGroup = rawChat.endsWith('@g.us')
  const isBroadcast = rawChat === 'status@broadcast' || rawChat.endsWith('@broadcast')

  return NormalizedEvolutionMessageSchema.parse({
    source_webhook: sourceWebhook,
    instance_name: instanceName,
    external_message_id: externalMessageId,
    from: normalizePhone(rawChat),
    from_me: fromMe,
    is_group: isGroup,
    is_broadcast: isBroadcast,
    message_type: pickMessageType(message, text),
    text,
    timestamp: new Date().toISOString(),
    raw: payload,
  })
}