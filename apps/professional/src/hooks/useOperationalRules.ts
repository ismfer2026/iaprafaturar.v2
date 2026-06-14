import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

export interface OperationalRulesInput {
  cancelWindowHours: number;
  rescheduleWindowHours: number;
  relationshipCheckinsEnabled: boolean;
  relationshipCheckinIntervalDays: number;
}

export function useOperationalRules(professionalId: string | null) {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["operational-rules", professionalId],
    enabled: Boolean(professionalId),
    queryFn: async () => {
      if (!professionalId) throw new Error("professionalId is required");

      const { data, error } = await supabase
        .from("professionals")
        .select("settings")
        .eq("id", professionalId)
        .maybeSingle();

      if (error) throw error;

      const appointmentRules = ((data?.settings ?? {}) as Record<string, unknown>)["appointment_rules"] as
        | Record<string, unknown>
        | undefined;

      return {
        cancelWindowHours: Number(appointmentRules?.["cancel_window_hours"] ?? 24),
        rescheduleWindowHours: Number(appointmentRules?.["reschedule_window_hours"] ?? 24),
        relationshipCheckinsEnabled: appointmentRules?.["relationship_checkins_enabled"] !== false,
        relationshipCheckinIntervalDays: Number(appointmentRules?.["relationship_checkin_interval_days"] ?? 45),
      } satisfies OperationalRulesInput;
    },
  });

  const mutation = useMutation({
    mutationFn: async (input: OperationalRulesInput) => {
      const { data, error } = await supabase.rpc("update_operational_rules", {
        p_rules: {
          cancel_window_hours: input.cancelWindowHours,
          reschedule_window_hours: input.rescheduleWindowHours,
          relationship_checkins_enabled: input.relationshipCheckinsEnabled,
          relationship_checkin_interval_days: input.relationshipCheckinIntervalDays,
        },
      });

      if (error) throw error;
      return data as { ok: true };
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["operational-rules", professionalId] });
    },
  });

  return {
    ...query,
    saveOperationalRules: mutation.mutateAsync,
    isSavingOperationalRules: mutation.isPending,
    saveOperationalRulesError: mutation.error,
  };
}
