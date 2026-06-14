import { Button, Card, CardContent, Skeleton } from "@iaprafaturar/ui";
import { GrowthAccessDenied, GrowthPageHeader } from "@/components/growth/GrowthShared";
import { useAuth } from "@/contexts/AuthContext";
import { usePartners } from "@/hooks/useGrowth";
import { useI18n } from "@/i18n";

export default function PartnersPage() {
  const { professionalId, role } = useAuth();
  const { t } = useI18n();
  const query = usePartners(role === "gestor" ? professionalId : null);
  if (role !== "gestor") return <GrowthAccessDenied />;
  if (query.isLoading) return <div className="p-5"><Skeleton className="h-40 w-full" /></div>;
  const data = query.data ?? {};
  const hasPartner = Boolean(data["id"]);
  return <main className="mx-auto w-full max-w-5xl space-y-5 px-4 py-5 sm:px-6"><GrowthPageHeader title={t("growth.partners.title")} description={t("growth.partners.description")} action={!hasPartner ? <Button disabled={query.isRequesting} onClick={() => query.request()}>{t("growth.partners.request")}</Button> : undefined} /><Card className="rounded-lg"><CardContent className="grid gap-4 p-4 sm:grid-cols-2"><div><p className="text-xs font-semibold text-zinc-500">{t("growth.partners.status")}</p><p className="mt-1 font-semibold">{String(data["status"] ?? t("common.pending"))}</p></div><div><p className="text-xs font-semibold text-zinc-500">{t("growth.partners.code")}</p><p className="mt-1 font-semibold">{String(data["affiliate_code"] ?? "-")}</p></div><div><p className="text-xs font-semibold text-zinc-500">{t("growth.partners.referrals")}</p><p className="mt-1 font-semibold">{Array.isArray(data["referrals"]) ? data["referrals"].length : 0}</p></div><div><p className="text-xs font-semibold text-zinc-500">{t("growth.partners.commissions")}</p><p className="mt-1 font-semibold">{Array.isArray(data["commissions"]) ? data["commissions"].length : 0}</p></div></CardContent></Card></main>;
}
