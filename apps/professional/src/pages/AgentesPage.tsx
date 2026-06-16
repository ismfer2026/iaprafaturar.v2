import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowLeft,
  Bot,
  Cake,
  Check,
  Gift,
  HeartPulse,
  Megaphone,
  MessageCircle,
  RefreshCw,
  Repeat,
  Send,
  ShieldAlert,
  Sparkles,
  TrendingUp,
  Users,
  WandSparkles,
  X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  Skeleton,
} from "@iaprafaturar/ui";
import { useAuth } from "@/contexts/AuthContext";
import { useAssistantSettings, type AssistantSettingsInput } from "@/hooks/useAssistantSettings";
import { useWhatsappConnection } from "@/hooks/useWhatsappConnection";
import {
  useConversations,
  useConversationMessages,
  useShadowSuggestions,
  type ConversationListItem,
  type ShadowSuggestion,
} from "@/hooks/useConversations";
import { useI18n, type Locale } from "@/i18n";

type AgentSlug =
  | "indicacao-agent"
  | "reativacao-agent"
  | "upsell-agent"
  | "aniversariantes-agent"
  | "campaign-dispatcher"
  | "calculate-rfm"
  | "calculate-client-health-scores"
  | "lead-followup-agent"
  | "relationship-agent";

type AgentKind =
  | "indicacao"
  | "reativacao"
  | "upsell"
  | "aniversariantes"
  | "campaigns"
  | "rfm"
  | "health"
  | "leadFollowUp"
  | "relationship";

interface AgentSlot {
  slug: AgentSlug;
  kind: AgentKind;
  icon: LucideIcon;
}

type AgentDraft = Record<string, unknown>;
type AgentDraftMap = Record<AgentSlug, AgentDraft>;

const DEFAULT_ASSISTANT_NAME = "Rosane";

const AGENT_SLOTS: AgentSlot[] = [
  { slug: "indicacao-agent", kind: "indicacao", icon: Gift },
  { slug: "reativacao-agent", kind: "reativacao", icon: Repeat },
  { slug: "upsell-agent", kind: "upsell", icon: WandSparkles },
  { slug: "aniversariantes-agent", kind: "aniversariantes", icon: Cake },
  { slug: "campaign-dispatcher", kind: "campaigns", icon: Megaphone },
  { slug: "calculate-rfm", kind: "rfm", icon: TrendingUp },
  { slug: "calculate-client-health-scores", kind: "health", icon: HeartPulse },
  { slug: "lead-followup-agent", kind: "leadFollowUp", icon: Send },
  { slug: "relationship-agent", kind: "relationship", icon: Users },
];

const AGENT_TEXT: Record<
  Locale,
  {
    title: Record<AgentSlug, string>;
    description: Record<AgentSlug, string>;
    drawerTitle: Record<AgentKind, string>;
    drawerDescription: Record<AgentKind, string>;
    drawerFields: Record<AgentKind, Record<string, string>>;
  }
