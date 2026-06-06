import { Activity, AlertTriangle, CalendarDays, Users } from "lucide-react";
import { Badge, Card, CardContent, CardHeader, CardTitle, Skeleton } from "@iaprafaturar/ui";
import type { DashboardAppointment, DashboardAttentionItem } from "@iaprafaturar/domain";
import { useAuth } from "@/contexts/AuthContext";
import { useDashboard } from "@/hooks/useDashboard";
import { useI18n, type Locale, type TranslationKey } from "@/i18n";

const APPOINTMENT_STATUS_LABEL_KEYS: Record<DashboardAppointment["status"], TranslationKey> = {
  agendado: "appointment.status.agendado",
  confirmado: "appointment.status.confirmado",
  cancelado: "appointment.status.cancelado",
  realizado: "appointment.status.realizado",
  falta: "appointment.status.falta",
  reagendado: "appointment.status.reagendado",
};

function formatTime(value: string, locale: Locale) {
  return new Intl.DateTimeFormat(locale, {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function AppointmentRow({ appointment }: { appointment: DashboardAppointment }) {
  const { locale, t } = useI18n();

  return (
    <div className="rounded-lg border border-zinc-200 bg-white px-3 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-zinc-950">
            {formatTime(appointment.scheduled_at, locale)} -{" "}
            {appointment.client_name ?? t("dashboard.appointment.defaultClient")}
          </p>
          <p className="mt-1 truncate text-sm text-zinc-500">
            {appointment.service_name ?? t("dashboard.appointment.noService")}
          </p>
        </div>
        <Badge variant={appointment.status === "confirmado" ? "success" : "warning"}>
          {t(APPOINTMENT_STATUS_LABEL_KEYS[appointment.status])}
        </Badge>
      </div>
    </div>
  );
}

function AttentionRow({ item }: { item: DashboardAttentionItem }) {
  const { locale, t } = useI18n();

  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-3">
      <div className="flex gap-3">
        <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-700" />
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-amber-950">
            {item.client_name ?? t("dashboard.appointment.defaultClient")}
          </p>
          <p className="mt-1 text-sm text-amber-800">
            {t("dashboard.attention.overdue")} - {formatTime(item.scheduled_at, locale)}
          </p>
        </div>
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const { t } = useI18n();
  const { professionalId } = useAuth();
  const dashboardQuery = useDashboard(professionalId);

  if (!professionalId || dashboardQuery.isLoading) {
    return (
      <div className="space-y-4 p-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  if (dashboardQuery.error || !dashboardQuery.data) {
    return (
      <div className="space-y-4 p-4">
        <h1 className="text-xl font-semibold text-zinc-900">{t("dashboard.title")}</h1>
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {t("dashboard.error.load")}
        </div>
      </div>
    );
  }

  const { todayAppointments, attentionItems, pulse } = dashboardQuery.data;

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-5 px-4 py-5 md:px-6">
      <header>
        <p className="text-xs font-semibold uppercase tracking-wide text-violet-600">CRM</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight text-zinc-950">{t("dashboard.title")}</h1>
        <p className="mt-1 text-sm text-zinc-500">{t("dashboard.subtitle")}</p>
      </header>

      <section className="grid gap-3 md:grid-cols-3">
        <Card className="rounded-lg border-zinc-200">
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-violet-50 text-violet-700">
              <Users className="h-5 w-5" />
            </div>
            <div>
              <p className="text-2xl font-semibold text-zinc-950">{pulse.clientsInTreatmentCount}</p>
              <p className="text-sm text-zinc-500">{t("dashboard.pulse.clientsInTreatment")}</p>
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-lg border-zinc-200">
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-50 text-emerald-700">
              <Activity className="h-5 w-5" />
            </div>
            <div>
              <p className="text-2xl font-semibold text-zinc-950">{pulse.activeClientsCount}</p>
              <p className="text-sm text-zinc-500">{t("dashboard.pulse.activeClients")}</p>
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-lg border-zinc-200">
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-50 text-amber-700">
              <CalendarDays className="h-5 w-5" />
            </div>
            <div>
              <p className="text-2xl font-semibold text-zinc-950">{pulse.appointmentsTodayCount}</p>
              <p className="text-sm text-zinc-500">{t("dashboard.pulse.appointmentsToday")}</p>
            </div>
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-4 lg:grid-cols-[1fr_0.9fr]">
        <Card className="rounded-lg border-zinc-200">
          <CardHeader>
            <CardTitle>{t("dashboard.today")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {todayAppointments.length === 0 ? (
              <p className="rounded-lg border border-dashed border-zinc-300 p-4 text-sm text-zinc-500">
                {t("dashboard.today.empty")}
              </p>
            ) : (
              todayAppointments.map((appointment) => (
                <AppointmentRow key={appointment.id} appointment={appointment} />
              ))
            )}
          </CardContent>
        </Card>

        <Card className="rounded-lg border-zinc-200">
          <CardHeader>
            <CardTitle>{t("dashboard.attention")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {attentionItems.length === 0 ? (
              <p className="rounded-lg border border-dashed border-zinc-300 p-4 text-sm text-zinc-500">
                {t("dashboard.attention.empty")}
              </p>
            ) : (
              attentionItems.map((item) => <AttentionRow key={item.id} item={item} />)
            )}
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
