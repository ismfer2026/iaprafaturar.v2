import type {
  PublicBookingCompleteClientOnboardingOutput,
  PublicBookingContextOutput,
  PublicBookingCreateAppointmentOutput,
  PublicBookingErrorOutput
} from "@iaprafaturar/contracts/edge-functions/public-booking-handler";
import { supabase } from "@/lib/supabase";
import type { Locale } from "@/i18n";
import { readFunctionErrorBody } from "@/lib/function-error";

export type PublicBookingResult = PublicBookingContextOutput | PublicBookingErrorOutput;

export interface CreatePublicAppointmentInput {
  slug: string;
  serviceId: string;
  scheduledAt: string;
  fullName: string;
  phoneWhatsapp: string;
  email?: string;
  lang: Locale;
  ref?: string;
}

export interface CompleteClientOnboardingInput {
  slug: string;
  fullName: string;
  phoneWhatsapp: string;
  email?: string;
  lgpdAccepted: true;
  contactPreference: "whatsapp" | "email" | "both";
  remindersOptIn: boolean;
  lang: Locale;
  ref?: string;
}

export async function getPublicBookingContext(params: {
  slug: string;
  lang: Locale;
  ref?: string;
}): Promise<PublicBookingResult> {
  const { data, error } = await supabase.functions.invoke<PublicBookingResult>("public-booking-handler", {
    body: {
      mode: "get_context",
      slug: params.slug,
      lang: params.lang,
      ...(params.ref ? { ref: params.ref } : {})
    }
  });

  if (error) throw error;
  if (!data) throw new Error("empty_public_booking_context");
  return data;
}

export async function createPublicAppointment(
  input: CreatePublicAppointmentInput
): Promise<PublicBookingCreateAppointmentOutput | PublicBookingErrorOutput> {
  const { data, error } = await supabase.functions.invoke<
    PublicBookingCreateAppointmentOutput | PublicBookingErrorOutput
  >("public-booking-handler", {
    body: {
      mode: "create_appointment",
      slug: input.slug,
      service_id: input.serviceId,
      scheduled_at: input.scheduledAt,
      full_name: input.fullName,
      phone_whatsapp: input.phoneWhatsapp,
      ...(input.email ? { email: input.email } : {}),
      lang: input.lang,
      ...(input.ref ? { ref: input.ref } : {})
    }
  });

  if (error) {
    const errorBody = await readFunctionErrorBody<PublicBookingErrorOutput>(error);
    if (errorBody) return errorBody;
    throw error;
  }
  if (!data) throw new Error("empty_public_appointment_response");
  return data;
}

export async function completeClientOnboarding(
  input: CompleteClientOnboardingInput
): Promise<PublicBookingCompleteClientOnboardingOutput | PublicBookingErrorOutput> {
  const { data, error } = await supabase.functions.invoke<
    PublicBookingCompleteClientOnboardingOutput | PublicBookingErrorOutput
  >("public-booking-handler", {
    body: {
      mode: "complete_client_onboarding",
      slug: input.slug,
      full_name: input.fullName,
      phone_whatsapp: input.phoneWhatsapp,
      ...(input.email ? { email: input.email } : {}),
      lgpd_accepted: input.lgpdAccepted,
      contact_preference: input.contactPreference,
      reminders_opt_in: input.remindersOptIn,
      lang: input.lang,
      ...(input.ref ? { ref: input.ref } : {})
    }
  });

  if (error) {
    const errorBody = await readFunctionErrorBody<PublicBookingErrorOutput>(error);
    if (errorBody) return errorBody;
    throw error;
  }
  if (!data) throw new Error("empty_public_client_onboarding_response");
  return data;
}
