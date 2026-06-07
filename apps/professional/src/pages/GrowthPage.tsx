import { useMemo, useState, type FormEvent } from "react";
import { Gift, HeartPulse, Megaphone, RefreshCw, Users, type LucideIcon } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
  Skeleton,
  cn,
} from "@iaprafaturar/ui";
import { useAuth } from "@/contexts/AuthContext";
import { useI18n, type TranslationKey } from "@/i18n";
import { supabase } from "@/lib/supabase";

type GrowthTab = "overview" | "campaigns" | "risk" | "referrals" | "rfm";

interface ClientRelation {
  full_name: string;
  phone_whatsapp?: string | null;
}

interface RfmRow {
  id: string;
  client_id: string;
  recency_score: number;
  frequency_score: number;
  monetary_score: number;
  rfm_code: string;
  segment: string;
  calculated_at: string;
  clients: ClientRelation | ClientRelation[] | null;
}

interface HealthRow {
  id: string;
  client_id: string;
  score: number;
  risk_level: "healthy" | "attention" | "risk" | "churn";
  reactivation_cooldown_until: string | null;
  reactivation_attempts_in_cycle: number;
  clients: ClientRelation | ClientRelation[] | null;
}

interface CampaignRow {
  id: string;
  name: string;
  segment_type: string;
  status: "draft" | "scheduled" | "sending" | "sent" | "cancelled" | "failed";
  scheduled_at: string | null;
  created_at: string;
}

interface ReferralEventRow {
  id: string;
  event_type: string;
  created_at: string;
}

function clientName(value: ClientRelation | ClientRelation[] | null): string {
  const client = Array.isArray(value) ? value[0] : value;
  return client?.full_name ?? "";
}

function riskTone(risk: HealthRow["risk_level"]) {
  if (risk === "healthy") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (risk === "attention") return "border-amber-200 bg-amber-50 text-amber-700";
  if (risk === "risk") return "border-orange-200 bg-orange-50 text-orange-700";
  return "border-red-200 bg-red-50 text-red-700";
}

const TABS = [
  { value: "overview", labelKey: "growth.tab.overview" },
  { value: "campaigns", labelKey: "growth.tab.campaigns" },
  { value: "risk", labelKey: "growth.tab.risk" },
  { value: "referrals", labelKey: "growth.tab.referrals" },
  { value: "rfm", labelKey: "growth.tab.rfm" },
] satisfies Array<{ value: GrowthTab; labelKey: TranslationKey }>;

const CAMPAIGN_STATUS_KEYS: Record<CampaignRow["status"], TranslationKey> = {
  draft: "growth.status.draft",
  scheduled: "growth.status.scheduled",
  sending: "growth.status.sending",
  sent: "growth.status.sent",
  cancelled: "growth.status.cancelled",
  failed: "growth.status.failed",
};

const RISK_KEYS: Record<HealthRow["risk_level"], TranslationKey> = {
  healthy: "growth.risk.healthy",
  attention: "growth.risk.attention",
  risk: "growth.risk.risk",
  churn: "growth.risk.churn",
};

async function loadGrowth(professionalId: string) {
  const [rfm, health, campaigns, referrals] = await Promise.all([
    supabase
      .from("rfm_scores")
      .select("id, client_id, recency_score, frequency_score, monetary_score, rfm_code, segment, calculated_at, clients(full_name, phone_whatsapp)")
      .eq("professional_id", professionalId)
      .order("calculated_at", { ascending: false })
      .limit(50),
    supabase
      .from("client_health_scores")
      .select("id, client_id, score, risk_level, reactivation_cooldown_until, reactivation_attempts_in_cycle, clients(full_name, phone_whatsapp)")
      .eq("professional_id", professionalId)
      .order("score", { ascending: true })
      .limit(50),
    supabase
      .from("campaigns")
      .select("id, name, segment_type, status, scheduled_at, created_at")
      .eq("professional_id", professionalId)
      .order("created_at", { ascending: false })
      .limit(50),
    supabase
      .from("referral_events")
      .select("id, event_type, created_at")
      .eq("professional_id", professionalId)
      .order("created_at", { ascending: false })
      .limit(50),
  ]);

  if (rfm.error) throw rfm.error;
  if (health.error) throw health.error;
  if (campaigns.error) throw campaigns.error;
  if (referrals.error) throw referrals.error;

  return {
    rfm: (rfm.data ?? []) as RfmRow[],
    health: (health.data ?? []) as HealthRow[],
    campaigns: (campaigns.data ?? []) as CampaignRow[],
    referrals: (referrals.data ?? []) as ReferralEventRow[],
  };
}

