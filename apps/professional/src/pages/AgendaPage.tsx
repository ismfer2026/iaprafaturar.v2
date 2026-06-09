import { type FormEvent, useMemo, useState } from "react";
import { CalendarDays, CheckCircle2, ChevronLeft, ChevronRight, Clock, Link2, Plus, XCircle } from "lucide-react";
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

function addMonths(date: Date, amount: number) {
  const next = new Date(date);
  next.setMonth(next.getMonth() + amount);
  return next;
}

function monthlyWeekOccurrence(firstDate: Date, monthOffset: number) {
  const targetMonth = new Date(firstDate);
  targetMonth.setDate(1);
  targetMonth.setMonth(targetMonth.getMonth() + monthOffset);

  const targetWeekday = firstDate.getDay();
  const weekOrdinal = Math.floor((firstDate.getDate() - 1) / 7) + 1;
  const firstWeekday = targetMonth.getDay();
  const dayOffset = (targetWeekday - firstWeekday + 7) % 7;
  const candidate = new Date(targetMonth);
  candidate.setDate(1 + dayOffset + (weekOrdinal - 1) * 7);
  candidate.setHours(firstDate.getHours(), firstDate.getMinutes(), 0, 0);

  if (candidate.getMonth() !== targetMonth.getMonth()) {
    candidate.setDate(candidate.getDate() - 7);
  }

  return candidate;
}

