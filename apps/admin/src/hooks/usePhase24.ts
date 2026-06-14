import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

export interface BroadcastHistoryItem {
  id: string; audience_type: string; channel: string; message: string; status: string; dry_run: boolean;
  selected_count: number; eligible_count: number; sent_count: number; failed_count: number; skipped_count: number;
  created_at: string; completed_at: string | null;
}
export interface Ambassador {
  id: string; professional_id: string; professional_name: string; business_name: string | null; affiliate_code: string;
  status: string; commission_rate: number; pending_balance_cents: number; referrals: number; paid_referrals: number;
}
export interface AffiliatePayment { id: string; affiliate_code: string; amount_cents: number; status: string; reference_month: string; payment_reference: string | null; paid_at: string | null; }
export interface AffiliateCommission { id: string; affiliate_code: string; amount_cents: number; status: string; reference_month: string; }
export interface AffiliateReferral { id: string; affiliate_code: string; referred_professional_id: string | null; status: string; attribution_code: string; created_at: string; }
export interface SalesLead {
  id: string; name: string; business_name: string | null; email: string | null; phone: string | null; source: string;
  stage: string; score: number; last_interaction_at: string | null; next_follow_up_at: string | null; loss_reason: string | null;
}

export function useBroadcastHistory() {
  return useQuery({ queryKey: ["phase24-broadcasts"], queryFn: async () => {
    const { data, error } = await supabase.rpc("phase24_get_broadcasts", { p_limit: 50 });
    if (error) throw error;
    return data as { items: BroadcastHistoryItem[]; metrics: { total: number; sent: number; failed: number; active: number } };
  }});
}

export function useAmbassadors() {
  return useQuery({ queryKey: ["phase24-ambassadors"], queryFn: async () => {
    const { data, error } = await supabase.rpc("phase24_get_admin_ambassadors");
    if (error) throw error;
    return data as { partners: Ambassador[]; referrals: AffiliateReferral[]; payments: AffiliatePayment[]; commissions: AffiliateCommission[] };
  }});
}

export function useAmbassadorActions() {
  const client = useQueryClient();
  const invalidate = () => client.invalidateQueries({ queryKey: ["phase24-ambassadors"] });
  const create = useMutation({ mutationFn: async (input: { professionalId: string; code: string; rate: number; reason: string }) => {
    const { error } = await supabase.rpc("phase24_create_ambassador", { p_professional_id: input.professionalId, p_affiliate_code: input.code, p_commission_rate: input.rate, p_reason: input.reason });
    if (error) throw error;
  }, onSuccess: invalidate });
  const review = useMutation({ mutationFn: async (input: { id: string; decision: string; reason: string }) => {
    const { error } = await supabase.rpc("phase24_review_ambassador", { p_partner_id: input.id, p_decision: input.decision, p_reason: input.reason });
    if (error) throw error;
  }, onSuccess: invalidate });
  const pay = useMutation({ mutationFn: async (input: { id: string; reference: string; reason: string }) => {
    const { error } = await supabase.rpc("phase24_confirm_affiliate_payment", { p_payment_id: input.id, p_reference: input.reference, p_reason: input.reason });
    if (error) throw error;
  }, onSuccess: invalidate });
  return { create, review, pay };
}

export function useSalesLeads(stage: string, search: string) {
  return useQuery({ queryKey: ["phase24-leads", stage, search], queryFn: async () => {
    const { data, error } = await supabase.rpc("phase24_get_sales_leads", { p_stage: stage || null, p_search: search || null });
    if (error) throw error;
    return data as { items: SalesLead[]; metrics: { total: number; follow_up_due: number; converted: number } };
  }});
}

export function useUpsertSalesLead() {
  const client = useQueryClient();
  return useMutation({ mutationFn: async (lead: Partial<SalesLead> & { name: string; stage: string; reason: string }) => {
    const { error } = await supabase.rpc("phase24_upsert_sales_lead", {
      p_lead_id: lead.id ?? null, p_name: lead.name, p_business_name: lead.business_name ?? null,
      p_email: lead.email ?? null, p_phone: lead.phone ?? null, p_source: lead.source ?? "admin",
      p_stage: lead.stage, p_score: lead.score ?? 0, p_next_follow_up_at: lead.next_follow_up_at ?? null, p_reason: lead.reason,
    });
    if (error) throw error;
  }, onSuccess: () => client.invalidateQueries({ queryKey: ["phase24-leads"] }) });
}
