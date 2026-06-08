export interface ReportsSummary {
  month: string;
  revenuePaid: number;
  revenuePending: number;
  expensesPaid: number;
  projectedRevenue: number;
  averageTicket: number;
  activeClients: number;
  riskClients: number;
  championClients: number;
  appointmentsCompleted: number;
}

export interface ReportsTopClient {
  client_id: string;
  client_name: string;
  revenue: number;
  transaction_count: number;
  health_score: number | null;
  risk_level: "healthy" | "attention" | "risk" | "churn" | null;
  rfm_segment: string | null;
}

export interface ReportsServiceRanking {
  service_id: string | null;
  service_name: string | null;
  sessions_count: number;
  session_value: number;
  revenue: number;
}

export interface ReportsOccupancySlot {
  weekday: number;
  hour: number;
  appointments_count: number;
  duration_minutes: number;
}

export interface ProfessionalReports {
  summary: ReportsSummary;
  topClients: ReportsTopClient[];
  serviceRanking: ReportsServiceRanking[];
  occupancy: ReportsOccupancySlot[];
  generatedAt: string;
}
