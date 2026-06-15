import { supabase } from "@/lib/supabase";
import type {
  PublicChatContextOutput,
  PublicChatErrorOutput,
  PublicChatMessageOutput
} from "@iaprafaturar/contracts/edge-functions/public-chat-handler";

type PublicChatContext = PublicChatContextOutput | PublicChatErrorOutput;
type PublicChatMessageResult = PublicChatMessageOutput | PublicChatErrorOutput;

export async function getPublicChatContext(slug: string): Promise<PublicChatContext> {
  const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/public-chat-handler?slug=${encodeURIComponent(slug)}`, {
    headers: { apikey: import.meta.env.VITE_SUPABASE_ANON_KEY },
  });
  return await response.json() as PublicChatContext;
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
    body: { mode: "send_message", ...input },
  });

  if (error) {
    throw error;
  }

  return data ?? { ok: false, error: "internal_error" };
}
