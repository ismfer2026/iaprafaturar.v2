import { useState } from "react";
import { Badge, Button, Card, CardContent, Input, Skeleton } from "@iaprafaturar/ui";
import { CalendarClock, Target, UserPlus } from "lucide-react";
import { useSalesLeads, useUpsertSalesLead, type SalesLead } from "@/hooks/usePhase24";
import { useI18n } from "@/i18n";

const stages = ["new", "qualified", "demo", "proposal", "converted", "lost"];
export default function LeadsPage() {
  const { t } = useI18n();
  const [search, setSearch] = useState("");
  const [name, setName] = useState("");
  const [business, setBusiness] = useState("");
  const query = useSalesLeads("", search);
  const save = useUpsertSalesLead();
  const move = (lead: SalesLead, stage: string) => save.mutate({ ...lead, stage, reason: "phase24_pipeline_move" });
  return <div className="mx-auto flex w-full max-w-7xl flex-col gap-5 px-4 py-5 sm:px-6">
    <header><h1 className="text-2xl font-semibold">{t("leads.title")}</h1><p className="mt-1 text-sm text-zinc-500">{t("leads.subtitle")}</p></header>
    <div className="grid gap-3 sm:grid-cols-3"><Metric icon={Target} label={t("leads.total")} value={query.data?.metrics.total ?? 0} /><Metric icon={CalendarClock} label={t("leads.followUp")} value={query.data?.metrics.follow_up_due ?? 0} /><Metric icon={Target} label={t("leads.converted")} value={query.data?.metrics.converted ?? 0} /></div>
    <Card><CardContent className="grid gap-3 p-4 md:grid-cols-[1fr_1fr_auto]"><Input value={name} onChange={(e) => setName(e.target.value)} placeholder={t("leads.name")} /><Input value={business} onChange={(e) => setBusiness(e.target.value)} placeholder={t("leads.business")} /><Button disabled={!name || save.isPending} onClick={() => save.mutate({ name, business_name: business, stage: "new", reason: "phase24_manual_lead" })}><UserPlus className="mr-2 h-4 w-4" />{t("leads.create")}</Button></CardContent></Card>
    <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t("leads.search")} />
    {query.isLoading ? <Skeleton className="h-52" /> : null}{query.isError ? <Card><CardContent className="p-4 text-red-700">{t("common.error")}</CardContent></Card> : null}
    <div className="grid gap-3 xl:grid-cols-3">{stages.map((stage) => <section key={stage} className="min-w-0"><div className="mb-2 flex items-center justify-between"><h2 className="text-sm font-semibold uppercase text-zinc-600">{t(`leads.stage.${stage}` as Parameters<typeof t>[0])}</h2><Badge variant="secondary">{query.data?.items.filter((x) => x.stage === stage).length ?? 0}</Badge></div><div className="space-y-2">{query.data?.items.filter((x) => x.stage === stage).map((lead) => <Card key={lead.id}><CardContent className="space-y-3 p-3"><div><p className="font-semibold">{lead.name}</p><p className="text-xs text-zinc-500">{lead.business_name ?? lead.source} · score {lead.score}</p></div><select className="h-9 w-full rounded-lg border px-2 text-sm" value={lead.stage} onChange={(e) => move(lead, e.target.value)}>{stages.map((value) => <option key={value} value={value}>{t(`leads.stage.${value}` as Parameters<typeof t>[0])}</option>)}</select></CardContent></Card>)}</div></section>)}</div>
  </div>;
}
function Metric({ icon: Icon, label, value }: { icon: typeof Target; label: string; value: number }) { return <Card><CardContent className="p-4"><Icon className="h-4 w-4 text-teal-600" /><p className="mt-3 text-xs font-semibold uppercase text-zinc-500">{label}</p><p className="mt-1 text-2xl font-semibold">{value}</p></CardContent></Card>; }
