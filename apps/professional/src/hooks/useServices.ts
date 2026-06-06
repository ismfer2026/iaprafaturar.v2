import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  CreateServiceInput,
  DeactivateServiceOutput,
  Service,
  ServiceCategory,
  ServiceMutationOutput,
  UpdateServiceInput,
} from "@iaprafaturar/domain";
import { supabase } from "@/lib/supabase";
import { crmKeys } from "./queryKeys";

export function useServices(professionalId: string | null) {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: crmKeys.services(professionalId),
    enabled: Boolean(professionalId),
    queryFn: async () => {
      if (!professionalId) throw new Error("professionalId is required");

      const [servicesResult, categoriesResult] = await Promise.all([
        supabase
          .from("services")
          .select("*")
          .eq("professional_id", professionalId)
          .is("deleted_at", null)
          .order("name"),
        supabase
          .from("service_categories")
          .select("*")
          .eq("professional_id", professionalId)
          .is("deleted_at", null)
          .order("sort_order"),
      ]);

      if (servicesResult.error) throw servicesResult.error;
      if (categoriesResult.error) throw categoriesResult.error;

      return {
        services: (servicesResult.data ?? []) as Service[],
        categories: (categoriesResult.data ?? []) as ServiceCategory[],
      };
    },
  });

  const createService = useMutation({
    mutationFn: async (input: CreateServiceInput) => {
      const { data, error } = await supabase.rpc("create_service", {
        p_name: input.name,
        p_duration_minutes: input.durationMinutes ?? 60,
        p_price: input.price ?? 0,
        p_category_id: input.categoryId ?? null,
        p_description: input.description ?? null,
      });

      if (error) throw error;
      return data as ServiceMutationOutput;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: crmKeys.services(professionalId) });
    },
  });

  const updateService = useMutation({
    mutationFn: async (input: UpdateServiceInput) => {
      const { data, error } = await supabase.rpc("update_service", {
        p_service_id: input.serviceId,
        p_name: input.name,
        p_duration_minutes: input.durationMinutes,
        p_price: input.price,
        p_category_id: input.categoryId ?? null,
        p_description: input.description ?? null,
        p_is_public: input.isPublic ?? true,
      });

      if (error) throw error;
      return data as ServiceMutationOutput;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: crmKeys.services(professionalId) });
    },
  });

  const deactivateService = useMutation({
    mutationFn: async (serviceId: string) => {
      const { data, error } = await supabase.rpc("deactivate_service", {
        p_service_id: serviceId,
      });

      if (error) throw error;
      return data as DeactivateServiceOutput;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: crmKeys.services(professionalId) });
    },
  });

  return {
    ...query,
    createService: createService.mutateAsync,
    isCreatingService: createService.isPending,
    updateService: updateService.mutateAsync,
    isUpdatingService: updateService.isPending,
    deactivateService: deactivateService.mutateAsync,
    isDeactivatingService: deactivateService.isPending,
  };
}

