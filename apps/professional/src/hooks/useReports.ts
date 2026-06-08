import { useQuery } from "@tanstack/react-query";
import type { ProfessionalReports } from "@iaprafaturar/domain";
import { supabase } from "@/lib/supabase";
import { crmKeys } from "./queryKeys";

export function useReports(professionalId: string | null, month: string | null) {
  return useQuery({
    queryKey: crmKeys.reports(professionalId, month),
    enabled: Boolean(professionalId),
    queryFn: async () => {
      if (!professionalId) throw new Error("professionalId is required");

      const { data, error } = await supabase.rpc("get_professional_reports_rpc", {
        p_month: month,
      });

      if (error) throw error;
      return data as ProfessionalReports;
    },
  });
}
