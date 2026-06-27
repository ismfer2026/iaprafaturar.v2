import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { ArrowRight, Bot, Shield, Sparkles, Star, TrendingUp, Zap } from "lucide-react";
import { Button } from "@iaprafaturar/ui";
import type { Locale } from "@/i18n";
import { useI18n, type TranslationKey } from "@/i18n";
import { supabase } from "@/lib/supabase";

const BENEFITS: Array<{ icon: typeof Bot; textKey: TranslationKey }> = [
  { icon: Bot, textKey: "publicInvite.benefits.aiWhatsApp" },
  { icon: TrendingUp, textKey: "publicInvite.benefits.dashboard" },
  { icon: Zap, textKey: "publicInvite.benefits.crm" },
  { icon: Shield, textKey: "publicInvite.benefits.security" },
];

function normalizeLocale(value: string | null): Locale {
  if (value === "en-US" || value === "es-419" || value === "pt-BR") return value;
  if (value?.toLowerCase().startsWith("en")) return "en-US";
  if (value?.toLowerCase().startsWith("es")) return "es-419";
  return "pt-BR";
}

export default function PublicInviteLandingPage() {
  const { t, setLocale } = useI18n();
  const { codigo } = useParams<{ codigo?: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const lang = useMemo(() => normalizeLocale(searchParams.get("lang")), [searchParams]);
  const referralCode = (codigo || searchParams.get("ref") || "").toUpperCase();

  const [referrerName, setReferrerName] = useState<string | null>(null);
  const [loadingReferrer, setLoadingReferrer] = useState(Boolean(referralCode));

  useEffect(() => {
    setLocale(lang);
  }, [lang, setLocale]);

  useEffect(() => {
    if (!referralCode) {
      setLoadingReferrer(false);
      return;
    }

    let active = true;
    supabase
      .rpc("get_affiliate_referrer_name", { p_affiliate_code: referralCode })
      .then(
        ({ data }) => {
          if (!active) return;
          const name = (data as { name?: string } | null)?.name;
          setReferrerName(name?.trim() || null);
          setLoadingReferrer(false);
        },
        () => {
          if (active) setLoadingReferrer(false);
        },
      );

    return () => {
      active = false;
    };
  }, [referralCode]);

  function handleCTA() {
    const params = new URLSearchParams({ lang });
    if (referralCode) params.set("ref", referralCode);
    navigate(`/entrar?${params.toString()}`, { state: { fromInvite: true } });
  }

  return (
    <main className="flex min-h-screen flex-col bg-gradient-to-br from-primary-700 via-primary-800 to-zinc-950">
      <div className="flex flex-1 flex-col items-center justify-center px-4 py-12 text-center text-white">
        {referralCode ? (
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-white/25 bg-white/10 px-4 py-1.5 text-sm font-semibold backdrop-blur-sm">
            <span aria-hidden="true">🎁</span>
            {loadingReferrer ? (
              <span className="text-white/80">{t("publicInvite.badge.loading")}</span>
            ) : referrerName ? (
              <span>{t("publicInvite.badge.invitedBy", { referrer: referrerName })}</span>
            ) : (
              <span>{t("publicInvite.badge.specialInvite")}</span>
            )}
          </div>
        ) : null}

        <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-3xl border border-white/30 bg-white/20 shadow-xl backdrop-blur">
          <Sparkles className="h-10 w-10 text-white" />
        </div>

        <h1 className="mb-3 text-3xl font-black leading-tight sm:text-5xl">
          {t("publicInvite.hero.titleLine1")}
          <br className="hidden sm:block" />
          {" "}
          {t("publicInvite.hero.titleLine2Prefix")}{" "}
          <span className="text-yellow-300">{t("publicInvite.hero.titleHighlight")}</span>
        </h1>

        <p className="mb-2 max-w-md text-base text-white/80 sm:text-lg">
          {referrerName
            ? t("publicInvite.hero.referrerDescription", { referrer: referrerName })
            : t("publicInvite.hero.description")}
        </p>

        <p className="mb-8 text-sm font-semibold text-white/90 sm:text-base">
          {t("publicInvite.hero.trial")}
        </p>

        <div className="mb-8 grid w-full max-w-lg grid-cols-1 gap-3 sm:grid-cols-2">
          {BENEFITS.map(({ icon: Icon, textKey }) => (
            <div
              key={textKey}
              className="flex items-start gap-3 rounded-2xl border border-white/15 bg-white/10 p-3 text-left backdrop-blur"
            >
              <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-xl bg-white/20">
                <Icon className="h-4 w-4 text-yellow-300" />
              </div>
              <span className="text-sm leading-snug text-white/90">{t(textKey)}</span>
            </div>
          ))}
        </div>

        <div className="mb-8 flex items-center gap-1">
          {Array.from({ length: 5 }).map((_, index) => (
            <Star key={index} className="h-4 w-4 fill-yellow-300 text-yellow-300" />
          ))}
          <span className="ml-2 text-sm text-white/80">{t("publicInvite.socialProof")}</span>
        </div>

        <Button
          onClick={handleCTA}
          size="lg"
          className="gap-2 rounded-2xl bg-yellow-400 px-10 py-6 text-lg font-black text-zinc-950 shadow-2xl shadow-yellow-400/30 transition-all hover:scale-105 hover:bg-yellow-300"
        >
          {t("publicInvite.cta")}
          <ArrowRight className="h-5 w-5" />
        </Button>

        <p className="mt-4 text-sm text-white/60">
          {t("publicInvite.loginPrompt")}{" "}
          <Link to="/login" className="font-semibold text-white underline underline-offset-2">
            {t("publicInvite.login")}
          </Link>
        </p>
      </div>
    </main>
  );
}
