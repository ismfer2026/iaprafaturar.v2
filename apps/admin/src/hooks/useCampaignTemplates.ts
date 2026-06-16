import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

export interface CampaignTemplate {
  id: string;
  name: string;
  description: string | null;
  content: string;
  channel: "whatsapp" | "email" | "sms";
  category: string | null;
  variables: Array<{ key: string; label: string }>;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface CampaignTemplateInput {
  name: string;
  description?: string;
  content: string;
  channel: "whatsapp" | "email" | "sms";
  category?: string;
  variables?: Array<{ key: string; label: string }>;
  is_active?: boolean;
}

const QK = "admin-campaign-templates";

export function useCampaignTemplates(channel?: string) {
  return useQuery({
    queryKey: [QK, channel],
    queryFn: async () => {
      let query = supabase
        .from("campaign_templates")
        .select("*")
        .order("created_at", { ascending: false });

      if (channel && channel !== "all") {
        query = query.eq("channel", channel);
      }

      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as CampaignTemplate[];
    },
  });
}

export function useSaveCampaignTemplate() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...input }: CampaignTemplateInput & { id?: string }) => {
      const { data, error } = await supabase.rpc("admin_upsert_campaign_template", {
        p_id:          id ?? null,
        p_name:        input.name,
        p_description: input.description ?? null,
        p_content:     input.content,
        p_channel:     input.channel,
        p_category:    input.category ?? null,
        p_variables:   input.variables ?? [],
        p_is_active:   input.is_active ?? true,
      });
      if (error) throw error;
      return data as CampaignTemplate;
    },
    onSuccess: () => client.invalidateQueries({ queryKey: [QK] }),
  });
}

export function useToggleCampaignTemplate() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await supabase.rpc("admin_toggle_campaign_template", {
        p_id: id,
        p_is_active: is_active,
      });
      if (error) throw error;
    },
    onSuccess: () => client.invalidateQueries({ queryKey: [QK] }),
  });
}
