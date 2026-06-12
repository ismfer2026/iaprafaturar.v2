import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { crmKeys } from "./queryKeys";

export interface ConversationListItem {
  id: string;
  professional_id: string;
  client_id: string | null;
  channel: string;
  phone: string | null;
  rosane_status: "active" | "shadow" | "paused" | "human_takeover";
  last_message_at: string | null;
  last_message_preview: string | null;
  unread_count: number;
  created_at: string;
  client_name: string | null;
}

export const URGENT_THRESHOLD_HOURS = 2;

export function isConversationUrgent(
  conversation: Pick<ConversationListItem, "unread_count" | "last_message_at">,
  now: Date = new Date(),
): boolean {
  if (conversation.unread_count <= 0) return false;
  if (!conversation.last_message_at) return false;

  const elapsedMs = now.getTime() - new Date(conversation.last_message_at).getTime();
  return elapsedMs > URGENT_THRESHOLD_HOURS * 60 * 60 * 1000;
}

export interface ConversationMessage {
  id: string;
  conversation_id: string | null;
  direction: "inbound" | "outbound";
  message_type: string;
  content: string | null;
  sent_by: string | null;
  agent_slug: string | null;
  status: string;
  created_at: string;
}

export interface ShadowSuggestion {
  id: string;
  conversation_id: string | null;
  message_event_id: string | null;
  suggested_text: string;
  actual_text: string | null;
  status: "pending" | "approved" | "edited" | "rejected" | "ignored";
  expires_at: string | null;
  created_at: string;
}

interface ConversationRow extends Omit<ConversationListItem, "client_name"> {
  clients?: { full_name: string | null } | { full_name: string | null }[] | null;
}

function getClientName(clients: ConversationRow["clients"]) {
  if (Array.isArray(clients)) return clients[0]?.full_name ?? null;
  return clients?.full_name ?? null;
}

export function useConversations(professionalId: string | null) {
  return useQuery({
    queryKey: crmKeys.conversations(professionalId),
    enabled: Boolean(professionalId),
    queryFn: async () => {
      if (!professionalId) throw new Error("professionalId is required");

      const { data, error } = await supabase
        .from("conversations")
        .select("id, professional_id, client_id, channel, phone, rosane_status, last_message_at, last_message_preview, unread_count, created_at, clients(full_name)")
        .eq("professional_id", professionalId)
        .order("last_message_at", { ascending: false, nullsFirst: false })
        .limit(60);

      if (error) throw error;

      return ((data ?? []) as unknown as ConversationRow[]).map((conversation) => ({
        ...conversation,
        client_name: getClientName(conversation.clients),
        clients: undefined,
      })) as ConversationListItem[];
    },
  });
}

export function useConversationMessages(professionalId: string | null, conversationId: string | null) {
  return useQuery({
    queryKey: crmKeys.conversationMessages(professionalId, conversationId),
    enabled: Boolean(professionalId && conversationId),
    queryFn: async () => {
      if (!professionalId || !conversationId) throw new Error("professionalId and conversationId are required");

      const { data, error } = await supabase
        .from("message_events")
        .select("id, conversation_id, direction, message_type, content, sent_by, agent_slug, status, created_at")
        .eq("professional_id", professionalId)
        .eq("conversation_id", conversationId)
        .order("created_at", { ascending: true })
        .limit(120);

      if (error) throw error;
      return (data ?? []) as ConversationMessage[];
    },
  });
}

export function useShadowSuggestions(professionalId: string | null) {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: crmKeys.shadowSuggestions(professionalId),
    enabled: Boolean(professionalId),
    queryFn: async () => {
      if (!professionalId) throw new Error("professionalId is required");

      const { data, error } = await supabase
        .from("shadow_suggestions")
        .select("id, conversation_id, message_event_id, suggested_text, actual_text, status, expires_at, created_at")
        .eq("professional_id", professionalId)
        .eq("status", "pending")
        .order("created_at", { ascending: false })
        .limit(50);

      if (error) throw error;
      return (data ?? []) as ShadowSuggestion[];
    },
  });

  const invalidate = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: crmKeys.shadowSuggestions(professionalId) }),
      queryClient.invalidateQueries({ queryKey: ["crm", "conversation-messages", professionalId] }),
    ]);
  };

  const approve = useMutation({
    mutationFn: async (input: { suggestionId: string; actualText?: string | null }) => {
      const { data, error } = await supabase.functions.invoke("approve-shadow-suggestion", {
        body: {
          suggestion_id: input.suggestionId,
          actual_text: input.actualText ?? undefined,
        },
      });

      if (error) throw error;
      return data as {
        approved: boolean;
        sent?: boolean;
        dry_run: boolean;
        suggestion_id: string;
        skipped_reason?: string;
      };
    },
    onSuccess: invalidate,
  });

  const reject = useMutation({
    mutationFn: async (input: { suggestionId: string; reason?: string | null }) => {
      const { data, error } = await supabase.rpc("reject_shadow_suggestion", {
        p_suggestion_id: input.suggestionId,
        p_reason: input.reason ?? null,
      });

      if (error) throw error;
      return data as { suggestion_id: string; status: string };
    },
    onSuccess: invalidate,
  });

  return {
    ...query,
    approveSuggestion: approve.mutateAsync,
    rejectSuggestion: reject.mutateAsync,
    isApprovingSuggestion: approve.isPending,
    isRejectingSuggestion: reject.isPending,
    suggestionActionError: approve.error ?? reject.error,
  };
}

export function useConversationActions(professionalId: string | null) {
  const queryClient = useQueryClient();

  const invalidate = async (conversationId?: string | null) => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: crmKeys.conversations(professionalId) }),
      queryClient.invalidateQueries({ queryKey: crmKeys.conversationMessages(professionalId, conversationId ?? null) }),
      queryClient.invalidateQueries({ queryKey: ["crm", "conversation-messages", professionalId] }),
    ]);
  };

  const takeOver = useMutation({
    mutationFn: async (conversationId: string) => {
      const { data, error } = await supabase.rpc("take_over_conversation", {
        p_conversation_id: conversationId,
      });

      if (error) throw error;
      return data as { ok: boolean; conversation_id: string; rosane_status: string };
    },
    onSuccess: (data) => invalidate(data.conversation_id),
  });

  const release = useMutation({
    mutationFn: async (input: { conversationId: string; summary?: string | null }) => {
      const { data, error } = await supabase.rpc("release_conversation", {
        p_conversation_id: input.conversationId,
        p_summary: input.summary ?? null,
      });

      if (error) throw error;
      return data as { ok: boolean; conversation_id: string; rosane_status: string };
    },
    onSuccess: (data) => invalidate(data.conversation_id),
  });

  const sendManualMessage = useMutation({
    mutationFn: async (input: { conversationId: string; text: string }) => {
      const { data, error } = await supabase.functions.invoke("send-conversation-message", {
        body: {
          conversation_id: input.conversationId,
          text: input.text,
        },
      });

      if (error) throw error;
      return data as { sent: boolean; dry_run: boolean; conversation_id: string; message_event_id?: string };
    },
    onSuccess: (data) => invalidate(data.conversation_id),
  });

  return {
    takeOverConversation: takeOver.mutateAsync,
    releaseConversation: release.mutateAsync,
    sendManualMessage: sendManualMessage.mutateAsync,
    isTakingOver: takeOver.isPending,
    isReleasing: release.isPending,
    isSendingManualMessage: sendManualMessage.isPending,
    actionError: takeOver.error ?? release.error ?? sendManualMessage.error,
  };
}
