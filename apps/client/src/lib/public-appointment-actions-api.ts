import type {
  PublicAppointmentActionsOutput,
} from "@iaprafaturar/contracts/edge-functions/public-appointment-actions";
import { supabase } from "@/lib/supabase";
import { readFunctionErrorBody } from "@/lib/function-error";

export async function cancelPublicAppointment(input: {
  appointmentToken: string;
  reason?: string;
}): Promise<PublicAppointmentActionsOutput> {
  const { data, error } = await supabase.functions.invoke<PublicAppointmentActionsOutput>(
    "public-appointment-actions",
    {
      body: {
        mode: "cancel",
        appointment_token: input.appointmentToken,
        ...(input.reason?.trim() ? { reason: input.reason.trim() } : {}),
      },
    },
  );

  if (error) {
    const errorBody = await readFunctionErrorBody<PublicAppointmentActionsOutput>(error);
    if (errorBody) return errorBody;
    throw error;
  }

  if (!data) throw new Error("empty_public_appointment_action_response");
  return data;
}

export async function reschedulePublicAppointment(input: {
  appointmentToken: string;
  newScheduledAt: string;
}): Promise<PublicAppointmentActionsOutput> {
  const { data, error } = await supabase.functions.invoke<PublicAppointmentActionsOutput>(
    "public-appointment-actions",
    {
      body: {
        mode: "reschedule",
        appointment_token: input.appointmentToken,
        new_scheduled_at: input.newScheduledAt,
      },
    },
  );

  if (error) {
    const errorBody = await readFunctionErrorBody<PublicAppointmentActionsOutput>(error);
    if (errorBody) return errorBody;
    throw error;
  }

  if (!data) throw new Error("empty_public_appointment_action_response");
  return data;
}