> = {
  "pt-BR": {
    title: {
      "indicacao-agent": "Indicação",
      "reativacao-agent": "Reativação",
      "upsell-agent": "Upsell",
      "aniversariantes-agent": "Aniversariantes",
      "campaign-dispatcher": "Campanhas",
      "calculate-rfm": "RFM",
      "calculate-client-health-scores": "Saúde do cliente",
      "lead-followup-agent": "Follow-up de leads",
      "relationship-agent": "Relacionamento",
    },
    description: {
      "indicacao-agent": "Pede indicações, valida elegibilidade e respeita cooldown.",
      "reativacao-agent": "Recupera clientes inativos com limite de tentativas e opt-out.",
      "upsell-agent": "Sugere ofertas quando há histórico, margem e janela válidas.",
      "aniversariantes-agent": "Agenda mensagens e ofertas de aniversário por horário.",
      "campaign-dispatcher": "Despacha campanhas com opt-out, fila e janela de envio.",
      "calculate-rfm": "Recalcula recência, frequência e valor para segmentação.",
      "calculate-client-health-scores": "Mantém score de risco, churn e cooldown de reativação.",
      "lead-followup-agent": "Nutre oportunidades quentes até a conversão ou handoff.",
      "relationship-agent": "Faz check-ins neutros e pós-atendimento sem atropelar a clínica.",
    },
    drawerTitle: {
      indicacao: "Configuração de indicação",
      reativacao: "Configuração de reativação",
      upsell: "Configuração de upsell",
      aniversariantes: "Configuração de aniversariantes",
      campaigns: "Configuração de campanhas",
      rfm: "Configuração de RFM",
      health: "Configuração de saúde",
      leadFollowUp: "Configuração de follow-up",
      relationship: "Configuração de relacionamento",
    },
    drawerDescription: {
      indicacao: "Ajuste as regras de indicação sem abrir novo contrato.",
      reativacao: "Defina quando parar, quantas vezes tentar e por qual canal trabalhar.",
      upsell: "Edite regras de gatilho, oferta e validade em um único bloco.",
      aniversariantes: "Controle horário de envio e oferta associada ao aniversário.",
      campaigns: "Delimite janela e volume diário da esteira de campanhas.",
      rfm: "Ajuste recência, batch e cadência do cálculo.",
      health: "Proteja cooldown e janela de risco sem duplicar regra.",
      leadFollowUp: "Modele sequência de follow-up para leads quentes.",
      relationship: "Ajuste check-ins e tom de relacionamento da Rosane.",
    },
    drawerFields: {
      indicacao: {
        minSessions: "Sessões mínimas",
        cooldownDays: "Cooldown (dias)",
        minNps: "NPS mínimo",
      },
      reativacao: {
        inactiveThresholdDays: "Inatividade mínima (dias)",
        maxAttempts: "Máximo de tentativas",
        channel: "Canal principal",
      },
      upsell: {
        trigger: "Gatilho",
        offer: "Oferta",
        validityDays: "Validade (dias)",
        addRule: "Adicionar regra",
      },
      aniversariantes: {
        sendTime: "Horário de envio",
        offerEnabled: "Oferta ativa",
        offerType: "Tipo da oferta",
        offerValue: "Valor",
        validityDays: "Validade (dias)",
      },
      campaigns: {
        deliveryWindow: "Janela de envio",
        dailyLimit: "Limite diário",
        dryRunOnly: "Somente dry-run",
      },
      rfm: {
        refreshIntervalDays: "Intervalo de atualização (dias)",
        batchLimit: "Lote máximo",
        riskWindowDays: "Janela de risco (dias)",
      },
      health: {
        cooldownDays: "Cooldown de reativação (dias)",
        riskThreshold: "Limiar de risco",
        lookbackDays: "Janela histórica (dias)",
      },
      leadFollowUp: {
        cadenceDays: "Cadência (dias)",
        maxAttempts: "Máximo de tentativas",
        handoffAfterDays: "Handoff após (dias)",
      },
      relationship: {
        intervalDays: "Intervalo (dias)",
        tone: "Tom",
        shadowMode: "Shadow mode",
      },
    },
  },
  "en-US": {
    title: {
      "indicacao-agent": "Referrals",
      "reativacao-agent": "Reactivation",
      "upsell-agent": "Upsell",
      "aniversariantes-agent": "Birthdays",
      "campaign-dispatcher": "Campaigns",
      "calculate-rfm": "RFM",
      "calculate-client-health-scores": "Client health",
      "lead-followup-agent": "Lead follow-up",
      "relationship-agent": "Relationship",
    },
    description: {
      "indicacao-agent": "Asks for referrals, checks eligibility and respects cooldown.",
      "reativacao-agent": "Recovers inactive clients with retries and opt-out.",
      "upsell-agent": "Suggests offers when history, margin and timing fit.",
      "aniversariantes-agent": "Schedules birthday messages and offers by time slot.",
      "campaign-dispatcher": "Dispatches campaigns with opt-out, queue and send window.",
      "calculate-rfm": "Recomputes recency, frequency and value for segmentation.",
      "calculate-client-health-scores": "Keeps risk, churn and reactivation cooldown scores current.",
      "lead-followup-agent": "Nurtures hot leads until conversion or handoff.",
      "relationship-agent": "Runs neutral check-ins and post-care without stepping on clinic ops.",
    },
    drawerTitle: {
      indicacao: "Referral settings",
      reativacao: "Reactivation settings",
      upsell: "Upsell settings",
      aniversariantes: "Birthday settings",
      campaigns: "Campaign settings",
      rfm: "RFM settings",
      health: "Health settings",
      leadFollowUp: "Follow-up settings",
      relationship: "Relationship settings",
    },
    drawerDescription: {
      indicacao: "Tune referral rules without adding another contract.",
      reativacao: "Define when to stop, how many tries and which channel to use.",
      upsell: "Edit trigger, offer and validity rules in one place.",
      aniversariantes: "Control send time and the birthday offer payload.",
      campaigns: "Bound the dispatch window and daily volume.",
      rfm: "Adjust recency, batch size and refresh cadence.",
      health: "Protect cooldown and risk windows without duplicating logic.",
      leadFollowUp: "Model the sequence for warm lead follow-up.",
      relationship: "Adjust check-ins and the assistant tone.",
    },
    drawerFields: {
      indicacao: {
        minSessions: "Minimum sessions",
        cooldownDays: "Cooldown (days)",
        minNps: "Minimum NPS",
      },
      reativacao: {
        inactiveThresholdDays: "Inactive threshold (days)",
        maxAttempts: "Max attempts",
        channel: "Primary channel",
      },
      upsell: {
        trigger: "Trigger",
        offer: "Offer",
        validityDays: "Validity (days)",
        addRule: "Add rule",
      },
      aniversariantes: {
        sendTime: "Send time",
        offerEnabled: "Offer enabled",
        offerType: "Offer type",
        offerValue: "Value",
        validityDays: "Validity (days)",
      },
      campaigns: {
        deliveryWindow: "Delivery window",
        dailyLimit: "Daily limit",
        dryRunOnly: "Dry-run only",
      },
      rfm: {
        refreshIntervalDays: "Refresh interval (days)",
        batchLimit: "Batch size",
        riskWindowDays: "Risk window (days)",
      },
      health: {
        cooldownDays: "Reactivation cooldown (days)",
        riskThreshold: "Risk threshold",
        lookbackDays: "Historical window (days)",
      },
      leadFollowUp: {
        cadenceDays: "Cadence (days)",
        maxAttempts: "Max attempts",
        handoffAfterDays: "Handoff after (days)",
      },
      relationship: {
        intervalDays: "Interval (days)",
        tone: "Tone",
        shadowMode: "Shadow mode",
      },
    },
  },
  "es-419": {
    title: {
      "indicacao-agent": "Referidos",
      "reativacao-agent": "Reactivación",
      "upsell-agent": "Upsell",
      "aniversariantes-agent": "Cumpleaños",
      "campaign-dispatcher": "Campañas",
      "calculate-rfm": "RFM",
      "calculate-client-health-scores": "Salud del cliente",
      "lead-followup-agent": "Seguimiento de leads",
      "relationship-agent": "Relación",
    },
    description: {
      "indicacao-agent": "Pide referidos, valida elegibilidad y respeta cooldown.",
      "reativacao-agent": "Recupera clientes inactivos con intentos limitados y opt-out.",
      "upsell-agent": "Sugiere ofertas cuando historia, margen y ventana coinciden.",
      "aniversariantes-agent": "Programa mensajes y ofertas de cumpleaños por horario.",
      "campaign-dispatcher": "Despacha campañas con opt-out, cola y ventana de envío.",
      "calculate-rfm": "Recalcula recencia, frecuencia y valor para segmentación.",
      "calculate-client-health-scores": "Mantiene riesgo, churn y cooldown de reactivación.",
      "lead-followup-agent": "Nutre leads calientes hasta conversión o handoff.",
      "relationship-agent": "Hace check-ins neutros y post-atención sin tocar la operación clínica.",
    },
    drawerTitle: {
      indicacao: "Configuración de referidos",
      reativacao: "Configuración de reactivación",
      upsell: "Configuración de upsell",
      aniversariantes: "Configuración de cumpleaños",
      campaigns: "Configuración de campañas",
      rfm: "Configuración de RFM",
      health: "Configuración de salud",
      leadFollowUp: "Configuración de seguimiento",
      relationship: "Configuración de relación",
    },
    drawerDescription: {
      indicacao: "Ajusta reglas de referidos sin crear otro contrato.",
      reativacao: "Define cuándo parar, cuántos intentos y por qué canal actuar.",
      upsell: "Edita gatillo, oferta y validez en un solo bloque.",
      aniversariantes: "Controla horario de envío y la oferta de cumpleaños.",
      campaigns: "Delimita ventana y volumen diario de la cola.",
      rfm: "Ajusta recencia, lote y cadencia de actualización.",
      health: "Protege cooldown y ventana de riesgo sin duplicar lógica.",
      leadFollowUp: "Modela la secuencia para leads calientes.",
      relationship: "Ajusta check-ins y el tono de la asistente.",
    },
    drawerFields: {
      indicacao: {
        minSessions: "Sesiones mínimas",
        cooldownDays: "Cooldown (días)",
        minNps: "NPS mínimo",
      },
      reativacao: {
        inactiveThresholdDays: "Inactividad mínima (días)",
        maxAttempts: "Máximo de intentos",
        channel: "Canal principal",
      },
      upsell: {
        trigger: "Disparador",
        offer: "Oferta",
        validityDays: "Validez (días)",
        addRule: "Agregar regla",
      },
      aniversariantes: {
        sendTime: "Hora de envío",
        offerEnabled: "Oferta activa",
        offerType: "Tipo de oferta",
        offerValue: "Valor",
        validityDays: "Validez (días)",
      },
      campaigns: {
        deliveryWindow: "Ventana de envío",
        dailyLimit: "Límite diario",
        dryRunOnly: "Solo dry-run",
      },
      rfm: {
        refreshIntervalDays: "Intervalo de actualización (días)",
        batchLimit: "Tamaño del lote",
        riskWindowDays: "Ventana de riesgo (días)",
      },
      health: {
        cooldownDays: "Cooldown de reactivación (días)",
        riskThreshold: "Umbral de riesgo",
        lookbackDays: "Ventana histórica (días)",
      },
      leadFollowUp: {
        cadenceDays: "Cadencia (días)",
        maxAttempts: "Máximo de intentos",
        handoffAfterDays: "Handoff después de (días)",
      },
      relationship: {
        intervalDays: "Intervalo (días)",
        tone: "Tono",
        shadowMode: "Shadow mode",
      },
    },
  },
};

