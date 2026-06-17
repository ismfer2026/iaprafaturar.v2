import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  Bot,
  CalendarPlus,
  Check,
  CheckCheck,
  ChevronRight,
  MessageSquare,
  Search,
  Send,
  ShieldAlert,
  User,
  UserCheck,
  X,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  Skeleton,
  cn,
} from "@iaprafaturar/ui";
import { useAuth } from "@/contexts/AuthContext";
import {
  isConversationUrgent,
  useConversationMessages,
  useConversations,
  useConversationActions,
  useShadowSuggestions,
  type ConversationListItem,
  type ConversationMessage,
  type ShadowSuggestion,
} from "@/hooks/useConversations";
import { useClient } from "@/hooks/useClients";
import { useClientAppointments } from "@/hooks/useAppointments";
import { useServices } from "@/hooks/useServices";
import { supabase } from "@/lib/supabase";
import { useI18n, type TranslationKey } from "@/i18n";

const CONVERSATION_STATUS_KEYS: Record<ConversationListItem["rosane_status"], TranslationKey> = {
  active: "conversations.status.active",
  shadow: "conversations.status.shadow",
  paused: "conversations.status.paused",
  human_takeover: "conversations.status.humanTakeover",
};

const JOURNEY_STAGE_LABELS: Record<string, string> = {
  lead: "Lead",
  agendado: "Agendado",
  em_tratamento: "Em tratamento",
  pos_tratamento: "Pós-tratamento",
  cliente_fiel: "Cliente fiel",
  inativo: "Inativo",
};

const JOURNEY_STAGE_COLORS: Record<string, string> = {
  lead: "bg-sky-100 text-sky-700",
  agendado: "bg-violet-100 text-violet-700",
  em_tratamento: "bg-emerald-100 text-emerald-700",
  pos_tratamento: "bg-teal-100 text-teal-700",
  cliente_fiel: "bg-amber-100 text-amber-700",
  inativo: "bg-zinc-100 text-zinc-500",
};

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

function defaultScheduledAt() {
  const d = new Date();
  d.setHours(d.getHours() + 1);
  d.setMinutes(Math.ceil(d.getMinutes() / 15) * 15, 0, 0);
  return d.toISOString().slice(0, 16);
}

// ── Message delivery status icon ──────────────────────────────────────────────
function MessageStatus({ message }: { message: ConversationMessage }) {
  if (message.direction !== "outbound") return null;
  const { status } = message;
  if (status === "read") {
    return <CheckCheck className="inline h-3.5 w-3.5 text-sky-400" aria-label="Lido" />;
  }
  if (status === "delivered") {
    return <CheckCheck className="inline h-3.5 w-3.5 text-violet-200" aria-label="Entregue" />;
  }
  if (status === "sent") {
    return <Check className="inline h-3.5 w-3.5 text-violet-200" aria-label="Enviado" />;
  }
  if (status === "failed" || status === "dead_lettered") {
    return <XCircle className="inline h-3.5 w-3.5 text-red-400" aria-label="Falhou" />;
  }
  return null;
}