function toDateTimeLocalValue(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${year}-${month}-${day}T${hours}:${minutes}`;
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
  const [isRecurring, setIsRecurring] = useState(false);
  const [seriesFrequency, setSeriesFrequency] = useState<"weekly" | "biweekly" | "monthly_day" | "monthly_week">("weekly");
  const [seriesOccurrenceCount, setSeriesOccurrenceCount] = useState("4");
  const [seriesAdjustments, setSeriesAdjustments] = useState<Record<number, string>>({});
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

  const recurringPreview = useMemo(() => {
    if (!isRecurring) return [];
    const count = Number(seriesOccurrenceCount);
    if (!Number.isInteger(count) || count < 1 || count > 52) return [];

    const first = new Date(`${dateKey}T${time}:00`);
    if (Number.isNaN(first.getTime())) return [];

    return Array.from({ length: count }, (_, arrayIndex) => {
      const index = arrayIndex + 1;
      const baseDate = (() => {
        if (seriesFrequency === "weekly") return addDays(first, arrayIndex * 7);
        if (seriesFrequency === "biweekly") return addDays(first, arrayIndex * 14);
        if (seriesFrequency === "monthly_day") return addMonths(first, arrayIndex);
        return monthlyWeekOccurrence(first, arrayIndex);
      })();
      const adjusted = seriesAdjustments[index];
      const date = adjusted ? new Date(adjusted) : baseDate;

      return {
        index,
        baseDate,
        value: adjusted ?? toDateTimeLocalValue(baseDate),
        scheduledAt: date.toISOString(),
        adjusted: Boolean(adjusted),
      };
    });
  }, [dateKey, isRecurring, seriesAdjustments, seriesFrequency, seriesOccurrenceCount, time]);

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
      const scheduledAt = new Date(`${dateKey}T${time}:00`).toISOString();

      if (isRecurring) {
        const count = Number(seriesOccurrenceCount);
        if (!serviceId) {
          setFormError(t("agenda.recurring.error.serviceRequired"));
          return;
        }
        if (!Number.isInteger(count) || count < 2 || count > 52) {
          setFormError(t("agenda.recurring.error.countInvalid"));
          return;
        }

        const result = await appointmentsQuery.createAppointmentSeries({
          clientId,
          serviceId,
          firstScheduledAt: scheduledAt,
          frequency: seriesFrequency,
          occurrenceCount: count,
          adjustedOccurrences: recurringPreview
            .filter((item) => item.adjusted)
            .map((item) => ({ index: item.index, scheduledAt: item.scheduledAt })),
        });

        if (!result.ok) {
          if (result.error === "series_conflicts" && result.conflicts?.length) {
            const conflicts = result.conflicts
              .map((conflict: { index: number; scheduled_at: string }) => formatTime(conflict.scheduled_at, locale))
              .join(", ");
            setFormError(`${t("agenda.recurring.error.conflicts")}: ${conflicts}`);
            return;
          }

          setFormError(t("agenda.recurring.error.create"));
          return;
        }
      } else {
        await appointmentsQuery.createAppointment({
          clientId,
          serviceId: serviceId || null,
          scheduledAt,
          durationMinutes,
          notes: notes.trim() || null,
        });
      }

      setClientId("");
      setServiceId("");
      setTime("09:00");
      setDuration("60");
      setNotes("");
      setIsRecurring(false);
      setSeriesFrequency("weekly");
      setSeriesOccurrenceCount("4");
      setSeriesAdjustments({});
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

  async function handleCancelSeries(scope: "from_here" | "all") {
    if (!selectedAppointment?.series_id) return;
    await appointmentsQuery.cancelAppointmentSeries({
      seriesId: selectedAppointment.series_id,
      scope,
      fromAppointmentId: scope === "from_here" ? selectedAppointment.id : null,
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
                  {appointment.series_id ? (
                    <Badge className="w-fit gap-1 border border-violet-200 bg-violet-50 text-violet-700">
                      <Link2 className="h-3.5 w-3.5" />
                      {t("agenda.recurring.badge")}
                      {appointment.series_occurrence_index ? ` ${appointment.series_occurrence_index}` : ""}
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

              <div className="rounded-lg border border-violet-100 bg-violet-50/60 p-3">
                <label className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    className="mt-1 h-4 w-4 rounded border-violet-300 text-violet-700"
                    checked={isRecurring}
                    onChange={(event) => setIsRecurring(event.target.checked)}
                  />
                  <span>
                    <span className="block text-sm font-semibold text-zinc-950">
                      {t("agenda.recurring.enable")}
                    </span>
                    <span className="mt-1 block text-xs leading-5 text-zinc-500">
                      {t("agenda.recurring.description")}
                    </span>
                  </span>
                </label>

                {isRecurring ? (
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    <label className="block space-y-1.5">
                      <span className="text-sm font-medium text-zinc-700">
                        {t("agenda.recurring.frequency")}
                      </span>
                      <select
                        className="h-10 w-full rounded-md border border-zinc-200 bg-white px-3 text-sm shadow-sm outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-100"
                        value={seriesFrequency}
                        onChange={(event) => setSeriesFrequency(event.target.value as typeof seriesFrequency)}
                      >
                        <option value="weekly">{t("agenda.recurring.frequency.weekly")}</option>
                        <option value="biweekly">{t("agenda.recurring.frequency.biweekly")}</option>
                        <option value="monthly_day">{t("agenda.recurring.frequency.monthlyDay")}</option>
                        <option value="monthly_week">{t("agenda.recurring.frequency.monthlyWeek")}</option>
                      </select>
                    </label>
                    <label className="block space-y-1.5">
                      <span className="text-sm font-medium text-zinc-700">
                        {t("agenda.recurring.count")}
                      </span>
                      <Input
                        value={seriesOccurrenceCount}
                        inputMode="numeric"
                        onChange={(event) => {
                          setSeriesOccurrenceCount(event.target.value);
                          setSeriesAdjustments({});
                        }}
                      />
                    </label>
                  </div>
                ) : null}

                {isRecurring && recurringPreview.length > 0 ? (
                  <div className="mt-3 space-y-2">
                    <p className="text-sm font-semibold text-zinc-950">{t("agenda.recurring.preview")}</p>
                    <div className="space-y-2">
                      {recurringPreview.map((item) => (
                        <label key={item.index} className="grid gap-1 rounded-lg border border-zinc-200 bg-white p-2">
                          <span className="text-xs font-medium text-zinc-500">
                            {t("agenda.recurring.occurrence", { count: item.index })}
                          </span>
                          <Input
                            type="datetime-local"
                            value={item.value}
                            onChange={(event) =>
                              setSeriesAdjustments((current) => ({
                                ...current,
                                [item.index]: event.target.value,
                              }))
                            }
                          />
                        </label>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>

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
              <Button
                type="submit"
                disabled={appointmentsQuery.isCreatingAppointment || appointmentsQuery.isCreatingAppointmentSeries}
              >
                {appointmentsQuery.isCreatingAppointment || appointmentsQuery.isCreatingAppointmentSeries
                  ? t("common.saving")
                  : isRecurring
                    ? t("agenda.recurring.create")
                    : t("common.save")}
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

                {selectedAppointment.series_id ? (
                  <div className="grid gap-2 rounded-lg border border-violet-200 bg-violet-50 p-3">
                    <p className="text-sm font-semibold text-violet-950">{t("agenda.recurring.manage")}</p>
                    <Button
                      type="button"
                      variant="outline"
                      className="border-violet-200 bg-white text-violet-700 hover:bg-violet-50"
                      onClick={() => handleCancelSeries("from_here")}
                      disabled={appointmentsQuery.isCancellingAppointmentSeries}
                    >
                      {t("agenda.recurring.cancelFromHere")}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      className="border-red-200 bg-white text-red-700 hover:bg-red-50"
                      onClick={() => handleCancelSeries("all")}
                      disabled={appointmentsQuery.isCancellingAppointmentSeries}
                    >
                      {t("agenda.recurring.cancelAll")}
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
