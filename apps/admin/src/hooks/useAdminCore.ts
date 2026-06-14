import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

export interface AdminProfessional {
  id: string;
  name: string;
  business_name: string | null;
  email: string;
  plan_type: string;
  whatsapp_connected: boolean;
  onboarding_completed: boolean;
  total_score: number | null;
  health_level: string | null;
  access_status: string;
  ai_credit_balance: number;
  subscription_status: string | null;
  created_at: string;
}

export interface AdminProfessionalDetail {
  professional: Record<string, unknown>;
  health: Record<string, unknown> | null;
  access: Record<string, unknown>;
  subscription: Record<string, unknown> | null;
  wallets: Array<Record<string, unknown>>;
  agents: Array<Record<string, unknown>>;
}

export interface AdminPlan {
  id: string; slug: string; name: string; description: string; monthly_price_cents: number;
  annual_price_cents: number; included_ai_credits: number; client_limit: number | null;
  team_limit: number | null; is_public: boolean; is_active: boolean;
}
export interface AdminSubscription { id: string; professional_id: string; professional_name: string; plan_slug: string; status: string; source: string; current_period_end: string | null; }
export interface AdminAgentVersion { id: string; version: number; status: string; changelog: string; created_at: string; }
export interface AdminAgent { id: string; agent_slug: string; display_name: string; status: string; owner: string; active_version: number | null; versions: AdminAgentVersion[]; last_pause_until: string | null; executions_30d: number; }
export interface AdminImprovement { id: string; title: string; description: string; category: string; priority: string; status: string; status_reason: string | null; professional_name: string; votes: number; comments: number; created_at: string; updated_at: string; }
export interface AdminSetting { setting_key: string; status: string; public_status: Record<string, unknown>; secret_configured: boolean; last_checked_at: string | null; updated_at: string; }

export function useAdminDashboard() {
  return useQuery({
    queryKey: ["admin-dashboard"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("phase23_get_admin_dashboard");
      if (error) throw error;
      return data as Record<string, unknown>;
    },
  });
}

export function useAdminAnalytics(days: number) {
  return useQuery({
    queryKey: ["admin-analytics", days],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("phase23_get_admin_analytics", { p_days: days });
      if (error) throw error;
      return data as {
        period_days: number;
        metrics: Array<Record<string, number | string>>;
        plans: Array<{ plan: string; professionals: number }>;
        health: Array<{ level: string; professionals: number }>;
        ai: { credits_used: number; events: number };
      };
    },
  });
}

export function useAdminProfessionals(filters: { search: string; health: string; plan: string; access: string }) {
  return useQuery({
    queryKey: ["admin-professionals", filters],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("phase23_get_admin_professionals", {
        p_limit: 100,
        p_cursor: null,
        p_search: filters.search || null,
        p_health_level: filters.health || null,
        p_plan_type: filters.plan || null,
        p_access_status: filters.access || null,
      });
      if (error) throw error;
      return (data?.items ?? []) as AdminProfessional[];
    },
  });
}

export function useAdminProfessionalDetail(id: string | undefined) {
  return useQuery({
    queryKey: ["admin-professional", id],
    enabled: Boolean(id),
    queryFn: async () => {
      const { data, error } = await supabase.rpc("phase23_get_admin_professional_detail", { p_professional_id: id });
      if (error) throw error;
      return data as AdminProfessionalDetail;
    },
  });
}

export function useSetProfessionalAccess(id: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async ({ access, reason }: { access: string; reason: string }) => {
      const { error } = await supabase.rpc("phase23_set_professional_access", {
        p_professional_id: id,
        p_access_status: access,
        p_reason: reason,
      });
      if (error) throw error;
    },
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ["admin-professional", id] });
      await client.invalidateQueries({ queryKey: ["admin-professionals"] });
      await client.invalidateQueries({ queryKey: ["admin-dashboard"] });
    },
  });
}

function useAdminDomain<T>(key: string, rpc: string) {
  return useQuery({
    queryKey: [key],
    queryFn: async () => {
      const { data, error } = await supabase.rpc(rpc);
      if (error) throw error;
      return data as T;
    },
  });
}

export const useAdminPlans = () => useAdminDomain<{ governance: string; plans: AdminPlan[]; subscriptions: AdminSubscription[] }>("admin-plans", "phase23_get_admin_plans");
export const useAdminAgents = () => useAdminDomain<{ agents: AdminAgent[] }>("admin-agents", "phase23_get_admin_agents");
export const useAdminImprovements = () => useAdminDomain<{ items: AdminImprovement[] }>("admin-improvements", "phase23_get_admin_improvements");
export const useAdminSettings = () => useAdminDomain<{ items: AdminSetting[] }>("admin-settings", "phase23_get_admin_settings");
