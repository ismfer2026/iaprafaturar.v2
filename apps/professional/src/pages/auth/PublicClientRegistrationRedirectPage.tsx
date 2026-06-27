import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation, useParams } from "react-router-dom";
import { Button, Skeleton } from "@iaprafaturar/ui";
import type {
  PublicBookingErrorOutput,
  PublicBookingResolveRegistrationLinkOutput,
} from "@iaprafaturar/contracts/edge-functions/public-booking-handler";
import { useI18n } from "@/i18n";
import { supabase } from "@/lib/supabase";

function clientBaseUrl(): string {
  const configured = import.meta.env["VITE_CLIENT_APP_URL"] as string | undefined;
  if (configured) return configured.replace(/\/$/, "");
  if (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1") {
    return window.location.origin.replace(/\/$/, "");
  }
  return "https://app.iaprafaturar.com.br";
}

async function resolveRegistrationLink(input: {
  code: string;
  lang: string;
  ref?: string;
}): Promise<PublicBookingResolveRegistrationLinkOutput | PublicBookingErrorOutput> {
  const { data, error } = await supabase.functions.invoke<PublicBookingResolveRegistrationLinkOutput | PublicBookingErrorOutput>(
    "public-booking-handler",
    {
      body: {
        mode: "resolve_registration_link",
        code: input.code,
        lang: input.lang,
        ...(input.ref ? { ref: input.ref } : {}),
      },
    },
  );

  if (error) throw error;
  if (!data) throw new Error("empty_registration_link_response");
  return data;
}

export default function PublicClientRegistrationRedirectPage() {
  const { codigo = "" } = useParams<{ codigo: string }>();
  const location = useLocation();
  const { locale, t } = useI18n();
  const ref = new URLSearchParams(location.search).get("ref")?.trim() || undefined;

  const query = useQuery({
    queryKey: ["public-client-registration-link", codigo, locale, ref],
    queryFn: () => resolveRegistrationLink({ code: codigo, lang: locale, ...(ref ? { ref } : {}) }),
    enabled: Boolean(codigo),
  });

  useEffect(() => {
    if (query.data?.ok !== true) return;
    const params = new URLSearchParams({
      lang: query.data.locale,
      ref: query.data.ref ?? query.data.registration_link_code,
    });
    window.location.replace(`${clientBaseUrl()}/cliente/${encodeURIComponent(query.data.professional_slug)}?${params.toString()}`);
  }, [query.data]);

  if (query.data?.ok === true) return null;

  if (query.isLoading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-stone-50 px-6">
        <div className="w-full max-w-sm space-y-4">
          <Skeleton className="h-8 w-2/3" />
          <Skeleton className="h-24 w-full rounded-lg" />
        </div>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-stone-50 px-6 text-center">
      <div className="w-full max-w-sm space-y-4 rounded-lg border border-zinc-200 bg-white p-6 shadow-sm">
        <h1 className="text-xl font-semibold text-zinc-950">{t("common.error.generic")}</h1>
        <p className="text-sm leading-6 text-zinc-600">Este link de cadastro de cliente nao foi encontrado ou expirou.</p>
        <Button type="button" className="w-full" onClick={() => query.refetch()}>
          Tentar novamente
        </Button>
      </div>
    </main>
  );
}
