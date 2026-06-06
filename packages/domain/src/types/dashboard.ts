import type { AppointmentStatus } from "./appointment";

export interface DashboardAppointment {
  id: string;
  client_id: string | null;
  client_name: string | null;
  service_id: string | null;
  service_name: string | null;
  scheduled_at: string;
  duration_minutes: number;
  status: AppointmentStatus;
}

export interface DashboardAttentionItem {
  id: string;
  client_id: string | null;
  client_name: string | null;
  scheduled_at: string;
  status: AppointmentStatus;
  reason: "appointment_overdue";
}

export interface DashboardPulse {
  clientsInTreatmentCount: number;
  activeClientsCount: number;
  appointmentsTodayCount: number;
  monthRevenuePaid: number;
  monthRevenuePending: number;
  monthExpensesPaid: number;
}

export interface DashboardSummary {
  todayAppointments: DashboardAppointment[];
  attentionItems: DashboardAttentionItem[];
  pulse: DashboardPulse;
}
