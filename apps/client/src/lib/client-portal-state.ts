const PORTAL_TOKEN_KEY = "iapf:client_portal:token";

export function readClientPortalToken(): string | null {
  return window.localStorage.getItem(PORTAL_TOKEN_KEY);
}

export function writeClientPortalToken(token: string): void {
  window.localStorage.setItem(PORTAL_TOKEN_KEY, token);
}

export function clearClientPortalToken(): void {
  window.localStorage.removeItem(PORTAL_TOKEN_KEY);
}

export function clientPortalCacheKey(name: string): string {
  return `iapf:client_portal:${name}`;
}
