import {
  validatePosAtendimentoAgentInput,
  validatePosAtendimentoAgentOutput,
} from '@iaprafaturar/contracts/edge-functions/pos-atendimento-agent.ts'
import type { SupabaseClient } from '@supabase/supabase-js'

import { startAgentExecution, completeAgentExecution } from '../_shared/agent-executions.ts'
import {
  createConversationContext,
  getActiveConversationContext,
  resolveOrCreateWhatsappConversation,
} from '../_shared/appointment-context.ts'
import { isDryRun } from '../_shared/dry-run.ts'
import { jsonResponse } from '../_shared/http.ts'
import { claimIdempotency } from '../_shared/idempotency.ts'
import { assertInternalAuth } from '../_shared/internal-auth.ts'
import { getConnectedProfessionalWhatsappInstance } from '../_shared/professional-instance.ts'
import { getPostCareConfig, getRosaneAgentConfig } from '../_shared/rosane-agent-config.ts'
import { sendMessageCore } from '../_shared/send-message-core.ts'
import { createServiceClient } from '../_shared/supabase.ts'

const AGENT_SLUG = 'pos-atendimento-agent'

interface SessionRow {
  id: string
  professional_id: string
  client_id: string
  service_id: string | null
  session_date: string
  followup_sent_at: string | null
  nps_requested_at: string | null
}

interface ClientRow {
  id: string
  full_name: string
  phone_whatsapp: string | null
}

interface ServiceRow {
  id: string
  name: string
}

function saoPauloYesterdayBounds(): { start: string; end: string } {
  const now = new Date()
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
  const parts = formatter.formatToParts(now)
  const year = Number(parts.find((part) => part.type === 'year')?.value)
  const month = Number(parts.find((part) => part.type === 'month')?.value)
  const day = Number(parts.find((part) => part.type === 'day')?.value)

  const start = new Date(Date.UTC(year, month - 1, day - 1, 3, 0, 0))
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000)

  return { start: start.toISOString(), end: end.toISOString() }
}

function parseNpsScore(text: string | null | undefined): number | null {
  const match = String(text ?? '').match(/\b([1-5])\b/)
  if (!match) return null
  return Number(match[1])
}

function buildFollowupText(input: {
  assistantName: string
  clientName: string
  serviceName?: string | null
}): string {
  const serviceText = input.serviceName ? ` sobre ${input.serviceName}` : ''
  return [
    `Ola, ${input.clientName}. Aqui e ${input.assistantName}.`,
    '',
    `Como voce ficou depois do atendimento${serviceText}?`,
    '',
    'De 1 a 5, que nota voce da para sua experiencia?',
  ].join('\n')
}

function buildThanksText(input: {
  assistantName: string
  score: number
  googleReviewUrl: string | null
}): string {
  if (input.score >= 4 && input.googleReviewUrl) {
    return [
      `Obrigada pela sua resposta. Aqui e ${input.assistantName}.`,
      '',
      'Ficamos felizes que sua experiencia foi positiva.',
      '',
      `Se puder deixar uma avaliacao publica, este e o link: ${input.googleReviewUrl}`,
    ].join('\n')
  }

  if (input.score >= 4) {
    return `Obrigada pela sua resposta. Aqui e ${input.assistantName}. Ficamos felizes que sua experiencia foi positiva.`
  }

  return `Obrigada por responder. Aqui e ${input.assistantName}. Vou sinalizar seu retorno para o profissional acompanhar com atencao.`
}

async function loadClientAndService(
  supabase: SupabaseClient,
  session: SessionRow,
): Promise<{ client: ClientRow; service: ServiceRow | null }> {
  const { data: client, error: clientError } = await supabase
    .from('clients')
    .select('id, full_name, phone_whatsapp')
    .eq('id', session.client_id)
    .eq('professional_id', session.professional_id)
    .is('deleted_at', null)
    .single()

  if (clientError) throw clientError

  let service: ServiceRow | null = null
  if (session.service_id) {
    const { data, error } = await supabase
      .from('services')
      .select('id, name')
      .eq('id', session.service_id)
      .eq('professional_id', session.professional_id)
      .is('deleted_at', null)
      .maybeSingle()

    if (error) throw error
    service = data as ServiceRow | null
  }

  return { client: client as ClientRow, service }
}

