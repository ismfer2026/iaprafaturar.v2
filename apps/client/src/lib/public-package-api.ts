import type { Locale } from "@/i18n";
import { readFunctionErrorBody } from "@/lib/function-error";
import { supabase } from "@/lib/supabase";

export interface PublicPackageContext {
  ok: true;
  package: {
    slug: string;
    name: string;
    type: string;
    total_sessions: number;
    price: number;
    validity_days: number | null;
    description: string | null;
  };
  service: {
    name: string;
    duration_minutes: number;
    description?: string | null;
  } | null;
  professional: {
    name: string;
    slug: string;
  };
}

export interface PublicPackageError {
  ok: false;
  error: "not_found" | "invalid_input" | "internal_error";
}

export type PublicPackageContextResult = PublicPackageContext | PublicPackageError;

export async function getPublicPackageContext(params: {
  slug: string;
  lang: Locale;
  ref?: string;
}): Promise<PublicPackageContextResult> {
  const { data, error } = await supabase.functions.invoke<PublicPackageContextResult>("public-package-handler", {
    body: {
      mode: "get_context",
      slug: params.slug,
      lang: params.lang,
      ...(params.ref ? { ref: params.ref } : {})
    }
  });

  if (error) {
    const errorBody = await readFunctionErrorBody<PublicPackageError>(error);
    if (errorBody) return errorBody;
    throw error;
  }
  if (!data) throw new Error("empty_public_package_context");
  return data;
}

export async function registerPublicPackageInterest(input: {
  slug: string;
  fullName: string;
  phoneWhatsapp: string;
  email?: string;
  lang: Locale;
  ref?: string;
}): Promise<{ ok: true; status: string } | PublicPackageError> {
  const { data, error } = await supabase.functions.invoke<{ ok: true; status: string } | PublicPackageError>(
    "public-package-handler",
    {
      body: {
        mode: "register_interest",
        slug: input.slug,
        full_name: input.fullName,
        phone_whatsapp: input.phoneWhatsapp,
        ...(input.email ? { email: input.email } : {}),
        lang: input.lang,
        ...(input.ref ? { ref: input.ref } : {})
      }
    }
  );

  if (error) {
    const errorBody = await readFunctionErrorBody<PublicPackageError>(error);
    if (errorBody) return errorBody;
    throw error;
  }
  if (!data) throw new Error("empty_public_package_interest_response");
  return data;
}
