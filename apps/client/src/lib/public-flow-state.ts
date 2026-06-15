import type { Locale } from "@/i18n";

export interface PublicFlowParams {
  lang: Locale;
  ref?: string;
}

export function buildPublicSearchParams(params: PublicFlowParams): string {
  const search = new URLSearchParams();
  search.set("lang", params.lang);
  if (params.ref) search.set("ref", params.ref);
  return search.toString();
}

export function readRefParam(search: string): string | undefined {
  const value = new URLSearchParams(search).get("ref")?.trim();
  return value || undefined;
}

export function buildPublicPath(path: string, params: PublicFlowParams): string {
  return `${path}?${buildPublicSearchParams(params)}`;
}
