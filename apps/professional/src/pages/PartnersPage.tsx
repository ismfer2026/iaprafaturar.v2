import { useState } from "react";
import { Building2, Check, Copy, MessageCircle, Users } from "lucide-react";
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, Input, Skeleton } from "@iaprafaturar/ui";
import { GrowthAccessDenied } from "@/components/growth/GrowthShared";
import { useAuth } from "@/contexts/AuthContext";
import { usePartners } from "@/hooks/useGrowth";
import { useI18n, type TranslationKey } from "@/i18n";

const STATUS_KEYS: Record<string, TranslationKey> = {
  pending: "growth.partners.status.pending",
  active: "growth.partners.status.active",
  suspended: "growth.partners.status.suspended",
  rejected: "growth.partners.status.rejected",
};

const STATUS_VARIANTS: Record<string, "secondary" | "success" | "destructive"> = {
  pending: "secondary",
  active: "success",
  suspended: "destructive",
  rejected: "destructive",
};

function buildReferralLink(code: string): string {
  const base = (import.meta.env["VITE_CLIENT_APP_URL"] as string | undefined) ?? "https://app.iaprafaturar.com.br";
  return `${base.replace(/\/$/, "")}/cadastro?ref=${encodeURIComponent(code)}`;
}

function formatBRL(cents: number): string {
  return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export default function PartnersPage() {
  const { professionalId, role } = useAuth();
  const { t } = useI18n();
  const query = usePartners(role === "gestor" ? professionalId : null);
  const [copied, setCopied] = useState(false);

  if (role !== "gestor") return <GrowthAccessDenied />;
  if (query.isLoading) {
    return (
      <main className="mx-auto w-full max-w-5xl space-y-4 px-4 py-5 sm:px-6">
        <Skeleton className="h-9 w-40" />
        <Skeleton className="h-32 w-full rounded-xl" />
        <Skeleton className="h-44 w-full rounded-xl" />
      </main>
    );
  }

  const data = query.data ?? {};
  const hasPartner = Boolean(data["partner_id"]);
  const status = String(data["status"] ?? "");
  const affiliateCode = String(data["affiliate_code"] ?? "");
  const referralLink = affiliateCode ? buildReferralLink(affiliateCode) : "";
  const commissionRate = Number(data["commission_rate"] ?? 15);
  const pendingBalanceCents = Number(data["pending_balance_cents"] ?? 0);
  const referrals = Array.isArray(data["referrals"]) ? (data["referrals"] as Array<{ status: string }>) : [];
  const activeReferrals = referrals.filter((r) => r.status === "paid" || r.status === "trial").length;
  const rateParams = { rate: commissionRate };

  async function copyLink() {
    if (!referralLink) return;
    await navigator.clipboard.writeText(referralLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function shareWhatsApp() {
    if (!referralLink) return;
    const message = t("growth.partners.whatsappMessage", { link: referralLink });
    window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(message)}`, "_blank");
  }

  return (
    <main className="mx-auto w-full max-w-2xl space-y-5 px-4 py-5 sm:px-6">
      <header>
        <h1 className="text-2xl font-semibold text-zinc-950">{t("growth.partners.title")}</h1>
        <p className="mt-1 text-sm text-zinc-500">{t("growth.partners.description")}</p>
      </header>

      {/* Hero banner */}
      <div className="flex flex-col gap-4 rounded-2xl bg-gradient-to-r from-violet-700 to-violet-800 p-5 text-white sm:flex-row sm:items-center">
        <div className="flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-2xl bg-white/20">
          <Users className="h-7 w-7" />
        </div>
        <div>
          <h2 className="text-xl font-black">{t("growth.partners.hero.title")}</h2>
          <p className="mt-1 text-sm text-violet-100">
            {t("growth.partners.hero.prefix")}{" "}
            <strong className="text-yellow-300">{t("growth.partners.hero.highlight", rateParams)}</strong>{" "}
            {t("growth.partners.hero.suffix")}
          </p>
        </div>
      </div>

      {/* Programa de parceiros */}
      <Card>
        <CardHeader className="border-b pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Building2 className="h-4 w-4 text-violet-700" />
            {t("growth.partners.programTitle")}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 pt-4">
          {hasPartner ? (
            <>
              <div className="flex items-center justify-end">
                <Badge variant={STATUS_VARIANTS[status] ?? "secondary"}>
                  {STATUS_KEYS[status] ? t(STATUS_KEYS[status]) : status}
                </Badge>
              </div>

              <div className="grid grid-cols-2 gap-3 text-center">
                <div className="rounded-xl border bg-zinc-50 p-4">
                  <p className="mb-1 text-xs uppercase tracking-wider text-zinc-500">
                    {t("growth.partners.activeReferrals")}
                  </p>
                  <p className="text-3xl font-black text-violet-700">{activeReferrals}</p>
                </div>
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
                  <p className="mb-1 text-xs uppercase tracking-wider text-zinc-500">
                    {t("growth.partners.availableBalance")}
                  </p>
                  <p className="text-3xl font-black text-emerald-600">{formatBRL(pendingBalanceCents)}</p>
                </div>
              </div>

              {referralLink ? (
                <div>
                  <label className="text-sm font-medium text-zinc-700">{t("growth.partners.referralLink")}</label>
                  <p className="mb-2 text-xs text-zinc-500">{t("growth.partners.linkHint")}</p>
                  <div className="flex gap-2">
                    <Input readOnly value={referralLink} className="bg-zinc-50 font-mono text-xs" />
                    <Button size="icon" variant="outline" onClick={copyLink} aria-label={t("growth.partners.copy")}>
                      {copied ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
                    </Button>
                  </div>

                  {status === "pending" ? (
                    <p className="mt-2 text-xs text-amber-700">{t("growth.partners.pending.info")}</p>
                  ) : null}

                  <Button
                    variant="outline"
                    className="mt-3 w-full gap-2 border-violet-700 text-violet-700 hover:bg-violet-50"
                    onClick={shareWhatsApp}
                  >
                    <MessageCircle className="h-4 w-4" />
                    {t("growth.partners.shareWhatsApp")}
                  </Button>
                </div>
              ) : null}
            </>
          ) : (
            <div className="space-y-4 py-6 text-center">
              <div className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-violet-100">
                <Users className="h-8 w-8 text-violet-700" />
              </div>
              <div>
                <p className="text-lg font-semibold text-zinc-950">{t("growth.partners.notPartnerYet")}</p>
                <p className="mt-1 text-sm text-zinc-500">{t("growth.partners.activateHint")}</p>
              </div>
              <Button disabled={query.isRequesting} className="px-8" onClick={() => query.request()}>
                {t("growth.partners.activate")}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Como funciona */}
      <Card>
        <CardHeader className="border-b pb-3">
          <CardTitle className="text-base">{t("growth.partners.howItWorks")}</CardTitle>
        </CardHeader>
        <CardContent className="pt-4">
          <ol className="space-y-3">
            {[
              t("growth.partners.step1"),
              t("growth.partners.step2"),
              t("growth.partners.step3", rateParams),
              t("growth.partners.step4"),
            ].map((step, index) => (
              <li key={index} className="flex items-start gap-3">
                <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-violet-700 text-xs font-bold text-white">
                  {index + 1}
                </span>
                <span className="text-sm leading-snug text-zinc-500">{step}</span>
              </li>
            ))}
          </ol>
        </CardContent>
      </Card>
    </main>
  );
}
