import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  Appointment,
  AppointmentStatusOutput,
  CancelAppointmentInput,
  CreateAppointmentInput,
  CreateAppointmentOutput,
  RegisterAppointmentOutcomeInput,
} from "@iaprafaturar/domain";
import { supabase } from "@/lib/supabase";
import { crmKeys } from "./queryKeys";

function dateRange(dateKey?: string | null) {
  if (!dateKey) return null;

  const start = new Date(`${dateKey}T00:00:00`);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);

  return {
    start: start.toISOString(),
    end: end.toISOString(),
  };
}

export function useAppointments(professionalId: string | null, dateKey?: string | null) {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: crmKeys.appointments(professionalId, dateKey),
    enabled: Boolean(professionalId),
    queryFn: async () => {
      if (!professionalId) throw new Error("professionalId is required");

      let queryBuilder = supabase
        .from("appointments")
        .select("*")
        .eq("professional_id", professionalId)
        .is("deleted_at", null)
        .order("scheduled_at");

      const range = dateRange(dateKey);
      if (range) {
        queryBuilder = queryBuilder.gte("scheduled_at", range.start).lt("scheduled_at", range.end);
      }

      const { data, error } = await queryBuilder;
      if (error) throw error;
      return (data ?? []) as Appointment[];
    },
  });

  const createAppointment = useMutation({
    mutationFn: async (input: CreateAppointmentInput) => {
      const { data, error } = await supabase.rpc("create_appointment", {
        p_client_id: input.clientId,
        p_service_id: input.serviceId ?? null,
        p_scheduled_at: input.scheduledAt,
        p_duration_minutes: input.durationMinutes ?? null,
        p_notes: input.notes ?? null,
      });

      if (error) throw error;
      return data as CreateAppointmentOutput;
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["crm", "appointments", professionalId] }),
        queryClient.invalidateQueries({ queryKey: ["crm", "clients", professionalId] }),
        queryClient.invalidateQueries({ queryKey: crmKeys.dashboard(professionalId) }),
      ]);
    },
  });

  const cancelAppointment = useMutation({
    mutationFn: async (input: CancelAppointmentInput) => {
      const { data, error } = await supabase.rpc("cancel_appointment", {
        p_appointment_id: input.appointmentId,
        p_reason: input.reason ?? null,
      });

      if (error) throw error;
      return data as AppointmentStatusOutput;
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["crm", "appointments", professionalId] }),
        queryClient.invalidateQueries({ queryKey: crmKeys.dashboard(professionalId) }),
      ]);
    },
  });

  const registerOutcome = useMutation({
    mutationFn: async (input: RegisterAppointmentOutcomeInput) => {
      const { data, error } = await supabase.rpc("register_appointment_outcome", {
        p_appointment_id: input.appointmentId,
        p_outcome: input.outcome,
        p_notes: input.notes ?? null,
      });

      if (error) throw error;
      return data as AppointmentStatusOutput;
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["crm", "appointments", professionalId] }),
        queryClient.invalidateQueries({ queryKey: ["crm", "sessions", professionalId] }),
        queryClient.invalidateQueries({ queryKey: crmKeys.dashboard(professionalId) }),
      ]);
    },
  });

  return {
    ...query,
    createAppointment: createAppointment.mutateAsync,
    isCreatingAppointment: createAppointment.isPending,
    cancelAppointment: cancelAppointment.mutateAsync,
    isCancellingAppointment: cancelAppointment.isPending,
    registerOutcome: registerOutcome.mutateAsync,
    isRegisteringOutcome: registerOutcome.isPending,
  };
}

export function useClientAppointments(professionalId: string | null, clientId: string | null) {
  return useQuery({
    queryKey: ["crm", "appointments", professionalId, "client", clientId] as const,
    enabled: Boolean(professionalId && clientId),
    queryFn: async () => {
      if (!professionalId || !clientId) {
        throw new Error("professionalId and clientId are required");
      }

      const { data, error } = await supabase
        .from("appointments")
        .select("*")
        .eq("professional_id", professionalId)
        .eq("client_id", clientId)
        .is("deleted_at", null)
        .order("scheduled_at", { ascending: false });

      if (error) throw error;
      return (data ?? []) as Appointment[];
    },
  });
}
