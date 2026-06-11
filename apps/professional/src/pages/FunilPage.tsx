import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, Check, CircleDollarSign, Columns3, MessageCircle, Plus, X } from "lucide-react";
import type { FunnelOpportunity, FunnelOpportunitySource, FunnelStage } from "@iaprafaturar/domain";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Input,
  Sheet,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  Skeleton,
  cn,
} from "@iaprafaturar/ui";
import { useAuth } from "@/contexts/AuthContext";
import { useClients } from "@/hooks/useClients";
import { useFunnelBoard } from "@/hooks/useFunnel";
import { useI18n, type TranslationKey } from "@/i18n";

const SOURCE_KEYS: Record<FunnelOpportunitySource, TranslationKey> = {
  manual: "funnel.source.manual",
  web_chat: "funnel.source.webChat",
  indicacao: "funnel.source.referral",
  campaign: "funnel.source.campaign",
  public_package: "funnel.source.publicPackage",
  public_quote: "funnel.source.publicQuote",
  whatsapp: "funnel.source.whatsapp",
  email: "funnel.source.email",
  other: "funnel.source.other",
};

const SOURCES = Object.keys(SOURCE_KEYS) as FunnelOpportunitySource[];

const initialForm = {
  clientId: "",
  title: "",
  source: "manual" as FunnelOpportunitySource,
  value: "",
  stageId: "",
};

