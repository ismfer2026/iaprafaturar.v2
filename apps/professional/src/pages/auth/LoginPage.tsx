import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button, Input } from "@iaprafaturar/ui";
import { supabase } from "@/lib/supabase";
import { useI18n } from "@/i18n";

export default function LoginPage() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    const { error: authError } = await supabase.auth.signInWithPassword({ email, password });

    if (authError) {
      setError(t("auth.login.error.invalid"));
    } else {
      navigate("/dashboard");
    }
    setIsLoading(false);
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-zinc-50 px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-bold text-zinc-900">{t("auth.login.title")}</h1>
          <p className="mt-1 text-sm text-zinc-500">{t("auth.login.subtitle")}</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1">
            <label htmlFor="email" className="text-sm font-medium text-zinc-700">
              {t("auth.email")}
            </label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="seu@email.com"
            />
          </div>

          <div className="space-y-1">
            <label htmlFor="password" className="text-sm font-medium text-zinc-700">
              {t("auth.password")}
            </label>
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="********"
            />
          </div>

          {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

          <Button type="submit" className="w-full" disabled={isLoading}>
            {isLoading ? t("auth.login.loading") : t("auth.login.submit")}
          </Button>
        </form>

        <div className="mt-6 space-y-3 text-center text-sm text-zinc-500">
          <p>
            <Link to="/recuperar-senha" className="text-violet-600 hover:underline">
              {t("auth.forgotPassword")}
            </Link>
          </p>
          <p>
            {t("auth.noAccount")}{" "}
            <Link to="/entrar" className="text-violet-600 hover:underline">
              {t("auth.createFreeAccount")}
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
