import { AlertTriangle, Gift, Network } from "lucide-react";
import { useState } from "react";
import { Button, Card, CardContent, Input, Skeleton } from "@iaprafaturar/ui";
import { DataRow, GrowthAccessDenied, GrowthPageHeader, MetricCard } from "@/components/growth/GrowthShared";
import { useAuth } from "@/contexts/AuthContext";
import { useRewards } from "@/hooks/useGrowth";
import { useClients } from "@/hooks/useClients";
import { useI18n } from "@/i18n";

export default function RewardsPage() {
  const { professionalId, role } = useAuth();
  const { t } = useI18n();
  const query = useRewards(role === "gestor" ? professionalId : null);
  const clients = useClients(role === "gestor" ? professionalId : null);
  const [clientId, setClientId] = useState("");
  const [points, setPoints] = useState("50");
  const [referralEventId, setReferralEventId] = useState("");
  const [referralPoints, setReferralPoints] = useState("100");
  if (role !== "gestor") return <GrowthAccessDenied />;
  const loyalty = query.data?.dashboard.loyalty ?? [];
  const referralEvents = query.data?.referrals ?? [];
  return <main className="mx-auto w-full max-w-7xl space-y-5 px-4 py-5 sm:px-6"><GrowthPageHeader title={t("growth.tab.loyalty")} description={t("growth.loyalty.description")} /><section className="grid gap-3 sm:grid-cols-3"><MetricCard icon={Gift} label={t("growth.metric.loyaltyPoints")} value={String(loyalty.reduce((sum, item) => sum + Number(item["points_delta"] ?? 0), 0))} /><MetricCard icon={Network} label={t("growth.metric.referrals")} value={String(referralEvents.length)} /><MetricCard icon={AlertTriangle} label={t("growth.rewards.divergences")} value={String(query.data?.reconciliation.length ?? 0)} /></section><div className="grid gap-4 lg:grid-cols-[1fr_340px]"><section className="space-y-3">{query.isLoading ? <Skeleton className="h-40 w-full" /> : loyalty.map((item, index) => <DataRow key={String(item["id"] ?? index)} title={String(item["client_name"] ?? t("growth.info.client"))} subtitle={String(item["reason"] ?? "")} value={`${String(item["points_delta"] ?? 0)} pts`} />)}<Card className="rounded-lg"><CardContent className="space-y-3 p-4"><p className="text-sm font-semibold text-zinc-950">{t("growth.rewards.referralReward")}</p><select className="h-10 w-full rounded-md border border-zinc-200 px-3 text-sm" value={referralEventId} onChange={(e) => setReferralEventId(e.target.value)}><option value="">{t("common.select")}</option>{referralEvents.map((event) => <option key={String(event["id"])} value={String(event["id"])}>{String(event["event_type"] ?? t("growth.info.referralEvent"))} · {String(event["id"]).slice(0, 8)}</option>)}</select><Input type="number" min="1" value={referralPoints} onChange={(e) => setReferralPoints(e.target.value)} /><Button className="w-full" disabled={!referralEventId || query.isDeliveringReferralReward} onClick={() => query.deliverReferralReward({ referralEventId, points: Number(referralPoints) })}>{t("growth.rewards.deliver")}</Button></CardContent></Card></section><Card className="rounded-lg"><CardContent className="space-y-3 p-4"><select className="h-10 w-full rounded-md border border-zinc-200 px-3 text-sm" value={clientId} onChange={(e) => setClientId(e.target.value)}><option value="">{t("common.select")}</option>{clients.data?.map((client) => <option key={client.id} value={client.id}>{client.full_name} · {client.loyalty_points} pts</option>)}</select><Input type="number" min="1" value={points} onChange={(e) => setPoints(e.target.value)} /><Button className="w-full" disabled={!clientId || query.isRedeeming} onClick={() => query.redeem({ clientId, points: Number(points) })}>{t("growth.loyalty.redeem")}</Button></CardContent></Card></div></main>;
}
