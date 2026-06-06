export type NivelAcesso = "gestor" | "operacional";

export interface TeamMember {
  id: string;
  professional_id: string;
  name: string;
  apelido: string | null;
  email: string;
  phone_whatsapp: string | null;
  cpf: string | null;
  funcao: string | null;
  conselho: string | null;
  nivel_acesso: NivelAcesso;
  comissao: number;
  possui_agenda: boolean;
  is_active: boolean;
  business_hours: Record<string, unknown>;
  notifications: Record<string, unknown>;
  cod_integracao: string | null;
  user_id: string | null;
  created_at: string;
  updated_at: string;
}
