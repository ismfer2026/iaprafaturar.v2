import { jsonResponse } from '../_shared/http.ts'
import { assertInternalAuth } from '../_shared/internal-auth.ts'
import { isDryRun } from '../_shared/dry-run.ts'
import { createServiceClient } from '../_shared/supabase.ts'
import { sendMessageCore } from '../_shared/send-message-core.ts'

Deno.serve(async (request) => {
  try {
    assertInternalAuth(request)

    const body = await request.json()
    const result = await sendMessageCore(createServiceClient(), {
      ...body,
      dry_run: body.dry_run ?? isDryRun(request),
    })

    return jsonResponse(result)
  } catch (error) {
    if (error instanceof Response) return error
    return jsonResponse({ error: error instanceof Error ? error.message : 'unknown_error' }, { status: 500 })
  }
})