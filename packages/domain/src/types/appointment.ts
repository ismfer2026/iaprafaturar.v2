export type AppointmentStatus =
  | "agendado"
  | "confirmado"
  | "cancelado"
  | "reagendado"
  | "realizado"
  | "falta";

export type AppointmentSource = "crm" | "public_link" | "whatsapp" | "import";

export interface Appointment {
  id: string;
  professional_id: string;
  client_id: string | null;
  service_id: string | null;
  scheduled_at: string;
  duration_minutes: number;
  status: AppointmentStatus;
  source: AppointmentSource;
  booked_by_client?: boolean;
  booked_at?: string | null;
  series_id?: string | null;
  series_occurrence_index?: number | null;
  notes: string | null;
  cancellation_reason: string | null;
  outcome_notes: string | null;
  cancelled_at: string | null;
  completed_at: string | null;
  no_show_at: string | null;
  created_by: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface CreateAppointmentInput {
  clientId: string;
  serviceId?: string | null;
  scheduledAt: string;
  durationMinutes?: number | null;
  notes?: string | null;
}

export interface CreateAppointmentOutput {
  appointment_id: string;
  status: AppointmentStatus;
  appointment: Appointment;
}

export type AppointmentSeriesFrequency = "weekly" | "biweekly" | "monthly_day" | "monthly_week";

export interface CreateAppointmentSeriesInput {
  clientId: string;
  serviceId: string;
  firstScheduledAt: string;
  frequency: AppointmentSeriesFrequency;
  occurrenceCount: number;
  endsAt?: string | null;
}

export interface CreateAppointmentSeriesOutput {
  ok: boolean;
  series_id?: string;
  created_appointment_ids?: string[];
  created_count?: number;
  error?: string;
  conflicts?: Array<{ index: number; scheduled_at: string }>;
}

export interface CancelAppointmentInput {
  appointmentId: string;
  reason?: string | null;
}

export interface AppointmentStatusOutput {
  appointment_id: string;
  status: AppointmentStatus;
}

export type AppointmentOutcome = "realizado" | "falta";

export interface RegisterAppointmentOutcomeInput {
  appointmentId: string;
  outcome: AppointmentOutcome;
  notes?: string | null;
}
