import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button, Input } from "@iaprafaturar/ui";
import { supabase } from "@/lib/supabase";
import { useI18n } from "@/i18n";

export default function CadastroPage() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phoneWhatsapp, setPhoneWhatsapp] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    const { error: authError } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { name, phone_whatsapp: phoneWhatsapp } },
    });

    if (authError) {
      setError(authError.message);
      setIsLoading(false);
      return;
    }

    const { data: existingId } = await supabase.from("professionals").select("id").single();

    if (!existingId) {
      const { error: rpcError } = await supabase.rpc("create_professional_from_signup", {
        p_name: name,
        p_phone_whatsapp: phoneWhatsapp,
      });

      if (rpcError) {
        setError(t("auth.signup.profileSetupError"));
        setIsLoading(false);
        return;
      }
    }

    navigate("/onboarding");
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-zinc-50 px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-bold text-zinc-900">{t("auth.signup.title")}</h1>
          <p className="mt-1 text-sm text-zinc-500">{t("auth.signup.subtitle")}</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1">
            <label htmlFor="name" className="text-sm font-medium text-zinc-700">
              {t("auth.signup.name")}
            </label>
            <Input
              id="name"
              type="text"
              autoComplete="name"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Dra. Ana Silva"
            />
          </div>

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
            <label htmlFor="phoneWhatsapp" className="text-sm font-medium text-zinc-700">
              WhatsApp
            </label>
            <Input
              id="phoneWhatsapp"
              type="tel"
              autoComplete="tel"
              required
              value={phoneWhatsapp}
              onChange={(e) => setPhoneWhatsapp(e.target.value)}
              placeholder="(11) 99999-9999"
            />
          </div>

          <div className="space-y-1">
            <label htmlFor="password" className="text-sm font-medium text-zinc-700">
              {t("auth.password")}
            </label>
            <Input
              id="password"
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={t("auth.signup.passwordPlaceholder")}
            />
          </div>

          {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

          <Button type="submit" className="w-full" disabled={isLoading}>
            {isLoading ? t("auth.signup.loading") : t("auth.createFreeAccount")}
          </Button>
        </form>

        <p className="mt-6 text-center text-sm text-zinc-500">
          {t("auth.signup.hasAccount")}{" "}
          <Link to="/login" className="text-violet-600 hover:underline">
            {t("auth.login.submit")}
          </Link>
        </p>
      </div>
    </div>
  );
}
