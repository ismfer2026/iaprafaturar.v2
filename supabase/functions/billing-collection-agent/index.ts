import {
  validateBillingCollectionAgentInput,
  validateBillingCollectionAgentOutput,
} from '../../../packages/contracts/edge-functions/billing-collection-agent.ts'

import { isDryRun } from '../_shared/dry-run.ts'
import { jsonResponse, readBearerToken } from '../_shared/http.ts'
import { getConnectedProfessionalWhatsappInstance } from '../_shared/professional-instance.ts'
import { sendMessageCore } from '../_shared/send-message-core.ts'
import { createServiceClient } from '../_shared/supabase.ts'

const CORS_HEADERS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, x-client-info, apikey, content-type, x-dry-run',
  'access-control-allow-methods': 'POST, OPTIONS',
}

function publicJsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return jsonResponse(body, {
    ...init,
    headers: {
      ...CORS_HEADERS,
      ...(init.headers ?? {}),
    },
  })
}

function money(value: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value)
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS })
  }

  if (request.method !== 'POST') {
    return publicJsonResponse({ ok: false, error: 'method_not_allowed' }, { status: 405 })
  }

  try {
    const token = readBearerToken(request)
    if (!token) return publicJsonResponse({ ok: false, error: 'unauthorized' }, { status: 401 })

    const input = validateBillingCollectionAgentInput(await request.json())
    const dryRun = input.dry_run ?? isDryRun(request)
    const supabase = createServiceClient()

    const { data: userData, error: userError } = await supabase.auth.getUser(token)
    if (userError || !userData.user) {
      return publicJsonResponse({ ok: false, error: 'unauthorized' }, { status: 401 })
    }

    const { data: professional, error: professionalError } = await supabase
      .from('professionals')
      .select('id')
      .eq('user_id', userData.user.id)
      .maybeSingle()

    if (professionalError) throw professionalError
    if (!professional?.id) {
      return publicJsonResponse({ ok: false, error: 'forbidden' }, { status: 403 })
    }

    const { data: transaction, error: transactionError } = await supabase
      .from('financial_transactions')
      .select('id, professional_id, client_id, net_amount, description, notes, collection_approved_at, collection_sent_at, clients(full_name, phone_whatsapp, whatsapp_opt_out)')
      .eq('id', input.transaction_id)
      .eq('professional_id', professional.id)
      .eq('type', 'receita')
      .eq('status', 'pendente')
      .maybeSingle()

    if (transactionError) throw transactionError
    if (!transaction) {
      return publicJsonResponse({ ok: false, error: 'transaction_not_found' }, { status: 404 })
    }

    if (!transaction.collection_approved_at) {
      return publicJsonResponse({ ok: false, error: 'collection_not_approved' }, { status: 400 })
    }

    if (transaction.collection_sent_at) {
      return publicJsonResponse(validateBillingCollectionAgentOutput({
        ok: true,
        transaction_id: transaction.id,
        status: 'collection_already_sent',
        dry_run: dryRun,
      }))
    }

    const rawClient = transaction.clients
    const client = Array.isArray(rawClient) ? rawClient[0] : rawClient
    if (!client?.phone_whatsapp || client.whatsapp_opt_out) {
      return publicJsonResponse(validateBillingCollectionAgentOutput({
        ok: true,
        transaction_id: transaction.id,
        status: 'skipped_no_phone',
        dry_run: dryRun,
      }))
    }

    const instance = await getConnectedProfessionalWhatsappInstance(supabase, professional.id)
    if (!instance) {
      return publicJsonResponse(validateBillingCollectionAgentOutput({
        ok: true,
        transaction_id: transaction.id,
        status: 'skipped_no_instance',
        dry_run: dryRun,
      }))
    }

    const text = [
      `Ola, ${client.full_name ?? 'tudo bem'}.`,
      '',
      `Passando para lembrar da cobranca pendente de ${money(Number(transaction.net_amount ?? 0))}.`,
      `Referencia: ${transaction.description}.`,
      '',
      transaction.notes ? String(transaction.notes).split('\n').at(-1) : 'Se precisar de ajuda, responda por aqui.',
    ].join('\n')

    const result = await sendMessageCore(supabase, {
      source_webhook: 'professional',
      professional_id: professional.id,
      instance_name: instance.instanceName,
      to: client.phone_whatsapp,
      text,
      actor_type: 'professional',
      dry_run: dryRun,
    })

    let messageEventId: string | null = null
    const { data: messageEvent } = await supabase
      .from('message_events')
      .select('id')
      .eq('professional_id', professional.id)
      .eq('direction', 'outbound')
      .eq('instance_name', instance.instanceName)
      .eq('content', text)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    messageEventId = messageEvent?.id ?? null

    const { error: markError } = await supabase.rpc('mark_collection_message_sent', {
      p_financial_transaction_id: transaction.id,
      p_message_event_id: messageEventId,
    })
    if (markError) throw markError

    return publicJsonResponse(validateBillingCollectionAgentOutput({
      ok: true,
      transaction_id: transaction.id,
      status: 'dry_run' in result ? 'dry_run' : 'sent',
      message_event_id: messageEventId,
      dry_run: dryRun,
    }))
  } catch (error) {
    return publicJsonResponse(
      { ok: false, error: error instanceof Error ? error.message : 'internal_error' },
      { status: 500 },
    )
  }
})