// ── Contact panel ─────────────────────────────────────────────────────────────
function ClientContactPanel({
  clientId,
  professionalId,
}: {
  clientId: string;
  professionalId: string;
}) {
  const { t } = useI18n();
  const clientQuery = useClient(professionalId, clientId);
  const appointmentsQuery = useClientAppointments(professionalId, clientId);
  const client = clientQuery.data;
  const lastAppointment = appointmentsQuery.data?.[0] ?? null;

  const initials = client?.full_name
    .split(" ")
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase() ?? "?";

  return (
    <aside className="flex flex-col gap-4 border-l border-zinc-200 bg-zinc-50 p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
        {t("conversations.contact.title")}
      </p>

      {clientQuery.isLoading ? (
        <div className="space-y-3">
          <Skeleton className="h-12 w-12 rounded-full" />
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-3 w-24" />
        </div>
      ) : client ? (
        <>
          {/* Avatar + name */}
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-violet-100 text-sm font-bold text-violet-700">
              {initials}
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-zinc-900">{client.full_name}</p>
              <p className="truncate text-xs text-zinc-500">{client.phone_whatsapp ?? client.email ?? "—"}</p>
            </div>
          </div>

          {/* Journey stage */}
          <div>
            <span
              className={cn(
                "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
                JOURNEY_STAGE_COLORS[client.journey_stage] ?? "bg-zinc-100 text-zinc-500",
              )}
            >
              {JOURNEY_STAGE_LABELS[client.journey_stage] ?? client.journey_stage}
            </span>
          </div>

          {/* Last appointment */}
          <div className="rounded-lg border border-zinc-200 bg-white p-3">
            <p className="mb-1.5 text-xs font-medium text-zinc-500">
              {t("conversations.contact.lastAppointment")}
            </p>
            {lastAppointment ? (
              <div>
                <p className="text-sm font-medium text-zinc-900">
                  {new Intl.DateTimeFormat(undefined, {
                    day: "2-digit",
                    month: "short",
                    hour: "2-digit",
                    minute: "2-digit",
                  }).format(new Date(lastAppointment.scheduled_at))}
                </p>
                <p className="mt-0.5 text-xs text-zinc-500 capitalize">{lastAppointment.status}</p>
              </div>
            ) : (
              <p className="text-xs text-zinc-400">{t("conversations.contact.noAppointment")}</p>
            )}
          </div>

          {/* View profile link */}
          <Link
            to={`/clientes/${clientId}`}
            className="flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs font-medium text-violet-700 transition-colors hover:bg-violet-50"
          >
            <User className="h-3.5 w-3.5" />
            {t("conversations.contact.viewProfile")}
            <ChevronRight className="ml-auto h-3.5 w-3.5 text-zinc-400" />
          </Link>
        </>
      ) : (
        <p className="text-xs text-zinc-400">{t("conversations.contact.noClient")}</p>
      )}
    </aside>
  );
}

