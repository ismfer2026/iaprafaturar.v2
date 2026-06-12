import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Check, CreditCard, Sparkles } from "lucide-react";
import { Badge, Button, Card, CardContent, CardHeader, CardTitle } from "@iaprafaturar/ui";
import { useI18n } from "@/i18n";
import { supabase } from "@/lib/supabase";

interface PlatformPlan {
  id: string;
  slug: string;
  name: string;
  description: string;
  monthly_price_cents: number;
  annual_price_cents: number;
  included_ai_credits: number;
  client_limit: number | null;
  team_limit: number | null;
}

interface SubscriptionState {
  subscription?: Record<string, unknown>;
  access?: { access_status?: string; reason?: string };
  credits?: number;
}

async function loadPlans() {
  const [plans, state] = await Promise.all([
    supabase.rpc("get_platform_plans"),
    supabase.rpc("get_my_subscription_state"),
  ]);
  if (plans.error) throw plans.error;
  if (state.error) throw state.error;
  return { plans: (plans.data ?? []) as PlatformPlan[], state: (state.data ?? {}) as SubscriptionState };
}

export default function PlanosPage() {
  const { t } = useI18n();
  const [message, setMessage] = useState<string | null>(null);
  const query = useQuery({ queryKey: ["platform-plans"], queryFn: loadPlans });
  const checkout = useMutation({
    mutationFn: async (productSlug: string) => {
      const { data, error } = await supabase.functions.invoke<{ checkout_url: string | null; dry_run?: boolean; reason?: string }>("platform-create-checkout-session", {
        body: {
          product_slug: productSlug,
          success_url: `${window.location.origin}/planos?checkout=success`,
          cancel_url: `${window.location.origin}/planos?checkout=cancelled`,
        },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      if (data?.checkout_url) {
        window.location.href = data.checkout_url;
        return;
      }
      setMessage(data?.reason ? `${t("plans.checkoutDryRun")}: ${data.reason}` : t("plans.checkoutDryRun"));
    },
    onError: () => setMessage(t("plans.checkoutError")),
  });

  const plans = query.data?.plans ?? [];
  const access = query.data?.state.access?.access_status ?? "full";

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-5 px-4 py-5 sm:px-6">
      <header className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-violet-700">{t("plans.eyebrow")}</p>
          <h1 className="mt-1 text-2xl font-semibold text-zinc-950">{t("plans.title")}</h1>
          <p className="mt-1 max-w-2xl text-sm text-zinc-500">{t("plans.subtitle")}</p>
        </div>
        <Badge variant={access === "full" ? "success" : "secondary"}>{access === "full" ? t("plans.access.full") : t("plans.access.readOnly")}</Badge>
      </header>

      {message ? <div className="rounded-lg border border-violet-200 bg-violet-50 px-3 py-2 text-sm font-semibold text-violet-800">{message}</div> : null}

      {query.isLoading ? <Card className="rounded-lg"><CardContent className="p-5 text-sm text-zinc-500">{t("common.loading")}</CardContent></Card> : null}
      {query.isError ? <Card className="rounded-lg"><CardContent className="p-5 text-sm font-semibold text-red-700">{t("common.error.generic")}</CardContent></Card> : null}

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {plans.map((plan) => (
          <Card key={plan.id} className="rounded-lg">
            <CardHeader>
              <div className="flex items-center justify-between gap-3">
                <CardTitle>{plan.name}</CardTitle>
                {plan.slug === "equipe" ? <Badge>{t("plans.recommended")}</Badge> : null}
              </div>
              <p className="text-sm text-zinc-500">{plan.description}</p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <p className="text-2xl font-semibold text-zinc-950">{formatCurrency(plan.monthly_price_cents)}</p>
                <p className="text-xs text-zinc-500">{t("plans.perMonth")}</p>
              </div>
              <div className="space-y-2 text-sm text-zinc-600">
                <Feature icon={Check} text={`${plan.client_limit ?? t("plans.unlimited")} ${t("plans.clients")}`} />
                <Feature icon={Sparkles} text={`${plan.included_ai_credits} ${t("plans.aiCredits")}`} />
                <Feature icon={Check} text={`${plan.team_limit ?? t("plans.unlimited")} ${t("plans.team")}`} />
              </div>
              <Button className="w-full" disabled={checkout.isPending || plan.slug === "enterprise"} onClick={() => checkout.mutate(`${plan.slug}_monthly`)}>
                <CreditCard className="mr-2 h-4 w-4" />
                {plan.slug === "enterprise" ? t("plans.contact") : t("plans.subscribe")}
              </Button>
            </CardContent>
          </Card>
        ))}
      </section>
    </div>
  );
}

function Feature({ icon: Icon, text }: { icon: typeof Check; text: string }) {
  return <div className="flex items-center gap-2"><Icon className="h-4 w-4 text-emerald-600" /><span>{text}</span></div>;
}

function formatCurrency(cents: number) {
  if (cents === 0) return "Custom";
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);
}
