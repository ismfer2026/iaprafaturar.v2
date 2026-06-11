import { supabase } from "@/lib/supabase";

export interface PublicChatContext {
  ok: boolean;
  context?: {
    professional?: { name: string; slug: string };
    config?: { enabled: boolean; welcome_message: string; require_contact: boolean };
  };
  error?: string;
}

export interface PublicChatMessageResult {
  ok: boolean;
  result?: {
    conversation_id: string;
    message_event_id: string;
    client_id: string;
    opportunity_id: string;
    handoff_mode: string;
  };
  error?: string;
}

export async function getPublicChatContext(slug: string): Promise<PublicChatContext> {
  const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/public-chat-handler?slug=${encodeURIComponent(slug)}`, {
    headers: { apikey: import.meta.env.VITE_SUPABASE_ANON_KEY },
  });
  return await response.json();
}

export async function sendPublicChatMessage(input: {
  slug: string;
  name: string;
  email: string;
  phone: string;
  message: string;
  website?: string;
}): Promise<PublicChatMessageResult> {
  const { data, error } = await supabase.functions.invoke<PublicChatMessageResult>("public-chat-handler", {
    body: input,
  });

  if (error) {
    throw error;
  }

  return data ?? { ok: false, error: "empty_response" };
}
