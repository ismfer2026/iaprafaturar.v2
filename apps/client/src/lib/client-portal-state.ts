const PORTAL_TOKEN_KEY = "iapf:client_portal:token";

export function readClientPortalToken(): string | null {
  return window.sessionStorage.getItem(PORTAL_TOKEN_KEY);
}

export function writeClientPortalToken(token: string): void {
  window.sessionStorage.setItem(PORTAL_TOKEN_KEY, token);
}

export function clearClientPortalToken(): void {
  window.sessionStorage.removeItem(PORTAL_TOKEN_KEY);
  window.sessionStorage.removeItem(clientPortalCacheKey("last_context"));
}

export function clientPortalCacheKey(name: string): string {
  return `iapf:client_portal:${name}`;
}

export function writeClientPortalCache(name: string, value: unknown): void {
  window.sessionStorage.setItem(clientPortalCacheKey(name), JSON.stringify(value));
}
