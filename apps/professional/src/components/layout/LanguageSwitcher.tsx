import { Languages } from "lucide-react";
import { Button, cn } from "@iaprafaturar/ui";
import { useI18n, type Locale } from "@/i18n";

const locales: Array<{ value: Locale; label: string }> = [
  { value: "pt-BR", label: "PT" },
  { value: "en-US", label: "EN" },
  { value: "es-419", label: "ES" },
];

interface LanguageSwitcherProps {
  compact?: boolean;
}

export function LanguageSwitcher({ compact = false }: LanguageSwitcherProps) {
  const { locale, setLocale, t } = useI18n();

  return (
    <div
      className={cn(
        "flex max-w-full items-center gap-1 rounded-full border border-zinc-200 bg-white p-1 shadow-sm",
        compact ? "justify-center" : "justify-between",
      )}
      aria-label={t("language.label")}
    >
      {!compact ? (
        <span className="flex min-w-0 items-center gap-2 px-2 text-xs font-medium text-zinc-500">
          <Languages className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span className="truncate">{t("language.label")}</span>
        </span>
      ) : (
        <Languages className="ml-1 h-4 w-4 shrink-0 text-zinc-500" aria-hidden="true" />
      )}

      <div className="flex shrink-0 items-center gap-0.5">
        {locales.map((item) => (
          <Button
            key={item.value}
            type="button"
            variant="ghost"
            size="sm"
            className={cn(
              "h-8 rounded-full px-2 text-xs font-semibold",
              locale === item.value && "bg-violet-700 text-white hover:bg-violet-700 hover:text-white",
            )}
            aria-pressed={locale === item.value}
            onClick={() => setLocale(item.value)}
          >
            {item.label}
          </Button>
        ))}
      </div>
    </div>
  );
}
