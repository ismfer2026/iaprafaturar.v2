import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Bot, Check, MessageSquare, Send, ShieldAlert, UserCheck, X } from "lucide-react";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Skeleton,
  cn,
} from "@iaprafaturar/ui";
import { useAuth } from "@/contexts/AuthContext";
import {
  useConversationMessages,
  useConversations,
  useConversationActions,
  useShadowSuggestions,
  type ConversationListItem,
  type ShadowSuggestion,
} from "@/hooks/useConversations";
import { useI18n, type TranslationKey } from "@/i18n";

const CONVERSATION_STATUS_KEYS: Record<ConversationListItem["rosane_status"], TranslationKey> = {
  active: "conversations.status.active",
  shadow: "conversations.status.shadow",
  paused: "conversations.status.paused",
  human_takeover: "conversations.status.humanTakeover",
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

export default function ConversasPage() {
  const { t } = useI18n();
  const { professionalId } = useAuth();
  const conversations = useConversations(professionalId);
  const suggestions = useShadowSuggestions(professionalId);
  const actions = useConversationActions(professionalId);
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);
  const [isMobileDetailOpen, setIsMobileDetailOpen] = useState(false);
  const [manualText, setManualText] = useState("");

  const conversationList = useMemo(() => conversations.data ?? [], [conversations.data]);

  useEffect(() => {
    if (!selectedConversationId && conversationList.length > 0) {
      setSelectedConversationId(conversationList[0]?.id ?? null);
    }
  }, [conversationList, selectedConversationId]);

  const selectedConversation = useMemo(
    () => conversationList.find((conversation) => conversation.id === selectedConversationId) ?? null,
    [conversationList, selectedConversationId],
  );

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

      <div className="grid min-h-[calc(100vh-220px)] gap-4 lg:grid-cols-[360px_1fr]">
        <section className={cn("space-y-3", isMobileDetailOpen ? "hidden lg:block" : "block")}>
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

          {conversationList.map((conversation) => {
            const isSelected = conversation.id === selectedConversationId;
            const hasSuggestion = (suggestions.data ?? []).some(
              (suggestion) => suggestion.conversation_id === conversation.id,
            );

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
                  <Badge variant={conversation.rosane_status === "shadow" ? "warning" : "secondary"}>
                    {t(CONVERSATION_STATUS_KEYS[conversation.rosane_status])}
                  </Badge>
                  {hasSuggestion ? <Badge variant="warning">{t("conversations.shadow.badge")}</Badge> : null}
                </div>
              </button>
            );
          })}
        </section>

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
                  <Badge variant="secondary">{selectedConversation.channel}</Badge>
                </div>
                <div className="mt-4 grid gap-2 sm:grid-cols-[1fr_auto] sm:items-center">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={selectedConversation.rosane_status === "human_takeover" ? "warning" : "secondary"}>
                      {t(CONVERSATION_STATUS_KEYS[selectedConversation.rosane_status])}
                    </Badge>
                    {actions.actionError ? (
                      <span className="text-xs text-red-600">{t("conversations.actions.error")}</span>
                    ) : null}
                  </div>
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
                      <p className={cn("mt-1 text-xs", isOutbound ? "text-violet-100" : "text-zinc-400")}>
                        {formatConversationTime(message.created_at)}
                      </p>
                    </div>
                  );
                })}
              </div>
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
      </div>
    </div>
  );
}