async function selectSessions(
  supabase: SupabaseClient,
  input: { professionalId?: string; sessionId?: string },
): Promise<SessionRow[]> {
  let query = supabase
    .from('sessions')
    .select('id, professional_id, client_id, service_id, session_date, followup_sent_at, nps_requested_at')
    .is('deleted_at', null)
    .is('followup_sent_at', null)
    .is('nps_requested_at', null)
    .order('session_date', { ascending: true })
    .limit(50)

  if (input.sessionId) {
    query = query.eq('id', input.sessionId)
  } else {
    const bounds = saoPauloYesterdayBounds()
    query = query.gte('session_date', bounds.start).lt('session_date', bounds.end)
  }

  if (input.professionalId) {
    query = query.eq('professional_id', input.professionalId)
  }

  const { data, error } = await query
  if (error) throw error
  return (data ?? []) as SessionRow[]
}

async function sendFollowup(
  supabase: SupabaseClient,
  session: SessionRow,
  dryRun: boolean,
): Promise<'sent' | 'skipped'> {
  const { client, service } = await loadClientAndService(supabase, session)
  if (!client.phone_whatsapp) return 'skipped'

  const instance = await getConnectedProfessionalWhatsappInstance(supabase, session.professional_id)
  if (!instance) return 'skipped'

  const baseKey = `${AGENT_SLUG}:session:${session.id}:followup`
  const claim = await claimIdempotency(
    supabase,
    dryRun ? `dry-run:${baseKey}:${crypto.randomUUID()}` : baseKey,
    { session_id: session.id, dry_run: dryRun },
  )
  if (!claim.claimed) return 'skipped'

  const config = await getRosaneAgentConfig(supabase, session.professional_id)
  const conversation = await resolveOrCreateWhatsappConversation(supabase, {
    professionalId: session.professional_id,
    clientId: client.id,
    phone: client.phone_whatsapp,
    preview: 'pos-atendimento',
  })

  await createConversationContext(supabase, {
    professionalId: session.professional_id,
    conversationId: conversation.id,
    clientId: client.id,
    contextType: 'post_care',
    sourceFunction: AGENT_SLUG,
    refType: 'session',
    refId: session.id,
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    metadata: { mode: 'nps' },
  })

  await sendMessageCore(supabase, {
    source_webhook: 'professional',
    professional_id: session.professional_id,
    instance_name: instance.instanceName,
    to: client.phone_whatsapp,
    text: buildFollowupText({
      assistantName: config.agentName,
      clientName: client.full_name,
      serviceName: service?.name ?? null,
    }),
    actor_type: 'ai',
    agent_slug: AGENT_SLUG,
    dry_run: dryRun,
  })

  if (!dryRun) {
    const { error } = await supabase
      .from('sessions')
      .update({
        followup_sent_at: new Date().toISOString(),
        nps_requested_at: new Date().toISOString(),
      })
      .eq('id', session.id)
      .eq('professional_id', session.professional_id)

    if (error) throw error
  }

  return 'sent'
}

