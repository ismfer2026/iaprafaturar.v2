import { Activity, BarChart3, MessageCircle, TrendingDown } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Badge, Card, CardContent, CardHeader, CardTitle, Skeleton } from "@iaprafaturar/ui";
import { useI18n } from "@/i18n";
import { supabase } from "@/lib/supabase";

interface AdminDashboard {
  snapshot?: {
    mrr?: number;
    active_professionals?: number;
    churned_professionals?: number;
    total_messages_sent?: number;
  };
  health_breakdown?: Record<string, number>;
}

async function loadDashboard(): Promise<AdminDashboard> {
  const { data, error } = await supabase.rpc("get_admin_dashboard_rpc");
  if (error) throw error;
  return data as AdminDashboard;
}

export default function DashboardPage() {
  const { t } = useI18n();
  const query = useQuery({ queryKey: ["admin-dashboard"], queryFn: loadDashboard });
  const snapshot = query.data?.snapshot ?? {};
  const health = query.data?.health_breakdown ?? {};

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-5 px-4 py-5 sm:px-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-violet-700">{t("dashboard.eyebrow")}</p>
        <h1 className="mt-1 text-2xl font-semibold text-zinc-950">{t("dashboard.title")}</h1>
        <p className="mt-1 max-w-2xl text-sm text-zinc-500">{t("dashboard.subtitle")}</p>
      </div>

      {query.isLoading ? <DashboardSkeleton /> : null}
      {query.isError ? <ErrorCard /> : null}

      {!query.isLoading && !query.isError ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard icon={BarChart3} label={t("dashboard.mrr")} value={formatCurrency(snapshot.mrr ?? 0)} />
            <MetricCard icon={Activity} label={t("dashboard.active")} value={String(snapshot.active_professionals ?? 0)} />
            <MetricCard icon={TrendingDown} label={t("dashboard.churn")} value={String(snapshot.churned_professionals ?? 0)} />
            <MetricCard icon={MessageCircle} label={t("dashboard.messages")} value={String(snapshot.total_messages_sent ?? 0)} />
          </div>

          <Card className="rounded-lg">
            <CardHeader>
              <CardTitle>{t("dashboard.health")}</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              {Object.entries(health).map(([level, count]) => (
                <Badge key={level} variant="secondary">{level}: {count}</Badge>
              ))}
            </CardContent>
          </Card>
        </>
      ) : null}
    </div>
  );
}

function MetricCard({ icon: Icon, label, value }: { icon: typeof BarChart3; label: string; value: string }) {
  return (
    <Card className="rounded-lg">
      <CardContent className="flex items-center gap-3 p-4">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-violet-50 text-violet-700">
          <Icon className="h-5 w-5" />
        </div>
        <div>
          <p className="text-xs font-semibold text-zinc-500">{label}</p>
          <p className="text-xl font-semibold text-zinc-950">{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function DashboardSkeleton() {
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {Array.from({ length: 4 }).map((_, index) => (
        <Card key={index} className="rounded-lg">
          <CardContent className="space-y-3 p-4">
            <Skeleton className="h-5 w-20" />
            <Skeleton className="h-8 w-28" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function ErrorCard() {
  const { t } = useI18n();
  return (
    <Card className="rounded-lg">
      <CardContent className="p-5 text-sm font-semibold text-red-700">{t("common.error")}</CardContent>
    </Card>
  );
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}
