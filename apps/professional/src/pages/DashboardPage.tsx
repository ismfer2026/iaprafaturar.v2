import {
  AlertTriangle,
  Bot,
  CalendarDays,
  ChevronRight,
  DollarSign,
  Flame,
  Stethoscope,
  TrendingDown,
  Users,
  type LucideIcon,
} from "lucide-react";
import { Link } from "react-router-dom";
import { Badge, Card, CardContent, CardHeader, CardTitle, Skeleton } from "@iaprafaturar/ui";
import type { DashboardAppointment, DashboardAttentionItem } from "@iaprafaturar/domain";
import { useAuth } from "@/contexts/AuthContext";
import { useDashboard } from "@/hooks/useDashboard";
import { useI18n, type Locale, type TranslationKey } from "@/i18n";

// ─── Formatadores ─────────────────────────────────────────────────────────────

function formatTime(value: string, locale: Locale) {
  return new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

function formatCurrency(value: number, locale: Locale) {
  return new Intl.NumberFormat(locale, { style: "currency", currency: "BRL" }).format(value);
}

function formatFullDate(locale: Locale) {
  return new Intl.DateTimeFormat(locale, {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date());
}

// ─── KPI Card (badge quadrado estilo v1) ─────────────────────────────────────

function KpiCard({
  icon: Icon,
  value,
  label,
  iconBg,
  iconColor,
}: {
  icon: LucideIcon;
  value: string | number;
  label: string;
  iconBg: string;
  iconColor: string;
}) {
  return (
    <Card className="min-w-[148px] shrink-0 rounded-xl border-zinc-200 bg-white">
      <CardContent className="p-4">
        <div className={`flex h-11 w-11 items-center justify-center rounded-xl ${iconBg}`}>
          <Icon className={`h-5 w-5 ${iconColor}`} />
        </div>
        <p className="mt-3 text-2xl font-bold tracking-tight text-zinc-950">{value}</p>
        <p className="mt-0.5 text-xs text-zinc-500">{label}</p>
      </CardContent>
    </Card>
  );
}

// ─── Status map de appointments ───────────────────────────────────────────────

const APPOINTMENT_STATUS_LABEL_KEYS: Record<DashboardAppointment["status"], TranslationKey> = {
  agendado: "appointment.status.agendado",
  confirmado: "appointment.status.confirmado",
  cancelado: "appointment.status.cancelado",
  realizado: "appointment.status.realizado",
  falta: "appointment.status.falta",
  reagendado: "appointment.status.reagendado",
};

// ─── Appointment row ──────────────────────────────────────────────────────────

function AppointmentRow({ appointment }: { appointment: DashboardAppointment }) {
  const { locale, t } = useI18n();

  return (
    <div className="flex items-center gap-3 rounded-lg border border-zinc-100 bg-zinc-50/50 px-3 py-2.5">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-50">
        <CalendarDays className="h-4 w-4 text-emerald-600" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-zinc-950">
          {appointment.client_name ?? t("dashboard.appointment.defaultClient")}
        </p>
        <p className="truncate text-xs text-zinc-500">
          {formatTime(appointment.scheduled_at, locale)} ·{" "}
          {appointment.service_name ?? t("dashboard.appointment.noService")}
        </p>
      </div>
      <Badge
        variant={appointment.status === "confirmado" ? "success" : "warning"}
        className="shrink-0"
      >
        {t(APPOINTMENT_STATUS_LABEL_KEYS[appointment.status])}
      </Badge>
    </div>
  );
}

// ─── Attention row (atividades recentes) ──────────────────────────────────────

function AttentionRow({ item }: { item: DashboardAttentionItem }) {
  const { locale, t } = useI18n();
  const isAnamnese = item.reason === "anamnese_pending_review";

  const content = (
    <div className="flex items-center gap-3">
      <div
        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
          isAnamnese ? "bg-sky-50" : "bg-amber-50"
        }`}
      >
        {isAnamnese ? (
          <Stethoscope className="h-4 w-4 text-sky-600" />
        ) : (
          <AlertTriangle className="h-4 w-4 text-amber-600" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-zinc-950">
          {item.client_name ?? t("dashboard.appointment.defaultClient")}
        </p>
        <p className="mt-0.5 text-xs text-zinc-500">
          {isAnamnese
            ? t("dashboard.attention.anamnesePending")
            : `${t("dashboard.attention.overdue")} · ${formatTime(item.scheduled_at, locale)}`}
        </p>
      </div>
    </div>
  );

  if (isAnamnese && item.client_id) {
    return (
      <Link
        to={`/clientes/${item.client_id}/anamnese`}
        className="block rounded-lg border border-zinc-100 bg-zinc-50/50 px-3 py-2.5 transition-colors hover:bg-zinc-100"
      >
        {content}
      </Link>
    );
  }

  return (
    <div className="rounded-lg border border-zinc-100 bg-zinc-50/50 px-3 py-2.5">{content}</div>
  );
}

// ─── Funil metric card ────────────────────────────────────────────────────────

function FunnelCard({
  label,
  value,
  subtitle,
  bgColor,
  labelColor,
}: {
  label: string;
  value: string | number;
  subtitle: string;
  bgColor: string;
  labelColor: string;
}) {
  return (
    <div className={`rounded-xl border border-zinc-100 ${bgColor} p-4`}>
      <p className={`text-xs font-semibold uppercase tracking-widest ${labelColor}`}>{label}</p>
      <p className="mt-2 text-2xl font-bold text-zinc-950">{value}</p>
      <p className="mt-0.5 text-xs text-zinc-500">{subtitle}</p>
    </div>
  );
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function DashboardSkeleton() {
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-5 px-4 py-5 md:px-6">
      <Skeleton className="h-9 w-56" />
      <div className="flex gap-3 overflow-x-auto pb-1">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-[108px] min-w-[148px] shrink-0 rounded-xl" />
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-[3fr_2fr]">
        <Skeleton className="h-72 rounded-xl" />
        <div className="flex flex-col gap-4">
          <Skeleton className="h-40 rounded-xl" />
          <Skeleton className="h-36 rounded-xl" />
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <Skeleton className="h-24 rounded-xl" />
        <Skeleton className="h-24 rounded-xl" />
        <Skeleton className="h-24 rounded-xl" />
      </div>
    </div>
  );
}

// ─── Página principal ─────────────────────────────────────────────────────────

export default function DashboardPage() {
  const { locale, t } = useI18n();
  const { professionalId } = useAuth();
  const dashboardQuery = useDashboard(professionalId);

  if (!professionalId || dashboardQuery.isLoading) {
    return <DashboardSkeleton />;
  }

  if (dashboardQuery.error || !dashboardQuery.data) {
    return (
      <div className="space-y-4 p-4">
        <h1 className="text-xl font-semibold text-zinc-900">{t("dashboard.visaoGeral")}</h1>
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {t("dashboard.error.load")}
        </div>
      </div>
    );
  }

  const { todayAppointments, attentionItems, pulse } = dashboardQuery.data;
  const netRevenue = pulse.monthRevenuePaid - pulse.monthExpensesPaid;

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-5 px-4 py-5 md:px-6">

      {/* Header com data estilo v1 */}
      <header>
        <h1 className="text-2xl font-bold tracking-tight text-zinc-950">{t("dashboard.visaoGeral")}</h1>
        <p className="mt-0.5 text-sm capitalize text-zinc-500">{formatFullDate(locale)}</p>
      </header>

      {/* 5 KPI cards – horizontal scrollável no mobile */}
      <section className="flex gap-3 overflow-x-auto pb-1">
        <KpiCard
          icon={CalendarDays}
          value={pulse.appointmentsTodayCount}
          label={t("dashboard.pulse.appointmentsToday")}
          iconBg="bg-emerald-50"
          iconColor="text-emerald-600"
        />
        <KpiCard
          icon={Users}
          value={pulse.activeClientsCount}
          label={t("dashboard.pulse.activeClients")}
          iconBg="bg-sky-50"
          iconColor="text-sky-600"
        />
        <KpiCard
          icon={DollarSign}
          value={formatCurrency(pulse.monthRevenuePaid, locale)}
          label={t("dashboard.pulse.monthRevenuePaid")}
          iconBg="bg-green-50"
          iconColor="text-green-700"
        />
        <KpiCard
          icon={Flame}
          value={pulse.hotLeadsCount}
          label={t("dashboard.pulse.hotLeads")}
          iconBg="bg-orange-50"
          iconColor="text-orange-600"
        />
        <KpiCard
          icon={Bot}
          value={pulse.aiExecutionsTodayCount}
          label={t("dashboard.pulse.aiActivity")}
          iconBg="bg-violet-50"
          iconColor="text-violet-600"
        />
      </section>

      {/* Área principal 2 colunas */}
      <section className="grid gap-4 lg:grid-cols-[3fr_2fr]">

        {/* Próximos Atendimentos */}
        <Card className="rounded-xl border-zinc-200">
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <CardTitle className="text-base font-semibold text-zinc-900">
              {t("dashboard.proximosAtendimentos")}
            </CardTitle>
            <Link
              to="/agenda"
              className="flex items-center gap-0.5 text-xs font-medium text-emerald-600 hover:text-emerald-700"
            >
              {t("dashboard.verTodos")}
              <ChevronRight className="h-3.5 w-3.5" />
            </Link>
          </CardHeader>
          <CardContent className="space-y-2">
            {todayAppointments.length === 0 ? (
              <p className="rounded-lg border border-dashed border-zinc-200 p-4 text-center text-sm text-zinc-500">
                {t("dashboard.today.empty")}
              </p>
            ) : (
              todayAppointments.slice(0, 6).map((a) => (
                <AppointmentRow key={a.id} appointment={a} />
              ))
            )}
          </CardContent>
        </Card>

        {/* Coluna direita */}
        <div className="flex flex-col gap-4">

          {/* Resumo do Mês */}
          <Card className="rounded-xl border-zinc-200">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold text-zinc-900">
                {t("dashboard.resumoDoMes")}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-sm text-zinc-500">{t("dashboard.pulse.monthRevenuePaid")}</span>
                <span className="text-sm font-semibold text-emerald-600">
                  {formatCurrency(pulse.monthRevenuePaid, locale)}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-zinc-500">{t("dashboard.pulse.monthRevenuePending")}</span>
                <span className="text-sm font-semibold text-amber-600">
                  {formatCurrency(pulse.monthRevenuePending, locale)}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-zinc-500">{t("dashboard.pulse.monthExpensesPaid")}</span>
                <span className="text-sm font-semibold text-red-600">
                  {formatCurrency(pulse.monthExpensesPaid, locale)}
                </span>
              </div>
              <div className="border-t border-zinc-100 pt-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-zinc-900">{t("dashboard.netRevenue")}</span>
                  <span className={`text-sm font-bold ${netRevenue >= 0 ? "text-emerald-700" : "text-red-600"}`}>
                    {formatCurrency(netRevenue, locale)}
                  </span>
                </div>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-zinc-500">{t("dashboard.emTratamento")}</span>
                <span className="text-sm font-semibold text-zinc-900">{pulse.clientsInTreatmentCount}</span>
              </div>
            </CardContent>
          </Card>

          {/* Atividades Recentes */}
          <Card className="rounded-xl border-zinc-200">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold text-zinc-900">
                {t("dashboard.atividadesRecentes")}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {attentionItems.length === 0 ? (
                <p className="rounded-lg border border-dashed border-zinc-200 p-4 text-center text-sm text-zinc-500">
                  {t("dashboard.naoHaAtividade")}
                </p>
              ) : (
                attentionItems.slice(0, 4).map((item) => (
                  <AttentionRow key={item.id} item={item} />
                ))
              )}
            </CardContent>
          </Card>
        </div>
      </section>

      {/* Métricas dos Funis */}
      <section>
        <h2 className="mb-3 text-[11px] font-semibold uppercase tracking-widest text-zinc-400">
          {t("dashboard.metricasFunis")}
        </h2>
        <div className="grid gap-3 sm:grid-cols-3">
          <FunnelCard
            label={t("dashboard.captacao")}
            value={pulse.hotLeadsCount}
            subtitle={t("dashboard.pulse.hotLeads")}
            bgColor="bg-orange-50"
            labelColor="text-orange-600"
          />
          <FunnelCard
            label={t("dashboard.retencao")}
            value={pulse.clientsInTreatmentCount}
            subtitle={t("dashboard.pulse.clientsInTreatment")}
            bgColor="bg-teal-50"
            labelColor="text-teal-600"
          />
          <FunnelCard
            label={t("dashboard.oportunidades")}
            value={pulse.openOpportunitiesCount}
            subtitle={t("dashboard.pulse.openOpportunities")}
            bgColor="bg-sky-50"
            labelColor="text-sky-600"
          />
        </div>
      </section>

      {/* Leads Quentes · Clientes em Risco · IA Agindo Hoje */}
      <section className="grid gap-3 pb-2 sm:grid-cols-3">

        <Card className="rounded-xl border-zinc-200">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-orange-50">
                <Flame className="h-5 w-5 text-orange-500" />
              </div>
              <div>
                <p className="text-xl font-bold text-zinc-950">{pulse.hotLeadsCount}</p>
                <p className="text-xs text-zinc-500">{t("dashboard.leadsQuentes")}</p>
              </div>
            </div>
            {pulse.hotLeadsCount > 0 && (
              <Link
                to="/clientes"
                className="mt-3 flex items-center gap-0.5 text-xs font-medium text-orange-600 hover:text-orange-700"
              >
                {t("dashboard.verTodos")}
                <ChevronRight className="h-3.5 w-3.5" />
              </Link>
            )}
          </CardContent>
        </Card>

        <Card className="rounded-xl border-zinc-200">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-red-50">
                <TrendingDown className="h-5 w-5 text-red-500" />
              </div>
              <div>
                <p className="text-xl font-bold text-zinc-950">{pulse.clientsAtRiskCount}</p>
                <p className="text-xs text-zinc-500">{t("dashboard.clientesEmRisco")}</p>
              </div>
            </div>
            {pulse.clientsAtRiskCount > 0 && (
              <Link
                to="/clientes"
                className="mt-3 flex items-center gap-0.5 text-xs font-medium text-red-600 hover:text-red-700"
              >
                {t("dashboard.verTodos")}
                <ChevronRight className="h-3.5 w-3.5" />
              </Link>
            )}
          </CardContent>
        </Card>

        <Card className="rounded-xl border-zinc-200">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-50">
                <Bot className="h-5 w-5 text-violet-500" />
              </div>
              <div>
                <p className="text-xl font-bold text-zinc-950">{pulse.aiExecutionsTodayCount}</p>
                <p className="text-xs text-zinc-500">{t("dashboard.iaAgindoHoje")}</p>
              </div>
            </div>
            {pulse.aiExecutionsTodayCount > 0 && (
              <Link
                to="/agentes"
                className="mt-3 flex items-center gap-0.5 text-xs font-medium text-violet-600 hover:text-violet-700"
              >
                {t("dashboard.verTodos")}
                <ChevronRight className="h-3.5 w-3.5" />
              </Link>
            )}
          </CardContent>
        </Card>

      </section>
    </div>
  );
}
