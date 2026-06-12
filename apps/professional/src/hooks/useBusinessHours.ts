import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  BusinessHours,
  BusinessHoursValue,
  ProfessionalScheduleSettings,
  UpsertBusinessHoursOutput,
  UpsertTeamMemberBusinessHoursOutput,
} from "@iaprafaturar/domain";
import { supabase } from "@/lib/supabase";
import { crmKeys } from "./queryKeys";

export function useBusinessHours(professionalId: string | null) {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: crmKeys.scheduleSettings(professionalId),
    enabled: Boolean(professionalId),
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_professional_schedule_settings");

      if (error) throw error;
      return data as ProfessionalScheduleSettings;
    },
  });

  const updateClinicHours = useMutation({
    mutationFn: async (businessHours: BusinessHours) => {
      const { data, error } = await supabase.rpc("upsert_professional_business_hours", {
        p_business_hours: businessHours,
      });

      if (error) throw error;
      return data as UpsertBusinessHoursOutput;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: crmKeys.scheduleSettings(professionalId) });
    },
  });

  const updateTeamMemberHours = useMutation({
    mutationFn: async (input: { teamMemberId: string; businessHours: BusinessHoursValue }) => {
      const { data, error } = await supabase.rpc("upsert_team_member_business_hours", {
        p_team_member_id: input.teamMemberId,
        p_business_hours: input.businessHours,
      });

      if (error) throw error;
      return data as UpsertTeamMemberBusinessHoursOutput;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: crmKeys.scheduleSettings(professionalId) });
    },
  });

  return {
    ...query,
    updateClinicHours: updateClinicHours.mutateAsync,
    isUpdatingClinicHours: updateClinicHours.isPending,
    updateTeamMemberHours: updateTeamMemberHours.mutateAsync,
    isUpdatingTeamMemberHours: updateTeamMemberHours.isPending,
  };
}
