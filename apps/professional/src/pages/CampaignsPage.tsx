import { useState, type FormEvent } from "react";
import { Pencil } from "lucide-react";
import { toast } from "sonner";
import {
  Button,
  Card,
  CardContent,
  Input,
  Sheet,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  Skeleton,
} from "@iaprafaturar/ui";
import { GrowthAccessDenied, GrowthPageHeader, DataRow } from "@/components/growth/GrowthShared";
import { useAuth } from "@/contexts/AuthContext";
import { useCampaigns, useGrowthOverview, type CampaignRow } from "@/hooks/useGrowth";
import { useI18n } from "@/i18n";

const CAMPAIGN_STATUS_COLORS: Record<string, string> = {
  draft: "bg-zinc-100 text-zinc-600",
  scheduled: "bg-sky-100 text-sky-700",
  running: "bg-violet-100 text-violet-700",
  completed: "bg-emerald-100 text-emerald-700",
  cancelled: "bg-red-100 text-red-600",
};

function EditCampaignSheet({
  campaign,
  open,
  onClose,
  onSave,
  isSaving,
}: {
  campaign: CampaignRow;
  open: boolean;
  onClose: () => void;
  onSave: (values: { name: string; message: string; segment: string }) => Promise<void>;
  isSaving: boolean;
}) {
  const { t } = useI18n();
  const [name, setName] = useState(campaign.name);
  const [message, setMessage] = useState(campaign.message ?? "");
  const [segment, setSegment] = useState(campaign.segment_type);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    await onSave({ name, message, segment });
    onClose();
  }

  return (
    <Sheet open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <SheetContent side="right" className="w-full max-w-md overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{t("growth.campaign.edit.title")}</SheetTitle>
        </SheetHeader>
        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-zinc-700">{t("growth.form.name")}</label>
            <Input
              value={name}
              placeholder={t("growth.form.name")}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-zinc-700">{t("growth.campaign.segment")}</label>
            <select
              className="h-10 w-full rounded-md border border-zinc-200 px-3 text-sm"
              value={segment}
              onChange={(e) => setSegment(e.target.value)}
            >
              <option value="all">{t("growth.form.segment.all")}</option>
              <option value="inactive">{t("growth.form.segment.inactive")}</option>
              <option value="risk">{t("growth.form.segment.risk")}</option>
              <option value="champions">{t("growth.form.segment.champions")}</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-zinc-700">{t("growth.form.message")}</label>
            <textarea
              className="min-h-32 w-full rounded-md border border-zinc-200 p-3 text-sm leading-6 text-zinc-800 outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-100"
              value={message}
              placeholder={t("growth.form.message")}
              onChange={(e) => setMessage(e.target.value)}
              required
            />
          </div>
          <SheetFooter>
            <Button type="submit" className="w-full" disabled={isSaving || !name.trim() || !message.trim()}>
              {t("common.save")}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}

