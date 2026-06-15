import { useEffect, useMemo, useState } from "react";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarDays, History, Home, LogOut, Package, PlusCircle, UserRound } from "lucide-react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, Input, Skeleton, cn } from "@iaprafaturar/ui";
import type {
  ClientPortalBookingContextOutput,
  ClientPortalContextOutput,
  ClientPortalErrorOutput
} from "@iaprafaturar/contracts/edge-functions/client-portal-handler";
import { useI18n } from "@/i18n";
import {
  createClientPortalAppointment,
  cancelClientPortalAppointment,
  completeClientPortalOnboarding,
  getClientPortalBookingContext,
  getClientPortalContext,
  getClientPortalHistory,
  getClientPortalPackages,
  logoutClientPortal,
  rescheduleClientPortalAppointment,
  updateClientPortalProfile
} from "@/lib/client-portal-api";
import {
  clearClientPortalToken,
  readClientPortalToken,
  writeClientPortalCache,
  writeClientPortalToken
} from "@/lib/client-portal-state";
import { buildPublicPath, readRefParam } from "@/lib/public-flow-state";

type PortalView = "home" | "historico" | "pacotes" | "agendar" | "onboarding";

const internalViews = new Set(["home", "historico", "pacotes", "agendar", "onboarding"]);

function isSuccess<T extends { ok: true }>(data: T | ClientPortalErrorOutput | undefined): data is T {
  return Boolean(data && data.ok === true);
}

