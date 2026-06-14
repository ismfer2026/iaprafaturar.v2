import { Activity, AlertTriangle, BarChart3, MessageCircle, UserRoundPlus } from "lucide-react";
import { Link } from "react-router-dom";
import { Badge, Card, CardContent, CardHeader, CardTitle, Skeleton } from "@iaprafaturar/ui";
import { useAdminDashboard } from "@/hooks/useAdminCore";
import { useI18n } from "@/i18n";

export default function DashboardPage() {
  const { t } = useI18n();
  const query = useAdminDashboard();
  const data = query.data as {
    snapshot?: Record<string, number>;
    health_breakdown?: Record<string, number>;
    alerts?: Record<string, number>;
    recent_professionals?: Array<{ id: string; name: string; business_name: string | null; plan_type: string; onboarding_completed: boolean }>;
  } | undefined;
  const snapshot = data?.snapshot ?? {};

  return (
    <Page title={t("dashboard.title")} subtitle={t("dashboard.subtitle")}>
      {query.isLoading ? <SkeletonGrid /> : null}
      {query.isError ? <ErrorCard /> : null}
      {data ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Metric icon={BarChart3} label={t("dashboard.mrr")} value={money(snapshot.mrr ?? 0)} />
            <Metric icon={Activity} label={t("dashboard.active")} value={String(snapshot.active_professionals ?? 0)} />
            <Metric icon={AlertTriangle} label={t("dashboard.churn")} value={String(data.alerts?.critical_health ?? 0)} />
            <Metric icon={MessageCircle} label={t("dashboard.messages")} value={String(snapshot.total_messages_sent ?? 0)} />
          </div>
          <section className="grid gap-3 lg:grid-cols-2">
            <Card className="rounded-lg">
              <CardHeader><CardTitle>{t("dashboard.alerts")}</CardTitle></CardHeader>
              <CardContent className="grid gap-2 sm:grid-cols-2">
                {Object.entries(data.alerts ?? {}).map(([key, value]) => <Badge key={key} variant={value > 0 ? "secondary" : "success"}>{key}: {value}</Badge>)}
              </CardContent>
            </Card>
            <Card className="rounded-lg">
              <CardHeader><CardTitle>{t("dashboard.recent")}</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                {data.recent_professionals?.map((item) => (
                  <Link className="flex items-center justify-between rounded-md border p-2 text-sm hover:bg-zinc-50" key={item.id} to={`/profissionais/${item.id}`}>
                    <span className="flex items-center gap-2"><UserRoundPlus className="h-4 w-4 text-violet-600" />{item.business_name || item.name}</span>
                    <Badge variant="secondary">{item.plan_type}</Badge>
                  </Link>
                ))}
              </CardContent>
            </Card>
          </section>
        </>
      ) : null}
    </Page>
  );
}

function Page({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return <div className="mx-auto flex w-full max-w-6xl flex-col gap-5 px-4 py-5 sm:px-6"><header><p className="text-xs font-semibold uppercase text-violet-700">SaaS</p><h1 className="mt-1 text-2xl font-semibold">{title}</h1><p className="mt-1 text-sm text-zinc-500">{subtitle}</p></header>{children}</div>;
}
function Metric({ icon: Icon, label, value }: { icon: typeof BarChart3; label: string; value: string }) {
  return <Card className="rounded-lg"><CardContent className="flex items-center gap-3 p-4"><Icon className="h-5 w-5 text-violet-700" /><div><p className="text-xs font-semibold text-zinc-500">{label}</p><p className="text-xl font-semibold">{value}</p></div></CardContent></Card>;
}
function SkeletonGrid() { return <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{[1,2,3,4].map((i) => <Skeleton className="h-24" key={i} />)}</div>; }
function ErrorCard() { const { t } = useI18n(); return <Card><CardContent className="p-5 text-red-700">{t("common.error")}</CardContent></Card>; }
function money(value: number) { return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value); }
