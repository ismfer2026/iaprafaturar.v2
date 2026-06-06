import { readBearerToken } from './http.ts'

export function assertInternalAuth(request: Request): void {
  const expected = Deno.env.get('INTERNAL_FUNCTION_TOKEN')
  if (!expected) {
    throw new Error('Missing INTERNAL_FUNCTION_TOKEN')
  }

  const received = readBearerToken(request)
  if (!received || received !== expected) {
    throw new Response('Unauthorized', { status: 401 })
  }
}