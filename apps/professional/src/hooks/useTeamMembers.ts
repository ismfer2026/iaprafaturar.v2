import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  CreateTeamMemberInput,
  TeamMember,
  TeamMemberMutationOutput,
  UpdateTeamMemberInput,
  UpdateTeamMemberPermissionsInput,
} from "@iaprafaturar/domain";
import { supabase } from "@/lib/supabase";
import { crmKeys } from "./queryKeys";

export function useTeamMembers(professionalId: string | null) {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: crmKeys.teamMembers(professionalId),
    enabled: Boolean(professionalId),
    queryFn: async () => {
      if (!professionalId) throw new Error("professionalId is required");

      const { data, error } = await supabase
        .from("team_members")
        .select("*")
        .eq("professional_id", professionalId)
        .order("is_active", { ascending: false })
        .order("name");

      if (error) throw error;
      return (data ?? []) as TeamMember[];
    },
  });

  const createTeamMember = useMutation({
    mutationFn: async (input: CreateTeamMemberInput) => {
      const { data, error } = await supabase.functions.invoke("invite-team-member", {
        body: {
          name: input.name,
          email: input.email,
          phoneWhatsapp: input.phoneWhatsapp ?? null,
          funcao: input.funcao ?? null,
          nivelAcesso: input.nivelAcesso ?? "operacional",
          possuiAgenda: input.possuiAgenda ?? false,
          comissao: input.comissao ?? 0,
        },
      });

      if (error) throw error;
      return data as TeamMemberMutationOutput;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: crmKeys.teamMembers(professionalId) });
    },
  });

  const updateTeamMember = useMutation({
    mutationFn: async (input: UpdateTeamMemberInput) => {
      const { data, error } = await supabase.rpc("update_team_member", {
        p_team_member_id: input.teamMemberId,
        p_name: input.name,
        p_email: input.email,
        p_phone_whatsapp: input.phoneWhatsapp ?? null,
        p_funcao: input.funcao ?? null,
        p_comissao: input.comissao ?? null,
      });

      if (error) throw error;
      return data as TeamMemberMutationOutput;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: crmKeys.teamMembers(professionalId) });
    },
  });

  const deactivateTeamMember = useMutation({
    mutationFn: async (teamMemberId: string) => {
      const { data, error } = await supabase.rpc("deactivate_team_member", {
        p_team_member_id: teamMemberId,
      });

      if (error) throw error;
      return data as TeamMemberMutationOutput;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: crmKeys.teamMembers(professionalId) });
    },
  });

  const updateTeamMemberPermissions = useMutation({
    mutationFn: async (input: UpdateTeamMemberPermissionsInput) => {
      const { data, error } = await supabase.rpc("update_team_member_permissions", {
        p_team_member_id: input.teamMemberId,
        p_nivel_acesso: input.nivelAcesso,
        p_possui_agenda: input.possuiAgenda,
      });

      if (error) throw error;
      return data as TeamMemberMutationOutput;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: crmKeys.teamMembers(professionalId) });
    },
  });

  return {
    ...query,
    createTeamMember: createTeamMember.mutateAsync,
    isCreatingTeamMember: createTeamMember.isPending,
    updateTeamMember: updateTeamMember.mutateAsync,
    isUpdatingTeamMember: updateTeamMember.isPending,
    deactivateTeamMember: deactivateTeamMember.mutateAsync,
    isDeactivatingTeamMember: deactivateTeamMember.isPending,
    updateTeamMemberPermissions: updateTeamMemberPermissions.mutateAsync,
    isUpdatingTeamMemberPermissions: updateTeamMemberPermissions.isPending,
  };
}
