import {
  validateQuoteDispatcherInput,
  validateQuoteDispatcherOutput,
} from '../../../packages/contracts/edge-functions/quote-dispatcher.ts'

import { startAgentExecution, completeAgentExecution } from '../_shared/agent-executions.ts'
import { isDryRun } from '../_shared/dry-run.ts'
import { jsonResponse } from '../_shared/http.ts'
import { claimIdempotency } from '../_shared/idempotency.ts'
import { assertInternalAuth } from '../_shared/internal-auth.ts'
import { getConnectedProfessionalWhatsappInstance } from '../_shared/professional-instance.ts'
import { getRosaneAgentConfig } from '../_shared/rosane-agent-config.ts'
import { sendMessageCore } from '../_shared/send-message-core.ts'
import { createServiceClient } from '../_shared/supabase.ts'

const AGENT_SLUG = 'quote-dispatcher'

interface QuoteRow {
  id: string
  professional_id: string
  client_id: string
  title: string
  total_amount: number
  public_token: string | null
  sent_at: string | null
  clients?: {
    full_name: string | null
    phone_whatsapp: string | null
    whatsapp_opt_out: boolean | null
  } | Array<{
    full_name: string | null
    phone_whatsapp: string | null
    whatsapp_opt_out: boolean | null
  }> | null
}

function publicQuoteLink(token: string): string {
  const baseUrl = Deno.env.get('CLIENT_APP_URL') ?? 'https://app.iaprafaturar.com.br'
  return `${baseUrl.replace(/\/$/, '')}/orcamento/${token}`
}

function money(value: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value)
}

function buildFollowupText(input: {
  assistantName: string
  clientName: string
  quoteTitle: string
  amount: number
  token: string
}): string {
  return [
    `Ola, ${input.clientName}. Aqui e ${input.assistantName}.`,
    '',
    `Passando para lembrar do orcamento "${input.quoteTitle}" no valor de ${money(input.amount)}.`,
    '',
    `Voce pode revisar e responder por aqui: ${publicQuoteLink(input.token)}`,
  ].join('\n')
}

Deno.serve(async (request) => {
  let executionId: string | null = null

  try {
    assertInternalAuth(request)
    const input = validateQuoteDispatcherInput(await request.json())
    const dryRun = input.dry_run ?? isDryRun(request)
    const supabase = createServiceClient()
    const limit = input.limit ?? 50

    const execution = await startAgentExecution(supabase, {
      professionalId: null,
      agentSlug: AGENT_SLUG,
      triggerType: 'cron',
      triggerRef: input.mode,
      triggerPayload: { ...input, dry_run: dryRun },
    })
    executionId = execution.id

    if (input.mode === 'expire_quotes') {
      const { data, error } = await supabase.rpc('expire_quotes_batch', { p_limit: limit })
      if (error) throw error

      const processed = Number(data?.expired_count ?? 0)
      await completeAgentExecution(supabase, executionId, {
        status: 'success',
      })

      return jsonResponse(validateQuoteDispatcherOutput({
        ok: true,
        mode: input.mode,
        processed,
        sent: 0,
        skipped: 0,
        failed: 0,
        dry_run: dryRun,
      }))
    }

    const since = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString()
    const { data, error } = await supabase
      .from('quotes')
      .select('id, professional_id, client_id, title, total_amount, public_token, sent_at, clients(full_name, phone_whatsapp, whatsapp_opt_out)')
      .eq('status', 'enviado')
      .is('deleted_at', null)
      .is('followup_sent_at', null)
      .not('public_token', 'is', null)
      .lte('sent_at', since)
      .order('sent_at', { ascending: true })
      .limit(limit)

    if (error) throw error

    const quotes = (data ?? []) as unknown as QuoteRow[]
    let sent = 0
    let skipped = 0
    let failed = 0
    const instanceCache = new Map<string, Awaited<ReturnType<typeof getConnectedProfessionalWhatsappInstance>>>()
    const configCache = new Map<string, Awaited<ReturnType<typeof getRosaneAgentConfig>>>()

    for (const quote of quotes) {
      try {
        const client = Array.isArray(quote.clients) ? quote.clients[0] : quote.clients
        if (!client?.phone_whatsapp || client.whatsapp_opt_out || !quote.public_token) {
          skipped += 1
          continue
        }

        let instance = instanceCache.get(quote.professional_id)
        if (instance === undefined) {
          instance = await getConnectedProfessionalWhatsappInstance(supabase, quote.professional_id)
          instanceCache.set(quote.professional_id, instance)
        }

        if (!instance) {
          skipped += 1
          continue
        }

        const baseKey = `${AGENT_SLUG}:followup:${quote.id}`
        const claim = await claimIdempotency(
          supabase,
          dryRun ? `dry-run:${baseKey}:${crypto.randomUUID()}` : baseKey,
          { quote_id: quote.id, professional_id: quote.professional_id, dry_run: dryRun },
        )

        if (!claim.claimed) {
          skipped += 1
          continue
        }

        let config = configCache.get(quote.professional_id)
        if (!config) {
          config = await getRosaneAgentConfig(supabase, quote.professional_id)
          configCache.set(quote.professional_id, config)
        }

        await sendMessageCore(supabase, {
          source_webhook: 'professional',
          professional_id: quote.professional_id,
          instance_name: instance.instanceName,
          to: client.phone_whatsapp,
          text: buildFollowupText({
            assistantName: config.agentName,
            clientName: client.full_name ?? 'tudo bem',
            quoteTitle: quote.title,
            amount: quote.total_amount,
            token: quote.public_token,
          }),
          actor_type: 'ai',
          agent_slug: AGENT_SLUG,
          dry_run: dryRun,
        })

        const { error: markError } = await supabase.rpc('mark_quote_followup_sent', { p_quote_id: quote.id })
        if (markError) throw markError

        sent += 1
      } catch {
        failed += 1
      }
    }

    await completeAgentExecution(supabase, executionId, {
      status: failed > 0 ? 'failed' : 'success',
    })

    return jsonResponse(validateQuoteDispatcherOutput({
      ok: true,
      mode: input.mode,
      processed: quotes.length,
      sent,
      skipped,
      failed,
      dry_run: dryRun,
    }))
  } catch (error) {
    if (executionId) {
      try {
        await completeAgentExecution(createServiceClient(), executionId, {
          status: 'failed',
          errorMessage: error instanceof Error ? error.message : String(error),
        })
      } catch {
        // Ignore secondary failure while reporting original error.
      }
    }

    if (error instanceof Response) return error
    return jsonResponse(
      { ok: false, error: error instanceof Error ? error.message : 'internal_error' },
      { status: 500 },
    )
  }
})
