import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { CalendarCheck, CheckCircle2, Clock, Scissors, UserRound, type LucideIcon } from "lucide-react";
import { useLocation, useParams } from "react-router-dom";
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, Input, Skeleton, cn } from "@iaprafaturar/ui";
import { useI18n } from "@/i18n";
import { createPublicAppointment, getPublicBookingContext } from "@/lib/public-booking-api";
import { readRefParam } from "@/lib/public-flow-state";
import { PublicLayout } from "./PublicLayout";
import type {
  PublicBookingContextOutput,
  PublicBookingCreateAppointmentOutput,
  PublicBookingErrorOutput
} from "@iaprafaturar/contracts/edge-functions/public-booking-handler";

type FlowStep = "service" | "time" | "client" | "confirm";
type BookingStep = FlowStep | "success";

const stepOrder: FlowStep[] = ["service", "time", "client", "confirm"];
const stepIcons: Record<FlowStep, LucideIcon> = {
  service: Scissors,
  time: Clock,
  client: UserRound,
  confirm: CalendarCheck
};

function formatPrice(value: number | undefined, locale: string) {
  if (value === undefined) return null;
  return new Intl.NumberFormat(locale, { style: "currency", currency: "BRL" }).format(value);
}

function formatDateTime(value: string, locale: string) {
  return new Intl.DateTimeFormat(locale, {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

function isContext(data: unknown): data is PublicBookingContextOutput {
  return Boolean(data && typeof data === "object" && "professional" in data);
}

function isAppointmentOutput(data: unknown): data is PublicBookingCreateAppointmentOutput {
  return Boolean(data && typeof data === "object" && "confirmation_status" in data);
}

function getConfirmationKey(status: PublicBookingCreateAppointmentOutput["confirmation_status"]) {
  if (status === "dry_run") return "booking.success.confirmation.dryRun";
  return `booking.success.confirmation.${status}` as const;
}

function getBookingErrorKey(error: PublicBookingErrorOutput["error"]) {
  if (error === "service_not_available") return "booking.error.serviceUnavailable";
  if (error === "scheduled_at_must_be_future") return "booking.error.futureTime";
  if (error === "invalid_input") return "booking.error.invalidInput";
  if (error === "not_found") return "booking.error.load";
  return "booking.error.submit";
}

export default function PublicBookingPage() {
  const { slug = "" } = useParams<{ slug: string }>();
  const location = useLocation();
  const { locale, t } = useI18n();
  const ref = readRefParam(location.search);

  const [step, setStep] = useState<BookingStep>("service");
  const [selectedServiceId, setSelectedServiceId] = useState("");
  const [selectedSlot, setSelectedSlot] = useState("");
  const [fullName, setFullName] = useState("");
  const [phoneWhatsapp, setPhoneWhatsapp] = useState("");
  const [email, setEmail] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  const contextQuery = useQuery({
    queryKey: ["public-booking-context", slug, locale, ref],
    queryFn: () => getPublicBookingContext({ slug, lang: locale, ...(ref ? { ref } : {}) }),
    enabled: Boolean(slug)
  });

  const context = isContext(contextQuery.data) ? contextQuery.data : null;
  const selectedService = context?.services.find((service) => service.id === selectedServiceId) ?? null;
  const selectedSlotLabel = selectedSlot ? formatDateTime(selectedSlot, locale) : "";

  const submitMutation = useMutation({
    mutationFn: () => {
      if (!selectedServiceId) throw new Error("missing_service");
      if (!selectedSlot) throw new Error("missing_time");
      return createPublicAppointment({
        slug,
        serviceId: selectedServiceId,
        scheduledAt: selectedSlot,
        fullName,
        phoneWhatsapp,
        lang: locale,
        ...(email.trim() ? { email: email.trim() } : {}),
        ...(ref ? { ref } : {})
      });
    },
    onSuccess(data) {
      if ("ok" in data && data.ok === false) {
        setFormError(t(getBookingErrorKey(data.error)));
        return;
      }
      setStep("success");
    },
    onError() {
      setFormError(t("booking.error.submit"));
    }
  });

  const confirmationText = useMemo(() => {
    const data = submitMutation.data;
    if (!isAppointmentOutput(data)) return null;
    return t(getConfirmationKey(data.confirmation_status));
  }, [submitMutation.data, t]);

  function goNext() {
    setFormError(null);
    if (step === "service") {
      if (!selectedServiceId) {
        setFormError(t("booking.error.service"));
        return;
      }
      setStep("time");
      return;
    }
    if (step === "time") {
      if (!selectedSlot) {
        setFormError(t("booking.error.time"));
        return;
      }
      setStep("client");
      return;
    }
    if (step === "client") {
      if (!fullName.trim()) {
        setFormError(t("booking.error.name"));
        return;
      }
      if (!phoneWhatsapp.trim()) {
        setFormError(t("booking.error.phone"));
        return;
      }
      setStep("confirm");
    }
  }

  function goBack() {
    setFormError(null);
    if (step === "success") return;
    const currentIndex = stepOrder.indexOf(step);
    if (currentIndex > 0) setStep(stepOrder[currentIndex - 1] ?? "service");
  }

  const titleByStep = {
    service: t("booking.service.title"),
    time: t("booking.time.title"),
    client: t("booking.client.title"),
    confirm: t("booking.confirm.title")
  };

  const descriptionByStep = {
    service: t("booking.service.description"),
    time: t("booking.time.description"),
    client: t("booking.client.description"),
    confirm: t("booking.confirm.description")
  };

  if (contextQuery.isLoading) {
    return (
      <PublicLayout eyebrow={t("shell.booking")} title={t("booking.title")} subtitle={t("common.loading")}>
        <Card className="rounded-lg">
          <CardContent className="space-y-4 p-5">
            <Skeleton className="h-8 w-2/3" />
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-full" />
          </CardContent>
        </Card>
      </PublicLayout>
    );
  }

  if (!context || contextQuery.data?.ok === false) {
    return (
      <PublicLayout eyebrow={t("shell.booking")} title={t("common.notFound.title")} subtitle={t("booking.error.load")}>
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
      eyebrow={t("shell.booking")}
      title={t("booking.title")}
      subtitle={t("booking.subtitle", { professionalName: context.professional.public_name })}
      {...(context.professional.brand_color ? { brandColor: context.professional.brand_color } : {})}
    >
      <Card className="overflow-hidden rounded-lg border-zinc-200 shadow-lg shadow-teal-950/5">
        <CardHeader className="space-y-4 border-b border-zinc-100 bg-white">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary">{t("booking.slug.label")}</Badge>
            <span className="max-w-full truncate text-sm font-medium text-zinc-700">{context.professional.slug}</span>
          </div>
          <div className="grid grid-cols-4 gap-2">
            {stepOrder.map((item) => {
              const Icon = stepIcons[item];
              const isActive = item === step;
              const isDone = stepOrder.indexOf(item) < stepOrder.indexOf(step as FlowStep) || step === "success";
              return (
                <div
                  key={item}
                  className={cn(
                    "flex h-14 flex-col items-center justify-center rounded-lg border text-[11px] font-semibold",
                    isActive && "border-brand bg-teal-50 text-brand",
                    isDone && "border-brand bg-brand text-white",
                    !isActive && !isDone && "border-zinc-200 bg-zinc-50 text-zinc-500"
                  )}
                >
                  <Icon className="mb-1 h-4 w-4" aria-hidden="true" />
                  <span className="truncate px-1">{t(`booking.step.${item}`)}</span>
                </div>
              );
            })}
          </div>
          {step !== "success" ? (
            <div className="space-y-1">
              <CardTitle className="text-xl">{titleByStep[step]}</CardTitle>
              <p className="text-sm leading-6 text-zinc-600">{descriptionByStep[step]}</p>
            </div>
          ) : null}
        </CardHeader>

        <CardContent className="space-y-5 p-5">
          {step === "service" ? (
            context.services.length > 0 ? (
              <div className="space-y-3">
                {context.services.map((service) => (
                  <button
                    key={service.id}
                    type="button"
                    className={cn(
                      "w-full rounded-lg border p-4 text-left transition",
                      selectedServiceId === service.id
                        ? "border-brand bg-teal-50 shadow-sm"
                        : "border-zinc-200 bg-white hover:border-zinc-300"
                    )}
                    onClick={() => setSelectedServiceId(service.id)}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 space-y-1">
                        <p className="font-semibold text-zinc-950">{service.name}</p>
                        {service.description ? <p className="text-sm leading-6 text-zinc-600">{service.description}</p> : null}
                      </div>
                      <div className="shrink-0 text-right text-sm text-zinc-600">
                        <p>{t("common.minute", { count: service.duration_minutes })}</p>
                        {formatPrice(service.price, locale) ? <p className="font-semibold text-zinc-950">{formatPrice(service.price, locale)}</p> : null}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            ) : (
              <EmptyState title={t("booking.empty.title")} description={t("booking.empty.description")} />
            )
          ) : null}

          {step === "time" ? (
            context.available_slots.length > 0 ? (
              <div className="grid grid-cols-2 gap-3">
                {context.available_slots.map((slot) => (
                  <button
                    key={slot.scheduled_at}
                    type="button"
                    className={cn(
                      "rounded-lg border p-3 text-left transition",
                      selectedSlot === slot.scheduled_at
                        ? "border-brand bg-teal-50 shadow-sm"
                        : "border-zinc-200 bg-white hover:border-zinc-300"
                    )}
                    onClick={() => setSelectedSlot(slot.scheduled_at)}
                  >
                    <p className="text-sm font-semibold text-zinc-950">{formatDateTime(slot.scheduled_at, locale)}</p>
                    <p className="text-xs text-zinc-500">{slot.label}</p>
                  </button>
                ))}
              </div>
            ) : (
              <EmptyState title={t("booking.noSlots.title")} description={t("booking.noSlots.description")} />
            )
          ) : null}

          {step === "client" ? (
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
          ) : null}

          {step === "confirm" ? (
            <div className="space-y-3">
              <SummaryRow label={t("booking.summary.service")} value={selectedService?.name ?? ""} />
              <SummaryRow label={t("booking.summary.time")} value={selectedSlotLabel} />
              <SummaryRow label={t("booking.summary.contact")} value={`${fullName} · ${phoneWhatsapp}`} />
            </div>
          ) : null}

          {step === "success" ? (
            <div className="space-y-4 text-center">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-teal-100 text-teal-700">
                <CheckCircle2 className="h-7 w-7" aria-hidden="true" />
              </div>
              <div className="space-y-2">
                <h2 className="text-2xl font-semibold text-zinc-950">{t("booking.success.title")}</h2>
                <p className="text-sm leading-6 text-zinc-600">{t("booking.success.description")}</p>
                {confirmationText ? <p className="text-sm font-medium text-brand">{confirmationText}</p> : null}
              </div>
            </div>
          ) : null}

          {formError ? <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{formError}</p> : null}

          {step !== "success" ? (
            <div className="flex gap-3">
              {step !== "service" ? (
                <Button type="button" variant="outline" className="h-12 flex-1" onClick={goBack}>
                  {t("common.back")}
                </Button>
              ) : null}
              {step === "confirm" ? (
                <Button
                  type="button"
                  className="h-12 flex-[2] bg-brand text-white hover:bg-brand/90"
                  disabled={submitMutation.isPending}
                  onClick={() => submitMutation.mutate()}
                >
                  {submitMutation.isPending ? t("common.sending") : t("booking.submit")}
                </Button>
              ) : (
                <Button type="button" className="h-12 flex-[2] bg-brand text-white hover:bg-brand/90" onClick={goNext}>
                  {t("common.continue")}
                </Button>
              )}
            </div>
          ) : null}
        </CardContent>
      </Card>
    </PublicLayout>
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

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-zinc-200 bg-[#fbfdfc] p-4">
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500">{label}</p>
      <p className="mt-1 text-sm font-semibold text-zinc-950">{value}</p>
    </div>
  );
}

function EmptyState({ title, description }: { title: string; description: string }) {
  return (
    <div className="rounded-lg border border-dashed border-zinc-300 bg-zinc-50 p-5 text-center">
      <p className="font-semibold text-zinc-950">{title}</p>
      <p className="mt-2 text-sm leading-6 text-zinc-600">{description}</p>
    </div>
  );
}
