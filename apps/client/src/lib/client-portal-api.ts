import type {
  ClientPortalBookingContextOutput,
  ClientPortalContextOutput,
  ClientPortalErrorOutput,
  ClientPortalHistoryOutput,
  ClientPortalMutationOutput,
  ClientPortalPackagesOutput,
  ClientPortalStartSessionOutput
} from "@iaprafaturar/contracts/edge-functions/client-portal-handler";
import { supabase } from "@/lib/supabase";
import { readFunctionErrorBody } from "@/lib/function-error";
import type { Locale } from "@/i18n";

export type ClientPortalResult<T extends { ok: boolean }> = T | ClientPortalErrorOutput;

async function invokePortal<T extends { ok: boolean }>(body: Record<string, unknown>): Promise<ClientPortalResult<T>> {
  const { data, error } = await supabase.functions.invoke<ClientPortalResult<T>>("client-portal-handler", { body });

  if (error) {
    const errorBody = await readFunctionErrorBody<ClientPortalErrorOutput>(error);
    if (errorBody) return errorBody;
    throw error;
  }

  if (!data) throw new Error("empty_client_portal_response");
  return data;
}

export function startClientPortalSession(input: {
  slug: string;
  fullName: string;
  phoneWhatsapp: string;
  email?: string;
  lang: Locale;
}): Promise<ClientPortalResult<ClientPortalStartSessionOutput>> {
  return invokePortal<ClientPortalStartSessionOutput>({
    mode: "start_session",
    slug: input.slug,
    full_name: input.fullName,
    phone_whatsapp: input.phoneWhatsapp,
    ...(input.email ? { email: input.email } : {}),
    lgpd_accepted: true,
    lang: input.lang
  });
}

export function getClientPortalContext(sessionToken: string, lang: Locale): Promise<ClientPortalResult<ClientPortalContextOutput>> {
  return invokePortal<ClientPortalContextOutput>({
    mode: "get_context",
    session_token: sessionToken,
    lang
  });
}

export function getClientPortalHistory(sessionToken: string): Promise<ClientPortalResult<ClientPortalHistoryOutput>> {
  return invokePortal<ClientPortalHistoryOutput>({
    mode: "get_history",
    session_token: sessionToken,
    limit: 20
  });
}

export function getClientPortalPackages(sessionToken: string): Promise<ClientPortalResult<ClientPortalPackagesOutput>> {
  return invokePortal<ClientPortalPackagesOutput>({
    mode: "get_packages",
    session_token: sessionToken
  });
}

export function getClientPortalBookingContext(
  sessionToken: string,
  lang: Locale
): Promise<ClientPortalResult<ClientPortalBookingContextOutput>> {
  return invokePortal<ClientPortalBookingContextOutput>({
    mode: "get_booking_context",
    session_token: sessionToken,
    lang
  });
}

export function createClientPortalAppointment(input: {
  sessionToken: string;
  serviceId: string;
  scheduledAt: string;
  useClientPackageId?: string;
}): Promise<ClientPortalResult<ClientPortalMutationOutput>> {
  return invokePortal<ClientPortalMutationOutput>({
    mode: "create_appointment",
    session_token: input.sessionToken,
    service_id: input.serviceId,
    scheduled_at: input.scheduledAt,
    ...(input.useClientPackageId ? { use_client_package_id: input.useClientPackageId } : {})
  });
}

export function completeClientPortalOnboarding(input: {
  sessionToken: string;
  fullName: string;
  email?: string;
  contactPreference: "whatsapp" | "email" | "both";
  remindersOptIn: boolean;
}): Promise<ClientPortalResult<ClientPortalMutationOutput>> {
  return invokePortal<ClientPortalMutationOutput>({
    mode: "complete_onboarding",
    session_token: input.sessionToken,
    full_name: input.fullName,
    ...(input.email ? { email: input.email } : {}),
    contact_preference: input.contactPreference,
    reminders_opt_in: input.remindersOptIn,
    lgpd_accepted: true
  });
}

export function logoutClientPortal(sessionToken: string): Promise<ClientPortalResult<ClientPortalMutationOutput>> {
  return invokePortal<ClientPortalMutationOutput>({
    mode: "logout",
    session_token: sessionToken
  });
}
