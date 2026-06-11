import { isDryRun } from '../_shared/dry-run.ts'
import { jsonResponse } from '../_shared/http.ts'
import { assertInternalAuth } from '../_shared/internal-auth.ts'
import { createServiceClient } from '../_shared/supabase.ts'

interface EmailOutboxRow {
  id: string
  professional_id: string
  to_email: string
  subject: string
  body_text: string
  status: string
}

interface EmailSettingsRow {
  professional_id: string
  provider: string
  from_email: string | null
  from_name: string | null
  enabled: boolean
  dry_run_only: boolean
}

async function sendViaResend(input: {
  apiKey: string
  from: string
  to: string
  subject: string
  text: string
}): Promise<string | null> {
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${input.apiKey}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      from: input.from,
      to: input.to,
      subject: input.subject,
      text: input.text,
    }),
  })

  const payload = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(typeof payload?.message === 'string' ? payload.message : 'resend_send_failed')
  }

  return typeof payload?.id === 'string' ? payload.id : null
}

Deno.serve(async (request) => {
  try {
    assertInternalAuth(request)
    const body = await request.json().catch(() => ({}))
    const dryRun = body.dry_run ?? isDryRun(request)
    const limit = Math.min(Math.max(Number(body.limit ?? 50), 1), 100)
    const supabase = createServiceClient()
    const resendApiKey = Deno.env.get('RESEND_API_KEY')

    const { data, error } = await supabase
      .from('email_outbox')
      .select('id, professional_id, to_email, subject, body_text, status')
      .eq('status', 'queued')
      .order('created_at', { ascending: true })
      .limit(limit)

    if (error) throw error

    let sent = 0
    let dry = 0
    let skipped = 0
    let failed = 0

    for (const email of (data ?? []) as EmailOutboxRow[]) {
      try {
        const { data: settings, error: settingsError } = await supabase
          .from('email_channel_settings')
          .select('professional_id, provider, from_email, from_name, enabled, dry_run_only')
          .eq('professional_id', email.professional_id)
          .maybeSingle()

        if (settingsError) throw settingsError

        const config = settings as EmailSettingsRow | null
        const shouldDryRun = dryRun || !resendApiKey || !config?.enabled || config.dry_run_only

        if (!config?.enabled) {
          await supabase.rpc('mark_email_outbox_sent', {
            p_email_outbox_id: email.id,
            p_status: 'skipped',
            p_provider_message_id: null,
            p_error: 'email_channel_disabled',
          })
          skipped += 1
          continue
        }

        if (shouldDryRun) {
          await supabase.rpc('mark_email_outbox_sent', {
            p_email_outbox_id: email.id,
            p_status: 'dry_run',
            p_provider_message_id: null,
            p_error: resendApiKey ? 'dry_run' : 'missing_resend_api_key',
          })
          dry += 1
          continue
        }

        const fromEmail = config.from_email ?? 'onboarding@resend.dev'
        const fromName = config.from_name ?? 'iaprafaturar'
        const providerId = await sendViaResend({
          apiKey: resendApiKey,
          from: `${fromName} <${fromEmail}>`,
          to: email.to_email,
          subject: email.subject,
          text: email.body_text,
        })

        await supabase.rpc('mark_email_outbox_sent', {
          p_email_outbox_id: email.id,
          p_status: 'sent',
          p_provider_message_id: providerId,
          p_error: null,
        })
        sent += 1
      } catch (error) {
        failed += 1
        await supabase.rpc('mark_email_outbox_sent', {
          p_email_outbox_id: email.id,
          p_status: 'failed',
          p_provider_message_id: null,
          p_error: error instanceof Error ? error.message : 'send_failed',
        })
      }
    }

    return jsonResponse({
      ok: true,
      processed: (data ?? []).length,
      sent,
      dry_run: dry,
      skipped,
      failed,
    })
  } catch (error) {
    if (error instanceof Response) return error
    return jsonResponse(
      { ok: false, error: error instanceof Error ? error.message : 'internal_error' },
      { status: 500 },
    )
  }
})
