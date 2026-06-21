import { Link } from "react-router-dom";
import { Bell, Box, Building2, Clock, FileSignature, Sparkles, Users } from "lucide-react";
import { Button, Card, CardDescription, CardHeader, CardTitle } from "@iaprafaturar/ui";
import { useAuth } from "@/contexts/AuthContext";
import { useI18n } from "@/i18n";

export default function ConfiguracoesIndexPage() {
  const { t } = useI18n();
  const { role } = useAuth();
  const isGestor = role === "gestor";

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-5 px-4 py-5 md:px-6">
      <header>
        <p className="text-xs font-semibold uppercase tracking-wide text-primary-600">{t("settings.index.eyebrow")}</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight text-zinc-950">{t("settings.index.title")}</h1>
        <p className="mt-1 text-sm text-zinc-500">{t("settings.index.subtitle")}</p>
      </header>

      <div className="grid gap-3">
        {isGestor && (
          <Card><CardHeader><div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3"><div className="flex h-10 w-10 items-center justify-center rounded-full bg-indigo-100 text-indigo-700"><Building2 className="h-5 w-5" /></div>
              <div><CardTitle>{t("settings.clinic.title")}</CardTitle><CardDescription>{t("settings.clinic.description")}</CardDescription></div>
            </div><Button asChild variant="outline"><Link to="/configuracoes/clinica">{t("common.open")}</Link></Button>
          </div></CardHeader></Card>
        )}
        {isGestor && (
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-indigo-100 text-indigo-700">
                    <Users className="h-5 w-5" />
                  </div>
                  <div>
                    <CardTitle>{t("settings.team.title")}</CardTitle>
                    <CardDescription>{t("settings.team.description")}</CardDescription>
                  </div>
                </div>
                <Button asChild variant="outline">
                  <Link to="/configuracoes/equipe">{t("common.open")}</Link>
                </Button>
              </div>
            </CardHeader>
          </Card>
        )}

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary-100 text-primary-700">
                  <Bell className="h-5 w-5" />
                </div>
                <div>
                  <CardTitle>{t("settings.index.notifications.title")}</CardTitle>
                  <CardDescription>{t("settings.index.notifications.description")}</CardDescription>
                </div>
              </div>
              <Button asChild variant="outline">
                <Link to="/configuracoes/notificacoes">{t("common.open")}</Link>
              </Button>
            </div>
          </CardHeader>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-sky-100 text-sky-700">
                  <Clock className="h-5 w-5" />
                </div>
                <div>
                  <CardTitle>{t("settings.index.schedule.title")}</CardTitle>
                  <CardDescription>{t("settings.index.schedule.description")}</CardDescription>
                </div>
              </div>
              <Button asChild variant="outline">
                <Link to="/configuracoes/agenda">{t("common.open")}</Link>
              </Button>
            </div>
          </CardHeader>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-zinc-100 text-zinc-700">
                  <Box className="h-5 w-5" />
                </div>
                <div>
                  <CardTitle>{t("settings.services.title")}</CardTitle>
                  <CardDescription>{t("settings.services.description")}</CardDescription>
                </div>
              </div>
              <Button asChild variant="outline">
                <Link to="/servicos">{t("common.open")}</Link>
              </Button>
            </div>
          </CardHeader>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-100 text-amber-700">
                  <FileSignature className="h-5 w-5" />
                </div>
                <div>
                  <CardTitle>{t("settings.documentsPackages.title")}</CardTitle>
                  <CardDescription>{t("settings.documentsPackages.description")}</CardDescription>
                </div>
              </div>
              <Button asChild variant="outline">
                <Link to="/documentos/pacotes">{t("common.open")}</Link>
              </Button>
            </div>
          </CardHeader>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
                  <Sparkles className="h-5 w-5" />
                </div>
                <div>
                  <CardTitle>{t("settings.index.assistant.title")}</CardTitle>
                  <CardDescription>{t("settings.index.assistant.description")}</CardDescription>
                </div>
              </div>
              <Button asChild variant="outline">
                <Link to="/agentes">{t("common.open")}</Link>
              </Button>
            </div>
          </CardHeader>
        </Card>
      </div>
    </div>
  );
}
