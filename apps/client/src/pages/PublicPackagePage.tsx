import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { CheckCircle2, Gift, PackageCheck } from "lucide-react";
import { useParams, useSearchParams } from "react-router-dom";
import { Button, Card, CardContent, CardHeader, CardTitle, Input } from "@iaprafaturar/ui";
import { useI18n } from "@/i18n";
import { getPublicPackageContext, registerPublicPackageInterest } from "@/lib/public-package-api";
import { PublicLayout } from "./PublicLayout";

function currency(value: number, locale: string) {
  return new Intl.NumberFormat(locale, { style: "currency", currency: "BRL" }).format(value);
}

function packageErrorKey(error: string | undefined) {
  if (error === "not_found") return "package.error.notFound";
  if (error === "invalid_input") return "package.error.invalidInput";
  return "package.error.submit";
}

export default function PublicPackagePage() {
  const { slug = "" } = useParams<{ slug: string }>();
  const [searchParams] = useSearchParams();
  const { locale, t } = useI18n();
  const ref = searchParams.get("ref") ?? undefined;

  const [fullName, setFullName] = useState("");
  const [phoneWhatsapp, setPhoneWhatsapp] = useState("");
  const [email, setEmail] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  const packageQuery = useQuery({
    queryKey: ["public-package", slug, locale, ref],
    queryFn: () => getPublicPackageContext({
      slug,
      lang: locale,
      ...(ref ? { ref } : {})
    }),
    enabled: Boolean(slug)
  });

  const context = packageQuery.data?.ok ? packageQuery.data : null;
  const loadError = packageQuery.data && !packageQuery.data.ok ? packageQuery.data.error : null;

  const summary = useMemo(() => {
    if (!context) return [];
    return [
      { label: t("package.summary.sessions"), value: String(context.package.total_sessions) },
      {
        label: t("package.summary.validity"),
        value: context.package.validity_days ? t("package.summary.days", { count: context.package.validity_days }) : t("package.summary.noExpiry")
      },
      { label: t("package.summary.price"), value: currency(context.package.price, locale) }
    ];
  }, [context, locale, t]);

  const interestMutation = useMutation({
    mutationFn: () => {
      setFormError(null);

      if (!fullName.trim()) throw new Error("name_required");
      if (!phoneWhatsapp.trim()) throw new Error("phone_required");

      return registerPublicPackageInterest({
        slug,
        fullName,
        phoneWhatsapp,
        lang: locale,
        ...(email.trim() ? { email: email.trim() } : {}),
        ...(ref ? { ref } : {})
      });
    },
    onSuccess(data) {
      if (!data.ok) {
        setFormError(t(packageErrorKey(data.error)));
        return;
      }
      setSubmitted(true);
    },
    onError(error) {
      if (error instanceof Error && error.message === "name_required") {
        setFormError(t("package.error.name"));
        return;
      }
      if (error instanceof Error && error.message === "phone_required") {
        setFormError(t("package.error.phone"));
        return;
      }
      setFormError(t("package.error.submit"));
    }
  });

  return (
    <PublicLayout
      eyebrow={t("shell.package")}
      title={context?.package.name ?? t(loadError ? "common.notFound.title" : "package.title")}
      subtitle={context ? t("package.subtitle", { professionalName: context.professional.name }) : t("package.loadingSubtitle")}
    >
      <Card className="overflow-hidden rounded-lg border-zinc-200 shadow-lg shadow-teal-950/5">
        <CardHeader className="border-b border-zinc-100 bg-white">
          <CardTitle className="flex items-center gap-2 text-xl">
            <PackageCheck className="h-5 w-5 text-brand" aria-hidden="true" />
            {context?.package.name ?? t("package.card.title")}
          </CardTitle>
          {context?.service ? (
            <p className="text-sm text-zinc-600">{context.service.name}</p>
          ) : null}
        </CardHeader>
        <CardContent className="space-y-5 p-5">
          {packageQuery.isLoading ? (
            <p className="text-sm text-zinc-600">{t("common.loading")}</p>
          ) : null}

          {loadError ? (
            <div className="rounded-lg bg-red-50 p-4 text-sm text-red-700">
              {t(packageErrorKey(loadError))}
            </div>
          ) : null}

          {context ? (
            <>
              {context.package.description ? (
                <p className="text-sm leading-6 text-zinc-600">{context.package.description}</p>
              ) : null}

              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                {summary.map((item) => (
                  <div key={item.label} className="rounded-lg border border-zinc-200 bg-zinc-50 p-3">
                    <p className="text-xs font-medium text-zinc-500">{item.label}</p>
                    <p className="mt-1 text-base font-semibold text-zinc-950">{item.value}</p>
                  </div>
                ))}
              </div>

              {submitted ? (
                <div className="rounded-lg border border-teal-100 bg-teal-50 p-4 text-center text-sm font-medium text-teal-800">
                  <CheckCircle2 className="mx-auto mb-2 h-6 w-6" aria-hidden="true" />
                  {t("package.success")}
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="flex items-start gap-3 rounded-lg bg-teal-50 p-4 text-sm leading-6 text-teal-900">
                    <Gift className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
                    <p>{t("package.form.description")}</p>
                  </div>
                  <label className="block space-y-2">
                    <span className="text-sm font-semibold text-zinc-800">{t("booking.form.name")}</span>
                    <Input value={fullName} onChange={(event) => setFullName(event.target.value)} placeholder={t("booking.form.namePlaceholder")} />
                  </label>
                  <label className="block space-y-2">
                    <span className="text-sm font-semibold text-zinc-800">{t("booking.form.phone")}</span>
                    <Input value={phoneWhatsapp} onChange={(event) => setPhoneWhatsapp(event.target.value)} placeholder={t("booking.form.phonePlaceholder")} />
                  </label>
                  <label className="block space-y-2">
                    <span className="text-sm font-semibold text-zinc-800">{t("booking.form.email")}</span>
                    <Input value={email} onChange={(event) => setEmail(event.target.value)} placeholder={t("booking.form.emailPlaceholder")} />
                  </label>
                  {formError ? <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{formError}</p> : null}
                  <Button
                    type="button"
                    className="h-12 w-full bg-brand text-white hover:bg-brand/90"
                    disabled={interestMutation.isPending}
                    onClick={() => interestMutation.mutate()}
                  >
                    {interestMutation.isPending ? t("common.sending") : t("package.submit")}
                  </Button>
                </div>
              )}
            </>
          ) : null}
        </CardContent>
      </Card>
    </PublicLayout>
  );
}
