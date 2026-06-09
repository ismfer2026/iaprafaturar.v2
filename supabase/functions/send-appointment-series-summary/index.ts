import {
  validateSendAppointmentSeriesSummaryInput,
  validateSendAppointmentSeriesSummaryOutput,
} from '@iaprafaturar/contracts/edge-functions/send-appointment-series-summary.ts'

import { isDryRun } from '../_shared/dry-run.ts'
import { sendEvolutionGoText } from '../_shared/evolution-go.ts'
import { jsonResponse } from '../_shared/http.ts'
import { createServiceClient } from '../_shared/supabase.ts'

const CORS_HEADERS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, x-client-info, apikey, content-type, x-dry-run',
  'access-control-allow-methods': 'POST, OPTIONS',
}

function readBearerToken(request: Request): string | null {
  const header = request.headers.get('authorization')
  if (!header) return null
  const [scheme, token] = header.split(' ')
  return scheme?.toLowerCase() === 'bearer' && token ? token : null
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

function formatAppointmentList(rows: Array<{ scheduled_at: string }>): string {
  return rows
    .slice(0, 8)
    .map((row, index) => {
      const date = new Date(row.scheduled_at)
      const formatted = new Intl.DateTimeFormat('pt-BR', {
        timeZone: 'America/Sao_Paulo',
        day: '2-digit',
        month: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      }).format(date)
      return `${index + 1}. ${formatted}`
    })
    .join('\n')
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS_HEADERS })
  if (request.method !== 'POST') {
    return publicJsonResponse({ sent: false, dry_run: false, error: 'method_not_allowed' }, { status: 405 })
  }

  try {
    const token = readBearerToken(request)
    if (!token) return publicJsonResponse({ sent: false, dry_run: false, error: 'unauthorized' }, { status: 401 })

    const input = validateSendAppointmentSeriesSummaryInput(await request.json())
    const supabase = createServiceClient()
    const dryRun = input.dry_run ?? isDryRun(request)

    const { data: userData, error: userError } = await supabase.auth.getUser(token)
    if (userError || !userData.user) {
      return publicJsonResponse({ sent: false, dry_run: dryRun, series_id: input.series_id, error: 'unauthorized' }, { status: 401 })
    }

    const { data: professional, error: professionalError } = await supabase
      .from('professionals')
      .select('id')
      .eq('user_id', userData.user.id)
      .single()

    if (professionalError || !professional) {
      return publicJsonResponse({ sent: false, dry_run: dryRun, series_id: input.series_id, error: 'professional_not_found' }, { status: 403 })
    }

    const { data: series, error: seriesError } = await supabase
      .from('appointment_series')
      .select('id, professional_id, client_id, service_id, frequency, occurrence_count, clients(full_name, phone_whatsapp), services(name)')
      .eq('id', input.series_id)
      .eq('professional_id', professional.id)
      .single()

    if (seriesError || !series) {
      return publicJsonResponse({ sent: false, dry_run: dryRun, series_id: input.series_id, skipped_reason: 'series_not_found' })
    }

    const client = Array.isArray(series.clients) ? series.clients[0] : series.clients
    const service = Array.isArray(series.services) ? series.services[0] : series.services
    if (!client?.phone_whatsapp) {
      return publicJsonResponse(validateSendAppointmentSeriesSummaryOutput({
        sent: false,
        dry_run: dryRun,
        series_id: input.series_id,
        skipped_reason: 'client_without_whatsapp',
      }))
    }

    const { data: instance, error: instanceError } = await supabase
      .from('professional_whatsapp')
      .select('instance_name')
      .eq('professional_id', professional.id)
      .eq('provider', 'evolution_go')
      .eq('is_connected', true)
      .maybeSingle()

    if (instanceError) throw instanceError
    if (!instance?.instance_name) {
      return publicJsonResponse(validateSendAppointmentSeriesSummaryOutput({
        sent: false,
        dry_run: dryRun,
        series_id: input.series_id,
        skipped_reason: 'no_professional_instance',
      }))
    }

    const { data: appointments, error: appointmentsError } = await supabase
      .from('appointments')
      .select('id, scheduled_at')
      .eq('professional_id', professional.id)
      .eq('series_id', input.series_id)
      .is('deleted_at', null)
      .order('scheduled_at', { ascending: true })

    if (appointmentsError) throw appointmentsError

    const text = [
      `Ola, ${client.full_name}.`,
      '',
      `Seus atendimentos recorrentes foram agendados${service?.name ? ` para ${service.name}` : ''}.`,
      '',
      formatAppointmentList(appointments ?? []),
      '',
      'Se precisar cancelar ou remarcar, responda por aqui.',
    ].join('\n')

    let providerPayload: Record<string, unknown> = {}
    if (!dryRun) {
      providerPayload = await sendEvolutionGoText({
        sourceWebhook: 'professional',
        instanceName: instance.instance_name,
        to: client.phone_whatsapp,
        text,
      })
    }

    const { data: messageEvent, error: insertError } = await supabase
      .from('message_events')
      .insert({
        professional_id: professional.id,
        client_id: series.client_id,
        direction: 'outbound',
        channel: 'whatsapp',
        message_type: 'text',
        source_webhook: 'professional',
        instance_name: instance.instance_name,
        content: text,
        sent_by: 'ai',
        agent_slug: 'appointment-series-summary',
        status: dryRun ? 'dry_run' : 'sent',
        sent_at: dryRun ? null : new Date().toISOString(),
        metadata: { series_id: input.series_id, sent_from: 'send-appointment-series-summary' },
        provider_payload: providerPayload,
      })
      .select('id')
      .single()

    if (insertError) throw insertError

    return publicJsonResponse(validateSendAppointmentSeriesSummaryOutput({
      sent: true,
      dry_run: dryRun,
      series_id: input.series_id,
      message_event_id: messageEvent.id,
    }))
  } catch (error) {
    if (error instanceof Error && error.name === 'ZodError') {
      return publicJsonResponse({ sent: false, dry_run: false, error: 'invalid_input' }, { status: 400 })
    }

    return publicJsonResponse({ sent: false, dry_run: false, error: 'internal_error' }, { status: 500 })
  }
})
