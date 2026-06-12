import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Coins, ShieldCheck } from "lucide-react";
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, Input } from "@iaprafaturar/ui";
import { useI18n } from "@/i18n";
import { supabase } from "@/lib/supabase";

interface Phase17Dashboard {
  plans: Array<Record<string, unknown> & { id: string; slug: string; name: string; monthly_price_cents: number; included_ai_credits: number; is_public: boolean }>;
  subscriptions: Array<Record<string, unknown> & { id: string; professional_id: string; status: string; source: string; updated_at: string }>;
}

async function loadPhase17(): Promise<Phase17Dashboard> {
  const { data, error } = await supabase.rpc("get_admin_phase17_dashboard");
  if (error) throw error;
  return data as Phase17Dashboard;
}

export default function PlansPage() {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: ["admin-phase17"], queryFn: loadPhase17 });
  const [professionalId, setProfessionalId] = useState("");
  const [reason, setReason] = useState("");
  const [credits, setCredits] = useState("500");

  const grantFree = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc("admin_grant_free_internal", {
        p_professional_id: professionalId,
        p_reason: reason,
        p_expires_at: null,
      });
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin-phase17"] }),
  });

  const addCredits = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc("admin_add_ai_credits", {
        p_professional_id: professionalId,
        p_amount: Number(credits || 0),
        p_reason: reason,
      });
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin-phase17"] }),
  });

  const data = query.data;

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-5 px-4 py-5 sm:px-6">
      <header>
        <h1 className="text-2xl font-semibold text-zinc-950">{t("plans.title")}</h1>
        <p className="mt-1 max-w-2xl text-sm text-zinc-500">{t("plans.subtitle")}</p>
      </header>

      {query.isError ? <ErrorCard /> : null}

      <section className="grid gap-3 lg:grid-cols-[1fr_360px]">
        <div className="space-y-3">
          {data?.plans.map((plan) => (
            <Card key={plan.id} className="rounded-lg">
              <CardContent className="flex items-center justify-between gap-3 p-4">
                <div>
                  <h2 className="text-sm font-semibold text-zinc-950">{plan.name}</h2>
                  <p className="text-xs text-zinc-500">{plan.included_ai_credits} {t("plans.credits")} · {formatCurrency(plan.monthly_price_cents)}</p>
                </div>
                <Badge variant={plan.is_public ? "default" : "secondary"}>{plan.slug}</Badge>
              </CardContent>
            </Card>
          ))}
          {data?.subscriptions.map((subscription) => (
            <Card key={subscription.id} className="rounded-lg">
              <CardContent className="flex items-center justify-between gap-3 p-4">
                <div>
                  <h2 className="text-sm font-semibold text-zinc-950">{subscription.professional_id}</h2>
                  <p className="text-xs text-zinc-500">{subscription.source}</p>
                </div>
                <Badge>{subscription.status}</Badge>
              </CardContent>
            </Card>
          ))}
        </div>

        <Card className="rounded-lg">
          <CardHeader><CardTitle>{t("plans.adminActions")}</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <Field label={t("plans.professionalId")} value={professionalId} onChange={setProfessionalId} />
            <Field label={t("plans.reason")} value={reason} onChange={setReason} />
            <Field label={t("plans.credits")} value={credits} onChange={setCredits} />
            <Button className="w-full" disabled={!professionalId || !reason || grantFree.isPending} onClick={() => grantFree.mutate()}>
              <ShieldCheck className="mr-2 h-4 w-4" />
              {t("plans.grantFree")}
            </Button>
            <Button className="w-full" variant="outline" disabled={!professionalId || !reason || addCredits.isPending} onClick={() => addCredits.mutate()}>
              <Coins className="mr-2 h-4 w-4" />
              {t("plans.addCredits")}
            </Button>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return <label className="block space-y-1"><span className="text-xs font-semibold text-zinc-600">{label}</span><Input value={value} onChange={(event) => onChange(event.target.value)} /></label>;
}

function ErrorCard() {
  const { t } = useI18n();
  return <Card className="rounded-lg"><CardContent className="p-5 text-sm font-semibold text-red-700">{t("common.error")}</CardContent></Card>;
}

function formatCurrency(cents: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);
}
