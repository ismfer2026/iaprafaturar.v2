import { type FormEvent, useMemo, useState } from "react";
import { CalendarDays, CheckCircle2, ChevronLeft, ChevronRight, Clock, Plus, XCircle } from "lucide-react";
import {
  Badge,
  Button,
  Card,
  CardContent,
  Input,
  Sheet,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  Skeleton,
  cn,
} from "@iaprafaturar/ui";
import type { Appointment, Client, Service } from "@iaprafaturar/domain";
import { useAppointments } from "@/hooks/useAppointments";
import { useAuth } from "@/contexts/AuthContext";
import { useClients } from "@/hooks/useClients";
import { useClientPackages } from "@/hooks/useDocumentsPackages";
import { useServices } from "@/hooks/useServices";
import { useSessions } from "@/hooks/useSessions";
import { useI18n, type Locale, type TranslationKey } from "@/i18n";

const APPOINTMENT_STATUS_LABEL_KEYS: Record<Appointment["status"], TranslationKey> = {
  agendado: "appointment.status.agendado",
  confirmado: "appointment.status.confirmado",
  cancelado: "appointment.status.cancelado",
  realizado: "appointment.status.realizado",
  falta: "appointment.status.falta",
  reagendado: "appointment.status.reagendado",
};

function toDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function addDays(date: Date, amount: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + amount);
  return next;
}

function formatDay(date: Date, locale: Locale) {
  return new Intl.DateTimeFormat(locale, {
    weekday: "long",
    day: "2-digit",
    month: "long",
  }).format(date);
}

