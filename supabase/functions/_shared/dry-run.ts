export function isDryRun(request?: Request): boolean {
  const envValue = Deno.env.get('DRY_RUN')?.toLowerCase()
  const headerValue = request?.headers.get('x-dry-run')?.toLowerCase()

  return envValue === 'true' || envValue === '1' || headerValue === 'true' || headerValue === '1'
}