import type { TranslationKey } from "@/i18n";

type Translate = (key: TranslationKey, params?: Record<string, string | number>) => string;

export function friendlyErrorMessage(error: unknown, t: Translate, fallbackKey: TranslationKey) {
  const message = error instanceof Error ? error.message : "";
  if (message.includes("read_only_access")) {
    return t("common.error.readOnlyAccess");
  }
  return message || t(fallbackKey);
}