// ── Shadow suggestion card ─────────────────────────────────────────────────────
function ConversationSkeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 5 }).map((_, index) => (
        <Card key={index} className="rounded-lg border-zinc-200">
          <CardContent className="space-y-2 p-4">
            <Skeleton className="h-5 w-36" />
            <Skeleton className="h-4 w-full" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function ShadowSuggestionCard({
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
        <CardDescription>{t("conversations.shadow.description")}</CardDescription>
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

// ── Main page ─────────────────────────────────────────────────────────────────
export default function ConversasPage() {
  const { t } = useI18n();
  const { professionalId } = useAuth();
  const queryClient = useQueryClient();
  const conversations = useConversations(professionalId);
  const suggestions = useShadowSuggestions(professionalId);
  const actions = useConversationActions(professionalId);
  const services = useServices(professionalId);

  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);
  const [isMobileDetailOpen, setIsMobileDetailOpen] = useState(false);
  const [manualText, setManualText] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [showContactPanel, setShowContactPanel] = useState(true);

  // Schedule sheet state
  const [isScheduleOpen, setIsScheduleOpen] = useState(false);
  const [scheduleDate, setScheduleDate] = useState("");
  const [scheduleServiceId, setScheduleServiceId] = useState("");
  const [scheduleDuration, setScheduleDuration] = useState("");
  const [scheduleNotes, setScheduleNotes] = useState("");
  const [scheduleSendWhatsapp, setScheduleSendWhatsapp] = useState(false);
  const [isCreatingSchedule, setIsCreatingSchedule] = useState(false);

  const conversationList = useMemo(() => conversations.data ?? [], [conversations.data]);

  const orderedConversationList = useMemo(() => {
    const urgent: ConversationListItem[] = [];
    const rest: ConversationListItem[] = [];
    for (const conversation of conversationList) {
      (isConversationUrgent(conversation) ? urgent : rest).push(conversation);
    }
    return [...urgent, ...rest];
  }, [conversationList]);

  const filteredConversationList = useMemo(() => {
    if (!searchQuery.trim()) return orderedConversationList;
    const q = searchQuery.toLowerCase();
    return orderedConversationList.filter(
      (c) =>
        c.client_name?.toLowerCase().includes(q) ||
        c.phone?.toLowerCase().includes(q),
    );
  }, [orderedConversationList, searchQuery]);

  useEffect(() => {
    if (!selectedConversationId && conversationList.length > 0) {
      setSelectedConversationId(conversationList[0]?.id ?? null);
    }
  }, [conversationList, selectedConversationId]);

  const selectedConversation = useMemo(
    () => conversationList.find((conversation) => conversation.id === selectedConversationId) ?? null,
    [conversationList, selectedConversationId],
  );

  const isSelectedUrgent = selectedConversation ? isConversationUrgent(selectedConversation) : false;

  const messages = useConversationMessages(professionalId, selectedConversationId);
  const selectedSuggestion = useMemo(
    () => (suggestions.data ?? []).find((suggestion) => suggestion.conversation_id === selectedConversationId) ?? null,
    [selectedConversationId, suggestions.data],
  );

  async function handleApproveSuggestion(suggestionId: string, text: string) {
    await suggestions.approveSuggestion({ suggestionId, actualText: text });
  }

  async function handleRejectSuggestion(suggestionId: string) {
    await suggestions.rejectSuggestion({ suggestionId, reason: "Rejected from inbox" });
  }

  async function handleTakeOver() {
    if (!selectedConversation) return;
    await actions.takeOverConversation(selectedConversation.id);
  }

  async function handleRelease() {
    if (!selectedConversation) return;
    await actions.releaseConversation({ conversationId: selectedConversation.id });
  }

  async function handleSendManualMessage() {
    if (!selectedConversation || !manualText.trim()) return;
    await actions.sendManualMessage({ conversationId: selectedConversation.id, text: manualText.trim() });
    setManualText("");
  }

  function handleOpenSchedule() {
    setScheduleDate(defaultScheduledAt());
    setScheduleServiceId("");
    setScheduleDuration("");
    setScheduleNotes("");
    setScheduleSendWhatsapp(false);
    setIsScheduleOpen(true);
  }

  async function handleCreateSchedule() {
    if (!selectedConversation?.client_id || !scheduleDate) return;
    setIsCreatingSchedule(true);
    try {
      const { data, error } = await supabase.rpc("create_appointment", {
        p_client_id: selectedConversation.client_id,
        p_service_id: scheduleServiceId || null,
        p_scheduled_at: new Date(scheduleDate).toISOString(),
        p_duration_minutes: scheduleDuration ? parseInt(scheduleDuration, 10) : null,
        p_notes: scheduleNotes.trim() || null,
      });
      if (error) throw error;

      const appointmentId = (data as { appointment_id: string } | null)?.appointment_id;

      if (scheduleSendWhatsapp && appointmentId) {
        await supabase.functions.invoke("appointment-confirmation-agent", {
          body: { mode: "send_confirmation", appointment_id: appointmentId },
        });
      }

      await queryClient.invalidateQueries({ queryKey: ["crm", "appointments", professionalId] });
      toast.success(t("conversations.schedule.success"));
      setIsScheduleOpen(false);
    } catch {
      toast.error(t("conversations.schedule.error"));
    } finally {
      setIsCreatingSchedule(false);
    }
  }

  const hasContactPanel = Boolean(selectedConversation?.client_id && showContactPanel && professionalId);

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-5 px-4 py-5 pb-24 md:px-6 md:pb-6">
      <header className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-violet-600">
            {t("conversations.eyebrow")}
          </p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight text-zinc-950">
            {t("conversations.title")}
          </h1>
          <p className="mt-1 text-sm text-zinc-500">{t("conversations.subtitle")}</p>
        </div>
        <Badge variant={suggestions.data?.length ? "warning" : "secondary"}>
          {suggestions.data?.length ?? 0} {t("conversations.pendingSuggestions")}
        </Badge>
      </header>

      {conversations.error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {t("conversations.error.load")}
        </div>
      ) : null}

      <div
        className={cn(
          "grid min-h-[calc(100vh-220px)] gap-4",
          hasContactPanel
            ? "lg:grid-cols-[360px_1fr_280px]"
            : "lg:grid-cols-[360px_1fr]",
        )}
      >
        {/* ── Conversation list ── */}
        <section className={cn("space-y-3", isMobileDetailOpen ? "hidden lg:block" : "block")}>
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
            <input
              type="search"
              placeholder={t("conversations.search.placeholder")}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-lg border border-zinc-200 bg-white py-2 pl-9 pr-3 text-sm text-zinc-800 shadow-sm outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100"
            />
          </div>

          {conversations.isLoading ? <ConversationSkeleton /> : null}

          {!conversations.isLoading && conversationList.length === 0 ? (
            <Card className="border-dashed border-zinc-300">
              <CardContent className="p-6 text-center">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-violet-50 text-violet-700">
                  <MessageSquare className="h-5 w-5" />
                </div>
                <h2 className="mt-4 text-base font-semibold text-zinc-950">
                  {t("conversations.empty.title")}
                </h2>
                <p className="mt-1 text-sm text-zinc-500">{t("conversations.empty.description")}</p>
              </CardContent>
            </Card>
          ) : null}

          {!conversations.isLoading && conversationList.length > 0 && filteredConversationList.length === 0 ? (
            <p className="py-6 text-center text-sm text-zinc-400">Nenhuma conversa encontrada.</p>
          ) : null}

          {filteredConversationList.map((conversation) => {
            const isSelected = conversation.id === selectedConversationId;
            const hasSuggestion = (suggestions.data ?? []).some(
              (suggestion) => suggestion.conversation_id === conversation.id,
            );
            const isUrgent = isConversationUrgent(conversation);

            return (
              <button
                key={conversation.id}
                type="button"
                onClick={() => {
                  setSelectedConversationId(conversation.id);
                  setIsMobileDetailOpen(true);
                }}
                className={cn(
                  "block w-full rounded-lg border bg-white p-4 text-left shadow-sm transition-colors",
                  isUrgent && "border-l-4 border-l-rose-500",
                  isSelected
                    ? "border-violet-300 ring-2 ring-violet-100"
                    : "border-zinc-200 hover:border-zinc-300",
                )}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-zinc-950">
                      {getConversationTitle(conversation)}
                    </p>
                    <p className="mt-1 line-clamp-2 text-sm leading-5 text-zinc-500">
                      {conversation.last_message_preview || t("conversations.noPreview")}
                    </p>
                  </div>
                  <span className="shrink-0 text-xs text-zinc-400">
                    {formatConversationTime(conversation.last_message_at)}
                  </span>
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <Badge
                    variant={
                      isUrgent ? "urgent" : conversation.rosane_status === "shadow" ? "warning" : "secondary"
                    }
                  >
                    {isUrgent
                      ? t("conversations.status.urgent")
                      : t(CONVERSATION_STATUS_KEYS[conversation.rosane_status])}
                  </Badge>
                  {hasSuggestion ? <Badge variant="warning">{t("conversations.shadow.badge")}</Badge> : null}
                </div>
              </button>
            );
          })}
        </section>

        {/* ── Detail panel ── */}
        <section
          className={cn(
            "min-h-[calc(100vh-180px)] rounded-xl border border-zinc-200 bg-white shadow-sm lg:block lg:min-h-[520px]",
            isMobileDetailOpen ? "block" : "hidden",
          )}
        >
          {!selectedConversation ? (
            <div className="flex h-full min-h-[520px] items-center justify-center p-6 text-center">
              <div>
                <MessageSquare className="mx-auto h-8 w-8 text-zinc-300" />
                <p className="mt-3 text-sm text-zinc-500">{t("conversations.selectConversation")}</p>
              </div>
            </div>
          ) : (
            <div className="flex h-full min-h-[520px] flex-col">
              {/* Header */}
              <div className="border-b border-zinc-200 p-4">
                <Button
                  type="button"
                  variant="ghost"
                  className="-ml-2 mb-3 gap-2 px-2 lg:hidden"
                  onClick={() => setIsMobileDetailOpen(false)}
                >
                  <ArrowLeft className="h-4 w-4" />
                  {t("conversations.backToList")}
                </Button>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-semibold text-zinc-950">
                      {getConversationTitle(selectedConversation)}
                    </h2>
                    <p className="mt-1 text-sm text-zinc-500">
                      {selectedConversation.phone || t("common.noContact")}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary">{selectedConversation.channel}</Badge>
                    {/* Toggle contact panel */}
                    {selectedConversation.client_id ? (
                      <button
                        type="button"
                        title={showContactPanel ? "Ocultar contato" : "Ver contato"}
                        onClick={() => setShowContactPanel((v) => !v)}
                        className={cn(
                          "rounded-md p-1.5 transition-colors",
                          showContactPanel
                            ? "bg-violet-100 text-violet-700"
                            : "text-zinc-400 hover:bg-zinc-100",
                        )}
                      >
                        <User className="h-4 w-4" />
                      </button>
                    ) : null}
                  </div>
                </div>
                <div className="mt-4 grid gap-2 sm:grid-cols-[1fr_auto] sm:items-center">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge
                      variant={
                        isSelectedUrgent
                          ? "urgent"
                          : selectedConversation.rosane_status === "human_takeover"
                            ? "warning"
                            : "secondary"
                      }
                    >
                      {isSelectedUrgent
                        ? t("conversations.status.urgent")
                        : t(CONVERSATION_STATUS_KEYS[selectedConversation.rosane_status])}
                    </Badge>
                    {actions.actionError ? (
                      <span className="text-xs text-red-600">{t("conversations.actions.error")}</span>
                    ) : null}
                  </div>
                  <div className="flex items-center gap-2">
                    {selectedConversation.client_id ? (
                      <Button
                        type="button"
                        variant="outline"
                        className="gap-2"
                        onClick={handleOpenSchedule}
                      >
                        <CalendarPlus className="h-4 w-4" />
                        {t("conversations.schedule.button")}
                      </Button>
                    ) : null}
                    {selectedConversation.rosane_status === "human_takeover" ? (
                      <Button
                        type="button"
                        variant="outline"
                        className="gap-2"
                        disabled={actions.isReleasing}
                        onClick={handleRelease}
                      >
                        <Bot className="h-4 w-4" />
                        {t("conversations.actions.release")}
                      </Button>
                    ) : (
                      <Button
                        type="button"
                        className="gap-2"
                        disabled={actions.isTakingOver}
                        onClick={handleTakeOver}
                      >
                        <UserCheck className="h-4 w-4" />
                        {t("conversations.actions.takeOver")}
                      </Button>
                    )}
                  </div>
                </div>
              </div>

              {/* Messages */}
              <div className="flex-1 space-y-3 overflow-y-auto bg-zinc-50 p-4">
                {selectedSuggestion ? (
                  <ShadowSuggestionCard
                    suggestion={selectedSuggestion}
                    disabled={suggestions.isApprovingSuggestion || suggestions.isRejectingSuggestion}
                    onApprove={handleApproveSuggestion}
                    onReject={handleRejectSuggestion}
                  />
                ) : null}

                {messages.isLoading ? (
                  <div className="space-y-3">
                    <Skeleton className="h-16 w-3/4" />
                    <Skeleton className="ml-auto h-16 w-2/3" />
                  </div>
                ) : null}

                {!messages.isLoading && (messages.data ?? []).length === 0 ? (
                  <div className="rounded-lg border border-dashed border-zinc-300 bg-white p-6 text-center">
                    <Bot className="mx-auto h-7 w-7 text-zinc-300" />
                    <p className="mt-2 text-sm text-zinc-500">{t("conversations.messages.empty")}</p>
                  </div>
                ) : null}

                {(messages.data ?? []).map((message) => {
                  const isOutbound = message.direction === "outbound";
                  return (
                    <div
                      key={message.id}
                      className={cn(
                        "max-w-[82%] rounded-2xl px-4 py-3 text-sm leading-6 shadow-sm",
                        isOutbound
                          ? "ml-auto bg-violet-700 text-white"
                          : "mr-auto border border-zinc-200 bg-white text-zinc-900",
                      )}
                    >
                      <p>{message.content || t("conversations.messages.noContent")}</p>
                      <div className={cn("mt-1 flex items-center gap-1 text-xs", isOutbound ? "justify-end text-violet-200" : "text-zinc-400")}>
                        <span>{formatConversationTime(message.created_at)}</span>
                        <MessageStatus message={message} />
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Reply area */}
              <div className="border-t border-zinc-200 bg-white p-3">
                <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
                  <textarea
                    className="min-h-20 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm leading-6 text-zinc-800 shadow-sm outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-100"
                    placeholder={t("conversations.manual.placeholder")}
                    value={manualText}
                    onChange={(event) => setManualText(event.target.value)}
                    disabled={selectedConversation.rosane_status !== "human_takeover" || actions.isSendingManualMessage}
                  />
                  <Button
                    type="button"
                    className="h-full min-h-12 gap-2"
                    disabled={
                      selectedConversation.rosane_status !== "human_takeover"
                      || actions.isSendingManualMessage
                      || !manualText.trim()
                    }
                    onClick={handleSendManualMessage}
                  >
                    <Send className="h-4 w-4" />
                    {t("conversations.manual.send")}
                  </Button>
                </div>
                {selectedConversation.rosane_status !== "human_takeover" ? (
                  <p className="mt-2 text-xs text-zinc-500">{t("conversations.manual.requiresTakeover")}</p>
                ) : null}
              </div>
            </div>
          )}
        </section>

        {/* ── Contact panel (right sidebar) ── */}
        {hasContactPanel && professionalId ? (
          <div className="hidden lg:block">
            <ClientContactPanel
              clientId={selectedConversation!.client_id!}
              professionalId={professionalId}
            />
          </div>
        ) : null}
      </div>

      {/* Schedule Sheet */}
      <Sheet open={isScheduleOpen} onOpenChange={setIsScheduleOpen}>
        <SheetContent side="right" className="w-full max-w-md overflow-y-auto">
          <SheetHeader>
            <SheetTitle>{t("conversations.schedule.title")}</SheetTitle>
            {selectedConversation ? (
              <SheetDescription>
                {selectedConversation.client_name ?? selectedConversation.phone ?? selectedConversation.channel}
              </SheetDescription>
            ) : null}
          </SheetHeader>

          <div className="mt-6 space-y-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-zinc-700">
                {t("conversations.schedule.service")}
              </label>
              <select
                className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-800 shadow-sm outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-100"
                value={scheduleServiceId}
                onChange={(e) => setScheduleServiceId(e.target.value)}
              >
                <option value="">—</option>
                {(services.data?.services ?? [])
                  .filter((s) => s.is_active)
                  .map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium text-zinc-700">
                {t("conversations.schedule.datetime")}
              </label>
              <input
                type="datetime-local"
                className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-800 shadow-sm outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-100"
                value={scheduleDate}
                onChange={(e) => setScheduleDate(e.target.value)}
                required
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium text-zinc-700">
                {t("conversations.schedule.duration")}
              </label>
              <input
                type="number"
                min="15"
                max="480"
                step="15"
                placeholder="60"
                className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-800 shadow-sm outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-100"
                value={scheduleDuration}
                onChange={(e) => setScheduleDuration(e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium text-zinc-700">
                {t("conversations.schedule.notes")}
              </label>
              <textarea
                className="min-h-20 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm leading-6 text-zinc-800 shadow-sm outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-100"
                value={scheduleNotes}
                onChange={(e) => setScheduleNotes(e.target.value)}
              />
            </div>

            <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-zinc-200 bg-zinc-50 p-3">
              <input
                type="checkbox"
                className="accent-violet-600"
                checked={scheduleSendWhatsapp}
                onChange={(e) => setScheduleSendWhatsapp(e.target.checked)}
              />
              <span className="text-sm text-zinc-700">{t("conversations.schedule.whatsapp")}</span>
            </label>
          </div>

          <SheetFooter className="mt-6">
            <Button
              type="button"
              className="w-full"
              disabled={isCreatingSchedule || !scheduleDate}
              onClick={handleCreateSchedule}
            >
              {t("conversations.schedule.submit")}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </div>
  );
}
