import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { CalendarDays, History, Home, LogOut, Package, PlusCircle } from "lucide-react";
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
  completeClientPortalOnboarding,
  getClientPortalBookingContext,
  getClientPortalContext,
  getClientPortalHistory,
  getClientPortalPackages,
  logoutClientPortal
} from "@/lib/client-portal-api";
import {
  clearClientPortalToken,
  clientPortalCacheKey,
  readClientPortalToken,
  writeClientPortalToken
} from "@/lib/client-portal-state";

type PortalView = "home" | "historico" | "pacotes" | "agendar" | "onboarding";

const internalViews = new Set(["home", "historico", "pacotes", "agendar", "onboarding"]);

function isSuccess<T extends { ok: true }>(data: T | ClientPortalErrorOutput | undefined): data is T {
  return Boolean(data && data.ok === true);
}

export default function ClientPortalPage() {
  const { token } = useParams<{ token?: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const { locale } = useI18n();
  const [storedToken, setStoredToken] = useState<string | null>(() => readClientPortalToken());

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
    window.localStorage.setItem(clientPortalCacheKey("last_context"), JSON.stringify(bootstrapQuery.data));
    navigate("/portal/home", { replace: true });
  }, [bootstrapQuery.data, isBootstrap, navigate, token]);

  if (isBootstrap) {
    return (
      <PortalFrame title="Validando acesso" subtitle="Abrindo seu portal com seguranca.">
        <Card className="rounded-lg">
          <CardContent className="space-y-3 p-5">
            {bootstrapQuery.isError || bootstrapQuery.data?.ok === false ? (
              <PortalError message="Este acesso nao esta valido ou expirou." />
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
      <PortalFrame title="Acesso necessario" subtitle="Abra o link recebido para entrar no portal.">
        <Card className="rounded-lg">
          <CardContent className="space-y-4 p-5">
            <PortalError message="Nao encontramos uma sessao ativa neste aparelho." />
            <Button asChild className="w-full bg-brand text-white hover:bg-brand/90">
              <Link to="/agendar/demo">Ir para agendamento</Link>
            </Button>
          </CardContent>
        </Card>
      </PortalFrame>
    );
  }

  return <PortalDashboard sessionToken={storedToken} view={view} onLogout={() => setStoredToken(null)} />;
}

function PortalDashboard({ sessionToken, view, onLogout }: { sessionToken: string; view: PortalView; onLogout: () => void }) {
  const { locale } = useI18n();
  const navigate = useNavigate();

  const contextQuery = useQuery({
    queryKey: ["client-portal-context", sessionToken, locale],
    queryFn: () => getClientPortalContext(sessionToken, locale)
  });

  useEffect(() => {
    if (isSuccess(contextQuery.data)) {
      window.localStorage.setItem(clientPortalCacheKey("last_context"), JSON.stringify(contextQuery.data));
      document.title = `${contextQuery.data.professional.public_name} | Portal`;
      document.querySelector('meta[name="theme-color"]')?.setAttribute("content", contextQuery.data.professional.brand_color ?? "#0f766e");
    }
  }, [contextQuery.data]);

  const logoutMutation = useMutation({
    mutationFn: () => logoutClientPortal(sessionToken),
    onSettled() {
      clearClientPortalToken();
      onLogout();
      navigate("/portal/home", { replace: true });
    }
  });

  const context = isSuccess(contextQuery.data) ? contextQuery.data : null;
  const brandColor = context?.professional.brand_color ?? "#0f766e";

  useEffect(() => {
    if (!context?.client.onboarding_required || view === "onboarding") return;
    navigate("/portal/onboarding", { replace: true });
  }, [context?.client.onboarding_required, navigate, view]);

  if (contextQuery.isLoading) {
    return (
      <PortalFrame title="Portal" subtitle="Carregando seus dados." brandColor={brandColor}>
        <Skeleton className="h-72 w-full rounded-lg" />
      </PortalFrame>
    );
  }

  if (!context) {
    return (
      <PortalFrame title="Sessao expirada" subtitle="Abra novamente o link recebido.">
        <Card className="rounded-lg">
          <CardContent className="space-y-4 p-5">
            <PortalError message="Nao foi possivel carregar sua sessao." />
            <Button type="button" className="w-full" onClick={() => logoutMutation.mutate()}>
              Limpar acesso
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
            <h1 className="truncate text-2xl font-semibold">Portal do cliente</h1>
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
          {view === "home" ? <PortalHome context={context} /> : null}
          {view === "historico" ? <PortalHistory sessionToken={sessionToken} /> : null}
          {view === "pacotes" ? <PortalPackages sessionToken={sessionToken} /> : null}
          {view === "agendar" ? <PortalBooking sessionToken={sessionToken} /> : null}
          {view === "onboarding" ? <PortalOnboarding sessionToken={sessionToken} context={context} /> : null}
        </div>
      </div>
      <PortalNav active={view} />
    </main>
  );
}

function PortalOnboarding({ sessionToken, context }: { sessionToken: string; context: ClientPortalContextOutput }) {
  const navigate = useNavigate();
  const [fullName, setFullName] = useState(context.client.full_name);
  const [email, setEmail] = useState(context.client.email ?? "");
  const [contactPreference, setContactPreference] = useState<"whatsapp" | "email" | "both">("whatsapp");
  const [remindersOptIn, setRemindersOptIn] = useState(true);
  const [lgpdAccepted, setLgpdAccepted] = useState(Boolean(context.client.lgpd_consent_at));
  const [formError, setFormError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: () => completeClientPortalOnboarding({
      sessionToken,
      fullName,
      ...(email.trim() ? { email: email.trim() } : {}),
      contactPreference,
      remindersOptIn
    }),
    onSuccess(data) {
      if (!data.ok) {
        setFormError("Nao foi possivel concluir sua confirmacao.");
        return;
      }
      navigate("/portal/home", { replace: true });
    },
    onError() {
      setFormError("Nao foi possivel concluir sua confirmacao.");
    }
  });

  function submit() {
    setFormError(null);
    if (!fullName.trim()) {
      setFormError("Informe seu nome.");
      return;
    }
    if (!lgpdAccepted) {
      setFormError("Aceite a autorizacao para continuar.");
      return;
    }
    mutation.mutate();
  }

  return (
    <Card className="rounded-lg">
      <CardHeader>
        <Badge variant="secondary" className="w-fit">Onboarding</Badge>
        <CardTitle>Confirme seus dados</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <label className="block space-y-2">
          <span className="text-sm font-semibold text-zinc-800">Nome completo</span>
          <Input value={fullName} onChange={(event) => setFullName(event.target.value)} />
        </label>
        <label className="block space-y-2">
          <span className="text-sm font-semibold text-zinc-800">E-mail</span>
          <Input value={email} type="email" onChange={(event) => setEmail(event.target.value)} />
        </label>

        <div className="space-y-2">
          <p className="text-sm font-semibold text-zinc-800">Preferencia de contato</p>
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
                {value === "both" ? "Ambos" : value === "email" ? "E-mail" : "WhatsApp"}
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
          <span className="text-sm leading-6 text-zinc-700">Quero receber lembretes e avisos sobre meus atendimentos.</span>
        </label>

        <label className="flex items-start gap-3 rounded-lg border border-zinc-200 bg-white p-4">
          <input
            type="checkbox"
            className="mt-1 h-4 w-4 rounded border-zinc-300 text-brand focus:ring-brand"
            checked={lgpdAccepted}
            onChange={(event) => setLgpdAccepted(event.target.checked)}
          />
          <span className="text-sm leading-6 text-zinc-700">Li e autorizo o uso dos meus dados para atendimento, agenda, lembretes e historico com este profissional.</span>
        </label>

        {formError ? <PortalError message={formError} /> : null}

        <Button
          type="button"
          className="h-12 w-full bg-brand text-white hover:bg-brand/90"
          disabled={mutation.isPending}
          onClick={submit}
        >
          {mutation.isPending ? "Salvando..." : "Concluir"}
        </Button>
      </CardContent>
    </Card>
  );
}

function PortalHome({ context }: { context: ClientPortalContextOutput }) {
  const firstName = context.client.full_name.split(" ")[0] ?? context.client.full_name;
  return (
    <div className="space-y-4">
      <Card className="rounded-lg">
        <CardHeader>
          <Badge variant="secondary" className="w-fit">Home</Badge>
          <CardTitle className="text-xl">Ola, {firstName}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {context.next_appointment ? (
            <div className="rounded-lg border border-zinc-200 bg-white p-4">
              <p className="text-sm font-semibold text-zinc-800">Proximo agendamento</p>
              <p className="mt-1 text-lg font-semibold">{context.next_appointment.service_name ?? "Atendimento"}</p>
              <p className="text-sm text-zinc-600">{formatDateTime(context.next_appointment.scheduled_at)}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Badge variant="secondary">{context.next_appointment.status}</Badge>
                {context.next_appointment.can_reschedule ? <Badge variant="outline">Remarcacao disponivel</Badge> : null}
                {context.next_appointment.can_cancel ? <Badge variant="outline">Cancelamento disponivel</Badge> : null}
              </div>
            </div>
          ) : (
            <div className="rounded-lg border border-dashed border-zinc-300 bg-white p-4">
              <p className="text-sm font-semibold text-zinc-800">Nenhum agendamento futuro</p>
              <p className="mt-1 text-sm text-zinc-600">Voce pode marcar um novo atendimento pelo portal.</p>
            </div>
          )}
          <div className="grid grid-cols-2 gap-2">
            <ActionLink to="/portal/agendar" icon={PlusCircle} label="Agendar" />
            <ActionLink to="/portal/pacotes" icon={Package} label={`${context.packages_summary.total_remaining} sessoes`} />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function PortalHistory({ sessionToken }: { sessionToken: string }) {
  const query = useQuery({
    queryKey: ["client-portal-history", sessionToken],
    queryFn: () => getClientPortalHistory(sessionToken)
  });

  if (query.isLoading) return <Skeleton className="h-72 w-full rounded-lg" />;
  if (!isSuccess(query.data)) return <PortalError message="Nao foi possivel carregar o historico." />;

  return (
    <Card className="rounded-lg">
      <CardHeader>
        <CardTitle>Historico</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {query.data.items.length === 0 ? <p className="text-sm text-zinc-600">Nenhum atendimento liberado para visualizacao.</p> : null}
        {query.data.items.map((item) => (
          <div key={item.id} className="rounded-lg border border-zinc-200 p-4">
            <p className="font-semibold">{item.service_name ?? "Atendimento"}</p>
            <p className="text-sm text-zinc-600">{formatDateTime(item.session_date)}</p>
            {item.summary ? <p className="mt-2 text-sm leading-6 text-zinc-700">{item.summary}</p> : null}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function PortalPackages({ sessionToken }: { sessionToken: string }) {
  const query = useQuery({
    queryKey: ["client-portal-packages", sessionToken],
    queryFn: () => getClientPortalPackages(sessionToken)
  });

  if (query.isLoading) return <Skeleton className="h-72 w-full rounded-lg" />;
  if (!isSuccess(query.data)) return <PortalError message="Nao foi possivel carregar seus pacotes." />;

  return (
    <Card className="rounded-lg">
      <CardHeader>
        <CardTitle>Pacotes</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {query.data.items.length === 0 ? <p className="text-sm text-zinc-600">Voce ainda nao tem pacote ativo neste profissional.</p> : null}
        {query.data.items.map((item) => (
          <div key={item.id} className="rounded-lg border border-zinc-200 p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-semibold">{item.name}</p>
                <p className="text-sm text-zinc-600">{item.sessions_remaining} de {item.sessions_total} sessoes restantes</p>
              </div>
              <Badge variant={item.status === "ativo" ? "secondary" : "outline"}>{item.status}</Badge>
            </div>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-zinc-100">
              <div
                className="h-full bg-brand"
                style={{ width: `${Math.max(0, Math.min(100, (item.sessions_remaining / item.sessions_total) * 100))}%` }}
              />
            </div>
            {item.expires_at ? <p className="mt-2 text-xs text-zinc-500">Valido ate {formatDate(item.expires_at)}</p> : null}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function PortalBooking({ sessionToken }: { sessionToken: string }) {
  const { locale } = useI18n();
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
  if (!isSuccess(query.data)) return <PortalError message="Nao foi possivel carregar horarios." />;

  return (
    <Card className="rounded-lg">
      <CardHeader>
        <CardTitle>Agendar</CardTitle>
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

        {mutation.data?.ok === false ? <PortalError message="Nao foi possivel criar o agendamento." /> : null}
        {mutation.data?.ok === true ? <p className="rounded-lg bg-teal-50 p-3 text-sm text-teal-800">Agendamento criado.</p> : null}

        <Button
          type="button"
          className="h-12 w-full bg-brand text-white hover:bg-brand/90"
          disabled={!serviceId || !scheduledAt || mutation.isPending}
          onClick={() => mutation.mutate()}
        >
          Confirmar agendamento
        </Button>
      </CardContent>
    </Card>
  );
}

function PortalFrame({ title, subtitle, brandColor, children }: { title: string; subtitle: string; brandColor?: string; children: React.ReactNode }) {
  return (
    <main
      className="flex min-h-dvh w-full max-w-[100vw] items-center justify-center overflow-x-hidden bg-[#f7fbf9] px-4 py-8 text-zinc-950"
      style={{ "--client-brand": brandColor ?? "#0f766e" } as React.CSSProperties}
    >
      <section className="w-full max-w-md space-y-5">
        <div>
          <p className="text-sm font-semibold text-brand">Portal do cliente</p>
          <h1 className="mt-1 text-3xl font-semibold">{title}</h1>
          <p className="mt-2 text-sm leading-6 text-zinc-600">{subtitle}</p>
        </div>
        {children}
      </section>
    </main>
  );
}

function PortalNav({ active }: { active: PortalView }) {
  const items = [
    { view: "home" as const, label: "Home", icon: Home, to: "/portal/home" },
    { view: "historico" as const, label: "Historico", icon: History, to: "/portal/historico" },
    { view: "pacotes" as const, label: "Pacotes", icon: Package, to: "/portal/pacotes" },
    { view: "agendar" as const, label: "Agendar", icon: CalendarDays, to: "/portal/agendar" }
  ];

  return (
    <nav className="fixed inset-x-0 bottom-0 border-t border-zinc-200 bg-white/95 px-3 py-2 shadow-lg backdrop-blur">
      <div className="mx-auto grid max-w-3xl grid-cols-4 gap-1">
        {items.map((item) => (
          <Link
            key={item.view}
            to={item.to}
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

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value));
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "medium"
  }).format(new Date(value));
}
