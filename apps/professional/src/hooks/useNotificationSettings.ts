import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  NotificationSettings,
  ProfessionalNotificationSettings,
  UpsertMyNotificationPreferencesOutput,
  UpsertNotificationSettingsOutput,
} from "@iaprafaturar/domain";
import { supabase } from "@/lib/supabase";
import { crmKeys } from "./queryKeys";

export function useNotificationSettings(professionalId: string | null) {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: crmKeys.notificationSettings(professionalId),
    enabled: Boolean(professionalId),
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_professional_notification_settings");

      if (error) throw error;
      return data as ProfessionalNotificationSettings;
    },
  });

  const updateClinicSettings = useMutation({
    mutationFn: async (settings: NotificationSettings) => {
      const { data, error } = await supabase.rpc("upsert_professional_notification_settings", {
        p_settings: settings,
      });

      if (error) throw error;
      return data as UpsertNotificationSettingsOutput;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: crmKeys.notificationSettings(professionalId) });
    },
  });

  const updateMyPreferences = useMutation({
    mutationFn: async (preferences: NotificationSettings) => {
      const { data, error } = await supabase.rpc("upsert_my_notification_preferences", {
        p_preferences: preferences,
      });

      if (error) throw error;
      return data as UpsertMyNotificationPreferencesOutput;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: crmKeys.notificationSettings(professionalId) });
    },
  });

  return {
    ...query,
    updateClinicSettings: updateClinicSettings.mutateAsync,
    isUpdatingClinicSettings: updateClinicSettings.isPending,
    updateMyPreferences: updateMyPreferences.mutateAsync,
    isUpdatingMyPreferences: updateMyPreferences.isPending,
  };
}
