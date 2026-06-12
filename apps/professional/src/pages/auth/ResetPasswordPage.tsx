import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { Button, Input, Skeleton } from "@iaprafaturar/ui";
import { supabase } from "@/lib/supabase";
import { useI18n } from "@/i18n";

export default function ResetPasswordPage() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [hasSession, setHasSession] = useState<boolean | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search);
    const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    const hasRecoveryMarker =
      searchParams.has("code") ||
      searchParams.get("type") === "recovery" ||
      hashParams.get("type") === "recovery";

    supabase.auth.getSession().then(({ data }) => setHasSession(Boolean(data.session && hasRecoveryMarker)));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY") setHasSession(Boolean(session));
    });
    return () => subscription.unsubscribe();
  }, []);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (password.length < 8) return setError(t("auth.reset.error.length"));
    if (password !== confirmation) return setError(t("auth.reset.error.match"));

    setIsLoading(true);
    const { error: updateError } = await supabase.auth.updateUser({ password });
    setIsLoading(false);
    if (updateError) {
      setError(t("auth.reset.error.invalid"));
      return;
    }
    await supabase.auth.signOut();
    navigate("/login", { replace: true });
  }

  if (hasSession === null) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-50">
        <div className="w-64 space-y-3">
          <Skeleton className="h-5 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      </div>
    );
  }

  if (!hasSession) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-zinc-50 px-4">
        <div className="w-full max-w-sm text-center">
          <h1 className="text-2xl font-semibold text-zinc-950">{t("auth.reset.invalid.title")}</h1>
          <p className="mt-2 text-sm leading-6 text-zinc-500">{t("auth.reset.invalid.subtitle")}</p>
          <Button asChild className="mt-6">
            <Link to="/recuperar-senha">{t("auth.reset.invalid.action")}</Link>
          </Button>
        </div>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-zinc-50 px-4">
      <div className="w-full max-w-sm">
        <Link to="/login" className="mb-6 inline-flex items-center gap-2 text-sm font-medium text-violet-700">
          <ArrowLeft className="h-4 w-4" />
          {t("auth.recovery.back")}
        </Link>
        <h1 className="text-2xl font-semibold text-zinc-950">{t("auth.reset.title")}</h1>
        <p className="mt-2 text-sm leading-6 text-zinc-500">{t("auth.reset.subtitle")}</p>
        <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
          <div className="space-y-1">
            <label htmlFor="new-password" className="text-sm font-medium text-zinc-700">{t("auth.reset.password")}</label>
            <Input id="new-password" type="password" autoComplete="new-password" required value={password} onChange={(event) => setPassword(event.target.value)} />
          </div>
          <div className="space-y-1">
            <label htmlFor="confirm-password" className="text-sm font-medium text-zinc-700">{t("auth.reset.confirm")}</label>
            <Input id="confirm-password" type="password" autoComplete="new-password" required value={confirmation} onChange={(event) => setConfirmation(event.target.value)} />
          </div>
          {error ? <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
          <Button type="submit" className="w-full" disabled={isLoading}>
            {isLoading ? t("auth.reset.loading") : t("auth.reset.submit")}
          </Button>
        </form>
      </div>
    </main>
  );
}
