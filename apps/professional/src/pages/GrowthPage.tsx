import { Link } from "react-router-dom";
import { Gift, HeartPulse, Megaphone, Network, TrendingUp, Users } from "lucide-react";
import { Card, CardContent, Skeleton } from "@iaprafaturar/ui";
import { useAuth } from "@/contexts/AuthContext";
import { useGrowthOverview } from "@/hooks/useGrowth";
import { useI18n } from "@/i18n";
import { GrowthAccessDenied, GrowthPageHeader, MetricCard } from "@/components/growth/GrowthShared";

export default function GrowthPage() {
  const { professionalId, role } = useAuth();
  const { t } = useI18n();
  const query = useGrowthOverview(role === "gestor" ? professionalId : null);
  if (role !== "gestor") return <GrowthAccessDenied />;
  if (query.isLoading) return <div className="p-5"><Skeleton className="h-48 w-full" /></div>;
  const data = query.data;
  const risk = data?.health.filter((item) => item.risk_level === "risk" || item.risk_level === "churn").length ?? 0;
  const loyalty = data?.dashboard.loyalty.reduce((sum, item) => sum + Number(item["points_delta"] ?? 0), 0) ?? 0;
  const links = [
    { to: "/campanhas", icon: Megaphone, title: t("growth.tab.campaigns"), description: t("growth.campaign.description") },
    { to: "/rfm", icon: TrendingUp, title: t("growth.tab.rfm"), description: t("growth.subtitle") },
    { to: "/recompensas", icon: Gift, title: t("growth.tab.loyalty"), description: t("growth.loyalty.description") },
    { to: "/aniversariantes", icon: Users, title: t("growth.birthdays.title"), description: t("growth.birthdays.description") },
    { to: "/parceiros", icon: Network, title: t("growth.partners.title"), description: t("growth.partners.description") },
  ];
  return <main className="mx-auto w-full max-w-7xl space-y-5 px-4 py-5 sm:px-6">
    <GrowthPageHeader title={t("growth.title")} description={t("growth.subtitle.full")} />
    <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <MetricCard icon={HeartPulse} label={t("growth.metric.riskClients")} value={String(risk)} />
      <MetricCard icon={Megaphone} label={t("growth.metric.campaigns")} value={String(data?.campaigns.length ?? 0)} />
      <MetricCard icon={Gift} label={t("growth.metric.loyaltyPoints")} value={String(loyalty)} />
      <MetricCard icon={TrendingUp} label={t("growth.metric.referrals")} value={String(data?.referrals ?? 0)} />
    </section>
    <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {links.map(({ to, icon: Icon, title, description }) => <Link key={to} to={to}><Card className="h-full rounded-lg transition-colors hover:border-primary-300"><CardContent className="flex gap-3 p-4"><Icon className="mt-0.5 h-5 w-5 shrink-0 text-primary-700" /><div><h2 className="font-semibold text-zinc-950">{title}</h2><p className="mt-1 text-sm text-zinc-500">{description}</p></div></CardContent></Card></Link>)}
    </section>
  </main>;
}
