import { useState, type FormEvent } from "react";
import { Button, Card, CardContent, Input, Skeleton } from "@iaprafaturar/ui";
import { GrowthAccessDenied, GrowthPageHeader, DataRow } from "@/components/growth/GrowthShared";
import { useAuth } from "@/contexts/AuthContext";
import { useCampaigns, useGrowthOverview } from "@/hooks/useGrowth";
import { useI18n } from "@/i18n";

export default function CampaignsPage() {
  const { professionalId, role } = useAuth();
  const { t } = useI18n();
  const campaigns = useCampaigns(role === "gestor" ? professionalId : null);
  const overview = useGrowthOverview(role === "gestor" ? professionalId : null);
  const [form, setForm] = useState({ name: "", segment: "all", message: "" });
  const [selected, setSelected] = useState("");
  const [scheduledAt, setScheduledAt] = useState("");
  if (role !== "gestor") return <GrowthAccessDenied />;
  async function submit(event: FormEvent) { event.preventDefault(); await campaigns.create(form); setForm({ name: "", segment: "all", message: "" }); }
  return <main className="mx-auto w-full max-w-7xl space-y-5 px-4 py-5 sm:px-6">
    <GrowthPageHeader title={t("growth.tab.campaigns")} description={t("growth.campaign.description")} />
    <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
      <section className="space-y-3">
        {campaigns.isLoading ? <Skeleton className="h-40 w-full" /> : campaigns.data?.map((item) => <DataRow key={item.id} title={item.name} subtitle={item.segment_type} value={item.status} />)}
        <Card className="rounded-lg">
          <CardContent className="space-y-3 p-4">
            <p className="text-sm font-semibold text-zinc-950">{t("growth.campaign.results.title")}</p>
            {overview.isLoading ? <Skeleton className="h-24 w-full" /> : overview.data?.dashboard.campaign_results.length ? overview.data.dashboard.campaign_results.map((item, index) => (
              <DataRow
                key={String(item["id"] ?? index)}
                title={String(item["campaign_name"] ?? t("growth.info.result"))}
                subtitle={`${String(item["channel"] ?? "")} · ${t("growth.info.eligible")} ${String(item["eligible_count"] ?? 0)} · opt-out ${String(item["blocked_opt_out"] ?? 0)} · cooldown ${String(item["blocked_cooldown"] ?? 0)}`}
                value={new Date(String(item["created_at"] ?? Date.now())).toLocaleDateString()}
              />
            )) : <p className="text-sm text-zinc-500">{t("growth.campaign.results.empty")}</p>}
          </CardContent>
        </Card>
      </section>
      <Card className="rounded-lg"><CardContent className="space-y-4 p-4"><form className="space-y-3" onSubmit={submit}><Input value={form.name} placeholder={t("growth.form.name")} onChange={(e) => setForm({ ...form, name: e.target.value })} required /><select className="h-10 w-full rounded-md border border-zinc-200 px-3 text-sm" value={form.segment} onChange={(e) => setForm({ ...form, segment: e.target.value })}><option value="all">{t("growth.form.segment.all")}</option><option value="inactive">{t("growth.form.segment.inactive")}</option><option value="risk">{t("growth.form.segment.risk")}</option><option value="champions">{t("growth.form.segment.champions")}</option></select><textarea className="min-h-28 w-full rounded-md border border-zinc-200 p-3 text-sm" value={form.message} placeholder={t("growth.form.message")} onChange={(e) => setForm({ ...form, message: e.target.value })} required /><Button className="w-full" disabled={campaigns.isSaving}>{t("growth.action.newCampaign")}</Button></form><select className="h-10 w-full rounded-md border border-zinc-200 px-3 text-sm" value={selected} onChange={(e) => setSelected(e.target.value)}><option value="">{t("common.select")}</option>{campaigns.data?.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select><div className="grid grid-cols-2 gap-2"><Button variant="outline" disabled={!selected || campaigns.isSaving} onClick={() => campaigns.run({ campaignId: selected, channel: "whatsapp", dryRun: true })}>{t("growth.campaign.dryWhatsapp")}</Button><Button variant="outline" disabled={!selected || campaigns.isSaving} onClick={() => campaigns.run({ campaignId: selected, channel: "email", dryRun: true })}>{t("growth.campaign.dryEmail")}</Button></div><Input type="datetime-local" value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)} /><div className="grid grid-cols-2 gap-2"><Button variant="outline" disabled={!selected || !scheduledAt || campaigns.isSaving} onClick={() => campaigns.schedule({ campaignId: selected, scheduledAt: new Date(scheduledAt).toISOString() })}>{t("growth.campaign.schedule")}</Button><Button variant="outline" disabled={!selected || campaigns.isSaving} onClick={() => campaigns.cancel(selected)}>{t("common.cancel")}</Button></div></CardContent></Card>
    </div>
  </main>;
}