export default function ClientPortalPage() {
  const { token } = useParams<{ token?: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const { locale, t } = useI18n();
  const [storedToken, setStoredToken] = useState<string | null>(() => readClientPortalToken());
  const ref = readRefParam(location.search);

  const pathView = location.pathname.split("/")[2] as PortalView | undefined;
  const isBootstrap = Boolean(token && !internalViews.has(token));
  const view: PortalView = internalViews.has(pathView ?? "") ? (pathView as PortalView) : "home";

  const bootstrapQuery = useQuery({
    queryKey: ["client-portal-bootstrap", token, locale],
    queryFn: () => getClientPortalContext(token ?? "", locale),
    enabled: isBootstrap
  });

  useEffect(() => {
    if (!isBootstrap || !token || !isSuccess(bootstrapQuery.data)) return;
    writeClientPortalToken(token);
    setStoredToken(token);
    writeClientPortalCache("last_context", bootstrapQuery.data);
    navigate(buildPublicPath("/portal/home", { lang: locale, ...(ref ? { ref } : {}) }), { replace: true });
  }, [bootstrapQuery.data, isBootstrap, locale, navigate, ref, token]);

  if (isBootstrap) {
    return (
      <PortalFrame title={t("portal.validating")} subtitle={t("portal.validatingSubtitle")}>
        <Card className="rounded-lg">
          <CardContent className="space-y-3 p-5">
            {bootstrapQuery.isError || bootstrapQuery.data?.ok === false ? (
              <PortalError message={t("portal.invalidAccess")} />
            ) : (
              <>
                <Skeleton className="h-8 w-2/3" />
                <Skeleton className="h-24 w-full rounded-lg" />
              </>
            )}
          </CardContent>
        </Card>
      </PortalFrame>
    );
  }

  if (!storedToken) {
    return (
      <PortalFrame title={t("portal.accessRequired")} subtitle={t("portal.accessSubtitle")}>
        <Card className="rounded-lg">
          <CardContent className="space-y-4 p-5">
            <PortalError message={t("portal.noSession")} />
            <p className="text-sm text-zinc-600">{t("portal.useLink")}</p>
          </CardContent>
        </Card>
      </PortalFrame>
    );
  }

  return <PortalDashboard sessionToken={storedToken} view={view} onLogout={() => setStoredToken(null)} />;
}

function PortalDashboard({ sessionToken, view, onLogout }: { sessionToken: string; view: PortalView; onLogout: () => void }) {
  const { locale, t } = useI18n();
  const location = useLocation();
  const navigate = useNavigate();
  const ref = readRefParam(location.search);

  const contextQuery = useQuery({
    queryKey: ["client-portal-context", sessionToken, locale],
    queryFn: () => getClientPortalContext(sessionToken, locale)
  });

  useEffect(() => {
    if (isSuccess(contextQuery.data)) {
      writeClientPortalCache("last_context", contextQuery.data);
      document.title = `${contextQuery.data.professional.public_name} | Portal`;
      document.querySelector('meta[name="theme-color"]')?.setAttribute("content", contextQuery.data.professional.brand_color ?? "#0f766e");
    }
  }, [contextQuery.data]);

  useEffect(() => {
    if (contextQuery.data?.ok !== false) return;
    if (contextQuery.data.error !== "invalid_session" && contextQuery.data.error !== "session_expired") return;
    clearClientPortalToken();
    onLogout();
  }, [contextQuery.data, onLogout]);

  const logoutMutation = useMutation({
    mutationFn: () => logoutClientPortal(sessionToken),
    onSettled() {
      clearClientPortalToken();
      onLogout();
      navigate(buildPublicPath("/portal/home", { lang: locale, ...(ref ? { ref } : {}) }), { replace: true });
    }
  });

  const context = isSuccess(contextQuery.data) ? contextQuery.data : null;
  const brandColor = context?.professional.brand_color ?? "#0f766e";

  useEffect(() => {
    if (!context?.client.onboarding_required || view === "onboarding") return;
    navigate(buildPublicPath("/portal/onboarding", { lang: locale, ...(ref ? { ref } : {}) }), { replace: true });
  }, [context?.client.onboarding_required, locale, navigate, ref, view]);

  if (contextQuery.isLoading) {
    return (
      <PortalFrame title={t("portal.title")} subtitle={t("portal.loading")} brandColor={brandColor}>
        <Skeleton className="h-72 w-full rounded-lg" />
      </PortalFrame>
    );
  }

  if (!context) {
    return (
      <PortalFrame title={t("portal.expired")} subtitle={t("portal.expiredSubtitle")}>
        <Card className="rounded-lg">
          <CardContent className="space-y-4 p-5">
            <PortalError message={t("portal.loadError")} />
            <Button type="button" className="w-full" onClick={() => logoutMutation.mutate()}>
              {t("portal.clearAccess")}
            </Button>
          </CardContent>
        </Card>
      </PortalFrame>
    );
  }

  return (
    <main
      className="min-h-dvh w-full max-w-[100vw] overflow-x-hidden bg-[#f7fbf9] pb-24 text-zinc-950"
      style={{ "--client-brand": brandColor } as React.CSSProperties}
    >
      <div className="mx-auto w-full max-w-3xl px-4 py-4">
        <header className="flex items-center justify-between gap-3 py-2">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-brand">{context.professional.public_name}</p>
            <h1 className="truncate text-2xl font-semibold">{t("portal.title")}</h1>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="shrink-0"
            onClick={() => logoutMutation.mutate()}
          >
            <LogOut className="h-4 w-4" />
          </Button>
        </header>

        <div className="py-4">
          {view === "home" ? <PortalHome sessionToken={sessionToken} context={context} refCode={ref} /> : null}
          {view === "historico" ? <PortalHistory sessionToken={sessionToken} /> : null}
          {view === "pacotes" ? <PortalPackages sessionToken={sessionToken} /> : null}
          {view === "agendar" ? <PortalBooking sessionToken={sessionToken} /> : null}
          {view === "onboarding" ? <PortalOnboarding sessionToken={sessionToken} context={context} refCode={ref} /> : null}
        </div>
      </div>
      <PortalNav active={view} refCode={ref} />
    </main>
  );
}

function PortalOnboarding({ sessionToken, context, refCode }: { sessionToken: string; context: ClientPortalContextOutput; refCode: string | undefined }) {
  const navigate = useNavigate();
  const { locale, t } = useI18n();
  const [fullName, setFullName] = useState(context.client.full_name);
  const [email, setEmail] = useState(context.client.email ?? "");
  const [contactPreference, setContactPreference] = useState<"whatsapp" | "email" | "both">("whatsapp");
  const [remindersOptIn, setRemindersOptIn] = useState(true);
  const [lgpdAccepted, setLgpdAccepted] = useState(Boolean(context.client.lgpd_consent_at));
  const [formError, setFormError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: () => (context.client.onboarding_required ? completeClientPortalOnboarding : updateClientPortalProfile)({
      sessionToken,
      fullName,
      ...(email.trim() ? { email: email.trim() } : {}),
      contactPreference,
      remindersOptIn
    }),
    onSuccess(data) {
      if (!data.ok) {
        setFormError(t("portal.profileError"));
        return;
      }
      navigate(buildPublicPath("/portal/home", { lang: locale, ...(refCode ? { ref: refCode } : {}) }), { replace: true });
    },
    onError() {
      setFormError(t("portal.profileError"));
    }
  });

  function submit() {
    setFormError(null);
    if (!fullName.trim()) {
      setFormError(t("clientOnboarding.error.name"));
      return;
    }
    if (!lgpdAccepted) {
      setFormError(t("clientOnboarding.error.lgpd"));
      return;
    }
    mutation.mutate();
  }

  return (
    <Card className="rounded-lg">
      <CardHeader>
        <Badge variant="secondary" className="w-fit">{t("portal.profileBadge")}</Badge>
        <CardTitle>{t("portal.profileTitle")}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <label className="block space-y-2">
          <span className="text-sm font-semibold text-zinc-800">{t("booking.form.name")}</span>
          <Input value={fullName} onChange={(event) => setFullName(event.target.value)} />
        </label>
        <label className="block space-y-2">
          <span className="text-sm font-semibold text-zinc-800">{t("booking.form.email")}</span>
          <Input value={email} type="email" onChange={(event) => setEmail(event.target.value)} />
        </label>

        <div className="space-y-2">
          <p className="text-sm font-semibold text-zinc-800">{t("clientOnboarding.preference.title")}</p>
          <div className="grid grid-cols-3 gap-2">
            {(["whatsapp", "email", "both"] as const).map((value) => (
              <button
                key={value}
                type="button"
                className={cn(
                  "min-h-12 rounded-lg border px-2 text-xs font-semibold",
                  contactPreference === value ? "border-brand bg-teal-50 text-brand" : "border-zinc-200 bg-white text-zinc-600"
                )}
                onClick={() => setContactPreference(value)}
              >
                {t(`clientOnboarding.preference.${value}`)}
              </button>
            ))}
          </div>
        </div>

        <label className="flex items-start gap-3 rounded-lg border border-zinc-200 bg-white p-4">
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

        {formError ? <PortalError message={formError} /> : null}

        <Button
          type="button"
          className="h-12 w-full bg-brand text-white hover:bg-brand/90"
          disabled={mutation.isPending}
          onClick={submit}
        >
          {mutation.isPending ? t("portal.saving") : t("portal.save")}
        </Button>
      </CardContent>
    </Card>
  );
}

