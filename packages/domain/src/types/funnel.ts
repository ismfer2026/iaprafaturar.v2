export type FunnelOpportunitySource =
  | "manual"
  | "web_chat"
  | "indicacao"
  | "campaign"
  | "public_package"
  | "public_quote"
  | "whatsapp"
  | "email"
  | "other";

export type FunnelOpportunityStatus = "open" | "won" | "lost" | "archived";

export interface SalesFunnel {
  id: string;
  professional_id: string;
  name: string;
  is_default: boolean;
  is_active: boolean;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface FunnelStage {
  id: string;
  funnel_id: string;
  professional_id: string;
  name: string;
  slug: string;
  color: string;
  position: number;
  is_won: boolean;
  is_lost: boolean;
  is_active: boolean;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface FunnelOpportunity {
  id: string;
  professional_id: string;
  funnel_id: string;
  stage_id: string;
  client_id: string;
  client_name: string;
  client_phone_whatsapp: string | null;
  title: string;
  source: FunnelOpportunitySource;
  value: number;
  status: FunnelOpportunityStatus;
  expected_close_date: string | null;
  last_activity_at: string | null;
  won_at: string | null;
  lost_at: string | null;
  closed_reason: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export type FunnelEventType = "created" | "stage_moved" | "activity" | "closed" | "reopened";

export interface FunnelEvent {
  id: string;
  opportunity_id: string;
  event_type: FunnelEventType;
  from_stage_id: string | null;
  to_stage_id: string | null;
  payload: Record<string, unknown>;
  created_at: string;
}

export interface FunnelBoard {
  funnel: SalesFunnel;
  stages: FunnelStage[];
  opportunities: FunnelOpportunity[];
  events: FunnelEvent[];
}

export interface CreateFunnelOpportunityInput {
  clientId: string;
  title: string;
  source?: FunnelOpportunitySource;
  value?: number;
  stageId?: string | null;
  metadata?: Record<string, unknown>;
}

export interface CreateFunnelOpportunityOutput {
  opportunity_id: string;
  opportunity: Omit<FunnelOpportunity, "client_name" | "client_phone_whatsapp">;
}

export interface MoveFunnelOpportunityInput {
  opportunityId: string;
  stageId: string;
  reason?: string | null;
}

export interface MoveFunnelOpportunityOutput {
  opportunity_id: string;
  from_stage_id: string;
  to_stage_id: string;
  changed: boolean;
}

export interface CloseFunnelOpportunityInput {
  opportunityId: string;
  outcome: "won" | "lost";
  reason?: string | null;
}

export interface CloseFunnelOpportunityOutput {
  opportunity_id: string;
  status: "won" | "lost";
  stage_id: string;
}

export interface LogFunnelActivityInput {
  opportunityId: string;
  activityType: string;
  payload?: Record<string, unknown>;
}

export interface LogFunnelActivityOutput {
  event_id: string;
  opportunity_id: string;
}
