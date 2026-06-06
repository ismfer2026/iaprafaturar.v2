import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { TranslationKey } from "@/i18n";

export type OnboardingItemStatus = "pending" | "in_progress" | "completed" | "skipped";

export interface OnboardingChecklistItem {
  key: string;
  labelKey: TranslationKey;
  descriptionKey: TranslationKey;
  status: OnboardingItemStatus;
}

const DEFAULT_ITEMS: Array<Omit<OnboardingChecklistItem, "status">> = [
  {
    key: "profile_basics",
    labelKey: "onboarding.item.profile.label",
    descriptionKey: "onboarding.item.profile.description",
  },
  {
    key: "main_services",
    labelKey: "onboarding.item.services.label",
    descriptionKey: "onboarding.item.services.description",
  },
  {
    key: "business_hours",
    labelKey: "onboarding.item.hours.label",
    descriptionKey: "onboarding.item.hours.description",
  },
  {
    key: "rosane_preferences",
    labelKey: "onboarding.item.assistant.label",
    descriptionKey: "onboarding.item.assistant.description",
  },
  {
    key: "whatsapp_connection",
    labelKey: "onboarding.item.whatsapp.label",
    descriptionKey: "onboarding.item.whatsapp.description",
  },
];

export function useOnboardingSetup(professionalId: string | null) {
  return useQuery({
    queryKey: ["onboarding-setup", professionalId],
    enabled: Boolean(professionalId),
    queryFn: async () => {
      if (!professionalId) {
        throw new Error("professionalId is required");
      }

      const [sessionResult, itemsResult, whatsappResult] = await Promise.all([
        supabase
          .from("nerissa_setup_sessions")
          .select("id, status, current_step, completion_percent")
          .eq("professional_id", professionalId)
          .maybeSingle(),
        supabase
          .from("nerissa_setup_items")
          .select("item_key, status")
          .eq("professional_id", professionalId),
        supabase
          .from("professional_whatsapp")
          .select("provider, status, is_connected, connection_mode, number_kind")
          .eq("professional_id", professionalId)
          .order("is_connected", { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);

      if (sessionResult.error) throw sessionResult.error;
      if (itemsResult.error) throw itemsResult.error;
      if (whatsappResult.error) throw whatsappResult.error;

      const itemStatus = new Map<string, OnboardingItemStatus>(
        (itemsResult.data ?? []).map((item) => [
          item.item_key,
          item.status as OnboardingItemStatus,
        ]),
      );

      const checklist = DEFAULT_ITEMS.map((item) => ({
        ...item,
        status: itemStatus.get(item.key) ?? "pending",
      }));

      const completedCount = checklist.filter((item) => item.status === "completed").length;
      const calculatedPercent = Math.round((completedCount / checklist.length) * 100);

      return {
        session: sessionResult.data,
        checklist,
        whatsapp: whatsappResult.data,
        progressPercent:
          typeof sessionResult.data?.completion_percent === "number"
            ? sessionResult.data.completion_percent
            : calculatedPercent,
      };
    },
  });
}
