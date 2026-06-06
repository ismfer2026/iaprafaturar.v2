export type JourneyStage =
  | "lead"
  | "agendado"
  | "em_tratamento"
  | "pos_tratamento"
  | "cliente_fiel"
  | "inativo";

export type ClientGender = "masculino" | "feminino" | "outro" | "nao_informado";

export type ClientSource =
  | "manual"
  | "public_link"
  | "whatsapp"
  | "import"
  | "referral";

export interface Client {
  id: string;
  professional_id: string;
  full_name: string;
  phone_whatsapp: string | null;
  email: string | null;
  cpf: string | null;
  birth_date: string | null;
  gender: ClientGender | null;
  city: string | null;
  neighborhood: string | null;
  full_address: string | null;
  journey_stage: JourneyStage;
  source: ClientSource;
  referral_client_id: string | null;
  lgpd_consent_at: string | null;
  lgpd_consent_source: string | null;
  pwa_installed: boolean;
  loyalty_points: number;
  is_active: boolean;
  is_blocked: boolean;
  internal_notes: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface CreateClientManualInput {
  fullName: string;
  phoneWhatsapp?: string | null;
  email?: string | null;
  birthDate?: string | null;
  journeyStage?: JourneyStage;
  source?: ClientSource;
}

export interface CreateClientManualOutput {
  client_id: string;
  client: Client;
}

export interface MoveClientStageInput {
  clientId: string;
  toStage: JourneyStage;
  reason?: string | null;
}

export interface MoveClientStageOutput {
  client_id: string;
  from_stage: JourneyStage;
  to_stage: JourneyStage;
  changed: boolean;
}
