import { RefreshCw } from "lucide-react";
import { Button, Skeleton } from "@iaprafaturar/ui";
import { DataRow, GrowthAccessDenied, GrowthPageHeader, relationName } from "@/components/growth/GrowthShared";
import { useAuth } from "@/contexts/AuthContext";
import { useRfm } from "@/hooks/useGrowth";
import { useI18n } from "@/i18n";

export default function RfmPage() {
  const { professionalId, role } = useAuth();
  const { t } = useI18n();
  const query = useRfm(role === "gestor" ? professionalId : null);
  if (role !== "gestor") return <GrowthAccessDenied />;
  return <main className="mx-auto w-full max-w-7xl space-y-5 px-4 py-5 sm:px-6"><GrowthPageHeader title={t("growth.tab.rfm")} description={t("growth.subtitle")} action={<Button variant="outline" disabled={query.isRefreshing} onClick={() => query.refresh()}><RefreshCw className="mr-2 h-4 w-4" />{t("growth.action.refreshScores")}</Button>} /><section className="grid grid-cols-5 gap-2">{Array.from({ length: 25 }, (_, index) => { const r = 5 - Math.floor(index / 5); const f = index % 5 + 1; const count = query.data?.rfm.filter((item) => item.recency_score === r && item.frequency_score === f).length ?? 0; return <div key={`${r}-${f}`} className="flex aspect-square items-center justify-center rounded-md border border-zinc-200 bg-white text-sm font-semibold">{r}{f}<span className="ml-1 text-xs text-zinc-400">({count})</span></div>; })}</section><div className="grid gap-4 lg:grid-cols-[1fr_360px]"><section className="space-y-3">{query.isLoading ? <Skeleton className="h-40 w-full" /> : query.data?.rfm.map((item) => <DataRow key={item.id} title={relationName(item.clients)} subtitle={item.segment} value={item.rfm_code} />)}</section><section className="space-y-3">{query.isLoading ? <Skeleton className="h-40 w-full" /> : query.data?.reactivationQueue.length ? query.data.reactivationQueue.map((item) => <DataRow key={item.client_id} title={item.full_name} subtitle={`${t("growth.reactivation.cooldown")} ${item.reactivation_cooldown_until ?? t("common.none")} · ${t("growth.reactivation.attempts")} ${item.reactivation_attempts_in_cycle}`} value={String(item.score)} />) : <div className="rounded-md border border-dashed border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-500">{t("growth.reactivation.empty")}</div>}</section></div></main>;
}
