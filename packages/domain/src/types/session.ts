export interface Session {
  id: string;
  professional_id: string;
  client_id: string;
  appointment_id: string | null;
  service_id: string | null;
  session_date: string;
  session_time: string | null;
  clinical_evolution: string | null;
  notes: string | null;
  session_value: number;
  payment_status: "pendente" | "pago" | "parcial" | "isento";
  payment_method: string | null;
  procedures_performed: string[];
  products_used: string[];
  ai_registered: boolean;
  ai_raw_transcript: string | null;
  ai_confidence_score: number | null;
  created_by: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface RegisterSessionInput {
  appointmentId: string;
  clientId: string;
  serviceId?: string | null;
  sessionDate?: string | null;
  clinicalEvolution?: string | null;
  notes?: string | null;
  sessionValue?: number;
  proceduresPerformed?: string[];
  productsUsed?: string[];
}

export interface RegisterSessionOutput {
  session_id: string;
  appointment_id: string;
  appointment_status: "realizado";
}
