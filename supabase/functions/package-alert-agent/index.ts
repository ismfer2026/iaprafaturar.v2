import {
  validatePackageAlertAgentInput,
  validatePackageAlertAgentOutput,
} from '../../../packages/contracts/edge-functions/package-alert-agent.ts'

import { isDryRun } from '../_shared/dry-run.ts'
import { jsonResponse } from '../_shared/http.ts'
import { assertInternalAuth } from '../_shared/internal-auth.ts'
import { getConnectedProfessionalWhatsappInstance } from '../_shared/professional-instance.ts'
import { getRosaneAgentConfig } from '../_shared/rosane-agent-config.ts'
import { sendMessageCore } from '../_shared/send-message-core.ts'
import { createServiceClient } from '../_shared/supabase.ts'

const AGENT_SLUG = 'package-alert-agent'

interface ClientPackageRow {
  id: string
  professional_id: string
  sessions_remaining: number
  expires_at: string | null
  clients?: {
    full_name: string | null
    phone_whatsapp: string | null
    whatsapp_opt_out: boolean | null
  } | Array<{
    full_name: string | null
    phone_whatsapp: string | null
    whatsapp_opt_out: boolean | null
  }> | null
  service_packages?: {
    name: string | null
  } | Array<{
    name: string | null
  }> | null
}

function packageName(row: ClientPackageRow): string {
  const raw = Array.isArray(row.service_packages) ? row.service_packages[0] : row.service_packages
  return raw?.name ?? 'seu pacote'
}

function client(row: ClientPackageRow) {
  return Array.isArray(row.clients) ? row.clients[0] : row.clients
}

function buildText(input: {
  mode: 'low_balance' | 'expiry'
  assistantName: string
  clientName: string
  packageName: string
  sessionsRemaining: number
  expiresAt: string | null
}) {
  if (input.mode === 'low_balance') {
    return [
      `Ola, ${input.clientName}. Aqui e ${input.assistantName}.`,
      '',
      `Seu pacote ${input.packageName} esta com ${input.sessionsRemaining} sessao(oes) restante(s).`,
      'Se quiser renovar ou tirar duvidas, responda por aqui.',
    ].join('\n')
  }

  return [
    `Ola, ${input.clientName}. Aqui e ${input.assistantName}.`,
    '',
    `Seu pacote ${input.packageName} esta perto do vencimento.`,
    input.expiresAt ? `Validade: ${new Date(input.expiresAt).toLocaleDateString('pt-BR')}.` : '',
    'Se quiser renovar ou tirar duvidas, responda por aqui.',
  ].filter(Boolean).join('\n')
}

Deno.serve(async (request) => {
  try {
    assertInternalAuth(request)
    const input = validatePackageAlertAgentInput(await request.json())
    const dryRun = input.dry_run ?? isDryRun(request)
    const supabase = createServiceClient()
    const limit = input.limit ?? 50

    let query = supabase
      .from('client_packages')
      .select('id, professional_id, sessions_remaining, expires_at, clients(full_name, phone_whatsapp, whatsapp_opt_out), service_packages(name)')
      .eq('status', 'ativo')
      .order('updated_at', { ascending: true })
      .limit(limit)

    if (input.mode === 'low_balance') {
      query = query.lte('sessions_remaining', 2).is('low_balance_alert_sent_at', null)
    } else {
      const soon = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
      query = query.not('expires_at', 'is', null).lte('expires_at', soon).is('expiry_alert_sent_at', null)
    }

    const { data, error } = await query
    if (error) throw error

    const rows = (data ?? []) as unknown as ClientPackageRow[]
    let sent = 0
    let skipped = 0
    let failed = 0
    const instanceCache = new Map<string, Awaited<ReturnType<typeof getConnectedProfessionalWhatsappInstance>>>()
    const configCache = new Map<string, Awaited<ReturnType<typeof getRosaneAgentConfig>>>()

    for (const row of rows) {
      try {
        const currentClient = client(row)
        if (!currentClient?.phone_whatsapp || currentClient.whatsapp_opt_out) {
          skipped += 1
          continue
        }

        let instance = instanceCache.get(row.professional_id)
        if (instance === undefined) {
          instance = await getConnectedProfessionalWhatsappInstance(supabase, row.professional_id)
          instanceCache.set(row.professional_id, instance)
        }

        if (!instance) {
          skipped += 1
          continue
        }

        let config = configCache.get(row.professional_id)
        if (!config) {
          config = await getRosaneAgentConfig(supabase, row.professional_id)
          configCache.set(row.professional_id, config)
        }

        await sendMessageCore(supabase, {
          source_webhook: 'professional',
          professional_id: row.professional_id,
          instance_name: instance.instanceName,
          to: currentClient.phone_whatsapp,
          text: buildText({
            mode: input.mode,
            assistantName: config.agentName,
            clientName: currentClient.full_name ?? 'tudo bem',
            packageName: packageName(row),
            sessionsRemaining: row.sessions_remaining,
            expiresAt: row.expires_at,
          }),
          actor_type: 'ai',
          agent_slug: AGENT_SLUG,
          dry_run: dryRun,
        })

        const { error: markError } = await supabase.rpc('mark_package_alert_sent', {
          p_client_package_id: row.id,
          p_alert_type: input.mode,
        })
        if (markError) throw markError

        sent += 1
      } catch {
        failed += 1
      }
    }

    return jsonResponse(validatePackageAlertAgentOutput({
      ok: true,
      mode: input.mode,
      processed: rows.length,
      sent,
      skipped,
      failed,
      dry_run: dryRun,
    }))
  } catch (error) {
    if (error instanceof Response) return error
    return jsonResponse(
      { ok: false, error: error instanceof Error ? error.message : 'internal_error' },
      { status: 500 },
    )
  }
})
