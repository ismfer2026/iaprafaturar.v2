import { Badge, Card, CardContent, CardHeader, CardTitle, Skeleton } from "@iaprafaturar/ui";
import { useAdminPlans } from "@/hooks/useAdminCore";
import { useI18n } from "@/i18n";

export default function PlansPage() {
  const { t } = useI18n();
  const query = useAdminPlans();
  return <div className="mx-auto flex w-full max-w-6xl flex-col gap-5 px-4 py-5 sm:px-6">
    <header><h1 className="text-2xl font-semibold">{t("plans.title")}</h1><p className="text-sm text-zinc-500">{t("plans.subtitle")}</p></header>
    <Badge variant="secondary">{t("plans.governance")}: {query.data?.governance ?? "migration_rpc_controlled"}</Badge>
    {query.isLoading ? <Skeleton className="h-48" /> : null}{query.isError ? <Error /> : null}
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{query.data?.plans.map((plan) => <Card key={plan.id}><CardContent className="space-y-3 p-4"><div className="flex justify-between gap-2"><h2 className="font-semibold">{plan.name}</h2><Badge variant={plan.is_active ? "success" : "secondary"}>{plan.slug}</Badge></div><p className="text-sm text-zinc-500">{plan.description}</p><p className="text-lg font-semibold">{money(plan.monthly_price_cents)}</p><div className="flex flex-wrap gap-2"><Badge variant="secondary">{plan.included_ai_credits} {t("plans.credits")}</Badge><Badge variant="secondary">{plan.client_limit ?? "∞"} clients</Badge><Badge variant="secondary">{plan.team_limit ?? "∞"} team</Badge></div></CardContent></Card>)}</div>
    <Card><CardHeader><CardTitle>{t("plans.subscriptions")}</CardTitle></CardHeader><CardContent className="overflow-x-auto"><table className="w-full min-w-[680px] text-left text-sm"><thead><tr className="border-b text-zinc-500"><th className="p-2">{t("professionals.title")}</th><th>{t("nav.plans")}</th><th>Status</th><th>Source</th></tr></thead><tbody>{query.data?.subscriptions.map((s) => <tr className="border-b" key={s.id}><td className="p-2">{s.professional_name}</td><td>{s.plan_slug}</td><td>{s.status}</td><td>{s.source}</td></tr>)}</tbody></table></CardContent></Card>
  </div>;
}
function Error() { const { t } = useI18n(); return <Card><CardContent className="p-5 text-red-700">{t("common.error")}</CardContent></Card>; }
function money(cents: number) { return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100); }
