import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { Button, Input } from "@iaprafaturar/ui";
import { supabase } from "@/lib/supabase";
import { useI18n } from "@/i18n";

export default function RecoverPasswordPage() {
  const { t } = useI18n();
  const [email, setEmail] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsLoading(true);
    setError(false);

    const redirectTo = `${window.location.origin}/reset-password`;
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo });

    setIsLoading(false);
    if (resetError) {
      setError(true);
      return;
    }
    setSubmitted(true);
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-zinc-50 px-4">
      <div className="w-full max-w-sm">
        <Link to="/login" className="mb-6 inline-flex items-center gap-2 text-sm font-medium text-primary-700">
          <ArrowLeft className="h-4 w-4" />
          {t("auth.recovery.back")}
        </Link>
        <h1 className="text-2xl font-semibold text-zinc-950">{t("auth.recovery.title")}</h1>
        <p className="mt-2 text-sm leading-6 text-zinc-500">{t("auth.recovery.subtitle")}</p>

        {submitted ? (
          <div className="mt-6 rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm leading-6 text-emerald-800">
            {t("auth.recovery.success")}
          </div>
        ) : (
          <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
            <div className="space-y-1">
              <label htmlFor="recovery-email" className="text-sm font-medium text-zinc-700">
                {t("auth.email")}
              </label>
              <Input
                id="recovery-email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="seu@email.com"
              />
            </div>
            {error ? <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{t("auth.recovery.error")}</p> : null}
            <Button type="submit" className="w-full" disabled={isLoading}>
              {isLoading ? t("auth.recovery.loading") : t("auth.recovery.submit")}
            </Button>
          </form>
        )}
      </div>
    </main>
  );
}
