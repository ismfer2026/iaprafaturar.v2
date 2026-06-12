import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  Client,
  CreateClientManualInput,
  CreateClientManualOutput,
  JourneyStage,
  MoveClientStageInput,
  MoveClientStageOutput,
} from "@iaprafaturar/domain";
import { supabase } from "@/lib/supabase";
import { crmKeys } from "./queryKeys";

function toCreateClientArgs(input: CreateClientManualInput) {
  return {
    p_full_name: input.fullName,
    p_phone_whatsapp: input.phoneWhatsapp ?? null,
    p_email: input.email ?? null,
    p_birth_date: input.birthDate ?? null,
    p_journey_stage: input.journeyStage ?? "lead",
    p_source: input.source ?? "manual",
  };
}

export function useClients(professionalId: string | null, stage?: JourneyStage | null) {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: crmKeys.clients(professionalId, stage),
    enabled: Boolean(professionalId),
    queryFn: async () => {
      if (!professionalId) throw new Error("professionalId is required");

      let queryBuilder = supabase
        .from("clients")
        .select("*")
        .eq("professional_id", professionalId)
        .is("deleted_at", null)
        .order("updated_at", { ascending: false });

      if (stage) {
        queryBuilder = queryBuilder.eq("journey_stage", stage);
      }

      const { data, error } = await queryBuilder;
      if (error) throw error;
      return (data ?? []) as Client[];
    },
  });

  const createClient = useMutation({
    mutationFn: async (input: CreateClientManualInput) => {
      const { data, error } = await supabase.rpc("create_client_manual", toCreateClientArgs(input));
      if (error) throw error;
      return data as CreateClientManualOutput;
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["crm", "clients", professionalId] }),
        queryClient.invalidateQueries({ queryKey: crmKeys.dashboard(professionalId) }),
      ]);
    },
  });

  const moveStage = useMutation({
    mutationFn: async (input: MoveClientStageInput) => {
      const { data, error } = await supabase.rpc("move_client_stage", {
        p_client_id: input.clientId,
        p_to_stage: input.toStage,
        p_reason: input.reason ?? null,
      });

      if (error) throw error;
      return data as MoveClientStageOutput;
    },
    onMutate: async (input) => {
      const queryKey = crmKeys.clients(professionalId, stage);
      await queryClient.cancelQueries({ queryKey });

      const previous = queryClient.getQueryData<Client[]>(queryKey);
      if (previous) {
        queryClient.setQueryData<Client[]>(
          queryKey,
          previous.map((client) =>
            client.id === input.clientId ? { ...client, journey_stage: input.toStage } : client,
          ),
        );
      }

      return { previous, queryKey };
    },
    onError: (_error, _input, context) => {
      if (context?.previous) {
        queryClient.setQueryData(context.queryKey, context.previous);
      }
    },
    onSuccess: async (_data, input) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["crm", "clients", professionalId] }),
        queryClient.invalidateQueries({ queryKey: crmKeys.client(professionalId, input.clientId) }),
        queryClient.invalidateQueries({ queryKey: crmKeys.dashboard(professionalId) }),
      ]);
    },
  });

  return {
    ...query,
    createClient: createClient.mutateAsync,
    isCreatingClient: createClient.isPending,
    createClientError: createClient.error,
    moveStage: moveStage.mutateAsync,
    isMovingStage: moveStage.isPending,
    moveStageError: moveStage.error,
  };
}

export function useClient(professionalId: string | null, clientId: string | null) {
  return useQuery({
    queryKey: crmKeys.client(professionalId, clientId),
    enabled: Boolean(professionalId && clientId),
    queryFn: async () => {
      if (!professionalId || !clientId) throw new Error("professionalId and clientId are required");

      const { data, error } = await supabase
        .from("clients")
        .select("*")
        .eq("professional_id", professionalId)
        .eq("id", clientId)
        .is("deleted_at", null)
        .single();

      if (error) throw error;
      return data as Client;
    },
  });
}

