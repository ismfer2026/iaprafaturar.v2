import { Link } from "react-router-dom";
import { LogOut } from "lucide-react";
import { Button, Card, CardContent, cn } from "@iaprafaturar/ui";
import { useAuth } from "@/contexts/AuthContext";
import { useI18n } from "@/i18n";
import { LanguageSwitcher } from "@/components/layout/LanguageSwitcher";
import { moreNavRoutes } from "@/routes";

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
        {moreNavRoutes.map(({ path, icon: Icon, labelKey, moreNav }) => Icon && labelKey && moreNav ? (
          <Link key={path} to={path} className="block">
            <Card className="rounded-lg border-zinc-200 transition-colors hover:border-violet-200 hover:bg-violet-50/30">
              <CardContent className="flex items-start gap-3 p-4">
                <div className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-lg", moreNav.tone)}>
                  <Icon className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <h2 className="text-base font-semibold text-zinc-950">{t(labelKey)}</h2>
                  <p className="mt-1 text-sm leading-5 text-zinc-500">{t(moreNav.descriptionKey)}</p>
                </div>
              </CardContent>
            </Card>
          </Link>
        ) : null)}
      </section>

      <Button type="button" variant="outline" className="w-full justify-center gap-2 sm:w-fit" onClick={() => void signOut()}>
        <LogOut className="h-4 w-4" />
        {t("more.signOut")}
      </Button>
    </div>
  );
}
