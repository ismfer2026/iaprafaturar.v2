import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

export interface CampaignTemplate {
  id: string;
  name: string;
  description: string | null;
  content: string;
  channel: "whatsapp" | "email" | "sms";
  category: string | null;
  variables: { key: string; label: string }[];
  is_active: boolean;
}

export function useCampaignTemplates(channel?: "whatsapp" | "email" | "sms") {
  return useQuery({
    queryKey: ["campaign-templates", channel ?? "all"],
    queryFn: async () => {
      let query = supabase
        .from("campaign_templates")
        .select("id, name, description, content, channel, category, variables, is_active")
        .eq("is_active", true)
        .order("name");

      if (channel) {
        query = query.eq("channel", channel);
      }

      const { data, error } = await query.limit(100);
      if (error) throw error;
      return (data ?? []) as CampaignTemplate[];
    },
    staleTime: 5 * 60 * 1000,
  });
}