async function captureNpsReply(
  supabase: SupabaseClient,
  messageEventId: string,
  dryRun: boolean,
): Promise<{ captured: boolean; skippedReason?: string }> {
  const { data: messageEvent, error } = await supabase
    .from('message_events')
    .select('id, professional_id, conversation_id, client_id, content')
    .eq('id', messageEventId)
    .eq('source_webhook', 'professional')
    .eq('direction', 'inbound')
    .single()

  if (error) throw error
  if (!messageEvent.professional_id || !messageEvent.conversation_id) {
    return { captured: false, skippedReason: 'missing_message_context' }
  }

  const score = parseNpsScore(messageEvent.content)
  if (!score) return { captured: false, skippedReason: 'nps_score_not_found' }

  const context = await getActiveConversationContext(supabase, {
    professionalId: messageEvent.professional_id,
    conversationId: messageEvent.conversation_id,
    contextTypes: ['post_care'],
  })

  if (!context?.refId || context.refType !== 'session') {
    return { captured: false, skippedReason: 'active_post_care_context_not_found' }
  }

  const { data: session, error: sessionError } = await supabase
    .from('sessions')
    .select('id, professional_id, client_id, service_id, session_date, followup_sent_at, nps_requested_at')
    .eq('id', context.refId)
    .eq('professional_id', messageEvent.professional_id)
    .is('deleted_at', null)
    .single()

  if (sessionError) throw sessionError

  const { client } = await loadClientAndService(supabase, session as SessionRow)
  const config = await getRosaneAgentConfig(supabase, messageEvent.professional_id)
  const postCare = getPostCareConfig(config)

  const { error: updateError } = await supabase
    .from('sessions')
    .update({
      nps_score: score,
      nps_comment: messageEvent.content,
      nps_responded_at: new Date().toISOString(),
    })
    .eq('id', context.refId)
    .eq('professional_id', messageEvent.professional_id)

  if (updateError) throw updateError

  const { error: closeError } = await supabase
    .from('conversation_contexts')
    .update({
      status: 'closed',
      closed_at: new Date().toISOString(),
      metadata: {
        ...context.metadata,
        nps_score: score,
        message_event_id: messageEventId,
      },
    })
    .eq('id', context.id)

  if (closeError) throw closeError

  if (client.phone_whatsapp) {
    const instance = await getConnectedProfessionalWhatsappInstance(supabase, messageEvent.professional_id)
    if (instance) {
      await sendMessageCore(supabase, {
        source_webhook: 'professional',
        professional_id: messageEvent.professional_id,
        instance_name: instance.instanceName,
        to: client.phone_whatsapp,
        text: buildThanksText({
          assistantName: config.agentName,
          score,
          googleReviewUrl: score >= 4 && postCare.sendGoogleReviewAfterPositiveNps ? postCare.googleReviewUrl : null,
        }),
        actor_type: 'ai',
        agent_slug: AGENT_SLUG,
        dry_run: dryRun,
      })
    }
  }

  return { captured: true }
}

Deno.serve(async (request) => {
  let executionId: string | null = null

  try {
    assertInternalAuth(request)
    const input = validatePosAtendimentoAgentInput(await request.json())
    const dryRun = input.dry_run ?? isDryRun(request)
    const supabase = createServiceClient()

    const execution = await startAgentExecution(supabase, {
      professionalId: input.professional_id ?? null,
      agentSlug: AGENT_SLUG,
      triggerType: input.mode === 'nps_reply' ? 'qstash' : 'cron',
      triggerRef: input.session_id ?? input.message_event_id ?? input.mode,
      triggerPayload: { ...input, dry_run: dryRun },
      messageEventId: input.message_event_id,
    })
    executionId = execution.id

    if (input.mode === 'nps_reply') {
      const result = await captureNpsReply(supabase, input.message_event_id!, dryRun)
      await completeAgentExecution(supabase, execution.id, { status: result.captured ? 'success' : 'skipped' })
      return jsonResponse(validatePosAtendimentoAgentOutput({
        processed: result.captured,
        nps_captured: result.captured,
        skipped_reason: result.skippedReason,
      }))
    }

    const sessions = await selectSessions(supabase, {
      professionalId: input.professional_id,
      sessionId: input.session_id,
    })

    let sent = 0
    let skipped = 0

    for (const session of sessions) {
      const result = await sendFollowup(supabase, session, dryRun)
      if (result === 'sent') sent += 1
      else skipped += 1
    }

    await completeAgentExecution(supabase, execution.id, { status: 'success' })

    return jsonResponse(validatePosAtendimentoAgentOutput({
      processed: sent > 0,
      skipped_reason: skipped > 0 ? `skipped:${skipped}` : undefined,
    }))
  } catch (error) {
    if (error instanceof Response) return error

    if (executionId) {
      try {
        await completeAgentExecution(createServiceClient(), executionId, {
          status: 'failed',
          errorMessage: error instanceof Error ? error.message : 'unknown_error',
        })
      } catch {
        // Preserve original error.
      }
    }

    return jsonResponse({ error: error instanceof Error ? error.message : 'unknown_error' }, { status: 500 })
  }
})
