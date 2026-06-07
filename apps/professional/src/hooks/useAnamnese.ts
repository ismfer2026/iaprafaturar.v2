import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { crmKeys } from "./queryKeys";

export interface AnamneseAsset {
  path: string;
  name?: string;
  type?: string;
  size?: number;
  uploaded_at?: string;
  signedUrl?: string | null;
}

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
  fotos: AnamneseAsset[] | null;
  assinatura_url: string | null;
  assinatura_signed_url?: string | null;
  assinado_em: string | null;
  lgpd_aceito: boolean | null;
  preenchido_em: string | null;
  revisado_em: string | null;
  revisado_por: string | null;
  notas_profissional: string | null;
  created_at: string;
}

async function createSignedAssetUrl(path: string | null | undefined) {
  if (!path) return null;
  if (path.startsWith("http://") || path.startsWith("https://")) return path;

  const { data, error } = await supabase.storage.from("anamnese-assets").createSignedUrl(path, 60 * 60);
  if (error) return null;
  return data.signedUrl;
}

async function withSignedAssetUrls(ficha: AnamneseFicha): Promise<AnamneseFicha> {
  const fotos = await Promise.all(
    (ficha.fotos ?? []).map(async (asset) => ({
      ...asset,
      signedUrl: await createSignedAssetUrl(asset.path)
    }))
  );

  return {
    ...ficha,
    fotos,
    assinatura_signed_url: await createSignedAssetUrl(ficha.assinatura_url)
  };
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
          "id, professional_id, client_id, status, dados_pessoais, queixas, historico, alergias, habitos, custom_data, fotos, assinatura_url, assinado_em, lgpd_aceito, preenchido_em, revisado_em, revisado_por, notas_profissional, created_at"
        )
        .eq("professional_id", professionalId)
        .eq("client_id", clientId)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return Promise.all(((data ?? []) as AnamneseFicha[]).map(withSignedAssetUrls));
    }
  });
}

export function useReviewAnamneseFicha(professionalId: string | null, clientId: string | null) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: { fichaId: string; notasProfissional?: string }) => {
      const { data, error } = await supabase.rpc("review_anamnese_ficha", {
        p_ficha_id: input.fichaId,
        p_notas_profissional: input.notasProfissional ?? null
      });

      if (error) throw error;
      return data;
    },
    async onSuccess() {
      await queryClient.invalidateQueries({
        queryKey: crmKeys.anamneseFichas(professionalId, clientId)
      });
    }
  });
}
