import { useMemo, useState } from "react";
import { Link, Navigate, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { ArrowRight, Languages, MessageCircle, ShieldCheck } from "lucide-react";
import { Button, Input } from "@iaprafaturar/ui";
import type { Locale } from "@/i18n";
import { useI18n } from "@/i18n";
import { callPublicCreateAccount, isPublicCreateAccountError } from "@/lib/publicCreateAccount";

type PublicAccountError =
  | "invalid_input"
  | "pre_account_not_found"
  | "email_already_registered"
  | "identity_integrity_incident"
  | "invalid_professional_id"
  | "invalid_email"
  | "weak_password"
  | "internal_error";

const errorMessages: Record<PublicAccountError, Parameters<ReturnType<typeof useI18n>["t"]>[0]> = {
  invalid_input: "publicAccount.error.invalid_input",
  pre_account_not_found: "publicAccount.error.pre_account_not_found",
  email_already_registered: "publicAccount.error.email_already_registered",
  identity_integrity_incident: "publicAccount.error.identity_integrity_incident",
  invalid_professional_id: "publicAccount.error.invalid_professional_id",
  invalid_email: "publicAccount.error.invalid_email",
  weak_password: "publicAccount.error.weak_password",
  internal_error: "publicAccount.error.internal_error",
};

function normalizeLocale(value: string | null): Locale {
  if (value === "en-US" || value === "es-419" || value === "pt-BR") return value;
  if (value?.toLowerCase().startsWith("en")) return "en-US";
  if (value?.toLowerCase().startsWith("es")) return "es-419";
  return "pt-BR";
}

export default function PublicEntrarPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const { t, setLocale } = useI18n();
  const lang = useMemo(() => normalizeLocale(searchParams.get("lang")), [searchParams]);
  const ref = searchParams.get("ref") ?? undefined;
  const conversation = searchParams.get("conversation") ?? undefined;
  const cameFromInvite = Boolean((location.state as { fromInvite?: boolean } | null)?.fromInvite);

  const [email, setEmail] = useState(searchParams.get("email") ?? "");
  const [name, setName] = useState("");
  const [phoneWhatsapp, setPhoneWhatsapp] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // Direct/favorited referral URLs must see the capture page first.
  if (ref && !cameFromInvite) {
    const params = new URLSearchParams({ lang });
    return <Navigate to={`/convite/${encodeURIComponent(ref)}?${params.toString()}`} replace />;
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setIsLoading(true);
    setLocale(lang);

    try {
      const data = await callPublicCreateAccount({
        mode: "create_preaccount",
        email: email.trim().toLowerCase(),
        name: name.trim() || undefined,
        phone_whatsapp: phoneWhatsapp.trim() || undefined,
        ref,
        lang,
        conversation,
        collected_data: {
          entry_path: "/entrar",
          ref: ref ?? null,
          lang,
          conversation: conversation ?? null,
        },
      });

      if (isPublicCreateAccountError(data)) {
        setError(t(errorMessages[data.error]));
        return;
      }

      const next = new URLSearchParams({
        pid: data.professional_id,
        email: data.email,
        lang,
      });
      if (ref) next.set("ref", ref);
      if (conversation) next.set("conversation", conversation);
      navigate(`/criar-conta?${next.toString()}`);
    } catch {
      setError(t("publicAccount.error.internal_error"));
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-stone-50 text-zinc-950">
      <section className="mx-auto grid min-h-screen w-full max-w-6xl grid-cols-1 lg:grid-cols-[0.95fr_1.05fr]">
        <div className="hidden min-h-screen flex-col justify-between bg-gradient-to-br from-primary-700 via-primary-800 to-zinc-950 p-10 text-white lg:flex">
          <div>
            <p className="text-sm font-semibold text-yellow-300">iaprafaturar</p>
            <h1 className="mt-10 max-w-md text-5xl font-semibold leading-tight">
              {t("publicAccount.enter.heroTitle")}
            </h1>
            <p className="mt-5 max-w-md text-base leading-7 text-primary-100">
              {t("publicAccount.enter.heroSubtitle")}
            </p>
          </div>
          <div className="grid gap-3">
            <div className="rounded-lg border border-white/15 bg-white/10 p-4">
              <MessageCircle className="mb-3 h-5 w-5 text-yellow-300" />
              <p className="text-sm text-white/90">{t("publicAccount.enter.point.whatsapp")}</p>
            </div>
            <div className="rounded-lg border border-white/15 bg-white/10 p-4">
              <ShieldCheck className="mb-3 h-5 w-5 text-yellow-300" />
              <p className="text-sm text-white/90">{t("publicAccount.enter.point.secure")}</p>
            </div>
          </div>
        </div>

        <div className="flex min-h-screen items-center px-4 py-8 sm:px-8">
          <div className="mx-auto w-full max-w-md">
            <div className="mb-8">
              <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-zinc-200 bg-white px-3 py-1 text-xs font-medium text-zinc-600">
                <Languages className="h-3.5 w-3.5" />
                {lang}
              </div>
              <h2 className="text-3xl font-semibold tracking-tight text-zinc-950">
                {t("publicAccount.enter.title")}
              </h2>
              <p className="mt-2 text-sm leading-6 text-zinc-600">
                {t("publicAccount.enter.subtitle")}
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <label htmlFor="name" className="text-sm font-medium text-zinc-800">
                  {t("auth.signup.name")}
                </label>
                <Input
                  id="name"
                  autoComplete="name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder={t("publicAccount.enter.namePlaceholder")}
                />
              </div>

              <div className="space-y-1.5">
                <label htmlFor="email" className="text-sm font-medium text-zinc-800">
                  {t("auth.email")}
                </label>
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="seu@email.com"
                />
              </div>

              <div className="space-y-1.5">
                <label htmlFor="phoneWhatsapp" className="text-sm font-medium text-zinc-800">
                  WhatsApp
                </label>
                <Input
                  id="phoneWhatsapp"
                  type="tel"
                  autoComplete="tel"
                  value={phoneWhatsapp}
                  onChange={(event) => setPhoneWhatsapp(event.target.value)}
                  placeholder="(11) 99999-9999"
                />
              </div>

              {error ? (
                <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                  {error}
                </p>
              ) : null}

              <Button type="submit" size="lg" className="w-full" disabled={isLoading}>
                {isLoading ? t("publicAccount.enter.loading") : t("publicAccount.enter.submit")}
                <ArrowRight className="h-4 w-4" />
              </Button>
            </form>

            <p className="mt-6 text-center text-sm text-zinc-500">
              {t("publicAccount.enter.hasLogin")}{" "}
              <Link to="/login" className="font-medium text-primary-700 hover:underline">
                {t("auth.login.submit")}
              </Link>
            </p>
          </div>
        </div>
      </section>
    </main>
  );
}
