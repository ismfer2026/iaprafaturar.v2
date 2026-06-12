export type NivelAcesso = "gestor" | "operacional";

export interface CreateTeamMemberInput {
  name: string;
  email: string;
  phoneWhatsapp?: string | null;
  funcao?: string | null;
  nivelAcesso?: NivelAcesso;
  possuiAgenda?: boolean;
  comissao?: number;
}

export interface UpdateTeamMemberInput {
  teamMemberId: string;
  name: string;
  email: string;
  phoneWhatsapp?: string | null;
  funcao?: string | null;
  comissao?: number | null;
}

export interface UpdateTeamMemberPermissionsInput {
  teamMemberId: string;
  nivelAcesso: NivelAcesso;
  possuiAgenda: boolean;
}

export interface TeamMemberMutationOutput {
  team_member_id: string;
  team_member: TeamMember;
}

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
