import { Languages } from "lucide-react";
import { Button, cn } from "@iaprafaturar/ui";
import { useI18n, type Locale } from "@/i18n";

const locales: Array<{ value: Locale; label: string }> = [
  { value: "pt-BR", label: "PT" },
  { value: "en-US", label: "EN" },
  { value: "es-419", label: "ES" }
];

interface PublicLayoutProps {
  eyebrow: string;
  title: string;
  subtitle: string;
  children: React.ReactNode;
  brandColor?: string;
}

export function PublicLayout({ eyebrow, title, subtitle, children, brandColor }: PublicLayoutProps) {
  const { locale, setLocale, t } = useI18n();

  return (
    <main
      className="min-h-dvh w-full max-w-[100vw] overflow-x-hidden bg-[#f7fbf9] text-zinc-950"
      style={{ "--client-brand": brandColor ?? "#0f766e" } as React.CSSProperties}
    >
      <div className="mx-auto flex min-h-dvh w-full max-w-[100vw] flex-col overflow-x-hidden py-4 sm:max-w-5xl sm:px-6 lg:px-8">
        <header className="public-mobile-frame mx-4 flex max-w-full flex-col items-start justify-between gap-3 py-2 sm:mx-0 sm:flex-row sm:items-center">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brand text-sm font-semibold text-white shadow-sm">
              ia
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-zinc-950">{t("common.poweredBy")}</p>
              <p className="truncate text-xs text-zinc-500">{eyebrow}</p>
            </div>
          </div>

          <div className="flex max-w-full shrink-0 items-center gap-0.5 rounded-full border border-zinc-200 bg-white p-1 shadow-sm">
            <Languages className="ml-1 h-4 w-4 text-zinc-500" aria-hidden="true" />
            <span className="sr-only">{t("language.label")}</span>
            {locales.map((item) => (
              <Button
                key={item.value}
                type="button"
                variant="ghost"
                size="sm"
                className={cn(
                  "h-9 rounded-full px-2 text-xs",
                  locale === item.value && "bg-brand text-white hover:bg-brand hover:text-white"
                )}
                onClick={() => setLocale(item.value)}
              >
                {item.label}
              </Button>
            ))}
          </div>
        </header>

        <section className="public-mobile-frame mx-4 grid max-w-full flex-1 gap-5 py-5 sm:mx-0 lg:grid-cols-[0.9fr_1.1fr] lg:items-center lg:py-10">
          <div className="w-full min-w-0 space-y-4">
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-brand">{eyebrow}</p>
            <h1 className="break-words font-display text-4xl font-semibold leading-tight text-zinc-950 sm:text-5xl">{title}</h1>
            <p className="max-w-xl break-words text-base leading-7 text-zinc-600">{subtitle}</p>
          </div>
          <div className="w-full min-w-0">{children}</div>
        </section>
      </div>
    </main>
  );
}
