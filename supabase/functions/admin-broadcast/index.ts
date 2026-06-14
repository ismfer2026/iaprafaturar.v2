import {
  validateAdminBroadcastInput,
  validateAdminBroadcastOutput,
} from '@iaprafaturar/contracts/edge-functions/admin-broadcast.ts'

import { startAgentExecution, completeAgentExecution } from '../_shared/agent-executions.ts'
import { isDryRun } from '../_shared/dry-run.ts'
import { jsonResponse } from '../_shared/http.ts'
import { publishBroadcastWorker } from '../_shared/broadcast-worker-queue.ts'
import { createServiceClient } from '../_shared/supabase.ts'

const AGENT_SLUG = 'admin-broadcast'

const corsHeaders = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, x-client-info, apikey, content-type, x-dry-run',
  'access-control-allow-methods': 'POST, OPTIONS',
}

interface ProfessionalTarget {
  id: string
  phone_whatsapp: string | null
  health_level?: string | null
}

function maskPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '')
  return digits.length > 4 ? `***${digits.slice(-4)}` : '***'
}

function readBearerToken(request: Request): string | null {
  const header = request.headers.get('authorization')
  if (!header) return null
  const [scheme, token] = header.split(' ')
  return scheme?.toLowerCase() === 'bearer' && token ? token : null
}

async function assertAdminOrInternal(request: Request): Promise<{ caller: 'internal' | 'admin'; actorId: string | null }> {
  const token = readBearerToken(request)
  const internalToken = Deno.env.get('INTERNAL_FUNCTION_TOKEN')
  if (token && internalToken && token === internalToken) return { caller: 'internal', actorId: null }
  if (!token) throw new Response('Unauthorized', { status: 401, headers: corsHeaders })

  const supabase = createServiceClient()
  const { data: userData, error: userError } = await supabase.auth.getUser(token)
  if (userError || !userData.user) throw new Response('Unauthorized', { status: 401, headers: corsHeaders })

  const { data, error } = await supabase
    .from('master_admins')
    .select('id')
    .eq('user_id', userData.user.id)
    .maybeSingle()

  if (error) throw error
  if (!data) throw new Response('Forbidden', { status: 403, headers: corsHeaders })
  return { caller: 'admin', actorId: userData.user.id }
}

async function selectTargets(input: { target: string; limit: number }): Promise<ProfessionalTarget[]> {
  const supabase = createServiceClient()

  if (input.target === 'risk_professionals') {
    const { data, error } = await supabase
      .from('professional_platform_health_scores')
      .select('professional_id, health_level, professionals(id, phone_whatsapp)')
      .in('health_level', ['critico', 'baixo'])
      .limit(input.limit)

    if (error) throw error
    return (data ?? []).map((row: Record<string, unknown>) => {
      const professional = Array.isArray(row.professionals) ? row.professionals[0] : row.professionals
      return {
        id: (professional as { id: string }).id,
        phone_whatsapp: (professional as { phone_whatsapp: string | null }).phone_whatsapp,
        health_level: row.health_level as string,
      }
    })
  }

  let query = supabase
    .from('professionals')
    .select('id, phone_whatsapp, plan_type, trial_ends_at')
    .is('deleted_at', null)
    .limit(input.limit)

  if (input.target === 'trial_professionals') query = query.eq('plan_type', 'trial')

  const { data, error } = await query
  if (error) throw error
  return (data ?? []) as ProfessionalTarget[]
}

