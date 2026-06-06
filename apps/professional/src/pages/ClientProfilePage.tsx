import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, CalendarDays, DollarSign, History, UserRound } from "lucide-react";
import { Badge, Button, Card, CardContent, Skeleton, cn } from "@iaprafaturar/ui";
import type { Appointment, JourneyStage, Session } from "@iaprafaturar/domain";
import { useAuth } from "@/contexts/AuthContext";
import { useClient } from "@/hooks/useClients";
import { useClientAppointments } from "@/hooks/useAppointments";
import { useSessions } from "@/hooks/useSessions";
import { useI18n, type Locale, type TranslationKey } from "@/i18n";

const STAGE_LABEL_KEYS: Record<JourneyStage, TranslationKey> = {
  lead: "stage.lead",
  agendado: "stage.agendado",
  em_tratamento: "stage.em_tratamento",
  pos_tratamento: "stage.pos_tratamento",
  cliente_fiel: "stage.cliente_fiel",
  inativo: "stage.inativo",
};

const APPOINTMENT_STATUS_LABEL_KEYS: Record<Appointment["status"], TranslationKey> = {
  agendado: "appointment.status.agendado",
  confirmado: "appointment.status.confirmado",
  cancelado: "appointment.status.cancelado",
  realizado: "appointment.status.realizado",
  falta: "appointment.status.falta",
  reagendado: "appointment.status.reagendado",
};

type Tab = "resumo" | "historico" | "financeiro";

const TABS = [
  { value: "resumo", labelKey: "clientProfile.tab.summary", icon: UserRound },
  { value: "historico", labelKey: "clientProfile.tab.history", icon: History },
  { value: "financeiro", labelKey: "clientProfile.tab.finance", icon: DollarSign },
] satisfies Array<{ value: Tab; labelKey: TranslationKey; icon: typeof UserRound }>;