export default function FunilPage() {
  const { professionalId } = useAuth();
  const { t, locale } = useI18n();
  const boardQuery = useFunnelBoard(professionalId);
  const clientsQuery = useClients(professionalId);
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const [form, setForm] = useState(initialForm);
  const [stageFilter, setStageFilter] = useState("all");
  const [message, setMessage] = useState<string | null>(null);

  const board = boardQuery.data;
  const stages = useMemo(() => board?.stages ?? [], [board?.stages]);
  const openStages = useMemo(() => stages.filter((stage) => !stage.is_won && !stage.is_lost), [stages]);
  const opportunities = board?.opportunities ?? [];
  const clients = clientsQuery.data ?? [];
  const currency = useMemo(
    () => new Intl.NumberFormat(locale, { style: "currency", currency: "BRL" }),
    [locale],
  );

  useEffect(() => {
    const firstStageId = openStages[0]?.id;
    if (!form.stageId && firstStageId) {
      setForm((current) => ({ ...current, stageId: firstStageId }));
    }
  }, [form.stageId, openStages]);

  async function handleCreate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);

    if (!form.clientId || !form.title.trim()) {
      setMessage(t("funnel.error.required"));
      return;
    }

    try {
      await boardQuery.createOpportunity({
        clientId: form.clientId,
        title: form.title.trim(),
        source: form.source,
        value: Number(form.value || 0),
        stageId: form.stageId || null,
      });
      setForm({ ...initialForm, stageId: openStages[0]?.id ?? "" });
      setIsSheetOpen(false);
      setMessage(t("funnel.success.created"));
    } catch {
      setMessage(t("funnel.error.action"));
    }
  }

  async function move(opportunity: FunnelOpportunity, direction: -1 | 1) {
    const currentIndex = openStages.findIndex((stage) => stage.id === opportunity.stage_id);
    const targetStage = openStages[currentIndex + direction];
    if (!targetStage) return;

    try {
      await boardQuery.moveOpportunity({
        opportunityId: opportunity.id,
        stageId: targetStage.id,
      });
      setMessage(t("funnel.success.moved"));
    } catch {
      setMessage(t("funnel.error.action"));
    }
  }

  async function close(opportunity: FunnelOpportunity, outcome: "won" | "lost") {
    try {
      await boardQuery.closeOpportunity({ opportunityId: opportunity.id, outcome });
      setMessage(outcome === "won" ? t("funnel.success.won") : t("funnel.success.lost"));
    } catch {
      setMessage(t("funnel.error.action"));
    }
  }

  async function logTouch(opportunity: FunnelOpportunity) {
    try {
      await boardQuery.logActivity({
        opportunityId: opportunity.id,
        activityType: "manual_touch",
        payload: { source: "funnel_page" },
      });
      setMessage(t("funnel.success.activity"));
    } catch {
      setMessage(t("funnel.error.action"));
    }
  }

  if (boardQuery.isLoading) {
    return (
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-5 px-4 py-5 sm:px-6">
        <Skeleton className="h-10 w-64" />
        <div className="grid gap-3 md:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <Skeleton key={index} className="h-48 rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  const totalOpen = opportunities.filter((item) => item.status === "open").length;
  const totalWon = opportunities.filter((item) => item.status === "won").length;
  const totalValue = opportunities.reduce((sum, item) => sum + Number(item.value ?? 0), 0);
  const filteredMobile =
    stageFilter === "all" ? opportunities : opportunities.filter((item) => item.stage_id === stageFilter);

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-5 px-4 py-5 sm:px-6">
      <header className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-teal-700">{t("funnel.eyebrow")}</p>
          <h1 className="mt-1 text-2xl font-semibold text-zinc-950">{t("funnel.title")}</h1>
          <p className="mt-1 max-w-2xl text-sm text-zinc-500">{t("funnel.subtitle")}</p>
        </div>
        <Button className="w-full gap-2 md:w-auto" onClick={() => setIsSheetOpen(true)}>
          <Plus className="h-4 w-4" />
          {t("funnel.action.new")}
        </Button>
      </header>

      {message ? (
        <div className="rounded-lg border border-teal-100 bg-teal-50 px-3 py-2 text-sm text-teal-800">{message}</div>
      ) : null}

      {boardQuery.isError ? (
        <div className="rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-sm text-red-800">
          {t("funnel.error.load")}
        </div>
      ) : null}

      <section className="grid gap-3 sm:grid-cols-3">
        <MetricCard icon={Columns3} label={t("funnel.metric.open")} value={String(totalOpen)} />
        <MetricCard icon={Check} label={t("funnel.metric.won")} value={String(totalWon)} />
        <MetricCard icon={CircleDollarSign} label={t("funnel.metric.value")} value={currency.format(totalValue)} />
      </section>

      <section className="md:hidden">
        <div className="flex gap-2 overflow-x-auto pb-2">
          <StageChip active={stageFilter === "all"} label={t("funnel.stage.all")} onClick={() => setStageFilter("all")} />
          {stages.map((stage) => (
            <StageChip
              key={stage.id}
              active={stageFilter === stage.id}
              label={stage.name}
              color={stage.color}
              onClick={() => setStageFilter(stage.id)}
            />
          ))}
        </div>
        <div className="mt-3 space-y-3">
          {filteredMobile.length ? (
            filteredMobile.map((opportunity) => (
              <OpportunityCard
                key={opportunity.id}
                opportunity={opportunity}
                stages={stages}
                openStages={openStages}
                currency={currency}
                onMove={move}
                onClose={close}
                onLogTouch={logTouch}
              />
            ))
          ) : (
            <EmptyState title={t("funnel.empty.title")} description={t("funnel.empty.description")} />
          )}
        </div>
      </section>

      <section className="hidden min-h-[520px] gap-3 overflow-x-auto md:grid md:grid-cols-5">
        {stages.map((stage) => {
          const stageItems = opportunities.filter((item) => item.stage_id === stage.id);
          return (
            <div key={stage.id} className="flex min-w-[220px] flex-col gap-3 rounded-lg border border-zinc-200 bg-zinc-50/60 p-3">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <h2 className="truncate text-sm font-semibold text-zinc-950">{stage.name}</h2>
                  <p className="text-xs text-zinc-500">{stageItems.length} {t("funnel.stage.items")}</p>
                </div>
                <span className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: stage.color }} />
              </div>
              <div className="flex flex-col gap-3">
                {stageItems.map((opportunity) => (
                  <OpportunityCard
                    key={opportunity.id}
                    compact
                    opportunity={opportunity}
                    stages={stages}
                    openStages={openStages}
                    currency={currency}
                    onMove={move}
                    onClose={close}
                    onLogTouch={logTouch}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </section>

      <Sheet open={isSheetOpen} onOpenChange={setIsSheetOpen}>
        <SheetContent className="max-h-[88vh] overflow-y-auto">
          <form className="space-y-5" onSubmit={handleCreate}>
            <SheetHeader>
              <SheetTitle>{t("funnel.form.title")}</SheetTitle>
            </SheetHeader>

            <SelectField
              label={t("funnel.form.client")}
              value={form.clientId}
              onChange={(clientId) => setForm((current) => ({ ...current, clientId }))}
              options={[{ value: "", label: t("common.select") }, ...clients.map((client) => ({ value: client.id, label: client.full_name }))]}
            />
            <Field label={t("funnel.form.name")}>
              <Input value={form.title} onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))} />
            </Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <SelectField
                label={t("funnel.form.source")}
                value={form.source}
                onChange={(source) => setForm((current) => ({ ...current, source: source as FunnelOpportunitySource }))}
                options={SOURCES.map((source) => ({ value: source, label: t(SOURCE_KEYS[source]) }))}
              />
              <Field label={t("funnel.form.value")}>
                <Input
                  inputMode="decimal"
                  value={form.value}
                  onChange={(event) => setForm((current) => ({ ...current, value: event.target.value }))}
                />
              </Field>
            </div>
            <SelectField
              label={t("funnel.form.stage")}
              value={form.stageId}
              onChange={(stageId) => setForm((current) => ({ ...current, stageId }))}
              options={openStages.map((stage) => ({ value: stage.id, label: stage.name }))}
            />

            <SheetFooter>
              <Button type="button" variant="outline" onClick={() => setIsSheetOpen(false)}>
                {t("common.cancel")}
              </Button>
              <Button type="submit" disabled={boardQuery.isCreatingOpportunity}>
                {boardQuery.isCreatingOpportunity ? t("common.saving") : t("common.save")}
              </Button>
            </SheetFooter>
          </form>
        </SheetContent>
      </Sheet>
    </div>
  );
}

function MetricCard({ icon: Icon, label, value }: { icon: typeof Columns3; label: string; value: string }) {
  return (
    <Card className="rounded-lg border-zinc-200">
      <CardContent className="flex items-center gap-3 p-4">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-teal-50 text-teal-700">
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <p className="text-xs font-medium text-zinc-500">{label}</p>
          <p className="truncate text-xl font-semibold text-zinc-950">{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function StageChip({ active, label, color, onClick }: { active: boolean; label: string; color?: string; onClick: () => void }) {
  return (
    <button
      type="button"
      className={cn(
        "flex h-9 shrink-0 items-center gap-2 rounded-full border px-3 text-sm font-medium transition-colors",
        active ? "border-teal-600 bg-teal-50 text-teal-800" : "border-zinc-200 bg-white text-zinc-600",
      )}
      onClick={onClick}
    >
      {color ? <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }} /> : null}
      {label}
    </button>
  );
}

function OpportunityCard({
  opportunity,
  stages,
  openStages,
  currency,
  compact = false,
  onMove,
  onClose,
  onLogTouch,
}: {
  opportunity: FunnelOpportunity;
  stages: FunnelStage[];
  openStages: FunnelStage[];
  currency: Intl.NumberFormat;
  compact?: boolean;
  onMove: (opportunity: FunnelOpportunity, direction: -1 | 1) => void;
  onClose: (opportunity: FunnelOpportunity, outcome: "won" | "lost") => void;
  onLogTouch: (opportunity: FunnelOpportunity) => void;
}) {
  const { t } = useI18n();
  const stage = stages.find((item) => item.id === opportunity.stage_id);
  const currentIndex = openStages.findIndex((item) => item.id === opportunity.stage_id);
  const canMove = opportunity.status === "open" && currentIndex >= 0;

  return (
    <Card className="rounded-lg border-zinc-200 bg-white shadow-sm">
      <CardHeader className={cn("space-y-2 p-4", compact && "p-3")}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <CardTitle className="line-clamp-2 text-base leading-5">{opportunity.title}</CardTitle>
            <p className="mt-1 truncate text-sm text-zinc-500">{opportunity.client_name}</p>
          </div>
          <Badge className={cn("shrink-0", opportunity.status === "won" && "bg-emerald-100 text-emerald-700", opportunity.status === "lost" && "bg-red-100 text-red-700")}>
            {opportunity.status}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className={cn("space-y-3 p-4 pt-0", compact && "p-3 pt-0")}>
        <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-500">
          <span className="font-semibold text-zinc-900">{currency.format(Number(opportunity.value ?? 0))}</span>
          <span>{stage?.name}</span>
          <span>{t(SOURCE_KEYS[opportunity.source])}</span>
        </div>
        <div className="grid grid-cols-4 gap-2">
          <IconButton label={t("funnel.action.back")} disabled={!canMove || currentIndex === 0} onClick={() => onMove(opportunity, -1)}>
            <ArrowLeft className="h-4 w-4" />
          </IconButton>
          <IconButton label={t("funnel.action.next")} disabled={!canMove || currentIndex === openStages.length - 1} onClick={() => onMove(opportunity, 1)}>
            <ArrowRight className="h-4 w-4" />
          </IconButton>
          <IconButton label={t("funnel.action.touch")} disabled={opportunity.status !== "open"} onClick={() => onLogTouch(opportunity)}>
            <MessageCircle className="h-4 w-4" />
          </IconButton>
          {opportunity.status === "open" ? (
            <div className="flex gap-1">
              <IconButton label={t("funnel.action.win")} onClick={() => onClose(opportunity, "won")}>
                <Check className="h-4 w-4" />
              </IconButton>
              <IconButton label={t("funnel.action.lose")} onClick={() => onClose(opportunity, "lost")}>
                <X className="h-4 w-4" />
              </IconButton>
            </div>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}

function IconButton({ label, disabled, onClick, children }: { label: string; disabled?: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <Button type="button" variant="outline" size="icon" aria-label={label} title={label} disabled={disabled} onClick={onClick}>
      {children}
    </Button>
  );
}

function EmptyState({ title, description }: { title: string; description: string }) {
  return (
    <Card className="rounded-lg border-dashed border-zinc-200">
      <CardContent className="p-6 text-center">
        <h2 className="text-base font-semibold text-zinc-950">{title}</h2>
        <p className="mt-1 text-sm text-zinc-500">{description}</p>
      </CardContent>
    </Card>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-xs font-semibold text-zinc-600">{label}</span>
      {children}
    </label>
  );
}

function SelectField({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <Field label={label}>
      <select
        className="h-10 w-full rounded-md border border-zinc-200 bg-white px-3 text-sm shadow-sm outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-100"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </Field>
  );
}
