import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { CheckCircle2, KeyRound, ShieldAlert } from "lucide-react";
import { Button, Input } from "@iaprafaturar/ui";
import type { Locale } from "@/i18n";
import { useI18n } from "@/i18n";
import { supabase } from "@/lib/supabase";
import {
  callPublicCreateAccount,
  isPublicCreateAccountError,
  type PublicCreateAccountOutput,
} from "@/lib/publicCreateAccount";

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

export default function PublicCreateAccountPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { t, setLocale } = useI18n();
  const professionalId = searchParams.get("pid") ?? "";
  const email = searchParams.get("email") ?? "";
  const lang = useMemo(() => normalizeLocale(searchParams.get("lang")), [searchParams]);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [status, setStatus] = useState<PublicCreateAccountOutput | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isChecking, setIsChecking] = useState(true);

  useEffect(() => {
    let active = true;
    setLocale(lang);

    async function loadStatus() {
      if (!professionalId || !email) {
        setError(t("publicAccount.error.invalid_input"));
        setIsChecking(false);
        return;
      }

      const data = await callPublicCreateAccount({
        mode: "get_status",
        professional_id: professionalId,
        email,
        lang,
      });

      if (!active) return;
      setStatus(data);
      if (isPublicCreateAccountError(data)) {
        setError(t(errorMessages[data.error]));
      }
      setIsChecking(false);
    }

    void loadStatus().catch(() => {
      if (!active) return;
      setError(t("publicAccount.error.internal_error"));
      setIsChecking(false);
    });

    return () => {
      active = false;
    };
  }, [email, lang, professionalId, setLocale, t]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);

    if (password !== confirmPassword) {
      setError(t("publicAccount.create.error.passwordMismatch"));
      return;
    }

    setIsLoading(true);
    try {
      const data = await callPublicCreateAccount({
        mode: "complete_account",
        professional_id: professionalId,
        email,
        password,
        lang,
      });

      if (isPublicCreateAccountError(data)) {
        setError(t(errorMessages[data.error]));
        return;
      }

      const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
      if (signInError) {
        setError(t("auth.login.error.invalid"));
        return;
      }

      navigate("/onboarding");
    } catch {
      setError(t("publicAccount.error.internal_error"));
    } finally {
      setIsLoading(false);
    }
  }

  const alreadyRegistered =
    status && !isPublicCreateAccountError(status) && "status" in status && status.status === "registered";

  return (
    <main className="min-h-screen bg-zinc-950 px-4 py-8 text-white">
      <section className="mx-auto flex min-h-[calc(100vh-4rem)] w-full max-w-md items-center">
        <div className="w-full">
          <div className="mb-8">
            <p className="text-sm font-semibold text-emerald-300">iaprafaturar</p>
            <h1 className="mt-4 text-3xl font-semibold tracking-tight">
              {t("publicAccount.create.title")}
            </h1>
            <p className="mt-2 text-sm leading-6 text-zinc-300">
              {t("publicAccount.create.subtitle")}
            </p>
          </div>

          <div className="rounded-lg border border-white/10 bg-white p-5 text-zinc-950 shadow-2xl">
            {isChecking ? (
              <div className="py-10 text-center text-sm text-zinc-500">
                {t("publicAccount.create.checking")}
              </div>
            ) : alreadyRegistered ? (
              <div className="space-y-5 text-center">
                <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-600" />
                <div>
                  <h2 className="text-lg font-semibold">{t("publicAccount.create.alreadyReady")}</h2>
                  <p className="mt-1 text-sm text-zinc-600">{email}</p>
                </div>
                <Button asChild className="w-full">
                  <Link to="/login">{t("auth.login.submit")}</Link>
                </Button>
              </div>
            ) : error && !status ? (
              <div className="space-y-5 text-center">
                <ShieldAlert className="mx-auto h-10 w-10 text-red-600" />
                <p className="text-sm text-zinc-700">{error}</p>
                <Button asChild variant="outline" className="w-full">
                  <Link to="/entrar">{t("publicAccount.create.restart")}</Link>
                </Button>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="rounded-md bg-zinc-50 px-3 py-2 text-sm text-zinc-600">
                  {email}
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="password" className="text-sm font-medium text-zinc-800">
                    {t("auth.password")}
                  </label>
                  <Input
                    id="password"
                    type="password"
                    autoComplete="new-password"
                    minLength={8}
                    required
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    placeholder={t("auth.signup.passwordPlaceholder")}
                  />
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="confirmPassword" className="text-sm font-medium text-zinc-800">
                    {t("publicAccount.create.confirmPassword")}
                  </label>
                  <Input
                    id="confirmPassword"
                    type="password"
                    autoComplete="new-password"
                    minLength={8}
                    required
                    value={confirmPassword}
                    onChange={(event) => setConfirmPassword(event.target.value)}
                    placeholder={t("auth.signup.passwordPlaceholder")}
                  />
                </div>

                {error ? (
                  <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                    {error}
                  </p>
                ) : null}

                <Button type="submit" size="lg" className="w-full" disabled={isLoading}>
                  <KeyRound className="h-4 w-4" />
                  {isLoading ? t("publicAccount.create.loading") : t("publicAccount.create.submit")}
                </Button>
              </form>
            )}
          </div>
        </div>
      </section>
    </main>
  );
}
