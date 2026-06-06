import { z } from 'zod'

import { ActorTypeSchema, SourceWebhookSchema } from '../events/message-events.ts'

export const SendMessageInputSchema = z.object({
  source_webhook: SourceWebhookSchema,
  professional_id: z.string().uuid().optional().nullable(),
  instance_name: z.string().min(1),
  to: z.string().min(10),
  text: z.string().min(1).max(4096),
  actor_type: ActorTypeSchema,
  agent_slug: z.string().min(1).optional(),
  dry_run: z.boolean().optional(),
}).strict().superRefine((value, ctx) => {
  if (value.actor_type === 'ai' && !value.agent_slug) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['agent_slug'],
      message: 'agent_slug is required when actor_type is ai',
    })
  }

  if (value.actor_type !== 'ai' && value.agent_slug) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['agent_slug'],
      message: 'agent_slug is only allowed when actor_type is ai',
    })
  }
})

export const SendMessageDryRunOutputSchema = z.object({
  dry_run: z.literal(true),
  would_send: z.object({
    instance_name: z.string().min(1),
    to: z.string().min(10),
    text: z.string().min(1),
  }),
})

export type SendMessageInput = z.infer<typeof SendMessageInputSchema>
export type SendMessageDryRunOutput = z.infer<typeof SendMessageDryRunOutputSchema>

export function validateSendMessageInput(input: unknown): SendMessageInput {
  return SendMessageInputSchema.parse(input)
}

export function validateSendMessageDryRunOutput(input: unknown): SendMessageDryRunOutput {
  return SendMessageDryRunOutputSchema.parse(input)
}