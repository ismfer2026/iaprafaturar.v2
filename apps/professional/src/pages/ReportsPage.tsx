import { useMemo, useState } from "react";
import { CalendarClock, Download, LineChart, ReceiptText, Users, type LucideIcon } from "lucide-react";
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, Skeleton, cn } from "@iaprafaturar/ui";
import type { ReportsOccupancySlot, ReportsServiceRanking, ReportsTopClient } from "@iaprafaturar/domain";
import { useAuth } from "@/contexts/AuthContext";
import { useReports } from "@/hooks/useReports";
import { useFinancialTransactions } from "@/hooks/useFinancial";
import { useI18n, type Locale, type TranslationKey } from "@/i18n";

type ReportsTab = "summary" | "clients" | "services" | "occupancy";

const TABS = [
  { value: "summary", labelKey: "reports.tab.summary" },
  { value: "clients", labelKey: "reports.tab.clients" },
  { value: "services", labelKey: "reports.tab.services" },
  { value: "occupancy", labelKey: "reports.tab.occupancy" },
] satisfies Array<{ value: ReportsTab; labelKey: TranslationKey }>;

const RISK_KEYS: Record<NonNullable<ReportsTopClient["risk_level"]>, TranslationKey> = {
  healthy: "growth.risk.healthy",
  attention: "growth.risk.attention",
  risk: "growth.risk.risk",
  churn: "growth.risk.churn",
};

function currentMonthKey() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
}

function formatCurrency(value: number, locale: Locale) {
  return new Intl.NumberFormat(locale, { style: "currency", currency: "BRL" }).format(Number(value) || 0);
}

function formatNumber(value: number, locale: Locale) {
  return new Intl.NumberFormat(locale).format(Number(value) || 0);
}

