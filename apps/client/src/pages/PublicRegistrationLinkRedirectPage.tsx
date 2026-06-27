import { useQuery } from "@tanstack/react-query";
import { Navigate, useLocation, useParams } from "react-router-dom";
import { Button, Card, CardContent, Skeleton } from "@iaprafaturar/ui";
import { useI18n } from "@/i18n";
import { buildPublicPath, readRefParam } from "@/lib/public-flow-state";
import { resolveRegistrationLink } from "@/lib/public-booking-api";
import { PublicLayout } from "./PublicLayout";

export default function PublicRegistrationLinkRedirectPage() {
  const { codigo = "" } = useParams<{ codigo: string }>();
  const location = useLocation();
  const { locale, t } = useI18n();
  const ref = readRefParam(location.search);

  const query = useQuery({
    queryKey: ["public-registration-link", codigo, locale, ref],
    queryFn: () => resolveRegistrationLink({ code: codigo, lang: locale, ...(ref ? { ref } : {}) }),
    enabled: Boolean(codigo)
  });

  if (query.isLoading) {
    return (
      <PublicLayout eyebrow={t("shell.client")} title={t("clientOnboarding.title")} subtitle={t("common.loading")}>
        <Card className="rounded-lg">
          <CardContent className="space-y-4 p-5">
            <Skeleton className="h-8 w-2/3" />
            <Skeleton className="h-24 w-full" />
          </CardContent>
        </Card>
      </PublicLayout>
    );
  }

  if (!query.data || query.data.ok === false) {
    return (
      <PublicLayout eyebrow={t("shell.client")} title={t("common.notFound.title")} subtitle={t("clientOnboarding.error.load")}>
        <Card className="rounded-lg">
          <CardContent className="space-y-4 p-5">
            <p className="text-sm leading-6 text-zinc-600">{t("common.notFound.description")}</p>
            <Button type="button" className="w-full bg-brand text-white hover:bg-brand/90" onClick={() => query.refetch()}>
              {t("common.tryAgain")}
            </Button>
          </CardContent>
        </Card>
      </PublicLayout>
    );
  }

  return (
    <Navigate
      replace
      to={buildPublicPath(`/cliente/${query.data.professional_slug}`, {
        lang: query.data.locale,
        ref: query.data.ref ?? query.data.registration_link_code
      })}
    />
  );
}