const DEFAULT_AGENT_CONFIGS: AgentDraftMap = {
  "indicacao-agent": { minSessions: 6, cooldownDays: 30, minNps: 4 },
  "reativacao-agent": { inactiveThresholdDays: 45, maxAttempts: 3, channel: "whatsapp" },
  "upsell-agent": {
    rules: [{ trigger: "8 sessões concluídas", offer: "Pacote premium", validityDays: 7 }],
  },
  "aniversariantes-agent": {
    sendTime: "09:00",
    offerEnabled: true,
    offerType: "desconto",
    offerValue: 10,
    validityDays: 5,
  },
  "campaign-dispatcher": {
    deliveryWindow: "09:00-17:00",
    dailyLimit: 3,
    dryRunOnly: true,
  },
  "calculate-rfm": {
    refreshIntervalDays: 7,
    batchLimit: 200,
    riskWindowDays: 30,
  },
  "calculate-client-health-scores": {
    cooldownDays: 60,
    riskThreshold: "risk",
    lookbackDays: 180,
  },
  "lead-followup-agent": {
    cadenceDays: 3,
    maxAttempts: 4,
    handoffAfterDays: 7,
  },
  "relationship-agent": {
    intervalDays: 30,
    tone: "neutro",
    shadowMode: true,
  },
};

function truncate(value: string, maxLength = 120) {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
}