function PortalHome({ sessionToken, context, refCode }: { sessionToken: string; context: ClientPortalContextOutput; refCode: string | undefined }) {
  const firstName = context.client.full_name.split(" ")[0] ?? context.client.full_name;
  const { locale, t } = useI18n();
  const queryClient = useQueryClient();
  const [newTime, setNewTime] = useState("");
  const appointment = context.next_appointment;
  const cancelMutation = useMutation({
    mutationFn: () => cancelClientPortalAppointment(sessionToken, appointment?.id ?? ""),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["client-portal-context", sessionToken] })
  });
  const rescheduleMutation = useMutation({
    mutationFn: () => rescheduleClientPortalAppointment(sessionToken, appointment?.id ?? "", new Date(newTime).toISOString()),
    onSuccess: () => {
      setNewTime("");
      queryClient.invalidateQueries({ queryKey: ["client-portal-context", sessionToken] });
    }
  });
  return (
    <div className="space-y-4">
      <Card className="rounded-lg">
        <CardHeader>
          <Badge variant="secondary" className="w-fit">{t("portal.home")}</Badge>
          <CardTitle className="text-xl">{t("portal.hello", { name: firstName })}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {context.next_appointment ? (
            <div className="rounded-lg border border-zinc-200 bg-white p-4">
              <p className="text-sm font-semibold text-zinc-800">{t("portal.nextAppointment")}</p>
              <p className="mt-1 text-lg font-semibold">{context.next_appointment.service_name ?? t("portal.appointment")}</p>
              <p className="text-sm text-zinc-600">{formatDateTime(context.next_appointment.scheduled_at, locale)}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Badge variant="secondary">{context.next_appointment.status}</Badge>
                {context.next_appointment.can_reschedule ? <Badge variant="outline">{t("portal.rescheduleAvailable")}</Badge> : null}
                {context.next_appointment.can_cancel ? <Badge variant="outline">{t("portal.cancelAvailable")}</Badge> : null}
              </div>
              {context.next_appointment.can_reschedule ? (
                <div className="mt-4 space-y-2">
                  <Input type="datetime-local" value={newTime} onChange={(event) => setNewTime(event.target.value)} />
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full"
                    disabled={!newTime || rescheduleMutation.isPending}
                    onClick={() => rescheduleMutation.mutate()}
                  >
                    {t("portal.reschedule")}
                  </Button>
                </div>
              ) : null}
              {context.next_appointment.can_cancel ? (
                <Button
                  type="button"
                  variant="ghost"
                  className="mt-2 w-full text-red-700"
                  disabled={cancelMutation.isPending}
                  onClick={() => cancelMutation.mutate()}
                >
                  {t("portal.cancel")}
                </Button>
              ) : null}
            </div>
          ) : (
            <div className="rounded-lg border border-dashed border-zinc-300 bg-white p-4">
              <p className="text-sm font-semibold text-zinc-800">{t("portal.noUpcoming")}</p>
              <p className="mt-1 text-sm text-zinc-600">{t("portal.noUpcomingDescription")}</p>
            </div>
          )}
          <div className="grid grid-cols-2 gap-2">
            <ActionLink to={buildPublicPath("/portal/agendar", { lang: locale, ...(refCode ? { ref: refCode } : {}) })} icon={PlusCircle} label={t("portal.book")} />
            <ActionLink to={buildPublicPath("/portal/pacotes", { lang: locale, ...(refCode ? { ref: refCode } : {}) })} icon={Package} label={t("portal.sessions", { count: context.packages_summary.total_remaining })} />
            <ActionLink to={buildPublicPath("/portal/onboarding", { lang: locale, ...(refCode ? { ref: refCode } : {}) })} icon={UserRound} label={t("portal.myData")} />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function PortalHistory({ sessionToken }: { sessionToken: string }) {
  const { t, locale } = useI18n();
  const query = useInfiniteQuery({
    queryKey: ["client-portal-history", sessionToken],
    queryFn: ({ pageParam }) => getClientPortalHistory(sessionToken, pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam(lastPage) {
      if (!isSuccess(lastPage) || lastPage.items.length < 20) return undefined;
      return lastPage.items.at(-1)?.session_date;
    }
  });

  if (query.isLoading) return <Skeleton className="h-72 w-full rounded-lg" />;
  const items = query.data?.pages.flatMap((page) => isSuccess(page) ? page.items : []) ?? [];
  if (query.isError) return <PortalError message={t("portal.historyError")} />;

  return (
    <Card className="rounded-lg">
      <CardHeader>
        <CardTitle>{t("portal.history")}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {items.length === 0 ? <p className="text-sm text-zinc-600">{t("portal.historyEmpty")}</p> : null}
        {items.map((item) => (
          <div key={item.id} className="rounded-lg border border-zinc-200 p-4">
            <p className="font-semibold">{item.service_name ?? t("portal.appointment")}</p>
            <p className="text-sm text-zinc-600">{formatDateTime(item.session_date, locale)}</p>
            {item.summary ? <p className="mt-2 text-sm leading-6 text-zinc-700">{item.summary}</p> : null}
          </div>
        ))}
        {query.hasNextPage ? (
          <Button type="button" variant="outline" className="w-full" disabled={query.isFetchingNextPage} onClick={() => query.fetchNextPage()}>
            {query.isFetchingNextPage ? t("common.loading") : t("portal.loadMore")}
          </Button>
        ) : null}
      </CardContent>
    </Card>
  );
}

function PortalPackages({ sessionToken }: { sessionToken: string }) {
  const { t, locale } = useI18n();
  const query = useQuery({
    queryKey: ["client-portal-packages", sessionToken],
    queryFn: () => getClientPortalPackages(sessionToken)
  });

  if (query.isLoading) return <Skeleton className="h-72 w-full rounded-lg" />;
  if (!isSuccess(query.data)) return <PortalError message={t("portal.packagesError")} />;

  return (
    <Card className="rounded-lg">
      <CardHeader>
        <CardTitle>{t("portal.packages")}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {query.data.items.length === 0 ? <p className="text-sm text-zinc-600">{t("portal.packagesEmpty")}</p> : null}
        {query.data.items.map((item) => (
          <div key={item.id} className="rounded-lg border border-zinc-200 p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-semibold">{item.name}</p>
                <p className="text-sm text-zinc-600">{t("portal.packageRemaining", { remaining: item.sessions_remaining, total: item.sessions_total })}</p>
              </div>
              <Badge variant={item.status === "ativo" ? "secondary" : "outline"}>{item.status}</Badge>
            </div>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-zinc-100">
              <div
                className="h-full bg-brand"
                style={{ width: `${Math.max(0, Math.min(100, (item.sessions_remaining / item.sessions_total) * 100))}%` }}
              />
            </div>
            {item.expires_at ? <p className="mt-2 text-xs text-zinc-500">{t("portal.validUntil", { date: formatDate(item.expires_at, locale) })}</p> : null}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function PortalBooking({ sessionToken }: { sessionToken: string }) {
  const { locale, t } = useI18n();
  const [serviceId, setServiceId] = useState("");
  const [scheduledAt, setScheduledAt] = useState("");
  const query = useQuery({
    queryKey: ["client-portal-booking", sessionToken, locale],
    queryFn: () => getClientPortalBookingContext(sessionToken, locale)
  });

  const mutation = useMutation({
    mutationFn: () => createClientPortalAppointment({ sessionToken, serviceId, scheduledAt }),
    onSuccess(data) {
      if (data.ok) {
        setServiceId("");
        setScheduledAt("");
      }
    }
  });

  const selectedService = useMemo(() => {
    if (!isSuccess<ClientPortalBookingContextOutput>(query.data)) return null;
    return query.data.services.find((service) => service.id === serviceId) ?? null;
  }, [query.data, serviceId]);

  if (query.isLoading) return <Skeleton className="h-72 w-full rounded-lg" />;
  if (!isSuccess(query.data)) return <PortalError message={t("portal.bookingError")} />;

  return (
    <Card className="rounded-lg">
      <CardHeader>
        <CardTitle>{t("portal.book")}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-2">
          {query.data.services.map((service) => (
            <button
              key={service.id}
              type="button"
              className={cn(
                "rounded-lg border p-3 text-left text-sm",
                serviceId === service.id ? "border-brand bg-teal-50 text-brand" : "border-zinc-200 bg-white"
              )}
              onClick={() => setServiceId(service.id)}
            >
              <span className="block font-semibold">{service.name}</span>
              <span className="text-xs text-zinc-500">{service.duration_minutes} min</span>
            </button>
          ))}
        </div>

        {selectedService ? (
          <div className="grid grid-cols-2 gap-2">
            {query.data.available_slots.slice(0, 12).map((slot) => (
              <button
                key={slot.scheduled_at}
                type="button"
                className={cn(
                  "min-h-12 rounded-lg border px-2 text-xs font-semibold",
                  scheduledAt === slot.scheduled_at ? "border-brand bg-brand text-white" : "border-zinc-200 bg-white text-zinc-700"
                )}
                onClick={() => setScheduledAt(slot.scheduled_at)}
              >
                {slot.label}
              </button>
            ))}
          </div>
        ) : null}

        {mutation.data?.ok === false ? <PortalError message={t("booking.error.submit")} /> : null}
        {mutation.data?.ok === true ? <p className="rounded-lg bg-teal-50 p-3 text-sm text-teal-800">{t("booking.success.title")}</p> : null}

        <Button
          type="button"
          className="h-12 w-full bg-brand text-white hover:bg-brand/90"
          disabled={!serviceId || !scheduledAt || mutation.isPending}
          onClick={() => mutation.mutate()}
        >
          {mutation.isPending ? t("common.sending") : t("booking.submit")}
        </Button>
      </CardContent>
    </Card>
  );
}

function PortalFrame({ title, subtitle, brandColor, children }: { title: string; subtitle: string; brandColor?: string; children: React.ReactNode }) {
  const { t } = useI18n();
  return (
    <main
      className="flex min-h-dvh w-full max-w-[100vw] items-center justify-center overflow-x-hidden bg-[#f7fbf9] px-4 py-8 text-zinc-950"
      style={{ "--client-brand": brandColor ?? "#0f766e" } as React.CSSProperties}
    >
      <section className="w-full max-w-md space-y-5">
        <div>
          <p className="text-sm font-semibold text-brand">{t("portal.title")}</p>
          <h1 className="mt-1 text-3xl font-semibold">{title}</h1>
          <p className="mt-2 text-sm leading-6 text-zinc-600">{subtitle}</p>
        </div>
        {children}
      </section>
    </main>
  );
}

function PortalNav({ active, refCode }: { active: PortalView; refCode: string | undefined }) {
  const { locale, t } = useI18n();
  const items = [
    { view: "home" as const, label: t("portal.home"), icon: Home, to: "/portal/home" },
    { view: "historico" as const, label: t("portal.history"), icon: History, to: "/portal/historico" },
    { view: "pacotes" as const, label: t("portal.packages"), icon: Package, to: "/portal/pacotes" },
    { view: "agendar" as const, label: t("portal.book"), icon: CalendarDays, to: "/portal/agendar" }
  ];

  return (
    <nav className="fixed inset-x-0 bottom-0 border-t border-zinc-200 bg-white/95 px-3 py-2 shadow-lg backdrop-blur">
      <div className="mx-auto grid max-w-3xl grid-cols-4 gap-1">
        {items.map((item) => (
          <Link
            key={item.view}
            to={buildPublicPath(item.to, { lang: locale, ...(refCode ? { ref: refCode } : {}) })}
            className={cn(
              "flex h-14 flex-col items-center justify-center rounded-lg text-[11px] font-semibold",
              active === item.view ? "bg-teal-50 text-brand" : "text-zinc-500"
            )}
          >
            <item.icon className="mb-1 h-4 w-4" />
            {item.label}
          </Link>
        ))}
      </div>
    </nav>
  );
}

function ActionLink({ to, icon: Icon, label }: { to: string; icon: typeof PlusCircle; label: string }) {
  return (
    <Link to={to} className="flex min-h-20 flex-col items-center justify-center rounded-lg border border-zinc-200 bg-white p-3 text-center text-sm font-semibold text-zinc-800">
      <Icon className="mb-2 h-5 w-5 text-brand" />
      {label}
    </Link>
  );
}

function PortalError({ message }: { message: string }) {
  return <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{message}</p>;
}

function formatDateTime(value: string, locale = "pt-BR") {
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value));
}

function formatDate(value: string, locale = "pt-BR") {
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium"
  }).format(new Date(value));
}
