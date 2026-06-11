import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  CloseFunnelOpportunityInput,
  CloseFunnelOpportunityOutput,
  CreateFunnelOpportunityInput,
  CreateFunnelOpportunityOutput,
  FunnelBoard,
  LogFunnelActivityInput,
  LogFunnelActivityOutput,
  MoveFunnelOpportunityInput,
  MoveFunnelOpportunityOutput,
} from "@iaprafaturar/domain";
import { supabase } from "@/lib/supabase";
import { crmKeys } from "./queryKeys";

export function useFunnelBoard(professionalId: string | null) {
  const queryClient = useQueryClient();
  const boardKey = crmKeys.funnelBoard(professionalId);

  const query = useQuery({
    queryKey: boardKey,
    enabled: Boolean(professionalId),
    queryFn: async () => {
      if (!professionalId) throw new Error("professionalId is required");

      const { data, error } = await supabase.rpc("get_funnel_board");
      if (error) throw error;
      return data as FunnelBoard;
    },
  });

  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: boardKey });
  };

  const createOpportunity = useMutation({
    mutationFn: async (input: CreateFunnelOpportunityInput) => {
      const { data, error } = await supabase.rpc("create_funnel_opportunity", {
        p_client_id: input.clientId,
        p_title: input.title,
        p_source: input.source ?? "manual",
        p_value: input.value ?? 0,
        p_stage_id: input.stageId ?? null,
        p_metadata: input.metadata ?? {},
      });

      if (error) throw error;
      return data as CreateFunnelOpportunityOutput;
    },
    onSuccess: invalidate,
  });

  const moveOpportunity = useMutation({
    mutationFn: async (input: MoveFunnelOpportunityInput) => {
      const { data, error } = await supabase.rpc("move_funnel_opportunity", {
        p_opportunity_id: input.opportunityId,
        p_stage_id: input.stageId,
        p_reason: input.reason ?? null,
      });

      if (error) throw error;
      return data as MoveFunnelOpportunityOutput;
    },
    onSuccess: invalidate,
  });

  const closeOpportunity = useMutation({
    mutationFn: async (input: CloseFunnelOpportunityInput) => {
      const { data, error } = await supabase.rpc("close_funnel_opportunity", {
        p_opportunity_id: input.opportunityId,
        p_outcome: input.outcome,
        p_reason: input.reason ?? null,
      });

      if (error) throw error;
      return data as CloseFunnelOpportunityOutput;
    },
    onSuccess: invalidate,
  });

  const logActivity = useMutation({
    mutationFn: async (input: LogFunnelActivityInput) => {
      const { data, error } = await supabase.rpc("log_funnel_activity", {
        p_opportunity_id: input.opportunityId,
        p_activity_type: input.activityType,
        p_payload: input.payload ?? {},
      });

      if (error) throw error;
      return data as LogFunnelActivityOutput;
    },
    onSuccess: invalidate,
  });

  return {
    ...query,
    createOpportunity: createOpportunity.mutateAsync,
    isCreatingOpportunity: createOpportunity.isPending,
    moveOpportunity: moveOpportunity.mutateAsync,
    isMovingOpportunity: moveOpportunity.isPending,
    closeOpportunity: closeOpportunity.mutateAsync,
    isClosingOpportunity: closeOpportunity.isPending,
    logActivity: logActivity.mutateAsync,
    isLoggingActivity: logActivity.isPending,
  };
}
