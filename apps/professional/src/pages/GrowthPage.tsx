import { useMemo, useState, type FormEvent, type ReactNode } from "react";
import {
  Gift,
  HeartPulse,
  Mail,
  Megaphone,
  MessageSquare,
  RefreshCw,
  TrendingUp,
  Users,
  type LucideIcon,
} from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Input, Skeleton, cn } from "@iaprafaturar/ui";
import { useAuth } from "@/contexts/AuthContext";
import { useClients } from "@/hooks/useClients";
import { useI18n } from "@/i18n";
import { supabase } from "@/lib/supabase";

type GrowthTab = "overview" | "campaigns" | "risk" | "loyalty" | "email" | "chat" | "upsell" | "rfm";

interface ClientRelation {
  full_name: string;
  phone_whatsapp?: string | null;
  email?: string | null;
}

interface RfmRow {
  id: string;
  client_id: string;
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
  signals?: Record<string, unknown>;
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
  referrer_client_id: string | null;
  referred_client_id: string | null;
  created_at: string;
}

interface CommercialDashboard {
  campaign_results: Array<Record<string, unknown> & { id: string; campaign_name?: string; channel: string; eligible_count: number; blocked_opt_out: number; blocked_cooldown: number; queued_count: number; dry_run_count: number; created_at: string }>;
  loyalty: Array<Record<string, unknown> & { id: string; client_name?: string; points_delta: number; reason: string; source: string; created_at: string }>;
  email_outbox: Array<Record<string, unknown> & { id: string; to_email: string; subject: string; status: string; skip_reason: string | null; created_at: string }>;
  public_chat_config: null | Record<string, unknown> & { enabled: boolean; welcome_message: string; handoff_mode: string; rate_limit_per_hour: number };
  upsell_metrics: Array<Record<string, unknown> & { event_type: string; reason: string | null; count: number; created_at: string }>;
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

const tabs: Array<{ value: GrowthTab; label: string }> = [
  { value: "overview", label: "Visao geral" },
  { value: "campaigns", label: "Campanhas" },
  { value: "risk", label: "Reativacao" },
  { value: "loyalty", label: "Fidelidade" },
  { value: "email", label: "E-mail" },
  { value: "chat", label: "Chat publico" },
  { value: "upsell", label: "Upsell" },
  { value: "rfm", label: "RFM" },
];

async function loadGrowth(professionalId: string) {
  const [rfm, health, campaigns, referrals, commercial] = await Promise.all([
    supabase
      .from("rfm_scores")
      .select("id, client_id, rfm_code, segment, calculated_at, clients(full_name, phone_whatsapp, email)")
      .eq("professional_id", professionalId)
      .order("calculated_at", { ascending: false })
      .limit(50),
    supabase
      .from("client_health_scores")
      .select("id, client_id, score, risk_level, reactivation_cooldown_until, reactivation_attempts_in_cycle, signals, clients(full_name, phone_whatsapp, email)")
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
      .select("id, event_type, referrer_client_id, referred_client_id, created_at")
      .eq("professional_id", professionalId)
      .order("created_at", { ascending: false })
      .limit(50),
    supabase.rpc("get_growth_commercial_dashboard"),
  ]);

  if (rfm.error) throw rfm.error;
  if (health.error) throw health.error;
  if (campaigns.error) throw campaigns.error;
  if (referrals.error) throw referrals.error;
  if (commercial.error) throw commercial.error;

  return {
    rfm: (rfm.data ?? []) as RfmRow[],
    health: (health.data ?? []) as HealthRow[],
    campaigns: (campaigns.data ?? []) as CampaignRow[],
    referrals: (referrals.data ?? []) as ReferralEventRow[],
    commercial: commercial.data as CommercialDashboard,
  };
}

export default function GrowthPage() {
  const { professionalId } = useAuth();
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<GrowthTab>("overview");
  const [message, setMessage] = useState<string | null>(null);
  const clientsQuery = useClients(professionalId);
  const [campaignForm, setCampaignForm] = useState({ name: "", segmentType: "all", messageTemplate: "" });
  const [selectedCampaignId, setSelectedCampaignId] = useState("");
  const [emailForm, setEmailForm] = useState({ clientId: "", subject: "", body: "" });
  const [chatConfig, setChatConfig] = useState({ enabled: true, welcomeMessage: "Ola! Como posso ajudar?", handoffMode: "shadow", rateLimit: "12" });
  const [loyaltyForm, setLoyaltyForm] = useState({ clientId: "", points: "50", rewardType: "manual_credit" });

  const query = useQuery({
    queryKey: ["growth", professionalId],
    queryFn: () => loadGrowth(professionalId as string),
    enabled: Boolean(professionalId),
  });

  const clients = clientsQuery.data ?? [];
  const healthRows = query.data?.health ?? [];
  const riskRows = healthRows.filter((row) => row.risk_level === "risk" || row.risk_level === "churn");
  const rfmRows = query.data?.rfm ?? [];
  const campaigns = query.data?.campaigns ?? [];
  const referrals = query.data?.referrals ?? [];
  const commercial = query.data?.commercial;
  const publicSlug = window.location.origin.includes("app.") ? "https://cliente.iaprafaturar.com.br/chat/SEU-SLUG" : "/chat/SEU-SLUG";

  const summary = useMemo(() => {
    const averageHealth = healthRows.length
      ? Math.round(healthRows.reduce((sum, row) => sum + row.score, 0) / healthRows.length)
      : 0;
    const emailQueued = commercial?.email_outbox.filter((item) => item.status === "queued").length ?? 0;
    const loyaltyPoints = commercial?.loyalty.reduce((sum, row) => sum + Number(row.points_delta ?? 0), 0) ?? 0;
    return {
      averageHealth,
      riskClients: riskRows.length,
      campaigns: campaigns.length,
      referrals: referrals.length,
      emailQueued,
      loyaltyPoints,
    };
  }, [campaigns.length, commercial, healthRows, referrals.length, riskRows.length]);

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ["growth", professionalId] });
  }

  const refreshScores = useMutation({
    mutationFn: async () => {
      const [rfm, health] = await Promise.all([
        supabase.rpc("calculate_rfm_for_professional", { p_professional_id: null, p_limit: 500, p_cursor: null }),
        supabase.rpc("calculate_client_health_for_professional", { p_professional_id: null, p_limit: 500, p_cursor: null }),
      ]);
      if (rfm.error) throw rfm.error;
      if (health.error) throw health.error;
    },
    onSuccess: () => {
      setMessage("Scores recalculados com formula v2.");
      invalidate();
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
      invalidate();
    },
    onError: () => setMessage(t("growth.error.campaign")),
  });

  const runCampaign = useMutation({
    mutationFn: async ({ channel, dryRun }: { channel: "whatsapp" | "email"; dryRun: boolean }) => {
      const { error } = await supabase.rpc("run_segmented_campaign", {
        p_campaign_id: selectedCampaignId,
        p_channel: channel,
        p_dry_run: dryRun,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setMessage("Campanha segmentada processada respeitando opt-out e cooldown.");
      invalidate();
    },
    onError: () => setMessage("Nao foi possivel processar a campanha."),
  });

  const queueEmail = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc("queue_email_to_client", {
        p_client_id: emailForm.clientId,
        p_subject: emailForm.subject,
        p_body_text: emailForm.body,
        p_campaign_id: null,
        p_dry_run: true,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setMessage("E-mail enfileirado em dry-run com consentimento verificado.");
      setEmailForm({ clientId: "", subject: "", body: "" });
      invalidate();
    },
    onError: () => setMessage("Nao foi possivel enfileirar o e-mail."),
  });

  const saveChatConfig = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc("upsert_public_chat_config", {
        p_config: {
          enabled: chatConfig.enabled,
          welcome_message: chatConfig.welcomeMessage,
          handoff_mode: chatConfig.handoffMode,
          rate_limit_per_hour: Number(chatConfig.rateLimit || 12),
        },
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setMessage("Chat publico atualizado.");
      invalidate();
    },
    onError: () => setMessage("Nao foi possivel atualizar o chat publico."),
  });

  const redeemLoyalty = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc("redeem_loyalty_reward", {
        p_client_id: loyaltyForm.clientId,
        p_points: Number(loyaltyForm.points || 0),
        p_reward_type: loyaltyForm.rewardType,
        p_reward_payload: { source: "growth_page" },
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setMessage("Recompensa resgatada no ledger de fidelidade.");
      setLoyaltyForm({ clientId: "", points: "50", rewardType: "manual_credit" });
      invalidate();
    },
    onError: () => setMessage("Nao foi possivel resgatar a recompensa."),
  });

  function submitCampaign(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    createCampaign.mutate();
  }

  function submitEmail(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    queueEmail.mutate();
  }

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-5 px-4 py-5 sm:px-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-violet-700">{t("growth.eyebrow")}</p>
          <h1 className="mt-1 text-2xl font-semibold text-zinc-950">{t("growth.title")}</h1>
          <p className="mt-1 max-w-2xl text-sm text-zinc-500">Campanhas, reativacao, fidelidade, e-mail, chat publico e upsell em uma visao operacional.</p>
        </div>
        <Button type="button" variant="outline" onClick={() => refreshScores.mutate()} disabled={refreshScores.isPending}>
          <RefreshCw className="mr-2 h-4 w-4" />
          {t("growth.action.refreshScores")}
        </Button>
      </div>

      {message ? <div className="rounded-lg border border-violet-200 bg-violet-50 px-3 py-2 text-sm font-medium text-violet-800">{message}</div> : null}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
        <MetricCard icon={HeartPulse} label={t("growth.metric.health")} value={`${summary.averageHealth}/100`} />
        <MetricCard icon={Users} label={t("growth.metric.riskClients")} value={String(summary.riskClients)} />
        <MetricCard icon={Megaphone} label={t("growth.metric.campaigns")} value={String(summary.campaigns)} />
        <MetricCard icon={Gift} label="Pontos ledger" value={String(summary.loyaltyPoints)} />
        <MetricCard icon={Mail} label="E-mails fila" value={String(summary.emailQueued)} />
        <MetricCard icon={TrendingUp} label="Indicacoes" value={String(summary.referrals)} />
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1">
        {tabs.map((item) => (
          <button
            key={item.value}
            type="button"
            onClick={() => setTab(item.value)}
            className={cn(
              "h-10 whitespace-nowrap rounded-lg border px-3 text-sm font-semibold transition-colors",
              tab === item.value ? "border-violet-600 bg-violet-600 text-white" : "border-zinc-200 bg-white text-zinc-600",
            )}
          >
            {item.label}
          </button>
        ))}
      </div>

      {query.isLoading ? <GrowthSkeleton /> : null}
      {query.isError ? <EmptyState title={t("growth.error.load")} description={t("common.error.generic")} /> : null}

      {!query.isLoading && !query.isError ? (
        <div className="grid gap-4 lg:grid-cols-[1fr_380px]">
          <div className="space-y-3">
            {(tab === "overview" || tab === "risk") && riskRows.map((row) => <ClientHealthCard key={row.id} row={row} />)}

            {tab === "campaigns" && (
              <Stack>
                {campaigns.map((campaign) => <CampaignCard key={campaign.id} campaign={campaign} />)}
                {commercial?.campaign_results.map((item) => (
                  <InfoRow key={item.id} title={item.campaign_name ?? "Resultado"} subtitle={`${item.channel} · elegiveis ${item.eligible_count} · opt-out ${item.blocked_opt_out} · cooldown ${item.blocked_cooldown}`} right={new Date(item.created_at).toLocaleDateString()} />
                ))}
              </Stack>
            )}

            {tab === "loyalty" && (
              <Stack>
                {commercial?.loyalty.map((item) => <InfoRow key={item.id} title={item.client_name ?? "Cliente"} subtitle={`${item.reason} · ${item.source}`} right={`${item.points_delta} pts`} />)}
                {referrals.map((event) => <InfoRow key={event.id} title={event.event_type} subtitle="Evento de indicacao" right={new Date(event.created_at).toLocaleDateString()} />)}
              </Stack>
            )}

            {tab === "email" && (
              <Stack>
                {commercial?.email_outbox.map((email) => <InfoRow key={email.id} title={email.subject} subtitle={`${email.to_email} · ${email.skip_reason ?? email.status}`} right={email.status} />)}
              </Stack>
            )}

            {tab === "chat" && (
              <Card className="rounded-lg">
                <CardContent className="space-y-3 p-4">
                  <InfoRow title="Link publico do chat" subtitle={publicSlug} right={commercial?.public_chat_config?.enabled ? "ativo" : "pendente"} />
                  <p className="text-sm text-zinc-500">O handler publico cria conversa rastreavel, lead e oportunidade no funil, com rate limit e handoff.</p>
                </CardContent>
              </Card>
            )}

            {tab === "upsell" && (
              <Stack>
                {commercial?.upsell_metrics.map((metric) => <InfoRow key={`${metric.event_type}-${metric.reason}`} title={metric.event_type} subtitle={metric.reason ?? "sem motivo"} right={String(metric.count)} />)}
              </Stack>
            )}

            {(tab === "overview" || tab === "rfm") && rfmRows.map((row) => <InfoRow key={row.id} title={clientName(row.clients)} subtitle={row.segment} right={row.rfm_code} />)}
          </div>

          <div className="space-y-4">
            <Card className="rounded-lg">
              <CardHeader>
                <CardTitle>{t("growth.form.campaignTitle")}</CardTitle>
                <CardDescription>Cria campanha e roda segmentacao com opt-out/cooldown.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <form className="space-y-3" onSubmit={submitCampaign}>
                  <Field label={t("growth.form.name")}><Input value={campaignForm.name} onChange={(event) => setCampaignForm((current) => ({ ...current, name: event.target.value }))} required /></Field>
                  <SelectField label={t("growth.form.segment")} value={campaignForm.segmentType} onChange={(segmentType) => setCampaignForm((current) => ({ ...current, segmentType }))} options={[
                    { value: "all", label: t("growth.form.segment.all") },
                    { value: "inactive", label: t("growth.form.segment.inactive") },
                    { value: "risk", label: t("growth.form.segment.risk") },
                    { value: "champions", label: t("growth.form.segment.champions") },
                  ]} />
                  <label className="block space-y-1">
                    <span className="text-xs font-semibold text-zinc-600">{t("growth.form.message")}</span>
                    <textarea className="min-h-24 w-full rounded-md border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-100" value={campaignForm.messageTemplate} onChange={(event) => setCampaignForm((current) => ({ ...current, messageTemplate: event.target.value }))} required />
                  </label>
                  <Button className="w-full" type="submit" disabled={createCampaign.isPending}>{t("growth.action.newCampaign")}</Button>
                </form>
                <SelectField label="Campanha para segmentar" value={selectedCampaignId} onChange={setSelectedCampaignId} options={[{ value: "", label: "Selecione" }, ...campaigns.map((item) => ({ value: item.id, label: item.name }))]} />
                <div className="grid grid-cols-2 gap-2">
                  <Button type="button" variant="outline" disabled={!selectedCampaignId || runCampaign.isPending} onClick={() => runCampaign.mutate({ channel: "whatsapp", dryRun: true })}>Dry WhatsApp</Button>
                  <Button type="button" variant="outline" disabled={!selectedCampaignId || runCampaign.isPending} onClick={() => runCampaign.mutate({ channel: "email", dryRun: true })}>Dry e-mail</Button>
                </div>
              </CardContent>
            </Card>

            <Card className="rounded-lg">
              <CardHeader><CardTitle>E-mail</CardTitle><CardDescription>Fila dry-run; envio real depende de chave Resend e config.</CardDescription></CardHeader>
              <CardContent>
                <form className="space-y-3" onSubmit={submitEmail}>
                  <SelectField label="Cliente" value={emailForm.clientId} onChange={(clientId) => setEmailForm((current) => ({ ...current, clientId }))} options={[{ value: "", label: "Selecione" }, ...clients.map((client) => ({ value: client.id, label: client.full_name }))]} />
                  <Field label="Assunto"><Input value={emailForm.subject} onChange={(event) => setEmailForm((current) => ({ ...current, subject: event.target.value }))} required /></Field>
                  <label className="block space-y-1">
                    <span className="text-xs font-semibold text-zinc-600">Corpo</span>
                    <textarea className="min-h-24 w-full rounded-md border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-100" value={emailForm.body} onChange={(event) => setEmailForm((current) => ({ ...current, body: event.target.value }))} required />
                  </label>
                  <Button className="w-full" type="submit" disabled={queueEmail.isPending}>Enfileirar dry-run</Button>
                </form>
              </CardContent>
            </Card>

            <Card className="rounded-lg">
              <CardHeader><CardTitle>Chat publico</CardTitle><CardDescription>Configuracao do widget publico.</CardDescription></CardHeader>
              <CardContent className="space-y-3">
                <Field label="Mensagem inicial"><Input value={chatConfig.welcomeMessage} onChange={(event) => setChatConfig((current) => ({ ...current, welcomeMessage: event.target.value }))} /></Field>
                <SelectField label="Handoff" value={chatConfig.handoffMode} onChange={(handoffMode) => setChatConfig((current) => ({ ...current, handoffMode }))} options={[{ value: "shadow", label: "Shadow" }, { value: "active", label: "Ativo" }, { value: "human_takeover", label: "Humano" }]} />
                <Field label="Limite por hora"><Input value={chatConfig.rateLimit} onChange={(event) => setChatConfig((current) => ({ ...current, rateLimit: event.target.value }))} /></Field>
                <Button className="w-full" type="button" disabled={saveChatConfig.isPending} onClick={() => saveChatConfig.mutate()}>Salvar chat</Button>
              </CardContent>
            </Card>

            <Card className="rounded-lg">
              <CardHeader><CardTitle>Resgate de fidelidade</CardTitle><CardDescription>Debita pontos em ledger imutavel.</CardDescription></CardHeader>
              <CardContent className="space-y-3">
                <SelectField label="Cliente" value={loyaltyForm.clientId} onChange={(clientId) => setLoyaltyForm((current) => ({ ...current, clientId }))} options={[{ value: "", label: "Selecione" }, ...clients.map((client) => ({ value: client.id, label: `${client.full_name} · ${client.loyalty_points} pts` }))]} />
                <Field label="Pontos"><Input value={loyaltyForm.points} onChange={(event) => setLoyaltyForm((current) => ({ ...current, points: event.target.value }))} /></Field>
                <Button className="w-full" type="button" disabled={!loyaltyForm.clientId || redeemLoyalty.isPending} onClick={() => redeemLoyalty.mutate()}>Resgatar</Button>
              </CardContent>
            </Card>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function MetricCard({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: string }) {
  return (
    <Card className="rounded-lg">
      <CardContent className="flex items-center gap-3 p-4">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-violet-50 text-violet-700"><Icon className="h-5 w-5" /></div>
        <div className="min-w-0"><p className="truncate text-xs font-semibold text-zinc-500">{label}</p><p className="truncate text-xl font-semibold text-zinc-950">{value}</p></div>
      </CardContent>
    </Card>
  );
}

function CampaignCard({ campaign }: { campaign: CampaignRow }) {
  return <InfoRow title={campaign.name} subtitle={campaign.segment_type} right={campaign.status} />;
}

function ClientHealthCard({ row }: { row: HealthRow }) {
  return (
    <Card className="rounded-lg">
      <CardContent className="flex items-center justify-between gap-3 p-4">
        <div className="min-w-0">
          <h2 className="truncate text-sm font-semibold text-zinc-950">{clientName(row.clients)}</h2>
          <p className="mt-1 text-xs text-zinc-500">{row.score}/100 · {String(row.signals?.["formula_version"] ?? "phase8_v1")}</p>
        </div>
        <Badge className={cn("border", riskTone(row.risk_level))}>{row.risk_level}</Badge>
      </CardContent>
    </Card>
  );
}

function InfoRow({ title, subtitle, right }: { title: string; subtitle: string; right: string }) {
  return (
    <Card className="rounded-lg">
      <CardContent className="flex items-center justify-between gap-3 p-4">
        <div className="min-w-0"><h2 className="truncate text-sm font-semibold text-zinc-950">{title}</h2><p className="mt-1 truncate text-xs text-zinc-500">{subtitle}</p></div>
        <Badge className="shrink-0">{right}</Badge>
      </CardContent>
    </Card>
  );
}

function Stack({ children }: { children: ReactNode }) {
  return <div className="space-y-3">{children}</div>;
}

function EmptyState({ title, description }: { title: string; description: string }) {
  return (
    <Card className="rounded-lg"><CardContent className="p-6"><h2 className="text-sm font-semibold text-zinc-950">{title}</h2><p className="mt-1 text-sm text-zinc-500">{description}</p></CardContent></Card>
  );
}

function GrowthSkeleton() {
  return <div className="space-y-3">{Array.from({ length: 4 }).map((_, index) => <Skeleton key={index} className="h-20 rounded-lg" />)}</div>;
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="block space-y-1"><span className="text-xs font-semibold text-zinc-600">{label}</span>{children}</label>;
}

function SelectField({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: Array<{ value: string; label: string }> }) {
  return (
    <Field label={label}>
      <select className="h-10 w-full rounded-md border border-zinc-200 bg-white px-3 text-sm outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-100" value={value} onChange={(event) => onChange(event.target.value)}>
        {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
    </Field>
  );
}
