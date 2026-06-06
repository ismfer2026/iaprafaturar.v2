import { useQuery } from "@tanstack/react-query";
import type { DashboardSummary } from "@iaprafaturar/domain";
import { supabase } from "@/lib/supabase";
import { crmKeys } from "./queryKeys";

export function useDashboard(professionalId: string | null) {
  return useQuery({
    queryKey: crmKeys.dashboard(professionalId),
    enabled: Boolean(professionalId),
    queryFn: async () => {
      if (!professionalId) throw new Error("professionalId is required");

      const { data, error } = await supabase.rpc("get_dashboard_rpc");
      if (error) throw error;
      return data as DashboardSummary;
    },
  });
}

