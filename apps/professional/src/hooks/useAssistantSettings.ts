import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

export interface AssistantSettingsInput {
  agentName: string;
  tone: "amigavel" | "profissional" | "objetivo";
  shadowMode: boolean;
  autoRespond: boolean;
  enabledAgents: string[];
  agentConfigs: Record<string, unknown>;
  sendGoogleReviewAfterPositiveNps: boolean;
  googleReviewUrl: string;
}

export function useAssistantSettings(professionalId: string | null) {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["assistant-settings", professionalId],
    enabled: Boolean(professionalId),
    queryFn: async () => {
      if (!professionalId) throw new Error("professionalId is required");

      const [agentResult, whatsappResult] = await Promise.all([
        supabase
          .from("professional_agents")
          .select("id, agent_name, shadow_mode, auto_respond, enabled_agents, agent_configs")
          .eq("professional_id", professionalId)
          .eq("agent_slug", "rosane")
          .maybeSingle(),
        supabase
          .from("professional_whatsapp")
          .select("provider, status, is_connected, connection_mode, number_kind, phone_number")
          .eq("professional_id", professionalId)
          .order("is_connected", { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);

      if (agentResult.error) throw agentResult.error;
      if (whatsappResult.error) throw whatsappResult.error;

      const configs = (agentResult.data?.agent_configs ?? {}) as Record<string, unknown>;
      const postCare = (configs["post_care"] ?? {}) as Record<string, unknown>;
      const agentsV2 = (configs["agents_v2"] ?? {}) as Record<string, unknown>;

      return {
        agent: agentResult.data,
        whatsapp: whatsappResult.data,
        form: {
          agentName: agentResult.data?.agent_name ?? "Rosane",
          tone: (configs["tone"] as AssistantSettingsInput["tone"] | undefined) ?? "amigavel",
          shadowMode: Boolean(agentResult.data?.shadow_mode ?? true),
          autoRespond: Boolean(agentResult.data?.auto_respond ?? true),
          enabledAgents: Array.isArray(agentResult.data?.enabled_agents)
            ? (agentResult.data.enabled_agents as string[])
            : ["duvidas", "agendamento", "lembrete"],
          agentConfigs: agentsV2,
          sendGoogleReviewAfterPositiveNps: Boolean(
            postCare["send_google_review_after_positive_nps"] ?? false,
          ),
          googleReviewUrl: typeof postCare["google_review_url"] === "string" ? postCare["google_review_url"] : "",
        },
      };
    },
  });

  const mutation = useMutation({
    mutationFn: async (input: AssistantSettingsInput) => {
      if (!professionalId) throw new Error("professionalId is required");
      if (!query.data?.agent?.id) throw new Error("Professional assistant agent was not initialized");

      const existingConfigs = (query.data.agent.agent_configs ?? {}) as Record<string, unknown>;

      const { error } = await supabase
        .from("professional_agents")
        .update({
          agent_name: input.agentName,
          shadow_mode: input.shadowMode,
          auto_respond: input.autoRespond,
          enabled_agents: input.enabledAgents,
          agent_configs: {
            ...existingConfigs,
            tone: input.tone,
            agents_v2: input.agentConfigs,
            post_care: {
              ...((existingConfigs["post_care"] ?? {}) as Record<string, unknown>),
              send_google_review_after_positive_nps: input.sendGoogleReviewAfterPositiveNps,
              google_review_url: input.googleReviewUrl.trim() || null,
            },
          },
        })
        .eq("id", query.data.agent.id);

      if (error) throw error;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["assistant-settings", professionalId] });
    },
  });

  return {
    ...query,
    save: mutation.mutateAsync,
    isSaving: mutation.isPending,
    saveError: mutation.error,
  };
}
