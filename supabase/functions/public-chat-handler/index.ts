import { jsonResponse } from '../_shared/http.ts'
import { createServiceClient } from '../_shared/supabase.ts'

const corsHeaders = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, x-client-info, apikey, content-type',
  'access-control-allow-methods': 'GET, POST, OPTIONS',
}

function withCors(response: Response): Response {
  for (const [key, value] of Object.entries(corsHeaders)) {
    response.headers.set(key, value)
  }
  return response
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders })
  }

  try {
    const supabase = createServiceClient()
    const url = new URL(request.url)

    if (request.method === 'GET') {
      const slug = url.searchParams.get('slug')
      const { data, error } = await supabase.rpc('get_public_chat_context', {
        p_slug: slug,
      })

      if (error) throw error
      return withCors(jsonResponse({ ok: true, context: data }))
    }

    if (request.method !== 'POST') {
      return withCors(jsonResponse({ ok: false, error: 'method_not_allowed' }, { status: 405 }))
    }

    const body = await request.json()
    const { data, error } = await supabase.rpc('register_public_chat_message', {
      p_slug: body.slug,
      p_name: body.name ?? null,
      p_email: body.email ?? null,
      p_phone: body.phone ?? null,
      p_message: body.message,
      p_fingerprint: request.headers.get('x-forwarded-for') ?? body.fingerprint ?? null,
      p_honeypot: body.website ?? body.honeypot ?? null,
    })

    if (error) throw error
    return withCors(jsonResponse({ ok: true, result: data }))
  } catch (error) {
    return withCors(jsonResponse(
      { ok: false, error: error instanceof Error ? error.message : 'internal_error' },
      { status: 400 },
    ))
  }
})
