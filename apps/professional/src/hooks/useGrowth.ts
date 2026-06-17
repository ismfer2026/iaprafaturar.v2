import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { crmKeys } from "./queryKeys";

export interface CampaignRow {
  id: string;
  name: string;
  message: string | null;
  segment_type: string;
  status: string;
  scheduled_at: string | null;
  created_at: string;
}

export interface RfmRow {
  id: string;
  client_id: string;
  recency_score: number;
  frequency_score: number;
  monetary_score: number;
  rfm_code: string;
  segment: string;
  calculated_at: string;
  clients: { full_name: string } | Array<{ full_name: string }> | null;
}

export interface HealthRow {
  id: string;
  client_id: string;
  score: number;
  risk_level: string;
  reactivation_cooldown_until: string | null;
  signals: Record<string, unknown>;
  clients: { full_name: string } | Array<{ full_name: string }> | null;
}

export interface BirthdayRow {
  id: string;
  full_name: string;
  birth_date: string;
  birth_month: number;
  birth_day: number;
  phone_whatsapp: string | null;
  email: string | null;
  whatsapp_opt_out: boolean;
  email_opt_out: boolean;
}

export interface GrowthDashboard {
  campaign_results: Array<Record<string, unknown>>;
  loyalty: Array<Record<string, unknown>>;
  email_outbox: Array<Record<string, unknown>>;
  upsell_metrics: Array<Record<string, unknown>>;
}

export interface ReactivationRow {
  client_id: string;
  full_name: string;
  phone_whatsapp: string | null;
  email: string | null;
  score: number;
  risk_level: string;
  reactivation_cooldown_until: string | null;
  reactivation_attempts_in_cycle: number;
  signals: Record<string, unknown>;
}

async function selectRows<T>(table: string, columns: string, professionalId: string): Promise<T[]> {
  const { data, error } = await supabase.from(table).select(columns).eq("professional_id", professionalId);
  if (error) throw error;
  return (data ?? []) as T[];
}

export function useGrowthOverview(professionalId: string | null) {
  return useQuery({
    queryKey: crmKeys.growthOverview(professionalId),
    enabled: Boolean(professionalId),
    queryFn: async () => {
      const [dashboard, health, campaigns, referrals] = await Promise.all([
        supabase.rpc("phase21_get_growth_dashboard"),
        selectRows<HealthRow>("client_health_scores", "id,client_id,score,risk_level,reactivation_cooldown_until,signals,clients(full_name)", professionalId as string),
        selectRows<CampaignRow>("campaigns", "id,name,segment_type,status,scheduled_at,created_at", professionalId as string),
        selectRows<{ id: string }>("referral_events", "id", professionalId as string),
      ]);
      if (dashboard.error) throw dashboard.error;
      return {
        dashboard: dashboard.data as GrowthDashboard,
        health,
        campaigns,
        referrals: referrals.length,
      };
    },
  });
}

