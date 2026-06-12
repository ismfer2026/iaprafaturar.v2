import { jsonResponse } from '../_shared/http.ts'
import { createServiceClient } from '../_shared/supabase.ts'

const encoder = new TextEncoder()

function parseStripeSignature(header: string | null) {
  const parts = Object.fromEntries((header ?? '').split(',').map((part) => {
    const [key, value] = part.split('=')
    return [key, value]
  }))
  return { timestamp: parts.t, signature: parts.v1 }
}

async function hmacHex(secret: string, payload: string) {
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(payload))
  return [...new Uint8Array(signature)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

async function verifyStripeSignature(rawBody: string, header: string | null, secret: string) {
  const { timestamp, signature } = parseStripeSignature(header)
  if (!timestamp || !signature) return false
  const expected = await hmacHex(secret, `${timestamp}.${rawBody}`)
  return expected === signature
}

Deno.serve(async (request) => {
  try {
    const rawBody = await request.text()
    const webhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET')
    if (!webhookSecret) return jsonResponse({ error: 'missing_stripe_webhook_secret' }, { status: 500 })
    const valid = await verifyStripeSignature(rawBody, request.headers.get('stripe-signature'), webhookSecret)
    if (!valid) return jsonResponse({ error: 'invalid_signature' }, { status: 401 })

    const event = JSON.parse(rawBody)
    const supabase = createServiceClient()

    const { data: existing } = await supabase
      .from('processed_stripe_events')
      .select('id')
      .eq('stripe_event_id', event.id)
      .maybeSingle()
    if (existing) return jsonResponse({ received: true, idempotent: true })

    const object = event.data?.object ?? {}
    const metadata = object.metadata ?? {}
    const professionalId = metadata.professional_id
    const productSlug = metadata.product_slug

    if (professionalId && event.type === 'checkout.session.completed') {
      const { data: product } = await supabase
        .from('platform_billing_products')
        .select('id, product_type, credits_amount, plan_id, platform_plans(slug)')
        .eq('slug', productSlug)
        .maybeSingle()

      if (product?.product_type === 'credits') {
        const { data: wallet, error: walletError } = await supabase
          .from('ai_credit_wallets')
          .insert({
            professional_id: professionalId,
            wallet_type: 'purchased',
            balance: product.credits_amount,
            metadata: { stripe_event_id: event.id, product_slug: productSlug },
          })
          .select('id')
          .single()
        if (walletError) throw walletError
        const { error: transactionError } = await supabase
          .from('ai_credit_transactions')
          .insert({
            professional_id: professionalId,
            wallet_id: wallet.id,
            amount: product.credits_amount,
            transaction_type: 'purchase',
            source: 'stripe',
            idempotency_key: event.id,
            reason: `stripe:${event.id}`,
            metadata: { product_slug: productSlug },
          })
        if (transactionError) throw transactionError
      } else if (product?.plan_id) {
        await supabase
          .from('professional_subscriptions')
          .upsert({
            professional_id: professionalId,
            plan_id: product.plan_id,
            status: 'active',
            source: 'stripe',
            stripe_customer_id: object.customer ?? null,
            stripe_subscription_id: object.subscription ?? null,
            current_period_start: new Date().toISOString(),
            metadata: { stripe_event_id: event.id },
          }, { onConflict: 'professional_id' })
        const plan = Array.isArray(product.platform_plans) ? product.platform_plans[0] : product.platform_plans
        if (plan?.slug) {
          await supabase.from('professionals').update({
            plan_type: plan.slug,
            stripe_customer_id: object.customer ?? null,
            updated_at: new Date().toISOString(),
          }).eq('id', professionalId)
        }
        await supabase.rpc('platform_refresh_access_state', { p_professional_id: professionalId })
      }
    }

    await supabase.from('processed_stripe_events').insert({
      stripe_event_id: event.id,
      event_type: event.type,
      payload: event,
    })

    return jsonResponse({ received: true })
  } catch (error) {
    return jsonResponse({ error: error instanceof Error ? error.message : 'unknown_error' }, { status: 500 })
  }
})