function formatMonth(value: string, locale: Locale) {
  return new Intl.DateTimeFormat(locale, { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(value));
}

function weekdayLabel(weekday: number, locale: Locale) {
  const base = new Date(Date.UTC(2026, 0, 4 + weekday));
  return new Intl.DateTimeFormat(locale, { weekday: "short", timeZone: "UTC" }).format(base);
}

function riskTone(risk: ReportsTopClient["risk_level"]) {
  if (risk === "healthy") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (risk === "attention") return "border-amber-200 bg-amber-50 text-amber-700";
  if (risk === "risk") return "border-orange-200 bg-orange-50 text-orange-700";
  if (risk === "churn") return "border-red-200 bg-red-50 text-red-700";
  return "border-zinc-200 bg-zinc-50 text-zinc-600";
}

function csvCell(value: string | number | null | undefined) {
  const text = String(value ?? "");
  return `"${text.replaceAll('"', '""')}"`;
}

function exportReportsCsv(rows: Array<Array<string | number | null | undefined>>, filename: string) {
  const csv = rows.map((row) => row.map(csvCell).join(";")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export default function ReportsPage() {
  const { professionalId } = useAuth();
  const { locale, t } = useI18n();
  const [month, setMonth] = useState(currentMonthKey());
  const [tab, setTab] = useState<ReportsTab>("summary");
  const reportsQuery = useReports(professionalId, month);
  const reports = reportsQuery.data;
  const monthInputValue = useMemo(() => month.slice(0, 7), [month]);

  const monthFrom = month;
  const monthTo = useMemo(() => {
    const parts = month.split("-").map(Number);
    const year = parts[0] ?? new Date().getFullYear();
    const mon = parts[1] ?? (new Date().getMonth() + 1);
    return mon === 12 ? `${year + 1}-01-01` : `${year}-${String(mon + 1).padStart(2, "0")}-01`;
  }, [month]);
  const transactionsQuery = useFinancialTransactions(professionalId, { dateFrom: monthFrom, dateTo: monthTo });

  function handleExportContador() {
    const txs = transactionsQuery.data;
    if (!txs) return;
    const header = ["Data", "Descrição", "Tipo", "Status", "Método", "Valor (R$)", "Desconto (R$)", "Líquido (R$)", "Cliente"];
    const rows = [
      header,
      ...txs.map((tx) => [
        tx.paid_at ? new Date(tx.paid_at).toLocaleDateString("pt-BR") : tx.due_date ? new Date(`${tx.due_date}T12:00:00`).toLocaleDateString("pt-BR") : new Date(tx.created_at ?? "").toLocaleDateString("pt-BR"),
        tx.description,
        tx.type,
        tx.status,
        tx.payment_method ?? "",
        String(tx.amount),
        String(tx.discount_amount ?? 0),
        String(tx.net_amount ?? tx.amount),
        tx.client_name ?? "",
      ]),
    ];
    exportReportsCsv(rows, `iaprafaturar-contador-${month.slice(0, 7)}.csv`);
  }

  function handleExport() {
    if (!reports) return;

    const rows = [
      [t("reports.csv.section"), t("reports.csv.name"), t("reports.csv.value"), t("reports.csv.extra")],
      [t("reports.tab.summary"), t("reports.metric.revenuePaid"), reports.summary.revenuePaid, reports.summary.month],
      [t("reports.tab.summary"), t("reports.metric.revenuePending"), reports.summary.revenuePending, reports.summary.month],
      [t("reports.tab.summary"), t("reports.metric.expensesPaid"), reports.summary.expensesPaid, reports.summary.month],
      [t("reports.tab.summary"), t("reports.metric.projectedRevenue"), reports.summary.projectedRevenue, reports.summary.month],
      ...reports.topClients.map((client) => [
        t("reports.tab.clients"),
        client.client_name,
        client.revenue,
        client.rfm_segment ?? client.risk_level ?? "",
      ]),
      ...reports.serviceRanking.map((service) => [
        t("reports.tab.services"),
        service.service_name ?? t("reports.service.unknown"),
        service.revenue,
        service.sessions_count,
      ]),
    ];

    exportReportsCsv(rows, `iaprafaturar-relatorios-${reports.summary.month}.csv`);
  }

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-5 px-4 py-5 sm:px-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-violet-700">{t("reports.eyebrow")}</p>
          <h1 className="mt-1 text-2xl font-semibold text-zinc-950 sm:text-3xl">{t("reports.title")}</h1>
          <p className="mt-1 max-w-3xl text-sm text-zinc-500">{t("reports.subtitle")}</p>
        </div>
        <div className="grid gap-2 sm:grid-cols-[180px_auto]">
          <label className="block">
            <span className="sr-only">{t("reports.form.month")}</span>
            <input
              type="month"
              className="h-10 w-full rounded-md border border-zinc-200 bg-white px-3 text-sm shadow-sm outline-none transition-colors focus:border-violet-500 focus:ring-2 focus:ring-violet-100"
              value={monthInputValue}
              onChange={(event) => event.target.value && setMonth(`${event.target.value}-01`)}
            />
          </label>
          <Button type="button" className="gap-2" onClick={handleExport} disabled={!reports}>
            <Download className="h-4 w-4" />
            {t("reports.action.exportCsv")}
          </Button>
          <Button type="button" variant="outline" className="gap-2" onClick={handleExportContador} disabled={!transactionsQuery.data}>
            <Download className="h-4 w-4" />
            {t("finance.export.action")}
          </Button>
        </div>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1">
        {TABS.map((item) => (
          <button
            key={item.value}
            type="button"
            onClick={() => setTab(item.value)}
            className={cn(
              "h-10 whitespace-nowrap rounded-lg border px-3 text-sm font-semibold transition-colors",
              tab === item.value
                ? "border-violet-600 bg-violet-600 text-white"
                : "border-zinc-200 bg-white text-zinc-600",
            )}
          >
            {t(item.labelKey)}
          </button>
        ))}
      </div>

      {reportsQuery.isLoading ? <ReportsSkeleton /> : null}

      {reportsQuery.isError ? (
        <Card className="rounded-lg border-red-200 bg-red-50">
          <CardContent className="p-4 text-sm font-medium text-red-700">{t("reports.error.load")}</CardContent>
        </Card>
      ) : null}

      {reports ? (
        <>
          <section className={cn("grid gap-3 sm:grid-cols-2 xl:grid-cols-4", tab !== "summary" && "hidden lg:grid")}>
            <MetricCard
              icon={ReceiptText}
              label={t("reports.metric.revenuePaid")}
              value={formatCurrency(reports.summary.revenuePaid, locale)}
              tone="emerald"
            />
            <MetricCard
              icon={CalendarClock}
              label={t("reports.metric.revenuePending")}
              value={formatCurrency(reports.summary.revenuePending, locale)}
              tone="amber"
            />
            <MetricCard
              icon={LineChart}
              label={t("reports.metric.projectedRevenue")}
              value={formatCurrency(reports.summary.projectedRevenue, locale)}
              tone="violet"
            />
            <MetricCard
              icon={Users}
              label={t("reports.metric.averageTicket")}
              value={formatCurrency(reports.summary.averageTicket, locale)}
              tone="zinc"
            />
          </section>

          {tab === "summary" || tab === "clients" ? (
            <section className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
              <TopClientsCard clients={reports.topClients} locale={locale} />
              <SummaryCard month={month} />
            </section>
          ) : null}

          {tab === "services" ? <ServiceRankingCard rows={reports.serviceRanking} locale={locale} /> : null}
          {tab === "occupancy" ? <OccupancyCard rows={reports.occupancy} locale={locale} /> : null}
        </>
      ) : null}
    </div>
  );
}

function MetricCard({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  tone: "emerald" | "amber" | "violet" | "zinc";
}) {
  const toneClass = {
    emerald: "bg-emerald-50 text-emerald-700",
    amber: "bg-amber-50 text-amber-700",
    violet: "bg-violet-50 text-violet-700",
    zinc: "bg-zinc-100 text-zinc-700",
  }[tone];

  return (
    <Card className="rounded-lg border-zinc-200">
      <CardContent className="flex items-center gap-3 p-4">
        <div className={cn("flex h-11 w-11 items-center justify-center rounded-lg", toneClass)}>
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <p className="truncate text-xs font-semibold text-zinc-500">{label}</p>
          <p className="mt-1 truncate text-xl font-semibold text-zinc-950">{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function TopClientsCard({ clients, locale }: { clients: ReportsTopClient[]; locale: Locale }) {
  const { t } = useI18n();

  return (
    <Card className="rounded-lg border-zinc-200">
      <CardHeader>
        <CardTitle>{t("reports.clients.title")}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {clients.length === 0 ? <EmptyText text={t("reports.empty.clients")} /> : null}
        {clients.map((client, index) => (
          <div key={client.client_id} className="flex items-center justify-between gap-3 rounded-lg border border-zinc-100 p-3">
            <div className="flex min-w-0 items-center gap-3">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-zinc-100 text-xs font-semibold text-zinc-600">
                {index + 1}
              </span>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-zinc-950">{client.client_name}</p>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {client.risk_level ? (
                    <Badge className={cn("border", riskTone(client.risk_level))}>
                      {t(RISK_KEYS[client.risk_level])}
                    </Badge>
                  ) : null}
                  {client.rfm_segment ? <Badge>{client.rfm_segment}</Badge> : null}
                </div>
              </div>
            </div>
            <div className="shrink-0 text-right">
              <p className="text-sm font-semibold text-zinc-950">{formatCurrency(client.revenue, locale)}</p>
              <p className="text-xs text-zinc-500">
                {formatNumber(client.transaction_count, locale)} {t("reports.clients.transactions")}
              </p>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function SummaryCard({ month }: { month: string }) {
  const { locale, t } = useI18n();

  return (
    <Card className="rounded-lg border-zinc-200">
      <CardHeader>
        <CardTitle>{t("reports.summary.title")}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-lg bg-zinc-50 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">{t("reports.summary.period")}</p>
          <p className="mt-1 text-lg font-semibold capitalize text-zinc-950">{formatMonth(month, locale)}</p>
        </div>
        <p className="text-sm leading-6 text-zinc-500">{t("reports.summary.description")}</p>
      </CardContent>
    </Card>
  );
}

function ServiceRankingCard({ rows, locale }: { rows: ReportsServiceRanking[]; locale: Locale }) {
  const { t } = useI18n();
  const maxRevenue = Math.max(...rows.map((row) => Number(row.revenue) || 0), 1);

  return (
    <Card className="rounded-lg border-zinc-200">
      <CardHeader>
        <CardTitle>{t("reports.services.title")}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {rows.length === 0 ? <EmptyText text={t("reports.empty.services")} /> : null}
        {rows.map((row) => (
          <div key={row.service_id ?? row.service_name ?? "unknown"} className="space-y-2">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-zinc-950">
                  {row.service_name ?? t("reports.service.unknown")}
                </p>
                <p className="text-xs text-zinc-500">
                  {formatNumber(row.sessions_count, locale)} {t("reports.services.sessions")}
                </p>
              </div>
              <p className="shrink-0 text-sm font-semibold text-zinc-950">{formatCurrency(row.revenue, locale)}</p>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-zinc-100">
              <div
                className="h-full rounded-full bg-violet-600"
                style={{ width: `${Math.max(5, (Number(row.revenue) / maxRevenue) * 100)}%` }}
              />
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function OccupancyCard({ rows, locale }: { rows: ReportsOccupancySlot[]; locale: Locale }) {
  const { t } = useI18n();
  const maxCount = Math.max(...rows.map((row) => Number(row.appointments_count) || 0), 1);

  return (
    <Card className="rounded-lg border-zinc-200">
      <CardHeader>
        <CardTitle>{t("reports.occupancy.title")}</CardTitle>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? <EmptyText text={t("reports.empty.occupancy")} /> : null}
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
          {rows.map((row) => {
            const intensity = Math.max(0.14, Number(row.appointments_count) / maxCount);
            return (
              <div
                key={`${row.weekday}-${row.hour}`}
                className="rounded-lg border border-violet-100 p-3 text-sm"
                style={{ backgroundColor: `rgba(124, 58, 237, ${intensity})` }}
              >
                <p className="font-semibold text-zinc-950">
                  {weekdayLabel(row.weekday, locale)} {String(row.hour).padStart(2, "0")}:00
                </p>
                <p className="mt-1 text-xs text-zinc-700">
                  {formatNumber(row.appointments_count, locale)} {t("reports.occupancy.appointments")}
                </p>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

function EmptyText({ text }: { text: string }) {
  return <p className="rounded-lg border border-dashed border-zinc-200 p-4 text-sm text-zinc-500">{text}</p>;
}

function ReportsSkeleton() {
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <Skeleton key={index} className="h-24 rounded-lg" />
        ))}
      </div>
      <Skeleton className="h-80 rounded-lg" />
    </div>
  );
}