export function useCampaigns(professionalId: string | null) {
  const queryClient = useQueryClient();
  const key = crmKeys.campaigns(professionalId);
  const query = useQuery({
    queryKey: key,
    enabled: Boolean(professionalId),
    queryFn: () => selectRows<CampaignRow>("campaigns", "id,name,message,segment_type,status,scheduled_at,created_at", professionalId as string),
  });
  const invalidate = () => queryClient.invalidateQueries({ queryKey: key });
  const create = useMutation({
    mutationFn: async (input: { name: string; segment: string; message: string }) => {
      const { data, error } = await supabase.rpc("phase21_create_campaign", {
        p_name: input.name,
        p_segment_type: input.segment,
        p_message_template: input.message,
        p_scheduled_at: null,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: invalidate,
  });
  const run = useMutation({
    mutationFn: async (input: { campaignId: string; channel: "whatsapp" | "email"; dryRun: boolean }) => {
      const { data, error } = await supabase.rpc("phase21_run_segmented_campaign", {
        p_campaign_id: input.campaignId,
        p_channel: input.channel,
        p_dry_run: input.dryRun,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: invalidate,
  });
  const schedule = useMutation({
    mutationFn: async (input: { campaignId: string; scheduledAt: string }) => {
      const { data, error } = await supabase.rpc("phase21_schedule_campaign", {
        p_campaign_id: input.campaignId,
        p_scheduled_at: input.scheduledAt,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: invalidate,
  });
  const cancel = useMutation({
    mutationFn: async (campaignId: string) => {
      const { data, error } = await supabase.rpc("phase21_cancel_campaign", {
        p_campaign_id: campaignId,
        p_reason: "cancelled_by_gestor",
      });
      if (error) throw error;
      return data;
    },
    onSuccess: invalidate,
  });
  const update = useMutation({
    mutationFn: async (input: { campaignId: string; name: string; message: string; segment: string; scheduledFor?: string | null }) => {
      const { data, error } = await supabase.rpc("update_campaign", {
        p_campaign_id: input.campaignId,
        p_name: input.name,
        p_message: input.message,
        p_segment_type: input.segment,
        p_scheduled_for: input.scheduledFor ?? null,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: invalidate,
  });
  return {
    ...query,
    create: create.mutateAsync,
    run: run.mutateAsync,
    schedule: schedule.mutateAsync,
    cancel: cancel.mutateAsync,
    update: update.mutateAsync,
    isSaving: create.isPending || run.isPending || schedule.isPending || cancel.isPending || update.isPending,
  };
}

export function useRfm(professionalId: string | null) {
  const queryClient = useQueryClient();
  const key = crmKeys.rfm(professionalId);
  const query = useQuery({
    queryKey: key,
    enabled: Boolean(professionalId),
    queryFn: async () => {
      const [rfm, health] = await Promise.all([
        selectRows<RfmRow>("rfm_scores", "id,client_id,recency_score,frequency_score,monetary_score,rfm_code,segment,calculated_at,clients(full_name)", professionalId as string),
        selectRows<HealthRow>("client_health_scores", "id,client_id,score,risk_level,reactivation_cooldown_until,signals,clients(full_name)", professionalId as string),
      ]);
      let reactivationQueue: ReactivationRow[] = [];
      try {
        const { data, error } = await supabase.rpc("phase21_get_reactivation_queue", { p_limit: 50 });
        if (error) {
          console.warn("phase21_get_reactivation_queue failed", error);
        } else {
          reactivationQueue = (data ?? []) as ReactivationRow[];
        }
      } catch (error) {
        console.warn("phase21_get_reactivation_queue threw", error);
      }
      return { rfm, health, reactivationQueue };
    },
  });
  const refresh = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc("phase21_refresh_growth_scores");
      if (error) throw error;
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: key }),
  });
  return { ...query, refresh: refresh.mutateAsync, isRefreshing: refresh.isPending };
}

export function useRewards(professionalId: string | null) {
  const queryClient = useQueryClient();
  const key = crmKeys.rewards(professionalId);
  const query = useQuery({
    queryKey: key,
    enabled: Boolean(professionalId),
    queryFn: async () => {
      const [dashboard, referrals, reconciliation] = await Promise.all([
        supabase.rpc("phase21_get_growth_dashboard"),
        selectRows<Record<string, unknown>>("referral_events", "id,event_type,referrer_client_id,referred_client_id,created_at", professionalId as string),
        supabase.rpc("phase21_reconcile_loyalty"),
      ]);
      if (dashboard.error) throw dashboard.error;
      if (reconciliation.error) throw reconciliation.error;
      return { dashboard: dashboard.data as GrowthDashboard, referrals, reconciliation: reconciliation.data as Array<Record<string, unknown>> };
    },
  });
  const redeem = useMutation({
    mutationFn: async (input: { clientId: string; points: number }) => {
      const { data, error } = await supabase.rpc("phase21_redeem_loyalty_reward", {
        p_client_id: input.clientId,
        p_points: input.points,
        p_reward_type: "manual_credit",
        p_reward_payload: { source: "rewards_page" },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: key }),
  });
  const deliverReferralReward = useMutation({
    mutationFn: async (input: { referralEventId: string; points: number }) => {
      const { data, error } = await supabase.rpc("phase21_record_referral_reward", {
        p_referral_event_id: input.referralEventId,
        p_points: input.points,
        p_reward_payload: { source: "rewards_page" },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: key }),
  });
  return {
    ...query,
    redeem: redeem.mutateAsync,
    isRedeeming: redeem.isPending,
    deliverReferralReward: deliverReferralReward.mutateAsync,
    isDeliveringReferralReward: deliverReferralReward.isPending,
  };
}

export function useBirthdays(professionalId: string | null, month: number | null, search: string) {
  return useQuery({
    queryKey: crmKeys.birthdays(professionalId, month, search),
    enabled: Boolean(professionalId),
    queryFn: async () => {
      const { data, error } = await supabase.rpc("phase21_get_birthdays", {
        p_month: month,
        p_search: search || null,
        p_limit: 250,
        p_offset: 0,
      });
      if (error) throw error;
      return ((data as { items?: BirthdayRow[] })?.items ?? []) as BirthdayRow[];
    },
  });
}

export function usePartners(professionalId: string | null) {
  const queryClient = useQueryClient();
  const key = crmKeys.partners(professionalId);
  const query = useQuery({
    queryKey: key,
    enabled: Boolean(professionalId),
    queryFn: async () => {
      const { data, error } = await supabase.rpc("phase21_get_ambassador_dashboard");
      if (error) throw error;
      return data as Record<string, unknown>;
    },
  });
  const request = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc("phase21_request_ambassador_program");
      if (error) throw error;
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: key }),
  });
  return { ...query, request: request.mutateAsync, isRequesting: request.isPending };
}
