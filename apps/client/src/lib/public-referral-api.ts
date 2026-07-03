import type {
  PublicReferralErrorOutput,
  PublicReferralResolveOutput,
  PublicReferralSubmitLeadOutput,
  PublicReferralWebChatOutput
} from "@iaprafaturar/contracts/edge-functions/public-referral-handler";
import { supabase } from "@/lib/supabase";
import { readFunctionErrorBody } from "@/lib/function-error";
import type { Locale } from "@/i18n";

export async function resolvePublicReferral(params: {
  code: string;
  lang: Locale;
}): Promise<PublicReferralResolveOutput | PublicReferralErrorOutput> {
  const { data, error } = await supabase.functions.invoke<PublicReferralResolveOutput | PublicReferralErrorOutput>(
    "public-referral-handler",
    {
      body: {
        mode: "resolve",
        code: params.code,
        lang: params.lang
      }
    }
  );

  if (error) {
    const errorBody = await readFunctionErrorBody<PublicReferralErrorOutput>(error);
    if (errorBody) return errorBody;
    throw error;
  }
  if (!data) throw new Error("empty_public_referral_response");
  return data;
}

export async function submitPublicReferralLead(input: {
  code: string;
  fullName: string;
  phoneWhatsapp: string;
  email?: string;
  note?: string;
  lang: Locale;
}): Promise<PublicReferralSubmitLeadOutput | PublicReferralErrorOutput> {
  const { data, error } = await supabase.functions.invoke<PublicReferralSubmitLeadOutput | PublicReferralErrorOutput>(
    "public-referral-handler",
    {
      body: {
        mode: "submit_lead",
        code: input.code,
        full_name: input.fullName,
        phone_whatsapp: input.phoneWhatsapp,
        ...(input.email ? { email: input.email } : {}),
        ...(input.note ? { note: input.note } : {}),
        lgpd_accepted: true,
        lang: input.lang
      }
    }
  );

  if (error) {
    const errorBody = await readFunctionErrorBody<PublicReferralErrorOutput>(error);
    if (errorBody) return errorBody;
    throw error;
  }
  if (!data) throw new Error("empty_public_referral_submit_response");
  return data;
}

export async function sendPublicReferralChatMessage(input: {
  code: string;
  message: string;
  conversation: Array<{ role: string; content: string }>;
  collectedData: Record<string, unknown>;
  locale: Locale;
}): Promise<PublicReferralWebChatOutput | PublicReferralErrorOutput> {
  const { data, error } = await supabase.functions.invoke<PublicReferralWebChatOutput | PublicReferralErrorOutput>(
    "public-referral-handler",
    {
      body: {
        mode: "web_chat",
        code: input.code,
        message: input.message,
        conversation: input.conversation,
        collected_data: input.collectedData,
        locale: input.locale
      }
    }
  );

  if (error) {
    const errorBody = await readFunctionErrorBody<PublicReferralErrorOutput>(error);
    if (errorBody) return errorBody;
    throw error;
  }
  if (!data) throw new Error("empty_public_referral_chat_response");
  return data;
}
