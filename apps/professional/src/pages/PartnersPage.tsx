import { useState } from "react";
import { Check, Copy, MessageCircle } from "lucide-react";
import { Badge, Button, Card, CardContent, Skeleton } from "@iaprafaturar/ui";
import { GrowthAccessDenied, GrowthPageHeader } from "@/components/growth/GrowthShared";
import { useAuth } from "@/contexts/AuthContext";
import { usePartners } from "@/hooks/useGrowth";
import { useI18n, type TranslationKey } from "@/i18n";

const STATUS_KEYS: Record<string, TranslationKey> = {
  pending: "growth.partners.status.pending",
  active: "growth.partners.status.active",
  suspended: "growth.partners.status.suspended",
};

const STATUS_VARIANTS: Record<string, "secondary" | "success" | "destructive"> = {
  pending: "secondary",
  active: "success",
  suspended: "destructive",
};

function buildReferralLink(code: string): string {
  const base = (import.meta.env["VITE_CLIENT_APP_URL"] as string | undefined) ?? "https://app.iaprafaturar.com.br";
  return `${base.replace(/\/$/, "")}/cadastro?ref=${encodeURIComponent(code)}`;
}

export default function PartnersPage() {
  const { professionalId, role } = useAuth();
  const { t } = useI18n();
  const query = usePartners(role === "gestor" ? professionalId : null);
  const [copied, setCopied] = useState(false);

  if (role !== "gestor") return <GrowthAccessDenied />;
  if (query.isLoading) return <div className="p-5"><Skeleton className="h-40 w-full" /></div>;

  const data = query.data ?? {};
  const hasPartner = Boolean(data["partner_id"]);
  const status = String(data["status"] ?? "");
  const affiliateCode = String(data["affiliate_code"] ?? "");
  const referralLink = affiliateCode ? buildReferralLink(affiliateCode) : "";

  async function copyLink() {
    if (!referralLink) return;
    await navigator.clipboard.writeText(referralLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function shareWhatsApp() {
    if (!referralLink) return;
    window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(referralLink)}`, "_blank");
  }

  return (
    <main className="mx-auto w-full max-w-5xl space-y-5 px-4 py-5 sm:px-6">
      <GrowthPageHeader
        title={t("growth.partners.title")}
        description={t("growth.partners.description")}
        action={
          !hasPartner ? (
            <Button disabled={query.isRequesting} onClick={() => query.request()}>
              {t("growth.partners.request")}
            </Button>
          ) : undefined
        }
      />

      {hasPartner ? (
        <div className="space-y-4">
          <Card className="rounded-lg">
            <CardContent className="grid gap-4 p-4 sm:grid-cols-2">
              <div>
                <p className="text-xs font-semibold text-zinc-500">{t("growth.partners.status")}</p>
                <div className="mt-1 flex items-center gap-2">
                  <Badge variant={STATUS_VARIANTS[status] ?? "secondary"}>
                    {STATUS_KEYS[status] ? t(STATUS_KEYS[status]) : status}
                  </Badge>
                </div>
              </div>
              <div>
                <p className="text-xs font-semibold text-zinc-500">{t("growth.partners.code")}</p>
                <p className="mt-1 font-mono text-sm font-semibold tracking-wide text-zinc-950">{affiliateCode}</p>
              </div>
              <div>
                <p className="text-xs font-semibold text-zinc-500">{t("growth.partners.referrals")}</p>
                <p className="mt-1 font-semibold">{Array.isArray(data["referrals"]) ? (data["referrals"] as unknown[]).length : 0}</p>
              </div>
              <div>
                <p className="text-xs font-semibold text-zinc-500">{t("growth.partners.commissions")}</p>
                <p className="mt-1 font-semibold">{Array.isArray(data["commissions"]) ? (data["commissions"] as unknown[]).length : 0}</p>
              </div>
            </CardContent>
          </Card>

          {referralLink ? (
            <Card className="rounded-lg">
              <CardContent className="space-y-3 p-4">
                <div>
                  <p className="text-xs font-semibold text-zinc-500">{t("growth.partners.referralLink")}</p>
                  <p className="mt-1 break-all rounded-md bg-zinc-50 px-3 py-2 font-mono text-sm text-zinc-700">
                    {referralLink}
                  </p>
                </div>
                {status === "pending" ? (
                  <p className="text-xs text-amber-700">{t("growth.partners.pending.info")}</p>
                ) : null}
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" className="gap-2" onClick={copyLink}>
                    {copied ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
                    {copied ? t("growth.partners.copied") : t("growth.partners.copy")}
                  </Button>
                  <Button variant="outline" className="gap-2" onClick={shareWhatsApp}>
                    <MessageCircle className="h-4 w-4 text-emerald-600" />
                    {t("growth.partners.shareWhatsApp")}
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : null}
        </div>
      ) : (
        <Card className="rounded-lg border-dashed">
          <CardContent className="px-4 py-8 text-center text-sm text-zinc-500">
            {t("growth.partners.description")}
          </CardContent>
        </Card>
      )}
    </main>
  );
}
