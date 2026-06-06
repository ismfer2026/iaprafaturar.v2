export type PlanType = "trial" | "individual" | "equipe" | "team" | "enterprise";

export type ProfessionType =
  | "fisioterapeuta"
  | "dentista"
  | "psicologo"
  | "nutricionista"
  | "medico"
  | "esteticista"
  | "personal_trainer"
  | "outros";

export interface ProfessionalSettings {
  pix_info: string | null;
  activity_type: string | null;
  business_hours: Record<string, unknown>;
  billing_info: Record<string, unknown>;
  registration_fields: {
    collect_cpf: boolean;
    collect_email: boolean;
    collect_address: boolean;
  };
  nfe_config: Record<string, unknown>;
}

export interface Professional {
  id: string;
  user_id: string | null;
  name: string;
  business_name: string | null;
  email: string;
  phone_whatsapp: string | null;
  document_cpf_cnpj: string | null;
  city: string | null;
  neighborhood: string | null;
  full_address: string | null;
  slug: string;
  logo_url: string | null;
  bio: string | null;
  instagram_handle: string | null;
  profession_type: ProfessionType;
  evolution_instance_id: string | null;
  whatsapp_connected: boolean;
  whatsapp_connected_at: string | null;
  plan_type: PlanType;
  trial_ends_at: string | null;
  acesso_vitalicio: boolean;
  stripe_customer_id: string | null;
  onboarding_completed: boolean;
  onboarding_essentials_completed: boolean;
  onboarding_step: number;
  settings: ProfessionalSettings;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}