function formatDate(value: string | null, locale: Locale, noDateLabel: string) {
  if (!value) return noDateLabel;
  return new Intl.DateTimeFormat(locale, {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function TimelineItem({ item }: { item: Appointment | Session }) {
  const { locale, t } = useI18n();
  const isSession = "session_date" in item;
  const title = isSession ? t("clientProfile.timeline.session") : t("clientProfile.timeline.appointment");
  const date = isSession ? item.session_date : item.scheduled_at;
  const status = isSession ? t("appointment.status.realizado") : t(APPOINTMENT_STATUS_LABEL_KEYS[item.status]);

  return (
    <Card className="rounded-lg border-zinc-200">
      <CardContent className="flex gap-3 p-4">
        <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-violet-50 text-violet-700">
          <CalendarDays className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <h3 className="truncate text-sm font-semibold text-zinc-950">{title}</h3>
            <Badge className="shrink-0 border border-zinc-200 bg-white text-zinc-600">{status}</Badge>
          </div>
          <p className="mt-1 text-sm text-zinc-500">{formatDate(date, locale, t("common.noDate"))}</p>
          {isSession && item.clinical_evolution ? (
            <p className="mt-2 line-clamp-2 text-sm text-zinc-600">{item.clinical_evolution}</p>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}

export default function ClientProfilePage() {
  const { locale, t } = useI18n();
  const { id } = useParams<{ id: string }>();
  const { professionalId } = useAuth();
  const [activeTab, setActiveTab] = useState<Tab>("resumo");

  const clientQuery = useClient(professionalId, id ?? null);
  const appointmentsQuery = useClientAppointments(professionalId, id ?? null);
  const sessionsQuery = useSessions(professionalId, id ?? null);

  const timeline = useMemo(() => {
    const appointments = appointmentsQuery.data ?? [];
    const sessions = sessionsQuery.data ?? [];

    return [...appointments, ...sessions].sort((a, b) => {
      const aDate = "session_date" in a ? a.session_date : a.scheduled_at;
      const bDate = "session_date" in b ? b.session_date : b.scheduled_at;
      return new Date(bDate).getTime() - new Date(aDate).getTime();
    });
  }, [appointmentsQuery.data, sessionsQuery.data]);

  if (clientQuery.isLoading) {
    return (
      <div className="mx-auto w-full max-w-4xl space-y-4 px-4 py-5 md:px-6">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  if (clientQuery.error || !clientQuery.data) {
    return (
      <div className="mx-auto w-full max-w-4xl px-4 py-5 md:px-6">
        <Button asChild variant="ghost" className="mb-4 gap-2">
          <Link to="/clientes">
            <ArrowLeft className="h-4 w-4" />
            {t("clientProfile.back")}
          </Link>
        </Button>
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {t("clientProfile.error.load")}
        </div>
      </div>
    );
  }

  const client = clientQuery.data;

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-5 px-4 py-5 md:px-6">
      <header className="space-y-4">
        <Button asChild variant="ghost" className="w-fit gap-2 px-0">
          <Link to="/clientes">
            <ArrowLeft className="h-4 w-4" />
            {t("clientProfile.back")}
          </Link>
        </Button>

        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="truncate text-3xl font-semibold tracking-tight text-zinc-950">
              {client.full_name}
            </h1>
            <p className="mt-1 text-sm text-zinc-500">
              {client.phone_whatsapp || client.email || t("common.noContact")}
            </p>
          </div>
          <Badge className="shrink-0 border border-violet-200 bg-violet-50 text-violet-700">
            {t(STAGE_LABEL_KEYS[client.journey_stage])}
          </Badge>
        </div>
      </header>

      <div className="grid grid-cols-3 rounded-lg bg-zinc-100 p-1">
        {TABS.map(({ value, labelKey, icon: Icon }) => {
          const isActive = activeTab === value;
          return (
            <button
              key={value}
              type="button"
              onClick={() => setActiveTab(value)}
              className={cn(
                "flex h-10 items-center justify-center gap-2 rounded-md text-sm font-medium transition-colors",
                isActive ? "bg-white text-zinc-950 shadow-sm" : "text-zinc-500",
              )}
            >
              <Icon className="h-4 w-4" />
              <span className="hidden sm:inline">{t(labelKey)}</span>
            </button>
          );
        })}
      </div>

      {activeTab === "resumo" ? (
        <section className="grid gap-3 md:grid-cols-2">
          <Card className="rounded-lg border-zinc-200">
            <CardContent className="space-y-3 p-4">
              <h2 className="text-sm font-semibold text-zinc-950">{t("clientProfile.contact")}</h2>
              <dl className="space-y-2 text-sm">
                <div className="flex justify-between gap-3">
                  <dt className="text-zinc-500">{t("clientProfile.whatsapp")}</dt>
                  <dd className="text-right text-zinc-900">{client.phone_whatsapp || "-"}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-zinc-500">{t("clientProfile.email")}</dt>
                  <dd className="truncate text-right text-zinc-900">{client.email || "-"}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-zinc-500">{t("clientProfile.city")}</dt>
                  <dd className="text-right text-zinc-900">{client.city || "-"}</dd>
                </div>
              </dl>
            </CardContent>
          </Card>

          <Card className="rounded-lg border-zinc-200">
            <CardContent className="space-y-3 p-4">
              <h2 className="text-sm font-semibold text-zinc-950">{t("clientProfile.journey")}</h2>
              <dl className="space-y-2 text-sm">
                <div className="flex justify-between gap-3">
                  <dt className="text-zinc-500">{t("clientProfile.stage")}</dt>
                  <dd className="text-right text-zinc-900">{t(STAGE_LABEL_KEYS[client.journey_stage])}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-zinc-500">{t("clientProfile.source")}</dt>
                  <dd className="text-right text-zinc-900">{client.source}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-zinc-500">{t("clientProfile.createdAt")}</dt>
                  <dd className="text-right text-zinc-900">
                    {formatDate(client.created_at, locale, t("common.noDate"))}
                  </dd>
                </div>
              </dl>
            </CardContent>
          </Card>
        </section>
      ) : null}

      {activeTab === "historico" ? (
        <section className="space-y-3">
          {appointmentsQuery.isLoading || sessionsQuery.isLoading ? (
            <>
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-20 w-full" />
            </>
          ) : null}

          {!appointmentsQuery.isLoading && !sessionsQuery.isLoading && timeline.length === 0 ? (
            <div className="rounded-lg border border-dashed border-zinc-300 bg-white p-6 text-center">
              <h2 className="text-base font-semibold text-zinc-950">{t("clientProfile.history.emptyTitle")}</h2>
              <p className="mt-1 text-sm text-zinc-500">{t("clientProfile.history.emptyDescription")}</p>
              <Button asChild className="mt-4">
                <Link to="/agenda">{t("clientProfile.history.openAgenda")}</Link>
              </Button>
            </div>
          ) : null}

          {timeline.map((item) => (
            <TimelineItem key={`${"session_date" in item ? "session" : "appointment"}-${item.id}`} item={item} />
          ))}
        </section>
      ) : null}

      {activeTab === "financeiro" ? (
        <section className="rounded-lg border border-dashed border-zinc-300 bg-white p-6 text-center">
          <h2 className="text-base font-semibold text-zinc-950">{t("clientProfile.finance.title")}</h2>
          <p className="mt-1 text-sm text-zinc-500">{t("clientProfile.finance.description")}</p>
        </section>
      ) : null}
    </div>
  );
}
