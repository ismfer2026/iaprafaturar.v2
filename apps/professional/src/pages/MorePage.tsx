import { Link } from "react-router-dom";
import { BarChart3, Box, Columns3, CreditCard, DollarSign, FileText, LogOut, Settings, Sparkles } from "lucide-react";
import { Button, Card, CardContent, cn } from "@iaprafaturar/ui";
import { useAuth } from "@/contexts/AuthContext";
import { useI18n, type TranslationKey } from "@/i18n";
import { LanguageSwitcher } from "@/components/layout/LanguageSwitcher";

const moreItems = [
  {
    to: "/planos",
    icon: CreditCard,
    titleKey: "plans.title",
    descriptionKey: "more.plans.description",
    tone: "bg-indigo-50 text-indigo-700",
  },
  {
    to: "/financeiro",
    icon: DollarSign,
    titleKey: "finance.title",
    descriptionKey: "more.finance.description",
    tone: "bg-emerald-50 text-emerald-700",
  },
  {
    to: "/growth",
    icon: Sparkles,
    titleKey: "growth.title",
    descriptionKey: "more.growth.description",
    tone: "bg-violet-50 text-violet-700",
  },
  {
    to: "/funil",
    icon: Columns3,
    titleKey: "funnel.title",
    descriptionKey: "more.funnel.description",
    tone: "bg-teal-50 text-teal-700",
  },
  {
    to: "/relatorios",
    icon: BarChart3,
    titleKey: "reports.title",
    descriptionKey: "more.reports.description",
    tone: "bg-blue-50 text-blue-700",
  },
  {
    to: "/documentos-pacotes",
    icon: FileText,
    titleKey: "docs.title",
    descriptionKey: "more.documents.description",
    tone: "bg-amber-50 text-amber-700",
  },
  {
    to: "/servicos",
    icon: Box,
    titleKey: "services.title",
    descriptionKey: "more.services.description",
    tone: "bg-zinc-100 text-zinc-700",
  },
  {
    to: "/configuracoes",
    icon: Settings,
    titleKey: "nav.settings",
    descriptionKey: "more.settings.description",
    tone: "bg-slate-100 text-slate-700",
  },
] satisfies Array<{
  to: string;
  icon: typeof BarChart3;
  titleKey: TranslationKey;
  descriptionKey: TranslationKey;
  tone: string;
}>;

export default function MorePage() {
  const { t } = useI18n();
  const { signOut } = useAuth();

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-5 px-4 py-5 sm:px-6">
      <header>
        <p className="text-xs font-semibold uppercase tracking-wide text-violet-700">{t("more.eyebrow")}</p>
        <h1 className="mt-1 text-2xl font-semibold text-zinc-950">{t("more.title")}</h1>
        <p className="mt-1 text-sm text-zinc-500">{t("more.subtitle")}</p>
      </header>

      <LanguageSwitcher />

      <section className="grid gap-3 sm:grid-cols-2">
        {moreItems.map(({ to, icon: Icon, titleKey, descriptionKey, tone }) => (
          <Link key={to} to={to} className="block">
            <Card className="rounded-lg border-zinc-200 transition-colors hover:border-violet-200 hover:bg-violet-50/30">
              <CardContent className="flex items-start gap-3 p-4">
                <div className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-lg", tone)}>
                  <Icon className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <h2 className="text-base font-semibold text-zinc-950">{t(titleKey)}</h2>
                  <p className="mt-1 text-sm leading-5 text-zinc-500">{t(descriptionKey)}</p>
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </section>

      <Button type="button" variant="outline" className="w-full justify-center gap-2 sm:w-fit" onClick={() => void signOut()}>
        <LogOut className="h-4 w-4" />
        {t("more.signOut")}
      </Button>
    </div>
  );
}