Deno.serve(async (request) => {
  let executionId: string | null = null

  try {
    if (request.method === 'OPTIONS') {
      return new Response('ok', { headers: corsHeaders })
    }

    const actor = await assertAdminOrInternal(request)
    const input = validateAdminBroadcastInput(await request.json())
    const dryRun = input.dry_run ?? isDryRun(request)
    const limit = input.limit ?? 50
    const supabase = createServiceClient()

    if (input.idempotency_key) {
      const { data: existing, error: existingError } = await supabase
        .from('platform_broadcasts')
        .select('id, status, selected_count, sent_count, skipped_count, failed_count, dry_run')
        .eq('idempotency_key', input.idempotency_key)
        .maybeSingle()
      if (existingError) throw existingError
      if (existing) {
        if (!existing.dry_run && ['queued', 'processing', 'partial'].includes(existing.status)) {
          await publishBroadcastWorker({ broadcastId: existing.id })
        }
        return jsonResponse(validateAdminBroadcastOutput({
          selected: existing.selected_count,
          sent_or_dry_run: existing.sent_count,
          skipped: existing.skipped_count,
          failed: existing.failed_count,
          dry_run: existing.dry_run,
          broadcast_id: existing.id,
          status: existing.status,
          reason: 'idempotent_replay',
        }), { headers: corsHeaders })
      }
    }

    const execution = await startAgentExecution(supabase, {
      professionalId: null,
      agentSlug: AGENT_SLUG,
      triggerType: 'manual',
      triggerRef: input.target,
      triggerPayload: { ...input, dry_run: dryRun, caller: actor.caller },
    })
    executionId = execution.id

    const instanceName = Deno.env.get('ADMIN_WHATSAPP_INSTANCE_NAME')
    const targets = await selectTargets({ target: input.target, limit })
    const eligibleTargets = targets.filter((target) => Boolean(target.phone_whatsapp))
    const { data: broadcast, error: broadcastError } = await supabase
      .from('platform_broadcasts')
      .insert({
        created_by: actor.actorId ?? execution.id,
        audience_type: input.target,
        channel: 'whatsapp',
        message: input.message,
        status: dryRun ? 'dry_run' : 'queued',
        dry_run: dryRun,
        reason: input.reason ?? (dryRun ? 'admin_broadcast_dry_run' : 'admin_broadcast_confirmed'),
        idempotency_key: input.idempotency_key ?? `admin-broadcast:${crypto.randomUUID()}`,
        selected_count: targets.length,
        eligible_count: eligibleTargets.length,
        skipped_count: targets.length - eligibleTargets.length,
      })
      .select('id')
      .single()
    if (broadcastError) throw broadcastError

    if (actor.actorId) {
      const { error: auditError } = await supabase.from('platform_admin_audit_log').insert({
        admin_user_id: actor.actorId,
        event_type: dryRun ? 'admin.broadcast.dry_run' : 'admin.broadcast.queued',
        entity_type: 'platform_broadcast',
        entity_id: broadcast.id,
        payload: { audience_type: input.target, channel: 'whatsapp', reason: input.reason ?? null },
      })
      if (auditError) throw auditError
    }

    if (!dryRun && eligibleTargets.length > 0) {
      const { error: recipientsError } = await supabase.from('platform_broadcast_recipients').insert(
        eligibleTargets.map((target) => ({
          broadcast_id: broadcast.id,
          professional_id: target.id,
          channel: 'whatsapp',
          destination_masked: maskPhone(target.phone_whatsapp!),
          status: 'queued',
        })),
      )
      if (recipientsError) throw recipientsError
    }

    if (dryRun) {
      await supabase
        .from('platform_broadcasts')
        .update({ status: 'dry_run', sent_count: eligibleTargets.length, completed_at: new Date().toISOString() })
        .eq('id', broadcast.id)
      await completeAgentExecution(supabase, execution.id, { status: 'success' })
      return jsonResponse(validateAdminBroadcastOutput({
        selected: targets.length,
        sent_or_dry_run: eligibleTargets.length,
        skipped: targets.length - eligibleTargets.length,
        failed: 0,
        dry_run: true,
        broadcast_id: broadcast.id,
        status: 'dry_run',
      }), { headers: corsHeaders })
    }

    if (!dryRun && !instanceName) {
      await supabase
        .from('platform_broadcasts')
        .update({
          status: 'failed',
          failed_count: eligibleTargets.length,
          completed_at: new Date().toISOString(),
        })
        .eq('id', broadcast.id)
      await completeAgentExecution(supabase, execution.id, { status: 'skipped' })
      return jsonResponse(validateAdminBroadcastOutput({
        selected: targets.length,
        sent_or_dry_run: 0,
        skipped: targets.length,
        failed: 0,
        dry_run: false,
        broadcast_id: broadcast.id,
        status: 'failed',
        reason: 'no_admin_instance',
      }), { headers: corsHeaders })
    }

    await publishBroadcastWorker({ broadcastId: broadcast.id })
    await completeAgentExecution(supabase, execution.id, { status: 'success' })
    return jsonResponse(validateAdminBroadcastOutput({
      selected: targets.length,
      sent_or_dry_run: 0,
      skipped: targets.length - eligibleTargets.length,
      failed: 0,
      dry_run: false,
      broadcast_id: broadcast.id,
      status: 'queued',
    }), { headers: corsHeaders })
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

    return jsonResponse(
      { error: error instanceof Error ? error.message : 'unknown_error' },
      { status: 500, headers: corsHeaders },
    )
  }
})
