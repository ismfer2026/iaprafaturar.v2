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

interface ProfessionalOnboardingProfile {
  name: string | null;
  business_name: string | null;
  phone_whatsapp: string | null;
  settings: Record<string, unknown> | null;
  whatsapp_connected: boolean;
  onboarding_essentials_completed: boolean;
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

      const [sessionResult, itemsResult, whatsappResult, profileResult, servicesResult, agentResult] = await Promise.all([
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
        supabase
          .from("professionals")
          .select("name, business_name, phone_whatsapp, settings, whatsapp_connected, onboarding_essentials_completed")
          .eq("id", professionalId)
          .single(),
        supabase
          .from("services")
          .select("id, name, is_active")
          .eq("professional_id", professionalId)
          .is("deleted_at", null)
          .eq("is_active", true),
        supabase
          .from("professional_agents")
          .select("agent_name, is_active")
          .eq("professional_id", professionalId)
          .eq("agent_slug", "rosane")
          .eq("is_active", true)
          .limit(1)
          .maybeSingle(),
      ]);

      if (sessionResult.error) throw sessionResult.error;
      if (itemsResult.error) throw itemsResult.error;
      if (whatsappResult.error) throw whatsappResult.error;
      if (profileResult.error) throw profileResult.error;
      if (servicesResult.error) throw servicesResult.error;
      if (agentResult.error) throw agentResult.error;

      const profile = profileResult.data as ProfessionalOnboardingProfile;
      const settings = profile.settings ?? {};
      const businessHours = settings["business_hours"];
      const hasHours =
        typeof businessHours === "object" &&
        businessHours !== null &&
        Object.keys(businessHours).length > 0;
      const hasProfile = Boolean(
        profile.name?.trim() &&
          (profile.business_name?.trim() || profile.name?.trim()) &&
          profile.phone_whatsapp?.trim(),
      );
      const hasService = Boolean(servicesResult.data?.length);
      const hasAgent = Boolean(agentResult.data?.agent_name?.trim());
      const hasWhatsapp = Boolean(profile.whatsapp_connected || whatsappResult.data?.is_connected);

      const itemStatus = new Map<string, OnboardingItemStatus>(
        (itemsResult.data ?? []).map((item) => [
          item.item_key,
          item.status as OnboardingItemStatus,
        ]),
      );

      const derivedStatus = new Map<string, OnboardingItemStatus>([
        ["profile_basics", hasProfile ? "completed" : "pending"],
        ["main_services", hasService ? "completed" : "pending"],
        ["business_hours", hasHours ? "completed" : "pending"],
        ["rosane_preferences", hasAgent ? "completed" : "pending"],
        ["whatsapp_connection", hasWhatsapp ? "completed" : "pending"],
      ]);

      const checklist = DEFAULT_ITEMS.map((item) => ({
        ...item,
        status: itemStatus.get(item.key) === "completed" ? "completed" : derivedStatus.get(item.key) ?? "pending",
      }));

      const completedCount = checklist.filter((item) => item.status === "completed").length;
      const calculatedPercent = Math.round((completedCount / checklist.length) * 100);

      return {
        session: sessionResult.data,
        checklist,
        profile,
        services: servicesResult.data ?? [],
        agent: agentResult.data,
        whatsapp: whatsappResult.data,
        progressPercent:
          typeof sessionResult.data?.completion_percent === "number"
            ? sessionResult.data.completion_percent
            : calculatedPercent,
      };
    },
  });
}