function formatConversationTime(value: string | null) {
  if (!value) return "";
  return new Intl.DateTimeFormat(undefined, {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function getConversationTitle(conversation: ConversationListItem) {
  return conversation.client_name || conversation.phone || conversation.channel;
}

function createDefaultAgentConfigs(): AgentDraftMap {
  return JSON.parse(JSON.stringify(DEFAULT_AGENT_CONFIGS)) as AgentDraftMap;
}

function normalizeAgentConfigs(input: Record<string, unknown> | null | undefined): AgentDraftMap {
  const normalized = createDefaultAgentConfigs();
  if (!input) return normalized;

  for (const slot of AGENT_SLOTS) {
    const raw = input[slot.slug];
    if (raw && typeof raw === "object" && !Array.isArray(raw)) {
      normalized[slot.slug] = { ...normalized[slot.slug], ...(raw as Record<string, unknown>) };
    }
  }

  return normalized;
}

function ShadowSuggestionEditor({
  suggestion,
  disabled,
  onApprove,
  onReject,
}: {
  suggestion: ShadowSuggestion;
  disabled: boolean;
  onApprove: (suggestionId: string, text: string) => void;
  onReject: (suggestionId: string) => void;
}) {
  const { t } = useI18n();
  const [text, setText] = useState(suggestion.actual_text ?? suggestion.suggested_text);

  useEffect(() => {
    setText(suggestion.actual_text ?? suggestion.suggested_text);
  }, [suggestion.actual_text, suggestion.suggested_text]);

  return (
    <Card className="border-amber-200 bg-amber-50/50">
      <CardHeader className="space-y-1">
        <div className="flex items-center gap-2">
          <ShieldAlert className="h-4 w-4 text-amber-700" />
          <CardTitle className="text-base">{t("conversations.shadow.title")}</CardTitle>
        </div>
        <CardDescription>{t("agents.shadow.description")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <textarea
          className="min-h-28 w-full rounded-lg border border-amber-200 bg-white px-3 py-2 text-sm leading-6 text-zinc-800 shadow-sm outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-100"
          value={text}
          onChange={(event) => setText(event.target.value)}
        />
        <div className="grid gap-2 sm:grid-cols-2">
          <Button
            type="button"
            className="gap-2"
            disabled={disabled || !text.trim()}
            onClick={() => onApprove(suggestion.id, text.trim())}
          >
            <Check className="h-4 w-4" />
            {t("conversations.shadow.approve")}
          </Button>
          <Button
            type="button"
            variant="outline"
            className="gap-2"
            disabled={disabled}
            onClick={() => onReject(suggestion.id)}
          >
            <X className="h-4 w-4" />
            {t("conversations.shadow.reject")}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function AgentToggleCard({
  slot,
  title,
  description,
  enabled,
  summary,
  onToggle,
  onOpen,
}: {
  slot: AgentSlot;
  title: string;
  description: string;
  enabled: boolean;
  summary: string;
  onToggle: (slug: AgentSlug) => void;
  onOpen: (slug: AgentSlug) => void;
}) {
  const Icon = slot.icon;

  return (
    <Card className={`border-zinc-200 transition ${enabled ? "bg-emerald-50/30" : "bg-white"}`}>
      <CardHeader className="space-y-3 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-3">
            <div
              className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${
                enabled ? "bg-emerald-100 text-emerald-700" : "bg-zinc-100 text-zinc-700"
              }`}
            >
              <Icon className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <CardTitle className="text-base">{title}</CardTitle>
              <CardDescription className="line-clamp-2">{description}</CardDescription>
            </div>
          </div>
          <Badge variant={enabled ? "success" : "secondary"}>{enabled ? "Ativo" : "Inativo"}</Badge>
        </div>
      </CardHeader>
      <CardContent className="flex items-center justify-between gap-3 px-4 pb-4 pt-0">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">Slug</p>
          <p className="truncate text-sm text-zinc-700">{slot.slug}</p>
          <p className="mt-1 text-xs text-zinc-500">{summary}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <label className="flex items-center gap-2 rounded-full border border-zinc-200 px-3 py-2 text-sm">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-zinc-300 text-violet-600"
              checked={enabled}
              onChange={() => onToggle(slot.slug)}
            />
            {enabled ? "ON" : "OFF"}
          </label>
          <Button type="button" variant="outline" onClick={() => onOpen(slot.slug)}>
            Abrir
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function getAgentSummary(locale: Locale, slug: AgentSlug, draft: AgentDraft) {
  const activeWords = {
    "pt-BR": { days: "dias", sessions: "sessões", attempts: "tentativas", rules: "regras" },
    "en-US": { days: "days", sessions: "sessions", attempts: "attempts", rules: "rules" },
    "es-419": { days: "días", sessions: "sesiones", attempts: "intentos", rules: "reglas" },
  }[locale];

  switch (slug) {
    case "indicacao-agent":
      return `${draft.minSessions ?? 0} ${activeWords.sessions} · NPS ${draft.minNps ?? 0}+ · ${draft.cooldownDays ?? 0} ${activeWords.days}`;
    case "reativacao-agent":
      return `${draft.inactiveThresholdDays ?? 0} ${activeWords.days} · ${draft.maxAttempts ?? 0} ${activeWords.attempts}`;
    case "upsell-agent": {
      const rules = Array.isArray(draft.rules) ? draft.rules.length : 0;
      return `${rules} ${activeWords.rules} · shadow`;
    }
    case "aniversariantes-agent":
      return `${String(draft.sendTime ?? "09:00")} · ${draft.offerEnabled ? "offer on" : "offer off"}`;
    case "campaign-dispatcher":
      return `${String(draft.deliveryWindow ?? "09:00-17:00")} · ${draft.dailyLimit ?? 0}/day`;
    case "calculate-rfm":
      return `${draft.refreshIntervalDays ?? 0} ${activeWords.days} · batch ${draft.batchLimit ?? 0}`;
    case "calculate-client-health-scores":
      return `${draft.cooldownDays ?? 0} ${activeWords.days} · ${draft.lookbackDays ?? 0} ${activeWords.days} lookback`;
    case "lead-followup-agent":
      return `${draft.cadenceDays ?? 0} ${activeWords.days} · ${draft.maxAttempts ?? 0} ${activeWords.attempts}`;
    case "relationship-agent":
      return `${draft.intervalDays ?? 0} ${activeWords.days} · shadow ${draft.shadowMode ? "on" : "off"}`;
  }
}

function AgentDrawerContent({
  locale,
  slug,
  draft,
  updateDraft,
}: {
  locale: Locale;
  slug: AgentSlug;
  draft: AgentDraft;
  updateDraft: (slug: AgentSlug, patch: AgentDraft) => void;
}) {
  const text = AGENT_TEXT[locale];

  const field = text.drawerFields[AGENT_SLOTS.find((slot) => slot.slug === slug)?.kind ?? "relationship"] as Record<
    string,
    string
  >;

  function patch(next: AgentDraft) {
    updateDraft(slug, next);
  }

  if (slug === "indicacao-agent") {
    return (
      <div className="space-y-4 px-4 pb-6">
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="space-y-1">
            <label className="text-sm font-medium text-zinc-700">{field.minSessions}</label>
            <Input type="number" value={String(draft.minSessions ?? 0)} onChange={(event) => patch({ ...draft, minSessions: Number(event.target.value) })} />
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium text-zinc-700">{field.cooldownDays}</label>
            <Input type="number" value={String(draft.cooldownDays ?? 0)} onChange={(event) => patch({ ...draft, cooldownDays: Number(event.target.value) })} />
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium text-zinc-700">{field.minNps}</label>
            <Input type="number" min={1} max={5} value={String(draft.minNps ?? 0)} onChange={(event) => patch({ ...draft, minNps: Number(event.target.value) })} />
          </div>
        </div>
      </div>
    );
  }

  if (slug === "reativacao-agent") {
    return (
      <div className="space-y-4 px-4 pb-6">
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="space-y-1">
            <label className="text-sm font-medium text-zinc-700">{field.inactiveThresholdDays}</label>
            <Input type="number" value={String(draft.inactiveThresholdDays ?? 0)} onChange={(event) => patch({ ...draft, inactiveThresholdDays: Number(event.target.value) })} />
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium text-zinc-700">{field.maxAttempts}</label>
            <Input type="number" value={String(draft.maxAttempts ?? 0)} onChange={(event) => patch({ ...draft, maxAttempts: Number(event.target.value) })} />
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium text-zinc-700">{field.channel}</label>
            <Input value={String(draft.channel ?? "whatsapp")} onChange={(event) => patch({ ...draft, channel: event.target.value })} />
          </div>
        </div>
      </div>
    );
  }

  if (slug === "upsell-agent") {
    const rules = Array.isArray(draft.rules) ? (draft.rules as Array<Record<string, unknown>>) : [];
    const removeLabel = locale === "en-US" ? "Remove" : locale === "es-419" ? "Eliminar" : "Remover";
    return (
      <div className="space-y-4 px-4 pb-6">
        <div className="space-y-3">
          {rules.map((rule, index) => (
            <div key={`${index}-${String(rule.trigger ?? "")}`} className="space-y-3 rounded-lg border border-zinc-200 bg-zinc-50 p-3">
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="space-y-1 sm:col-span-2">
                  <label className="text-sm font-medium text-zinc-700">{field.trigger}</label>
                  <Input
                    value={String(rule.trigger ?? "")}
                    onChange={(event) => {
                      const next = [...rules];
                      next[index] = { ...rule, trigger: event.target.value };
                      patch({ ...draft, rules: next });
                    }}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-medium text-zinc-700">{field.validityDays}</label>
                  <Input
                    type="number"
                    value={String(rule.validityDays ?? 0)}
                    onChange={(event) => {
                      const next = [...rules];
                      next[index] = { ...rule, validityDays: Number(event.target.value) };
                      patch({ ...draft, rules: next });
                    }}
                  />
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium text-zinc-700">{field.offer}</label>
                <Input
                  value={String(rule.offer ?? "")}
                  onChange={(event) => {
                    const next = [...rules];
                    next[index] = { ...rule, offer: event.target.value };
                    patch({ ...draft, rules: next });
                  }}
                />
              </div>
              <div className="flex justify-end">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => patch({ ...draft, rules: rules.filter((_, ruleIndex) => ruleIndex !== index) })}
                >
                  {removeLabel}
                </Button>
              </div>
            </div>
          ))}
        </div>
        <Button
          type="button"
          variant="outline"
          className="gap-2"
          onClick={() =>
            patch({
              ...draft,
              rules: [...rules, { trigger: "", offer: "", validityDays: 7 }],
            })
          }
        >
          <Sparkles className="h-4 w-4" />
          {field.addRule}
        </Button>
      </div>
    );
  }

  if (slug === "aniversariantes-agent") {
    return (
      <div className="space-y-4 px-4 pb-6">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <label className="text-sm font-medium text-zinc-700">{field.sendTime}</label>
            <Input value={String(draft.sendTime ?? "09:00")} onChange={(event) => patch({ ...draft, sendTime: event.target.value })} />
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium text-zinc-700">{field.validityDays}</label>
            <Input type="number" value={String(draft.validityDays ?? 0)} onChange={(event) => patch({ ...draft, validityDays: Number(event.target.value) })} />
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="flex items-center gap-2 rounded-lg border border-zinc-200 px-3 py-3 text-sm">
            <input
              type="checkbox"
              checked={Boolean(draft.offerEnabled)}
              onChange={(event) => patch({ ...draft, offerEnabled: event.target.checked })}
            />
            {field.offerEnabled}
          </label>
          <div className="space-y-1">
            <label className="text-sm font-medium text-zinc-700">{field.offerType}</label>
            <Input value={String(draft.offerType ?? "desconto")} onChange={(event) => patch({ ...draft, offerType: event.target.value })} />
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium text-zinc-700">{field.offerValue}</label>
            <Input type="number" value={String(draft.offerValue ?? 0)} onChange={(event) => patch({ ...draft, offerValue: Number(event.target.value) })} />
          </div>
        </div>
      </div>
    );
  }

  if (slug === "campaign-dispatcher") {
    return (
      <div className="space-y-4 px-4 pb-6">
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="space-y-1 sm:col-span-2">
            <label className="text-sm font-medium text-zinc-700">{field.deliveryWindow}</label>
            <Input value={String(draft.deliveryWindow ?? "09:00-17:00")} onChange={(event) => patch({ ...draft, deliveryWindow: event.target.value })} />
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium text-zinc-700">{field.dailyLimit}</label>
            <Input type="number" value={String(draft.dailyLimit ?? 0)} onChange={(event) => patch({ ...draft, dailyLimit: Number(event.target.value) })} />
          </div>
        </div>
        <label className="flex items-center gap-2 rounded-lg border border-zinc-200 px-3 py-3 text-sm">
          <input
            type="checkbox"
            checked={Boolean(draft.dryRunOnly)}
            onChange={(event) => patch({ ...draft, dryRunOnly: event.target.checked })}
          />
          {field.dryRunOnly}
        </label>
      </div>
    );
  }

  if (slug === "calculate-rfm") {
    return (
      <div className="space-y-4 px-4 pb-6">
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="space-y-1">
            <label className="text-sm font-medium text-zinc-700">{field.refreshIntervalDays}</label>
            <Input type="number" value={String(draft.refreshIntervalDays ?? 0)} onChange={(event) => patch({ ...draft, refreshIntervalDays: Number(event.target.value) })} />
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium text-zinc-700">{field.batchLimit}</label>
            <Input type="number" value={String(draft.batchLimit ?? 0)} onChange={(event) => patch({ ...draft, batchLimit: Number(event.target.value) })} />
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium text-zinc-700">{field.riskWindowDays}</label>
            <Input type="number" value={String(draft.riskWindowDays ?? 0)} onChange={(event) => patch({ ...draft, riskWindowDays: Number(event.target.value) })} />
          </div>
        </div>
      </div>
    );
  }

  if (slug === "calculate-client-health-scores") {
    return (
      <div className="space-y-4 px-4 pb-6">
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="space-y-1">
            <label className="text-sm font-medium text-zinc-700">{field.cooldownDays}</label>
            <Input type="number" value={String(draft.cooldownDays ?? 0)} onChange={(event) => patch({ ...draft, cooldownDays: Number(event.target.value) })} />
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium text-zinc-700">{field.riskThreshold}</label>
            <Input value={String(draft.riskThreshold ?? "risk")} onChange={(event) => patch({ ...draft, riskThreshold: event.target.value })} />
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium text-zinc-700">{field.lookbackDays}</label>
            <Input type="number" value={String(draft.lookbackDays ?? 0)} onChange={(event) => patch({ ...draft, lookbackDays: Number(event.target.value) })} />
          </div>
        </div>
      </div>
    );
  }

  if (slug === "lead-followup-agent") {
    return (
      <div className="space-y-4 px-4 pb-6">
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="space-y-1">
            <label className="text-sm font-medium text-zinc-700">{field.cadenceDays}</label>
            <Input type="number" value={String(draft.cadenceDays ?? 0)} onChange={(event) => patch({ ...draft, cadenceDays: Number(event.target.value) })} />
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium text-zinc-700">{field.maxAttempts}</label>
            <Input type="number" value={String(draft.maxAttempts ?? 0)} onChange={(event) => patch({ ...draft, maxAttempts: Number(event.target.value) })} />
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium text-zinc-700">{field.handoffAfterDays}</label>
            <Input type="number" value={String(draft.handoffAfterDays ?? 0)} onChange={(event) => patch({ ...draft, handoffAfterDays: Number(event.target.value) })} />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 px-4 pb-6">
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="space-y-1">
          <label className="text-sm font-medium text-zinc-700">{field.intervalDays}</label>
          <Input type="number" value={String(draft.intervalDays ?? 0)} onChange={(event) => patch({ ...draft, intervalDays: Number(event.target.value) })} />
        </div>
        <div className="space-y-1">
          <label className="text-sm font-medium text-zinc-700">{field.tone}</label>
          <Input value={String(draft.tone ?? "neutro")} onChange={(event) => patch({ ...draft, tone: event.target.value })} />
        </div>
        <label className="flex items-center gap-2 rounded-lg border border-zinc-200 px-3 py-3 text-sm">
          <input
            type="checkbox"
            checked={Boolean(draft.shadowMode)}
            onChange={(event) => patch({ ...draft, shadowMode: event.target.checked })}
          />
          {field.shadowMode}
        </label>
      </div>
    </div>
  );
}

export default function AgentesPage() {
  const { professionalId } = useAuth();
  const { t, locale } = useI18n();
  const settings = useAssistantSettings(professionalId);
  const conversations = useConversations(professionalId);
  const suggestions = useShadowSuggestions(professionalId);

  const [form, setForm] = useState<AssistantSettingsInput>({
    agentName: "Rosane",
    tone: "amigavel",
    shadowMode: true,
    autoRespond: true,
    enabledAgents: ["indicacao-agent", "reativacao-agent", "upsell-agent", "aniversariantes-agent"],
    agentConfigs: createDefaultAgentConfigs(),
    sendGoogleReviewAfterPositiveNps: false,
    googleReviewUrl: "",
  });
  const [saved, setSaved] = useState(false);
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);
  const [selectedAgentSlug, setSelectedAgentSlug] = useState<AgentSlug | null>(null);
  const [chatPrompt, setChatPrompt] = useState("");
  const [simulatedReply, setSimulatedReply] = useState<string | null>(null);
  const [agentConfigs, setAgentConfigs] = useState<AgentDraftMap>(createDefaultAgentConfigs());
  const [whatsappMode, setWhatsappMode] = useState<"idle" | "pairing_input">("idle");
  const [pairingPhone, setPairingPhone] = useState("");
  const [pairingCode, setPairingCode] = useState<string | null>(null);

  const whatsappConn = useWhatsappConnection(professionalId);
  const conn = whatsappConn.query.data;

  const assistantName = form.agentName.trim() || DEFAULT_ASSISTANT_NAME;
  const assistantParams = { assistantName };
  const agentText = AGENT_TEXT[locale];

  useEffect(() => {
    if (settings.data?.form) {
      setForm(settings.data.form);
      setAgentConfigs(normalizeAgentConfigs(settings.data.form.agentConfigs as Record<string, unknown> | undefined));
    }
  }, [settings.data?.form]);

  const conversationList = useMemo(() => conversations.data ?? [], [conversations.data]);

  useEffect(() => {
    if (!selectedConversationId && conversationList.length > 0) {
      setSelectedConversationId(conversationList[0]?.id ?? null);
    }
  }, [conversationList, selectedConversationId]);

  const selectedConversation =
    conversationList.find((conversation) => conversation.id === selectedConversationId) ?? null;
  const conversationMessages = useConversationMessages(professionalId, selectedConversationId);

  const whatsappStatus = useMemo(() => {
    const whatsapp = settings.data?.whatsapp;
    if (!whatsapp) return { label: t("settings.whatsapp.notConfigured"), variant: "secondary" as const };
    if (whatsapp.is_connected) return { label: t("settings.whatsapp.connected"), variant: "success" as const };
    if (whatsapp.status === "connecting") return { label: t("settings.whatsapp.connecting"), variant: "warning" as const };
    return { label: t("settings.whatsapp.disconnected"), variant: "secondary" as const };
  }, [settings.data?.whatsapp, t]);

  const activeAgentCount = form.enabledAgents.length;
  const metrics = [
    { label: t("settings.activeAgents"), value: String(activeAgentCount) },
    { label: t("conversations.pendingSuggestions"), value: String(suggestions.data?.length ?? 0) },
    { label: t("agents.metrics.conversations"), value: String(conversationList.length) },
    { label: t("agents.metrics.whatsapp"), value: whatsappStatus.label },
  ];

  const currentAgent = selectedAgentSlug ? AGENT_SLOTS.find((slot) => slot.slug === selectedAgentSlug) ?? null : null;
  const currentAgentDraft = selectedAgentSlug ? agentConfigs[selectedAgentSlug] ?? {} : {};

  function toggleAgent(agentSlug: AgentSlug) {
    setSaved(false);
    setForm((current) => {
      const enabled = current.enabledAgents.includes(agentSlug);
      return {
        ...current,
        enabledAgents: enabled
          ? current.enabledAgents.filter((item) => item !== agentSlug)
          : [...current.enabledAgents, agentSlug],
      };
    });
  }

  function updateAgentDraft(agentSlug: AgentSlug, patch: AgentDraft) {
    setAgentConfigs((current) => ({
      ...current,
      [agentSlug]: {
        ...(current[agentSlug] ?? {}),
        ...patch,
      },
    }));
  }

  async function handleSave() {
    setSaved(false);
    try {
      await settings.save({
        ...form,
        agentConfigs,
      });
      setSaved(true);
    } catch {
      setSaved(false);
    }
  }

  async function handleGeneratePreview() {
    if (!chatPrompt.trim()) return;
    const messages = conversationMessages.data ?? [];
    const lastInbound = [...messages].reverse().find((message) => message.direction === "inbound");
    const history = messages
      .slice(-3)
      .map((message) => {
        const speaker = message.direction === "inbound" ? (locale === "en-US" ? "Client" : locale === "es-419" ? "Cliente" : "Cliente") : assistantName;
        return `${speaker}: ${truncate(message.content ?? "", 90)}`;
      })
      .join(" | ");

    setSimulatedReply(
      [
        `${assistantName} · ${selectedConversation ? getConversationTitle(selectedConversation) : t("agents.chat.noConversation")}`,
        lastInbound?.content ? `${locale === "en-US" ? "Last client message" : locale === "es-419" ? "Último mensaje del cliente" : "Última mensagem do cliente"}: ${truncate(lastInbound.content, 140)}` : "",
        history ? `${locale === "en-US" ? "Real context" : locale === "es-419" ? "Contexto real" : "Contexto real"}: ${history}` : "",
        `${locale === "en-US" ? "Draft" : locale === "es-419" ? "Rascunho" : "Rascunho"}: ${chatPrompt.trim()}`,
      ]
        .filter(Boolean)
        .join("\n"),
    );
  }

  if (!professionalId || settings.isLoading) {
    return (
      <div className="space-y-4 p-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-56 w-full" />
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-5 px-4 py-5 pb-28 md:px-6 md:pb-6">
      <header className="space-y-2">
        <Button asChild variant="ghost" className="w-fit gap-2 px-0">
          <Link to="/configuracoes">
            <ArrowLeft className="h-4 w-4" />
            {t("team.back")}
          </Link>
        </Button>
        <p className="text-xs font-semibold uppercase tracking-wide text-violet-600">{t("agents.eyebrow")}</p>
        <h1 className="text-3xl font-semibold tracking-tight text-zinc-950">{t("agents.title")}</h1>
        <p className="max-w-3xl text-sm leading-6 text-zinc-500">{t("agents.subtitle", assistantParams)}</p>
      </header>

      {settings.isError && <div className="rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-sm text-red-700">{t("settings.error.load")}</div>}
      {settings.saveError && <div className="rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-sm text-red-700">{t("settings.error.save")}</div>}
      {saved && <div className="rounded-lg border border-emerald-100 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{t("settings.saved")}</div>}

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {metrics.map((metric) => (
          <Card key={metric.label} className="rounded-lg border-zinc-200">
            <CardContent className="p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">{metric.label}</p>
              <p className="mt-2 text-2xl font-semibold text-zinc-950">{metric.value}</p>
            </CardContent>
          </Card>
        ))}
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-violet-100 text-violet-700">
                <Bot className="h-5 w-5" />
              </div>
              <div>
                <CardTitle>{t("settings.assistantIdentity.title")}</CardTitle>
                <CardDescription>{t("settings.assistantIdentity.description")}</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-[1.4fr_0.6fr]">
              <div className="space-y-1">
                <label htmlFor="agentName" className="text-sm font-medium text-zinc-700">
                  {t("settings.assistantName")}
                </label>
                <Input id="agentName" value={form.agentName} onChange={(event) => setForm((current) => ({ ...current, agentName: event.target.value }))} placeholder="Rosane" />
              </div>
              <div className="space-y-1">
                <label htmlFor="tone" className="text-sm font-medium text-zinc-700">
                  {t("settings.tone")}
                </label>
                <select
                  id="tone"
                  className="h-10 w-full rounded-md border border-zinc-200 bg-white px-3 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
                  value={form.tone}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      tone: event.target.value as AssistantSettingsInput["tone"],
                    }))
                  }
                >
                  <option value="amigavel">{t("settings.tone.friendly")}</option>
                  <option value="profissional">{t("settings.tone.professional")}</option>
                  <option value="objetivo">{t("settings.tone.objective")}</option>
                </select>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="flex items-start gap-3 rounded-lg border border-zinc-200 px-3 py-3">
                <input
                  type="checkbox"
                  className="mt-1 h-4 w-4 rounded border-zinc-300 text-violet-600"
                  checked={form.autoRespond}
                  onChange={(event) => setForm((current) => ({ ...current, autoRespond: event.target.checked }))}
                />
                <span>
                  <span className="block text-sm font-medium text-zinc-900">{t("settings.autoRespond.title")}</span>
                  <span className="mt-0.5 block text-sm leading-5 text-zinc-500">{t("settings.autoRespond.description", assistantParams)}</span>
                </span>
              </label>

              <label className="flex items-start gap-3 rounded-lg border border-zinc-200 px-3 py-3">
                <input
                  type="checkbox"
                  className="mt-1 h-4 w-4 rounded border-zinc-300 text-violet-600"
                  checked={form.shadowMode}
                  onChange={(event) => setForm((current) => ({ ...current, shadowMode: event.target.checked }))}
                />
                <span>
                  <span className="block text-sm font-medium text-zinc-900">{t("settings.shadowMode.title")}</span>
                  <span className="mt-0.5 block text-sm leading-5 text-zinc-500">{t("settings.shadowMode.description")}</span>
                </span>
              </label>
            </div>

            <div className="space-y-2">
              <p className="text-sm font-medium text-zinc-700">{t("settings.activeAgents")}</p>
              <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                {AGENT_SLOTS.map((slot) => (
                  <label key={slot.slug} className="flex items-center gap-2 rounded-lg border border-zinc-200 px-3 py-2 text-sm">
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded border-zinc-300 text-violet-600"
                      checked={form.enabledAgents.includes(slot.slug)}
                      onChange={() => toggleAgent(slot.slug)}
                    />
                    {agentText.title[slot.slug]}
                  </label>
                ))}
              </div>
            </div>

            <label className="flex items-start gap-3 rounded-lg border border-zinc-200 px-3 py-3">
              <input
                type="checkbox"
                className="mt-1 h-4 w-4 rounded border-zinc-300 text-violet-600"
                checked={form.sendGoogleReviewAfterPositiveNps}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    sendGoogleReviewAfterPositiveNps: event.target.checked,
                  }))
                }
              />
              <span>
                <span className="block text-sm font-medium text-zinc-900">{t("settings.postCare.googleReview.title")}</span>
                <span className="mt-0.5 block text-sm leading-5 text-zinc-500">{t("settings.postCare.googleReview.description", assistantParams)}</span>
              </span>
            </label>

            <div className="space-y-1">
              <label htmlFor="googleReviewUrl" className="text-sm font-medium text-zinc-700">
                {t("settings.postCare.googleReviewUrl")}
              </label>
              <Input
                id="googleReviewUrl"
                value={form.googleReviewUrl}
                onChange={(event) => setForm((current) => ({ ...current, googleReviewUrl: event.target.value }))}
                inputMode="url"
                placeholder="https://"
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-zinc-100 text-zinc-700">
                <MessageCircle className="h-5 w-5" />
              </div>
              <div>
                <CardTitle>{t("settings.whatsapp.title")}</CardTitle>
                <CardDescription>{t("settings.whatsapp.description", assistantParams)}</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="grid gap-4 text-sm">
            {whatsappConn.query.isLoading ? (
              <div className="grid gap-2">
                <Skeleton className="h-8 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            ) : conn?.is_connected ? (
              <>
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="font-medium text-zinc-900">{t("settings.whatsapp.phoneNumber")}</p>
                    <p className="text-zinc-500">{conn.phone_number ?? t("settings.whatsapp.notInformed")}</p>
                  </div>
                  <Badge variant="success">{t("settings.whatsapp.connected")}</Badge>
                </div>
                <Button
                  variant="outline"
                  className="w-full"
                  disabled={whatsappConn.disconnect.isPending}
                  onClick={() => whatsappConn.disconnect.mutate(undefined, {
                    onError: () => { /* toast shown by hook */ },
                  })}
                >
                  {whatsappConn.disconnect.isPending ? (
                    <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                  ) : null}
                  {t("settings.whatsapp.disconnect")}
                </Button>
              </>
            ) : conn?.status === "connecting" && conn?.connection_mode === "qr" && conn?.qr_code ? (
              <>
                <Badge variant="warning" className="w-fit">{t("settings.whatsapp.connecting")}</Badge>
                <div className="flex flex-col items-center gap-3">
                  <img
                    src={conn.qr_code}
                    alt="WhatsApp QR code"
                    className="h-48 w-48 rounded-lg border border-zinc-200"
                  />
                  <p className="text-center text-xs text-zinc-500">{t("settings.whatsapp.qr.description")}</p>
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  <Button
                    variant="outline"
                    onClick={() => whatsappConn.disconnect.mutate()}
                  >
                    {t("settings.whatsapp.back")}
                  </Button>
                  <Button
                    variant="outline"
                    disabled={whatsappConn.startQr.isPending}
                    onClick={() => whatsappConn.startQr.mutate()}
                  >
                    {whatsappConn.startQr.isPending ? (
                      <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                    ) : <RefreshCw className="mr-2 h-4 w-4" />}
                    {t("settings.whatsapp.qr.refresh")}
                  </Button>
                </div>
              </>
            ) : conn?.status === "connecting" && conn?.connection_mode === "pairing_code" && pairingCode ? (
              <>
                <Badge variant="warning" className="w-fit">{t("settings.whatsapp.connecting")}</Badge>
                <div className="flex flex-col items-center gap-3">
                  <p className="text-sm font-medium text-zinc-900">{t("settings.whatsapp.pairing.title")}</p>
                  <p className="rounded-lg bg-zinc-100 px-6 py-4 text-center font-mono text-2xl font-bold tracking-widest text-zinc-900">
                    {pairingCode}
                  </p>
                  <p className="text-center text-xs text-zinc-500">{t("settings.whatsapp.pairing.description")}</p>
                </div>
                <Button variant="outline" onClick={() => { setPairingCode(null); setWhatsappMode("idle"); whatsappConn.disconnect.mutate(); }}>
                  {t("settings.whatsapp.back")}
                </Button>
              </>
            ) : whatsappMode === "pairing_input" ? (
              <>
                <div className="grid gap-1.5">
                  <label className="text-sm font-medium text-zinc-900" htmlFor="pairingPhone">
                    {t("settings.whatsapp.pairing.phoneLabel")}
                  </label>
                  <Input
                    id="pairingPhone"
                    type="tel"
                    inputMode="tel"
                    placeholder={t("settings.whatsapp.pairing.phonePlaceholder")}
                    value={pairingPhone}
                    onChange={(e) => setPairingPhone(e.target.value)}
                  />
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  <Button variant="outline" onClick={() => setWhatsappMode("idle")}>
                    {t("settings.whatsapp.back")}
                  </Button>
                  <Button
                    disabled={!pairingPhone.trim() || whatsappConn.startPairing.isPending}
                    onClick={() => {
                      whatsappConn.startPairing.mutate(pairingPhone.trim(), {
                        onSuccess: (data) => {
                          if (data.pairing_code) setPairingCode(data.pairing_code);
                          setWhatsappMode("idle");
                        },
                      });
                    }}
                  >
                    {whatsappConn.startPairing.isPending ? (
                      <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                    ) : null}
                    {t("settings.whatsapp.pairing.action")}
                  </Button>
                </div>
              </>
            ) : (
              <>
                <div className="flex items-center justify-between gap-3">
                  <Badge variant="secondary">{whatsappStatus.label}</Badge>
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  <Button
                    variant="outline"
                    disabled={whatsappConn.startQr.isPending}
                    onClick={() => whatsappConn.startQr.mutate()}
                  >
                    {whatsappConn.startQr.isPending ? (
                      <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                    ) : null}
                    {t("settings.whatsapp.connectQr")}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => { setPairingPhone(""); setWhatsappMode("pairing_input"); }}
                  >
                    {t("settings.whatsapp.connectPairing")}
                  </Button>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-4">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {AGENT_SLOTS.map((slot) => {
            const enabled = form.enabledAgents.includes(slot.slug);
            const summary = getAgentSummary(locale, slot.slug, agentConfigs[slot.slug] ?? DEFAULT_AGENT_CONFIGS[slot.slug]);
            return (
              <AgentToggleCard
                key={slot.slug}
                slot={slot}
                title={agentText.title[slot.slug]}
                description={agentText.description[slot.slug]}
                enabled={enabled}
                summary={summary}
                onToggle={toggleAgent}
                onOpen={(slug) => setSelectedAgentSlug(slug)}
              />
            );
          })}
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-[1fr_360px]">
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-100 text-amber-700">
                <ShieldAlert className="h-5 w-5" />
              </div>
              <div>
                <CardTitle>{t("agents.shadow.title")}</CardTitle>
                <CardDescription>{t("agents.shadow.description")}</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {suggestions.isLoading ? (
              <Skeleton className="h-32 w-full" />
            ) : suggestions.data?.length ? (
              <div className="space-y-3">
                {suggestions.data.map((suggestion) => (
                  <ShadowSuggestionEditor
                    key={suggestion.id}
                    suggestion={suggestion}
                    disabled={suggestions.isApprovingSuggestion || suggestions.isRejectingSuggestion}
                    onApprove={async (suggestionId, text) => {
                      await suggestions.approveSuggestion({ suggestionId, actualText: text });
                    }}
                    onReject={async (suggestionId) => {
                      await suggestions.rejectSuggestion({ suggestionId, reason: "Rejected from /agentes" });
                    }}
                  />
                ))}
              </div>
            ) : (
              <div className="rounded-lg border border-dashed border-zinc-200 bg-zinc-50 px-4 py-4 text-sm text-zinc-500">
                {t("agents.shadow.empty")}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="min-h-[420px]">
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-sky-100 text-sky-700">
                <MessageCircle className="h-5 w-5" />
              </div>
              <div>
                <CardTitle>{t("agents.chat.title")}</CardTitle>
                <CardDescription>{t("agents.chat.description")}</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-2 sm:grid-cols-[1fr_auto] sm:items-end">
              <div className="space-y-1">
                <label className="text-sm font-medium text-zinc-700">{t("agents.chat.conversation")}</label>
                <select
                  className="h-10 w-full rounded-md border border-zinc-200 bg-white px-3 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
                  value={selectedConversationId ?? ""}
                  onChange={(event) => setSelectedConversationId(event.target.value || null)}
                >
                  {conversationList.length === 0 ? (
                    <option value="">{t("agents.chat.noConversation")}</option>
                  ) : (
                    conversationList.map((conversation) => (
                      <option key={conversation.id} value={conversation.id}>
                        {getConversationTitle(conversation)}
                      </option>
                    ))
                  )}
                </select>
              </div>
              <Button
                type="button"
                variant="outline"
                className="gap-2"
                disabled={conversationMessages.isFetching}
                onClick={() => conversationMessages.refetch()}
              >
                <RefreshCw className="h-4 w-4" />
                {t("growth.action.refreshScores")}
              </Button>
            </div>

            <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-zinc-900">
                    {selectedConversation ? getConversationTitle(selectedConversation) : t("agents.chat.noConversation")}
                  </p>
                  <p className="text-xs text-zinc-500">
                    {selectedConversation?.phone ?? t("common.pending")} · {selectedConversation?.channel ?? t("common.pending")}
                  </p>
                </div>
                <Badge variant={selectedConversation ? "secondary" : "outline"}>
                  {selectedConversation?.rosane_status ?? t("common.pending")}
                </Badge>
              </div>

              <div className="mt-3 space-y-2">
                {conversationMessages.isLoading ? (
                  <Skeleton className="h-40 w-full" />
                ) : conversationMessages.data?.length ? (
                  conversationMessages.data.slice(-5).map((message) => (
                    <div key={message.id} className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-700">
                      <div className="flex items-center justify-between gap-3 text-xs uppercase tracking-wide text-zinc-400">
                        <span>{message.direction === "inbound" ? "Cliente" : assistantName}</span>
                        <span>{formatConversationTime(message.created_at)}</span>
                      </div>
                      <p className="mt-1 leading-6">{truncate(message.content ?? t("common.none"), 120)}</p>
                    </div>
                  ))
                ) : (
                  <div className="rounded-lg border border-dashed border-zinc-200 bg-white px-3 py-4 text-sm text-zinc-500">
                    {t("agents.chat.previewEmpty")}
                  </div>
                )}
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-sm font-medium text-zinc-700">{t("agents.chat.prompt")}</label>
              <textarea
                className="min-h-28 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm leading-6 text-zinc-800 shadow-sm outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
                value={chatPrompt}
                placeholder={t("agents.chat.promptPlaceholder")}
                onChange={(event) => setChatPrompt(event.target.value)}
              />
            </div>

            <div className="flex flex-wrap gap-2">
              <Button type="button" className="gap-2" onClick={handleGeneratePreview} disabled={!chatPrompt.trim()}>
                <Sparkles className="h-4 w-4" />
                {t("agents.chat.generate")}
              </Button>
              <Button type="button" variant="outline" className="gap-2" onClick={() => { setChatPrompt(""); setSimulatedReply(null); }}>
                <X className="h-4 w-4" />
                {t("agents.chat.clear")}
              </Button>
            </div>

            <div className="rounded-lg border border-sky-200 bg-sky-50/70 p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-sky-700">{t("agents.chat.preview")}</p>
              <p className="mt-2 whitespace-pre-line text-sm leading-6 text-sky-950">
                {simulatedReply ?? t("agents.chat.previewEmpty")}
              </p>
            </div>
          </CardContent>
        </Card>
      </section>

      <Sheet
        open={Boolean(selectedAgentSlug)}
        onOpenChange={(open) => {
          if (!open) setSelectedAgentSlug(null);
        }}
      >
        <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-xl">
          <SheetHeader className="px-4 pt-6">
            <SheetTitle>{currentAgent ? agentText.drawerTitle[currentAgent.kind] : t("agents.title")}</SheetTitle>
            <SheetDescription>
              {currentAgent ? agentText.drawerDescription[currentAgent.kind] : t("agents.subtitle", assistantParams)}
            </SheetDescription>
          </SheetHeader>
          {currentAgent && (
            <AgentDrawerContent
              locale={locale}
              slug={currentAgent.slug}
              draft={currentAgentDraft}
              updateDraft={updateAgentDraft}
            />
          )}
          <SheetFooter className="px-4 pb-6">
            <Button type="button" variant="outline" onClick={() => setSelectedAgentSlug(null)}>
              {t("common.cancel")}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-zinc-200 bg-white/95 px-4 py-3 backdrop-blur md:px-6">
        <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-3">
          <div className="text-sm text-zinc-600">
            {saved ? t("settings.saved") : t("settings.index.assistant.description")}
          </div>
          <Button type="button" className="gap-2" onClick={handleSave} disabled={settings.isSaving}>
            {settings.isSaving ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            {settings.isSaving ? t("common.saving") : t("settings.save")}
          </Button>
        </div>
      </div>
    </div>
  );
}
