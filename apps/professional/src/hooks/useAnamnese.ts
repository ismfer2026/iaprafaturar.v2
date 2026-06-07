import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { crmKeys } from "./queryKeys";

export interface AnamneseFicha {
  id: string;
  professional_id: string;
  client_id: string;
  status: "aguardando" | "preenchido" | "revisado" | "expirado";
  dados_pessoais: Record<string, unknown> | null;
  queixas: Record<string, unknown> | null;
  historico: Record<string, unknown> | null;
  alergias: Record<string, unknown> | null;
  habitos: Record<string, unknown> | null;
  custom_data: Record<string, unknown> | null;
  lgpd_aceito: boolean | null;
  preenchido_em: string | null;
  revisado_em: string | null;
  created_at: string;
}

export function useClientAnamneseFichas(professionalId: string | null, clientId: string | null) {
  return useQuery({
    queryKey: crmKeys.anamneseFichas(professionalId, clientId),
    enabled: Boolean(professionalId && clientId),
    queryFn: async () => {
      if (!professionalId || !clientId) {
        throw new Error("professionalId and clientId are required");
      }

      const { data, error } = await supabase
        .from("anamnese_fichas")
        .select(
          "id, professional_id, client_id, status, dados_pessoais, queixas, historico, alergias, habitos, custom_data, lgpd_aceito, preenchido_em, revisado_em, created_at"
        )
        .eq("professional_id", professionalId)
        .eq("client_id", clientId)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return (data ?? []) as AnamneseFicha[];
    }
  });
}
