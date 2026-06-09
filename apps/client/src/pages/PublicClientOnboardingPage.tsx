import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Bell, ShieldCheck, UserRound, type LucideIcon } from "lucide-react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, Input, Skeleton, cn } from "@iaprafaturar/ui";
import { useI18n } from "@/i18n";
import {
  completeClientOnboarding,
  getPublicBookingContext
} from "@/lib/public-booking-api";
import { buildPublicSearchParams, readRefParam } from "@/lib/public-flow-state";
import { PublicLayout } from "./PublicLayout";
import type {
  PublicBookingContextOutput,
  PublicBookingErrorOutput
} from "@iaprafaturar/contracts/edge-functions/public-booking-handler";

type ContactPreference = "whatsapp" | "email" | "both";

function isContext(data: unknown): data is PublicBookingContextOutput {
  return Boolean(data && typeof data === "object" && "professional" in data);
}

function getOnboardingErrorKey(error: PublicBookingErrorOutput["error"]) {
  if (error === "not_found") return "clientOnboarding.error.load";
  if (error === "invalid_input") return "clientOnboarding.error.invalidInput";
  return "clientOnboarding.error.submit";
}

export default function PublicClientOnboardingPage() {
  const { slug = "" } = useParams<{ slug: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const { locale, t } = useI18n();
  const ref = readRefParam(location.search);

  const [fullName, setFullName] = useState("");
  const [phoneWhatsapp, setPhoneWhatsapp] = useState("");
  const [email, setEmail] = useState("");
  const [contactPreference, setContactPreference] = useState<ContactPreference>("whatsapp");
  const [remindersOptIn, setRemindersOptIn] = useState(true);
  const [lgpdAccepted, setLgpdAccepted] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const contextQuery = useQuery({
    queryKey: ["public-client-onboarding-context", slug, locale, ref],
    queryFn: () => getPublicBookingContext({ slug, lang: locale, ...(ref ? { ref } : {}) }),
    enabled: Boolean(slug)
  });

  const context = isContext(contextQuery.data) ? contextQuery.data : null;

  const submitMutation = useMutation({
    mutationFn: () => completeClientOnboarding({
      slug,
      fullName,
      phoneWhatsapp,
      ...(email.trim() ? { email: email.trim() } : {}),
      lgpdAccepted: true,
      contactPreference,
      remindersOptIn,
      lang: locale,
      ...(ref ? { ref } : {})
    }),
    onSuccess(data) {
      if ("ok" in data && data.ok === false) {
        setFormError(t(getOnboardingErrorKey(data.error)));
        return;
      }

      navigate(`/agendar/${slug}?${buildPublicSearchParams({ lang: locale, ...(ref ? { ref } : {}) })}`);
    },
    onError() {
      setFormError(t("clientOnboarding.error.submit"));
    }
  });

  function submit() {
    setFormError(null);
    if (!fullName.trim()) {
      setFormError(t("clientOnboarding.error.name"));
      return;
    }
    if (!phoneWhatsapp.trim()) {
      setFormError(t("clientOnboarding.error.phone"));
      return;
    }
    if (!lgpdAccepted) {
      setFormError(t("clientOnboarding.error.lgpd"));
      return;
    }
    submitMutation.mutate();
  }

  if (contextQuery.isLoading) {
    return (
      <PublicLayout eyebrow={t("shell.client")} title={t("clientOnboarding.title")} subtitle={t("common.loading")}>
        <Card className="rounded-lg">
          <CardContent className="space-y-4 p-5">
            <Skeleton className="h-8 w-2/3" />
            <Skeleton className="h-28 w-full" />
            <Skeleton className="h-28 w-full" />
          </CardContent>
        </Card>
      </PublicLayout>
    );
  }

  if (!context || contextQuery.data?.ok === false) {
    return (
      <PublicLayout eyebrow={t("shell.client")} title={t("common.notFound.title")} subtitle={t("clientOnboarding.error.load")}>
        <Card className="rounded-lg">
          <CardContent className="space-y-4 p-5">
            <p className="text-sm leading-6 text-zinc-600">{t("common.notFound.description")}</p>
            <Button type="button" className="w-full bg-brand text-white hover:bg-brand/90" onClick={() => contextQuery.refetch()}>
              {t("common.tryAgain")}
            </Button>
          </CardContent>
        </Card>
      </PublicLayout>
    );
  }

  return (
    <PublicLayout
      eyebrow={t("shell.client")}
      title={t("clientOnboarding.title")}
      subtitle={t("clientOnboarding.subtitle", { professionalName: context.professional.public_name })}
      {...(context.professional.brand_color ? { brandColor: context.professional.brand_color } : {})}
    >
      <Card className="w-full max-w-full overflow-hidden rounded-lg border-zinc-200 shadow-lg shadow-teal-950/5">
        <CardHeader className="space-y-4 border-b border-zinc-100 bg-white">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary">{t("clientOnboarding.badge")}</Badge>
            <span className="max-w-full truncate text-sm font-medium text-zinc-700">{context.professional.public_name}</span>
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <StepIcon icon={UserRound} label={t("clientOnboarding.step.identity")} active />
            <StepIcon icon={ShieldCheck} label={t("clientOnboarding.step.consent")} active />
            <StepIcon icon={Bell} label={t("clientOnboarding.step.preferences")} active />
          </div>
          <div className="space-y-1">
            <CardTitle className="text-xl">{t("clientOnboarding.card.title")}</CardTitle>
            <p className="break-words text-sm leading-6 text-zinc-600">{t("clientOnboarding.card.description")}</p>
          </div>
        </CardHeader>

        <CardContent className="space-y-5 p-5">
          <div className="space-y-4">
            <Field label={t("booking.form.name")} required>
              <Input value={fullName} placeholder={t("booking.form.namePlaceholder")} onChange={(event) => setFullName(event.target.value)} />
            </Field>
            <Field label={t("booking.form.phone")} required>
              <Input
                value={phoneWhatsapp}
                inputMode="tel"
                placeholder={t("booking.form.phonePlaceholder")}
                onChange={(event) => setPhoneWhatsapp(event.target.value)}
              />
            </Field>
            <Field label={t("booking.form.email")}>
              <Input
                value={email}
                type="email"
                inputMode="email"
                placeholder={t("booking.form.emailPlaceholder")}
                onChange={(event) => setEmail(event.target.value)}
              />
            </Field>
          </div>

          <div className="space-y-3">
            <p className="text-sm font-semibold text-zinc-800">{t("clientOnboarding.preference.title")}</p>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              {(["whatsapp", "email", "both"] as const).map((value) => (
                <button
                  key={value}
                  type="button"
                  className={cn(
                    "min-h-14 rounded-lg border px-2 py-3 text-center text-xs font-semibold transition",
                    contactPreference === value
                      ? "border-brand bg-teal-50 text-brand"
                      : "border-zinc-200 bg-white text-zinc-600 hover:border-zinc-300"
                  )}
                  onClick={() => setContactPreference(value)}
                >
                  {t(`clientOnboarding.preference.${value}`)}
                </button>
              ))}
            </div>
          </div>

          <label className="flex items-start gap-3 rounded-lg border border-zinc-200 bg-[#fbfdfc] p-4">
            <input
              type="checkbox"
              className="mt-1 h-4 w-4 rounded border-zinc-300 text-brand focus:ring-brand"
              checked={remindersOptIn}
              onChange={(event) => setRemindersOptIn(event.target.checked)}
            />
            <span className="text-sm leading-6 text-zinc-700">{t("clientOnboarding.reminders")}</span>
          </label>

          <label className="flex items-start gap-3 rounded-lg border border-zinc-200 bg-white p-4">
            <input
              type="checkbox"
              className="mt-1 h-4 w-4 rounded border-zinc-300 text-brand focus:ring-brand"
              checked={lgpdAccepted}
              onChange={(event) => setLgpdAccepted(event.target.checked)}
            />
            <span className="text-sm leading-6 text-zinc-700">{t("clientOnboarding.lgpd")}</span>
          </label>

          {formError ? <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{formError}</p> : null}

          <Button
            type="button"
            className="h-12 w-full bg-brand text-white hover:bg-brand/90"
            disabled={submitMutation.isPending}
            onClick={submit}
          >
            {submitMutation.isPending ? t("common.sending") : t("clientOnboarding.submit")}
          </Button>
        </CardContent>
      </Card>
    </PublicLayout>
  );
}

function StepIcon({ icon: Icon, label, active }: { icon: LucideIcon; label: string; active?: boolean }) {
  return (
    <div className={cn(
      "flex h-14 flex-col items-center justify-center rounded-lg border text-[11px] font-semibold",
      active ? "border-brand bg-teal-50 text-brand" : "border-zinc-200 bg-zinc-50 text-zinc-500"
    )}>
      <Icon className="mb-1 h-4 w-4" aria-hidden="true" />
      <span className="truncate px-1">{label}</span>
    </div>
  );
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  const { t } = useI18n();
  return (
    <label className="block space-y-2">
      <span className="flex items-center gap-2 text-sm font-semibold text-zinc-800">
        {label}
        {required ? <span className="text-xs font-medium text-brand">{t("common.required")}</span> : null}
      </span>
      {children}
    </label>
  );
}
