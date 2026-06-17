export interface EvolutionGoCredentials {
  baseUrl: string
  apiKey: string
}

export function getEvolutionGoCredentials(sourceWebhook: 'admin' | 'professional'): EvolutionGoCredentials {
  const baseUrl = Deno.env.get('EVOLUTION_GO_BASE_URL') ?? Deno.env.get('EVOLUTION_GO_URL')
  const apiKey = sourceWebhook === 'admin'
    ? Deno.env.get('ADMIN_EVOLUTION_GO_API_KEY') ?? Deno.env.get('EVOLUTION_GO_API_KEY') ?? Deno.env.get('EVOLUTION_GO_KEY')
    : Deno.env.get('EVOLUTION_GO_API_KEY') ?? Deno.env.get('EVOLUTION_GO_KEY')

  if (!baseUrl || !apiKey) {
    throw new Error('Missing Evolution Go base URL or API key')
  }

  return { baseUrl: baseUrl.replace(/\/$/, ''), apiKey }
}

export async function sendEvolutionGoText(input: {
  sourceWebhook: 'admin' | 'professional'
  instanceName: string
  to: string
  text: string
}) {
  const credentials = getEvolutionGoCredentials(input.sourceWebhook)
  const response = await fetch(`${credentials.baseUrl}/send/text`, {
    method: 'POST',
    headers: {
      apikey: credentials.apiKey,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      id: input.instanceName,
      number: input.to,
      text: input.text,
    }),
  })

  const body = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(`Evolution Go sendText failed: ${response.status} ${JSON.stringify(body)}`)
  }

  return body as Record<string, unknown>
}

export async function sendEvolutionGoMedia(input: {
  sourceWebhook: 'admin' | 'professional'
  instanceName: string
  to: string
  mediaUrl: string
  mediaType: 'image' | 'video' | 'document' | 'audio'
  mimetype: string
  caption?: string
}) {
  const credentials = getEvolutionGoCredentials(input.sourceWebhook)
  const response = await fetch(`${credentials.baseUrl}/send/media`, {
    method: 'POST',
    headers: {
      apikey: credentials.apiKey,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      id: input.instanceName,
      number: input.to,
      mediatype: input.mediaType,
      mimetype: input.mimetype,
      media: input.mediaUrl,
      caption: input.caption ?? '',
    }),
  })

  const body = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(`Evolution Go sendMedia failed: ${response.status} ${JSON.stringify(body)}`)
  }

  return body as Record<string, unknown>
}