export default function GrowthPage() {
  const { professionalId } = useAuth();
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<GrowthTab>("overview");
  const [message, setMessage] = useState<string | null>(null);
  const [campaignForm, setCampaignForm] = useState({
    name: "",
    segmentType: "all",
    messageTemplate: "",
  });

  const query = useQuery({
    queryKey: ["growth", professionalId],
    queryFn: () => loadGrowth(professionalId as string),
    enabled: Boolean(professionalId),
  });

  const summary = useMemo(() => {
    const healthRows = query.data?.health ?? [];
    const averageHealth = healthRows.length
      ? Math.round(healthRows.reduce((sum, row) => sum + row.score, 0) / healthRows.length)
      : 0;
    const riskClients = healthRows.filter((row) => row.risk_level === "risk" || row.risk_level === "churn").length;

    return {
      averageHealth,
      riskClients,
      campaigns: query.data?.campaigns.length ?? 0,
      referrals: query.data?.referrals.length ?? 0,
    };
  }, [query.data]);

  const refreshScores = useMutation({
    mutationFn: async () => {
      const [rfm, health] = await Promise.all([
        supabase.rpc("calculate_rfm_for_professional", {
          p_professional_id: null,
          p_limit: 500,
          p_cursor: null,
        }),
        supabase.rpc("calculate_client_health_for_professional", {
          p_professional_id: null,
          p_limit: 500,
          p_cursor: null,
        }),
      ]);

      if (rfm.error) throw rfm.error;
      if (health.error) throw health.error;
    },
    onSuccess: () => {
      setMessage(t("growth.success.scores"));
      queryClient.invalidateQueries({ queryKey: ["growth", professionalId] });
    },
    onError: () => setMessage(t("growth.error.scores")),
  });

  const createCampaign = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc("create_campaign", {
        p_name: campaignForm.name,
        p_segment_type: campaignForm.segmentType,
        p_message_template: campaignForm.messageTemplate,
        p_scheduled_at: null,
      });

      if (error) throw error;
    },
    onSuccess: () => {
      setMessage(t("growth.success.campaign"));
      setCampaignForm({ name: "", segmentType: "all", messageTemplate: "" });
      queryClient.invalidateQueries({ queryKey: ["growth", professionalId] });
    },
    onError: () => setMessage(t("growth.error.campaign")),
  });

  function submitCampaign(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    createCampaign.mutate();
  }

  const healthRows = query.data?.health ?? [];
  const riskRows = healthRows.filter((row) => row.risk_level === "risk" || row.risk_level === "churn");
  const rfmRows = query.data?.rfm ?? [];
  const campaigns = query.data?.campaigns ?? [];
  const referrals = query.data?.referrals ?? [];

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-5 px-4 py-5 sm:px-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-violet-700">{t("growth.eyebrow")}</p>
          <h1 className="mt-1 text-2xl font-semibold text-zinc-950">{t("growth.title")}</h1>
          <p className="mt-1 max-w-2xl text-sm text-zinc-500">{t("growth.subtitle")}</p>
        </div>
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => refreshScores.mutate()}
            disabled={refreshScores.isPending}
          >
            <RefreshCw className="mr-2 h-4 w-4" />
            {t("growth.action.refreshScores")}
          </Button>
        </div>
      </div>

      {message ? (
        <div className="rounded-lg border border-violet-200 bg-violet-50 px-3 py-2 text-sm font-medium text-violet-800">
          {message}
        </div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard icon={HeartPulse} label={t("growth.metric.health")} value={`${summary.averageHealth}/100`} />
        <MetricCard icon={Users} label={t("growth.metric.riskClients")} value={String(summary.riskClients)} />
        <MetricCard icon={Megaphone} label={t("growth.metric.campaigns")} value={String(summary.campaigns)} />
        <MetricCard icon={Gift} label={t("growth.metric.referrals")} value={String(summary.referrals)} />
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1">
        {TABS.map((item) => (
          <button
            key={item.value}
            type="button"
            onClick={() => setTab(item.value)}
            className={cn(
              "h-10 whitespace-nowrap rounded-lg border px-3 text-sm font-semibold transition-colors",
              tab === item.value
                ? "border-violet-600 bg-violet-600 text-white"
                : "border-zinc-200 bg-white text-zinc-600",
            )}
          >
            {t(item.labelKey)}
          </button>
        ))}
      </div>

      {query.isLoading ? <GrowthSkeleton /> : null}
      {query.isError ? <EmptyState title={t("growth.error.load")} description={t("common.error.generic")} /> : null}
      {!query.isLoading && !query.isError && !rfmRows.length && !healthRows.length && !campaigns.length ? (
        <EmptyState title={t("growth.empty.title")} description={t("growth.empty.description")} />
      ) : null}

      {!query.isLoading && !query.isError ? (
        <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
          <div className="space-y-3">
            {(tab === "overview" || tab === "risk") && riskRows.map((row) => (
              <ClientHealthCard key={row.id} row={row} />
            ))}

            {tab === "campaigns" && campaigns.map((campaign) => (
              <Card key={campaign.id} className="rounded-lg">
                <CardContent className="flex items-center justify-between gap-3 p-4">
                  <div className="min-w-0">
                    <h2 className="truncate text-sm font-semibold text-zinc-950">{campaign.name}</h2>
                    <p className="mt-1 text-xs text-zinc-500">{campaign.segment_type}</p>
                  </div>
                  <Badge>{t(CAMPAIGN_STATUS_KEYS[campaign.status])}</Badge>
                </CardContent>
              </Card>
            ))}

            {tab === "referrals" && referrals.map((event) => (
              <Card key={event.id} className="rounded-lg">
                <CardContent className="flex items-center justify-between gap-3 p-4">
                  <span className="text-sm font-semibold text-zinc-900">{event.event_type}</span>
                  <span className="text-xs text-zinc-500">{new Date(event.created_at).toLocaleDateString()}</span>
                </CardContent>
              </Card>
            ))}

            {(tab === "overview" || tab === "rfm") && rfmRows.map((row) => (
              <Card key={row.id} className="rounded-lg">
                <CardContent className="flex items-center justify-between gap-3 p-4">
                  <div className="min-w-0">
                    <h2 className="truncate text-sm font-semibold text-zinc-950">{clientName(row.clients)}</h2>
                    <p className="mt-1 text-xs text-zinc-500">{row.segment}</p>
                  </div>
                  <Badge>{row.rfm_code}</Badge>
                </CardContent>
              </Card>
            ))}
          </div>

          <Card className="rounded-lg">
            <CardHeader>
              <CardTitle>{t("growth.form.campaignTitle")}</CardTitle>
              <CardDescription>{t("growth.action.newCampaign")}</CardDescription>
            </CardHeader>
            <CardContent>
              <form className="space-y-3" onSubmit={submitCampaign}>
                <label className="block space-y-1">
                  <span className="text-xs font-semibold text-zinc-600">{t("growth.form.name")}</span>
                  <Input
                    value={campaignForm.name}
                    onChange={(event) => setCampaignForm((current) => ({ ...current, name: event.target.value }))}
                    required
                  />
                </label>

                <label className="block space-y-1">
                  <span className="text-xs font-semibold text-zinc-600">{t("growth.form.segment")}</span>
                  <select
                    className="h-10 w-full rounded-md border border-zinc-200 bg-white px-3 text-sm outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-100"
                    value={campaignForm.segmentType}
                    onChange={(event) => setCampaignForm((current) => ({ ...current, segmentType: event.target.value }))}
                  >
                    <option value="all">{t("growth.form.segment.all")}</option>
                    <option value="inactive">{t("growth.form.segment.inactive")}</option>
                    <option value="risk">{t("growth.form.segment.risk")}</option>
                  </select>
                </label>

                <label className="block space-y-1">
                  <span className="text-xs font-semibold text-zinc-600">{t("growth.form.message")}</span>
                  <textarea
                    className="min-h-28 w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-100"
                    value={campaignForm.messageTemplate}
                    onChange={(event) => setCampaignForm((current) => ({ ...current, messageTemplate: event.target.value }))}
                    placeholder={t("growth.form.messagePlaceholder")}
                    required
                  />
                </label>

                <Button className="w-full" type="submit" disabled={createCampaign.isPending}>
                  <Megaphone className="mr-2 h-4 w-4" />
                  {t("growth.action.newCampaign")}
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>
      ) : null}
    </div>
  );
}

