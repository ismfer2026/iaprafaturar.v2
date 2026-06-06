const encoder = new TextEncoder()

function normalizeSignature(value: string | null): string | null {
  if (!value) return null
  return value.trim().replace(/^sha256=/i, '').toLowerCase()
}

function toHex(buffer: ArrayBuffer): string {
  return [...new Uint8Array(buffer)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false

  let result = 0
  for (let i = 0; i < a.length; i += 1) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i)
  }
  return result === 0
}

export async function verifyHmacSha256(rawBody: string, secret: string, signature: string | null): Promise<boolean> {
  const normalizedSignature = normalizeSignature(signature)
  if (!normalizedSignature) return false

  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )

  const digest = await crypto.subtle.sign('HMAC', key, encoder.encode(rawBody))
  const expected = toHex(digest)
  return timingSafeEqual(expected, normalizedSignature)
}

export function getSignatureHeader(request: Request): string | null {
  return (
    request.headers.get('x-evolution-signature') ??
    request.headers.get('x-signature') ??
    request.headers.get('x-hub-signature-256') ??
    request.headers.get('upstash-signature')
  )
}

export async function assertValidWebhookHmac(request: Request, rawBody: string, secretEnvName: string): Promise<void> {
  const secret = Deno.env.get(secretEnvName)
  if (!secret) {
    throw new Error(`Missing ${secretEnvName}`)
  }

  const valid = await verifyHmacSha256(rawBody, secret, getSignatureHeader(request))
  if (!valid) {
    throw new Response('Invalid signature', { status: 401 })
  }
}