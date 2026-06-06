import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { RegisterSessionInput, RegisterSessionOutput, Session } from "@iaprafaturar/domain";
import { supabase } from "@/lib/supabase";
import { crmKeys } from "./queryKeys";

export function useSessions(professionalId: string | null, clientId?: string | null) {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: crmKeys.sessions(professionalId, clientId),
    enabled: Boolean(professionalId),
    queryFn: async () => {
      if (!professionalId) throw new Error("professionalId is required");

      let queryBuilder = supabase
        .from("sessions")
        .select("*")
        .eq("professional_id", professionalId)
        .is("deleted_at", null)
        .order("session_date", { ascending: false });

      if (clientId) {
        queryBuilder = queryBuilder.eq("client_id", clientId);
      }

      const { data, error } = await queryBuilder;
      if (error) throw error;
      return (data ?? []) as Session[];
    },
  });

  const registerSession = useMutation({
    mutationFn: async (input: RegisterSessionInput) => {
      const { data, error } = await supabase.rpc("register_session", {
        p_appointment_id: input.appointmentId,
        p_client_id: input.clientId,
        p_service_id: input.serviceId ?? null,
        p_session_date: input.sessionDate ?? null,
        p_clinical_evolution: input.clinicalEvolution ?? null,
        p_notes: input.notes ?? null,
        p_session_value: input.sessionValue ?? 0,
        p_procedures_performed: input.proceduresPerformed ?? [],
        p_products_used: input.productsUsed ?? [],
      });

      if (error) throw error;
      return data as RegisterSessionOutput;
    },
    onSuccess: async (_data, input) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["crm", "sessions", professionalId] }),
        queryClient.invalidateQueries({ queryKey: ["crm", "appointments", professionalId] }),
        queryClient.invalidateQueries({ queryKey: crmKeys.client(professionalId, input.clientId) }),
        queryClient.invalidateQueries({ queryKey: crmKeys.dashboard(professionalId) }),
      ]);
    },
  });

  return {
    ...query,
    registerSession: registerSession.mutateAsync,
    isRegisteringSession: registerSession.isPending,
    registerSessionError: registerSession.error,
  };
}

