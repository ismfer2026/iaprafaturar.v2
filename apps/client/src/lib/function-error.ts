interface FunctionErrorWithContext {
  context?: {
    json?: () => Promise<unknown>;
  };
}

export async function readFunctionErrorBody<TError>(error: unknown): Promise<TError | null> {
  const context = (error as FunctionErrorWithContext | null)?.context;
  if (!context?.json) return null;

  try {
    const body = await context.json();
    if (!body || typeof body !== "object") return null;
    if (!("ok" in body) || (body as { ok?: unknown }).ok !== false) return null;
    return body as TError;
  } catch {
    return null;
  }
}