function formatTime(value: string, locale: Locale) {
  return new Intl.DateTimeFormat(locale, {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function statusTone(status: Appointment["status"]) {
  if (status === "agendado") return "border-amber-200 bg-amber-50 text-amber-700";
  if (status === "confirmado") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (status === "realizado") return "border-teal-200 bg-teal-50 text-teal-700";
  if (status === "falta") return "border-red-200 bg-red-50 text-red-700";
  return "border-zinc-200 bg-zinc-100 text-zinc-600";
}

function clientName(clientId: string | null, clients: Client[], fallback: string) {
  return clients.find((client) => client.id === clientId)?.full_name ?? fallback;
}

function serviceName(serviceId: string | null, services: Service[], fallback: string) {
  return services.find((service) => service.id === serviceId)?.name ?? fallback;
}

export default function AgendaPage() {
  const { locale, t } = useI18n();
  const { professionalId } = useAuth();
  const [selectedDate, setSelectedDate] = useState(() => new Date());
  const [isNewOpen, setIsNewOpen] = useState(false);
  const [selectedAppointment, setSelectedAppointment] = useState<Appointment | null>(null);
  const [clientId, setClientId] = useState("");
  const [serviceId, setServiceId] = useState("");
  const [time, setTime] = useState("09:00");
  const [duration, setDuration] = useState("60");
  const [notes, setNotes] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [isSessionFormOpen, setIsSessionFormOpen] = useState(false);
  const [clinicalEvolution, setClinicalEvolution] = useState("");
  const [sessionNotes, setSessionNotes] = useState("");
  const [sessionValue, setSessionValue] = useState("0");
  const [selectedClientPackageId, setSelectedClientPackageId] = useState("");
  const [sessionError, setSessionError] = useState<string | null>(null);

  const dateKey = toDateKey(selectedDate);
  const appointmentsQuery = useAppointments(professionalId, dateKey);
  const clientsQuery = useClients(professionalId);
  const servicesQuery = useServices(professionalId);
  const sessionsQuery = useSessions(professionalId);
  const appointmentClientPackagesQuery = useClientPackages(professionalId, selectedAppointment?.client_id ?? null);

  const clients = useMemo(() => clientsQuery.data ?? [], [clientsQuery.data]);
  const services = useMemo(() => servicesQuery.data?.services ?? [], [servicesQuery.data?.services]);
  const activeClients = useMemo(() => clients.filter((client) => client.is_active), [clients]);
  const activeServices = useMemo(() => services.filter((service) => service.is_active), [services]);
  const activeClientPackages = useMemo(() => {
    return (appointmentClientPackagesQuery.data ?? []).filter((item) => item.status === "ativo" && item.sessions_remaining > 0);
  }, [appointmentClientPackagesQuery.data]);

  function resetSessionForm() {
    setClinicalEvolution("");
    setSessionNotes("");
    setSessionValue("0");
    setSelectedClientPackageId("");
    setSessionError(null);
    setIsSessionFormOpen(false);
  }

  function openSessionForm(appointment: Appointment) {
    const service = services.find((item) => item.id === appointment.service_id);
    setClinicalEvolution("");
    setSessionNotes("");
    setSessionValue(String(service?.price ?? 0));
    setSelectedClientPackageId("");
    setSessionError(null);
    setIsSessionFormOpen(true);
  }

  async function handleCreateAppointment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);

    if (!clientId) {
      setFormError(t("agenda.error.clientRequired"));
      return;
    }

    const durationMinutes = Number(duration);
    if (!Number.isFinite(durationMinutes) || durationMinutes <= 0) {
      setFormError(t("agenda.error.durationInvalid"));
      return;
    }

    try {
      await appointmentsQuery.createAppointment({
        clientId,
        serviceId: serviceId || null,
        scheduledAt: new Date(`${dateKey}T${time}:00`).toISOString(),
        durationMinutes,
        notes: notes.trim() || null,
      });

      setClientId("");
      setServiceId("");
      setTime("09:00");
      setDuration("60");
      setNotes("");
      setIsNewOpen(false);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : t("agenda.error.create"));
    }
  }

  async function handleCancel() {
    if (!selectedAppointment) return;
    await appointmentsQuery.cancelAppointment({
      appointmentId: selectedAppointment.id,
      reason: t("agenda.cancelReason"),
    });
    setSelectedAppointment(null);
  }

  async function handleNoShow() {
    if (!selectedAppointment) return;
    await appointmentsQuery.registerOutcome({
      appointmentId: selectedAppointment.id,
      outcome: "falta",
      notes: t("agenda.noShowReason"),
    });
    setSelectedAppointment(null);
  }

  async function handleRegisterSession(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSessionError(null);

    if (!selectedAppointment?.client_id) {
      setSessionError(t("session.register.error.clientRequired"));
      return;
    }

    if (!clinicalEvolution.trim()) {
      setSessionError(t("session.register.error.evolutionRequired"));
      return;
    }

    const parsedSessionValue = Number(sessionValue);
    if (!Number.isFinite(parsedSessionValue) || parsedSessionValue < 0) {
      setSessionError(t("session.register.error.valueInvalid"));
      return;
    }

    try {
      const result = await sessionsQuery.registerSession({
        appointmentId: selectedAppointment.id,
        clientId: selectedAppointment.client_id,
        serviceId: selectedAppointment.service_id,
        sessionDate: selectedAppointment.scheduled_at,
        clinicalEvolution: clinicalEvolution.trim(),
        notes: sessionNotes.trim() || null,
        sessionValue: parsedSessionValue,
      });

      if (selectedClientPackageId) {
        await appointmentClientPackagesQuery.useClientPackageSession({
          clientPackageId: selectedClientPackageId,
          sessionId: result.session_id,
          appointmentId: selectedAppointment.id,
        });
      }

      resetSessionForm();
      setSelectedAppointment(null);
    } catch (err) {
      setSessionError(err instanceof Error ? err.message : t("session.register.error.save"));
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-5 px-4 py-5 md:px-6">
      <header className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-violet-600">{t("agenda.eyebrow")}</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight text-zinc-950">{t("agenda.title")}</h1>
          <p className="mt-1 text-sm capitalize text-zinc-500">{formatDay(selectedDate, locale)}</p>
        </div>
        <Button className="shrink-0 gap-2" onClick={() => setIsNewOpen(true)}>
          <Plus className="h-4 w-4" />
          {t("agenda.schedule")}
        </Button>
      </header>

      <div className="grid grid-cols-[auto_1fr_auto] gap-2">
        <Button
          variant="outline"
          aria-label={t("agenda.previousDay")}
          onClick={() => setSelectedDate((current) => addDays(current, -1))}
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <Input
          type="date"
          value={dateKey}
          onChange={(event) => setSelectedDate(new Date(`${event.target.value}T00:00:00`))}
        />
        <Button
          variant="outline"
          aria-label={t("agenda.nextDay")}
          onClick={() => setSelectedDate((current) => addDays(current, 1))}
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      {appointmentsQuery.isLoading ? (
        <div className="space-y-3">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      ) : null}

      {appointmentsQuery.error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {t("agenda.error.load")}
        </div>
      ) : null}

      {!appointmentsQuery.isLoading && !appointmentsQuery.error && !appointmentsQuery.data?.length ? (
        <div className="rounded-lg border border-dashed border-zinc-300 bg-white p-6 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-violet-50 text-violet-700">
            <CalendarDays className="h-5 w-5" />
          </div>
          <h2 className="mt-4 text-base font-semibold text-zinc-950">{t("agenda.empty.title")}</h2>
          <p className="mt-1 text-sm text-zinc-500">{t("agenda.empty.description")}</p>
          <Button className="mt-4 gap-2" onClick={() => setIsNewOpen(true)}>
            <Plus className="h-4 w-4" />
            {t("agenda.schedule")}
          </Button>
        </div>
      ) : null}

      {appointmentsQuery.data?.length ? (
        <section className="space-y-3">
          {appointmentsQuery.data.map((appointment) => (
            <button
              key={appointment.id}
              type="button"
              className="w-full text-left"
              onClick={() => setSelectedAppointment(appointment)}
            >
              <Card className="rounded-lg border-zinc-200 shadow-sm transition-colors hover:border-violet-200">
                <CardContent className="space-y-3 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h2 className="truncate text-base font-semibold text-zinc-950">
                        {formatTime(appointment.scheduled_at, locale)} -{" "}
                        {clientName(appointment.client_id, clients, t("agenda.defaultClient"))}
                      </h2>
                      <p className="mt-1 truncate text-sm text-zinc-500">
                        {serviceName(appointment.service_id, services, t("agenda.noService"))}
                      </p>
                    </div>
                    <Badge className={cn("shrink-0 border", statusTone(appointment.status))}>
                      {t(APPOINTMENT_STATUS_LABEL_KEYS[appointment.status])}
                    </Badge>
                  </div>
                  {appointment.source === "public_link" || appointment.booked_by_client ? (
                    <Badge className="w-fit border border-teal-200 bg-teal-50 text-teal-700">
                      {t("agenda.source.publicLink")}
                    </Badge>
                  ) : null}
                  <div className="flex items-center gap-2 text-sm text-zinc-500">
                    <Clock className="h-4 w-4" />
                    {appointment.duration_minutes} {t("common.minutes.short")}
                  </div>
                </CardContent>
              </Card>
            </button>
          ))}
        </section>
      ) : null}

      <Sheet open={isNewOpen} onOpenChange={setIsNewOpen}>
        <SheetContent className="max-h-[88vh] overflow-y-auto">
          <form onSubmit={handleCreateAppointment}>
            <SheetHeader>
              <SheetTitle>{t("agenda.newAppointment")}</SheetTitle>
            </SheetHeader>

            <div className="space-y-4 px-4 py-2">
              <label className="block space-y-1.5">
                <span className="text-sm font-medium text-zinc-700">{t("agenda.client")}</span>
                <select
                  className="h-10 w-full rounded-md border border-zinc-200 bg-white px-3 text-sm shadow-sm outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-100"
                  value={clientId}
                  onChange={(event) => setClientId(event.target.value)}
                >
                  <option value="">{t("common.select")}</option>
                  {activeClients.map((client) => (
                    <option key={client.id} value={client.id}>
                      {client.full_name}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block space-y-1.5">
                <span className="text-sm font-medium text-zinc-700">{t("agenda.service")}</span>
                <select
                  className="h-10 w-full rounded-md border border-zinc-200 bg-white px-3 text-sm shadow-sm outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-100"
                  value={serviceId}
                  onChange={(event) => {
                    const value = event.target.value;
                    setServiceId(value);
                    const selected = activeServices.find((service) => service.id === value);
                    if (selected) setDuration(String(selected.duration_minutes));
                  }}
                >
                  <option value="">{t("agenda.noService")}</option>
                  {activeServices.map((service) => (
                    <option key={service.id} value={service.id}>
                      {service.name}
                    </option>
                  ))}
                </select>
              </label>

              <div className="grid grid-cols-2 gap-3">
                <label className="block space-y-1.5">
                  <span className="text-sm font-medium text-zinc-700">{t("agenda.time")}</span>
                  <Input value={time} type="time" onChange={(event) => setTime(event.target.value)} />
                </label>
                <label className="block space-y-1.5">
                  <span className="text-sm font-medium text-zinc-700">{t("agenda.duration")}</span>
                  <Input
                    value={duration}
                    inputMode="numeric"
                    onChange={(event) => setDuration(event.target.value)}
                  />
                </label>
              </div>

              <label className="block space-y-1.5">
                <span className="text-sm font-medium text-zinc-700">{t("agenda.note")}</span>
                <Input value={notes} onChange={(event) => setNotes(event.target.value)} placeholder={t("common.optional")} />
              </label>

              {formError ? (
                <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                  {formError}
                </div>
              ) : null}
            </div>

            <SheetFooter>
              <Button type="button" variant="outline" onClick={() => setIsNewOpen(false)}>
                {t("common.cancel")}
              </Button>
              <Button type="submit" disabled={appointmentsQuery.isCreatingAppointment}>
                {appointmentsQuery.isCreatingAppointment ? t("common.saving") : t("common.save")}
              </Button>
            </SheetFooter>
          </form>
        </SheetContent>
      </Sheet>

      <Sheet
        open={Boolean(selectedAppointment)}
        onOpenChange={(open) => {
          if (!open) {
            resetSessionForm();
            setSelectedAppointment(null);
          }
        }}
      >
        <SheetContent>
          {selectedAppointment ? (
            <>
              <SheetHeader>
                <SheetTitle>{clientName(selectedAppointment.client_id, clients, t("agenda.defaultClient"))}</SheetTitle>
              </SheetHeader>
              <div className="space-y-4 px-4 py-2">
                <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-4">
                  <p className="text-sm font-medium text-zinc-950">
                    {formatDay(new Date(selectedAppointment.scheduled_at), locale)}
                  </p>
                  <p className="mt-1 text-sm text-zinc-500">
                    {formatTime(selectedAppointment.scheduled_at, locale)} · {selectedAppointment.duration_minutes}{" "}
                    {t("common.minutes.short")}
                  </p>
                  <p className="mt-1 text-sm text-zinc-500">
                    {serviceName(selectedAppointment.service_id, services, t("agenda.noService"))}
                  </p>
                </div>

                <Badge className={cn("border", statusTone(selectedAppointment.status))}>
                  {t(APPOINTMENT_STATUS_LABEL_KEYS[selectedAppointment.status])}
                </Badge>

                {selectedAppointment.status === "agendado" || selectedAppointment.status === "confirmado" ? (
                  <div className="grid gap-2">
                    <Button
                      className="gap-2"
                      onClick={() => openSessionForm(selectedAppointment)}
                      disabled={sessionsQuery.isRegisteringSession}
                    >
                      <CheckCircle2 className="h-4 w-4" />
                      {t("session.register.action")}
                    </Button>
                    <Button
                      variant="outline"
                      className="gap-2 border-red-200 text-red-700 hover:bg-red-50"
                      onClick={handleCancel}
                      disabled={appointmentsQuery.isCancellingAppointment}
                    >
                      <XCircle className="h-4 w-4" />
                      {t("agenda.cancelAppointment")}
                    </Button>
                    <Button
                      variant="outline"
                      className="gap-2"
                      onClick={handleNoShow}
                      disabled={appointmentsQuery.isRegisteringOutcome}
                    >
                      {t("agenda.markNoShow")}
                    </Button>
                  </div>
                ) : null}

                {isSessionFormOpen ? (
                  <form onSubmit={handleRegisterSession} className="space-y-3 rounded-lg border border-zinc-200 p-3">
                    <h3 className="text-sm font-semibold text-zinc-950">{t("session.register.title")}</h3>

                    <label className="block space-y-1.5">
                      <span className="text-sm font-medium text-zinc-700">
                        {t("session.register.clinicalEvolution")}
                      </span>
                      <textarea
                        className="min-h-24 w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm shadow-sm outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-100"
                        value={clinicalEvolution}
                        onChange={(event) => setClinicalEvolution(event.target.value)}
                        placeholder={t("session.register.clinicalEvolutionPlaceholder")}
                      />
                    </label>

                    <label className="block space-y-1.5">
                      <span className="text-sm font-medium text-zinc-700">{t("session.register.notes")}</span>
                      <Input
                        value={sessionNotes}
                        onChange={(event) => setSessionNotes(event.target.value)}
                        placeholder={t("common.optional")}
                      />
                    </label>

                    <label className="block space-y-1.5">
                      <span className="text-sm font-medium text-zinc-700">{t("session.register.value")}</span>
                      <Input
                        value={sessionValue}
                        onChange={(event) => setSessionValue(event.target.value)}
                        inputMode="decimal"
                      />
                    </label>

                    {activeClientPackages.length > 0 ? (
                      <label className="block space-y-1.5 rounded-lg border border-violet-200 bg-violet-50 p-3">
                        <span className="text-sm font-medium text-violet-900">
                          {t("session.register.packageUse")}
                        </span>
                        <select
                          className="mt-2 h-10 w-full rounded-md border border-violet-200 bg-white px-3 text-sm shadow-sm outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-100"
                          value={selectedClientPackageId}
                          onChange={(event) => setSelectedClientPackageId(event.target.value)}
                        >
                          <option value="">{t("session.register.packageNone")}</option>
                          {activeClientPackages.map((item) => (
                            <option key={item.id} value={item.id}>
                              {item.package_name ?? t("docs.tab.packages")} - {item.sessions_remaining}/{item.sessions_total}
                            </option>
                          ))}
                        </select>
                        <span className="mt-2 block text-xs leading-5 text-violet-700">
                          {t("session.register.packageUseDescription")}
                        </span>
                      </label>
                    ) : null}

                    {sessionError ? (
                      <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                        {sessionError}
                      </div>
                    ) : null}

                    <div className="grid grid-cols-2 gap-2">
                      <Button type="button" variant="outline" onClick={resetSessionForm}>
                        {t("common.cancel")}
                      </Button>
                      <Button type="submit" disabled={sessionsQuery.isRegisteringSession}>
                        {sessionsQuery.isRegisteringSession ? t("common.saving") : t("common.save")}
                      </Button>
                    </div>
                  </form>
                ) : null}
              </div>
            </>
          ) : null}
        </SheetContent>
      </Sheet>
    </div>
  );
}
