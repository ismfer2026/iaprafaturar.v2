import { jsonResponse, readBearerToken } from '../_shared/http.ts'
import { createServiceClient } from '../_shared/supabase.ts'

interface CheckoutInput {
  product_slug: string
  success_url: string
  cancel_url: string
}

function formEncode(value: Record<string, string>) {
  const params = new URLSearchParams()
  Object.entries(value).forEach(([key, entry]) => params.set(key, entry))
  return params.toString()
}

Deno.serve(async (request) => {
  try {
    const token = readBearerToken(request)
    if (!token) return jsonResponse({ error: 'Unauthorized' }, { status: 401 })

    const input = await request.json() as CheckoutInput
    if (!input.product_slug || !input.success_url || !input.cancel_url) {
      return jsonResponse({ error: 'invalid_input' }, { status: 400 })
    }

    const supabase = createServiceClient()
    const { data: userData, error: userError } = await supabase.auth.getUser(token)
    if (userError || !userData.user) return jsonResponse({ error: 'Unauthorized' }, { status: 401 })

    const { data: professional, error: professionalError } = await supabase
      .from('professionals')
      .select('id, stripe_customer_id')
      .eq('user_id', userData.user.id)
      .single()
    if (professionalError) throw professionalError

    const { data: product, error: productError } = await supabase
      .from('platform_billing_products')
      .select('slug, product_type, stripe_price_id, billing_cycle, plan_id, platform_plans(slug, is_public)')
      .eq('slug', input.product_slug)
      .eq('is_active', true)
      .single()
    if (productError) throw productError

    const plan = Array.isArray(product.platform_plans) ? product.platform_plans[0] : product.platform_plans
    if (plan?.slug === 'free_internal' || plan?.is_public === false) {
      return jsonResponse({ error: 'product_not_public' }, { status: 403 })
    }

    const stripeSecretKey = Deno.env.get('STRIPE_SECRET_KEY')
    if (!stripeSecretKey || !product.stripe_price_id) {
      return jsonResponse({
        dry_run: true,
        checkout_url: null,
        reason: !stripeSecretKey ? 'missing_stripe_secret_key' : 'missing_stripe_price_id',
      })
    }

    const body: Record<string, string> = {
      mode: product.product_type === 'credits' ? 'payment' : 'subscription',
      success_url: input.success_url,
      cancel_url: input.cancel_url,
      'line_items[0][price]': product.stripe_price_id,
      'line_items[0][quantity]': '1',
      'metadata[professional_id]': professional.id,
      'metadata[product_slug]': product.slug,
    }
    if (professional.stripe_customer_id) body.customer = professional.stripe_customer_id

    const response = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${stripeSecretKey}`,
        'content-type': 'application/x-www-form-urlencoded',
      },
      body: formEncode(body),
    })
    const session = await response.json()
    if (!response.ok) {
      return jsonResponse({ error: 'stripe_checkout_failed', details: session }, { status: 502 })
    }

    return jsonResponse({ dry_run: false, checkout_url: session.url, session_id: session.id })
  } catch (error) {
    return jsonResponse({ error: error instanceof Error ? error.message : 'unknown_error' }, { status: 500 })
  }
})
