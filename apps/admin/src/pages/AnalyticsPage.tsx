import { useState } from "react";
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, Skeleton } from "@iaprafaturar/ui";
import { useAdminAnalytics } from "@/hooks/useAdminCore";
import { useI18n } from "@/i18n";

export default function AnalyticsPage() {
  const { t } = useI18n();
  const [days, setDays] = useState(90);
  const query = useAdminAnalytics(days);
  const last = query.data?.metrics.at(-1);
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-5 px-4 py-5 sm:px-6">
      <header><h1 className="text-2xl font-semibold">{t("analytics.title")}</h1><p className="text-sm text-zinc-500">{t("analytics.subtitle")}</p></header>
      <div className="flex gap-2">{[30,90,365].map((value) => <Button key={value} size="sm" variant={days === value ? "default" : "outline"} onClick={() => setDays(value)}>{value}d</Button>)}</div>
      {query.isLoading ? <Skeleton className="h-40" /> : null}
      {query.isError ? <Card><CardContent className="p-5 text-red-700">{t("common.error")}</CardContent></Card> : null}
      {query.data ? <>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Stat label="MRR" value={money(Number(last?.mrr ?? 0))} />
          <Stat label={t("dashboard.active")} value={String(last?.active_professionals ?? 0)} />
          <Stat label={t("analytics.aiCredits")} value={String(query.data.ai.credits_used)} />
          <Stat label={t("analytics.aiEvents")} value={String(query.data.ai.events)} />
        </div>
        <section className="grid gap-3 lg:grid-cols-2">
          <Breakdown title={t("analytics.plans")} rows={query.data.plans.map((x) => [x.plan, x.professionals])} />
          <Breakdown title={t("dashboard.health")} rows={query.data.health.map((x) => [x.level, x.professionals])} />
        </section>
        <Card><CardHeader><CardTitle>{t("analytics.history")}</CardTitle></CardHeader><CardContent className="overflow-x-auto"><table className="w-full min-w-[640px] text-left text-sm"><thead><tr className="border-b text-zinc-500"><th className="p-2">Data</th><th>MRR</th><th>{t("dashboard.active")}</th><th>{t("dashboard.messages")}</th></tr></thead><tbody>{query.data.metrics.map((row) => <tr className="border-b" key={String(row.date)}><td className="p-2">{String(row.date)}</td><td>{money(Number(row.mrr ?? 0))}</td><td>{String(row.active_professionals ?? 0)}</td><td>{String(row.total_messages_sent ?? 0)}</td></tr>)}</tbody></table></CardContent></Card>
      </> : null}
    </div>
  );
}
function Stat({ label, value }: { label: string; value: string }) { return <Card><CardContent className="p-4"><p className="text-xs font-semibold text-zinc-500">{label}</p><p className="mt-1 text-xl font-semibold">{value}</p></CardContent></Card>; }
function Breakdown({ title, rows }: { title: string; rows: Array<[string, number]> }) { return <Card><CardHeader><CardTitle>{title}</CardTitle></CardHeader><CardContent className="flex flex-wrap gap-2">{rows.map(([label,value]) => <Badge key={label} variant="secondary">{label}: {value}</Badge>)}</CardContent></Card>; }
function money(value: number) { return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value); }