function MetricCard({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: string }) {
  return (
    <Card className="rounded-lg">
      <CardContent className="flex items-center gap-3 p-4">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-violet-50 text-violet-700">
          <Icon className="h-5 w-5" />
        </div>
        <div>
          <p className="text-xs font-semibold text-zinc-500">{label}</p>
          <p className="text-xl font-semibold text-zinc-950">{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function ClientHealthCard({ row }: { row: HealthRow }) {
  const { t } = useI18n();

  return (
    <Card className="rounded-lg">
      <CardContent className="flex items-center justify-between gap-3 p-4">
        <div className="min-w-0">
          <h2 className="truncate text-sm font-semibold text-zinc-950">{clientName(row.clients)}</h2>
          <p className="mt-1 text-xs text-zinc-500">{row.score}/100</p>
        </div>
        <Badge className={cn("border", riskTone(row.risk_level))}>{t(RISK_KEYS[row.risk_level])}</Badge>
      </CardContent>
    </Card>
  );
}

function EmptyState({ title, description }: { title: string; description: string }) {
  return (
    <Card className="rounded-lg">
      <CardContent className="p-6">
        <h2 className="text-sm font-semibold text-zinc-950">{title}</h2>
        <p className="mt-1 text-sm text-zinc-500">{description}</p>
      </CardContent>
    </Card>
  );
}

function GrowthSkeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 4 }).map((_, index) => (
        <Card key={index} className="rounded-lg">
          <CardContent className="space-y-3 p-4">
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-4 w-24" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