export default function CampaignsPage() {
  const { professionalId, role } = useAuth();
  const { t } = useI18n();
  const campaigns = useCampaigns(role === "gestor" ? professionalId : null);
  const overview = useGrowthOverview(role === "gestor" ? professionalId : null);
  const [form, setForm] = useState({ name: "", segment: "all", message: "" });
  const [selected, setSelected] = useState("");
  const [scheduledAt, setScheduledAt] = useState("");
  const [editingCampaign, setEditingCampaign] = useState<CampaignRow | null>(null);

  if (role !== "gestor") return <GrowthAccessDenied />;

  async function submit(event: FormEvent) {
    event.preventDefault();
    await campaigns.create(form);
    setForm({ name: "", segment: "all", message: "" });
  }

  async function handleSaveEdit(values: { name: string; message: string; segment: string }) {
    if (!editingCampaign) return;
    try {
      await campaigns.update({
        campaignId: editingCampaign.id,
        name: values.name,
        message: values.message,
        segment: values.segment,
      });
      toast.success(t("growth.campaign.edit.success"));
    } catch {
      toast.error(t("growth.campaign.edit.error"));
    }
  }

  return (
    <main className="mx-auto w-full max-w-7xl space-y-5 px-4 py-5 sm:px-6">
      <GrowthPageHeader title={t("growth.tab.campaigns")} description={t("growth.campaign.description")} />

      <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
        <section className="space-y-3">
          {campaigns.isLoading ? <Skeleton className="h-40 w-full" /> : null}
          {!campaigns.isLoading && (campaigns.data ?? []).length === 0 ? (
            <p className="py-6 text-center text-sm text-zinc-500">{t("growth.campaign.empty")}</p>
          ) : null}
          {(campaigns.data ?? []).map((item) => (
            <Card key={item.id} className="rounded-lg border-zinc-200">
              <CardContent className="flex items-start justify-between gap-3 p-4">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="truncate text-sm font-semibold text-zinc-950">{item.name}</p>
                    <span
                      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${CAMPAIGN_STATUS_COLORS[item.status] ?? "bg-zinc-100 text-zinc-600"}`}
                    >
                      {item.status}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-zinc-500">{item.segment_type}</p>
                  {item.scheduled_at ? (
                    <p className="mt-0.5 text-xs text-zinc-400">
                      {new Intl.DateTimeFormat(undefined, { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(item.scheduled_at))}
                    </p>
                  ) : null}
                </div>
                {item.status === "draft" ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="shrink-0 gap-1.5"
                    onClick={() => setEditingCampaign(item)}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                    {t("common.edit")}
                  </Button>
                ) : null}
              </CardContent>
            </Card>
          ))}

          <Card className="rounded-lg">
            <CardContent className="space-y-3 p-4">
              <p className="text-sm font-semibold text-zinc-950">{t("growth.campaign.results.title")}</p>
              {overview.isLoading ? <Skeleton className="h-24 w-full" /> : null}
              {!overview.isLoading && overview.data?.dashboard.campaign_results.length ? (
                overview.data.dashboard.campaign_results.map((item, index) => (
                  <DataRow
                    key={String(item["id"] ?? index)}
                    title={String(item["campaign_name"] ?? t("growth.info.result"))}
                    subtitle={`${String(item["channel"] ?? "")} · ${t("growth.info.eligible")} ${String(item["eligible_count"] ?? 0)} · opt-out ${String(item["blocked_opt_out"] ?? 0)}`}
                    value={new Date(String(item["created_at"] ?? Date.now())).toLocaleDateString()}
                  />
                ))
              ) : !overview.isLoading ? (
                <p className="text-sm text-zinc-500">{t("growth.campaign.results.empty")}</p>
              ) : null}
            </CardContent>
          </Card>
        </section>

        <div className="space-y-4">
          <Card className="rounded-lg">
            <CardContent className="space-y-4 p-4">
              <p className="text-sm font-semibold text-zinc-950">{t("growth.action.newCampaign")}</p>
              <form className="space-y-3" onSubmit={submit}>
                <Input
                  value={form.name}
                  placeholder={t("growth.form.name")}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  required
                />
                <select
                  className="h-10 w-full rounded-md border border-zinc-200 px-3 text-sm"
                  value={form.segment}
                  onChange={(e) => setForm({ ...form, segment: e.target.value })}
                >
                  <option value="all">{t("growth.form.segment.all")}</option>
                  <option value="inactive">{t("growth.form.segment.inactive")}</option>
                  <option value="risk">{t("growth.form.segment.risk")}</option>
                  <option value="champions">{t("growth.form.segment.champions")}</option>
                </select>
                <textarea
                  className="min-h-28 w-full rounded-md border border-zinc-200 p-3 text-sm"
                  value={form.message}
                  placeholder={t("growth.form.message")}
                  onChange={(e) => setForm({ ...form, message: e.target.value })}
                  required
                />
                <Button className="w-full" disabled={campaigns.isSaving}>
                  {t("growth.action.newCampaign")}
                </Button>
              </form>

              <div className="border-t border-zinc-100 pt-4">
                <p className="mb-3 text-sm font-medium text-zinc-700">{t("growth.campaign.actions")}</p>
                <select
                  className="mb-3 h-10 w-full rounded-md border border-zinc-200 px-3 text-sm"
                  value={selected}
                  onChange={(e) => setSelected(e.target.value)}
                >
                  <option value="">{t("common.select")}</option>
                  {(campaigns.data ?? []).map((item) => (
                    <option key={item.id} value={item.id}>{item.name}</option>
                  ))}
                </select>
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    variant="outline"
                    disabled={!selected || campaigns.isSaving}
                    onClick={() => campaigns.run({ campaignId: selected, channel: "whatsapp", dryRun: true })}
                  >
                    {t("growth.campaign.dryWhatsapp")}
                  </Button>
                  <Button
                    variant="outline"
                    disabled={!selected || campaigns.isSaving}
                    onClick={() => campaigns.run({ campaignId: selected, channel: "email", dryRun: true })}
                  >
                    {t("growth.campaign.dryEmail")}
                  </Button>
                </div>
                <Input
                  type="datetime-local"
                  className="mt-3"
                  value={scheduledAt}
                  onChange={(e) => setScheduledAt(e.target.value)}
                />
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <Button
                    variant="outline"
                    disabled={!selected || !scheduledAt || campaigns.isSaving}
                    onClick={() => campaigns.schedule({ campaignId: selected, scheduledAt: new Date(scheduledAt).toISOString() })}
                  >
                    {t("growth.campaign.schedule")}
                  </Button>
                  <Button
                    variant="outline"
                    disabled={!selected || campaigns.isSaving}
                    onClick={() => campaigns.cancel(selected)}
                  >
                    {t("common.cancel")}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {editingCampaign ? (
        <EditCampaignSheet
          campaign={editingCampaign}
          open={Boolean(editingCampaign)}
          onClose={() => setEditingCampaign(null)}
          onSave={handleSaveEdit}
          isSaving={campaigns.isSaving}
        />
      ) : null}
    </main>
  );
}
