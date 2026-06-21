import { Link } from "react-router-dom";
import { Settings, User } from "lucide-react";
import { Badge, Card, CardContent } from "@iaprafaturar/ui";
import { useAuth } from "@/contexts/AuthContext";
import { useI18n, type TranslationKey } from "@/i18n";

const ROLE_LABELS: Record<string, TranslationKey> = {
  gestor: "team.role.gestor",
  operacional: "team.role.operacional",
};

export default function ProfilePage() {
  const { t } = useI18n();
  const { session, role } = useAuth();

  const name = (session?.user?.user_metadata?.["name"] as string | undefined) ?? null;
  const email = session?.user?.email ?? null;

  return (
    <main className="mx-auto w-full max-w-2xl space-y-4 px-4 py-5 sm:px-6">
      <header>
        <p className="text-xs font-semibold uppercase tracking-wide text-primary-700">{t("header.profile")}</p>
        <h1 className="mt-1 text-2xl font-semibold text-foreground">{name ?? email ?? t("header.profile")}</h1>
      </header>

      <Card>
        <CardContent className="space-y-4 p-5">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary-100 text-primary-800">
              <User className="h-6 w-6" />
            </div>
            <div className="min-w-0">
              <p className="truncate font-semibold text-foreground">{name ?? "—"}</p>
              <p className="truncate text-sm text-muted-foreground">{email ?? "—"}</p>
            </div>
          </div>

          {role ? (
            <Badge variant="secondary">{ROLE_LABELS[role] ? t(ROLE_LABELS[role]) : role}</Badge>
          ) : null}

          <Link
            to="/configuracoes"
            className="flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm text-foreground transition-colors hover:bg-muted"
          >
            <Settings className="h-4 w-4" />
            {t("nav.settings")}
          </Link>
        </CardContent>
      </Card>
    </main>
  );
}
