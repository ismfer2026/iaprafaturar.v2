import { useState, type FormEvent } from "react";
import { Navigate } from "react-router-dom";
import { Button, Card, CardContent, Input } from "@iaprafaturar/ui";
import { useAdminAuth } from "@/contexts/AdminAuthContext";
import { useI18n } from "@/i18n";
import { supabase } from "@/lib/supabase";

export default function LoginPage() {
  const { session, isMasterAdmin, reload } = useAdminAuth();
  const { t } = useI18n();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (session && isMasterAdmin) return <Navigate to="/dashboard" replace />;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
    if (signInError) {
      setError(t("auth.error"));
      setIsSubmitting(false);
      return;
    }

    await reload();
    setIsSubmitting(false);
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-8">
      <Card className="w-full max-w-md rounded-lg">
        <CardContent className="p-5">
          <div className="mb-6 text-center">
            <h1 className="text-2xl font-semibold text-zinc-950">{t("auth.title")}</h1>
            <p className="mt-1 text-sm text-zinc-500">{t("auth.subtitle")}</p>
          </div>
          <form className="space-y-4" onSubmit={submit}>
            <label className="block space-y-1">
              <span className="text-sm font-semibold text-zinc-700">{t("auth.email")}</span>
              <Input value={email} onChange={(event) => setEmail(event.target.value)} type="email" required />
            </label>
            <label className="block space-y-1">
              <span className="text-sm font-semibold text-zinc-700">{t("auth.password")}</span>
              <Input value={password} onChange={(event) => setPassword(event.target.value)} type="password" required />
            </label>
            {error ? <p className="text-sm font-semibold text-red-600">{error}</p> : null}
            <Button className="w-full" type="submit" disabled={isSubmitting}>
              {t("auth.submit")}
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
