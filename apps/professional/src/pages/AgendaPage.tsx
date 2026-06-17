import { type FormEvent, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Link2,
  MessageCircle,
  Plus,
  XCircle,
} from "lucide-react";
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
import { useAppointments, type AppointmentsRange } from "@/hooks/useAppointments";
import { useAuth } from "@/contexts/AuthContext";
import { useClients } from "@/hooks/useClients";
import { useClientPackages } from "@/hooks/useDocumentsPackages";
import { useServices } from "@/hooks/useServices";
import { useSessions } from "@/hooks/useSessions";
import { useI18n, type Locale, type TranslationKey } from "@/i18n";
import { friendlyErrorMessage } from "@/lib/friendlyError";

// ── Grid constants ────────────────────────────────────────────────────────────

const HOUR_PX = 64;
const GRID_START = 7;
const GRID_END = 21;
const TOTAL_HOURS = GRID_END - GRID_START;

// ── Types ─────────────────────────────────────────────────────────────────────

type AgendaViewMode = "day" | "week" | "month" | "list";
type AgendaTab = "agenda" | "historico";

const STATUS_KEYS: Record<Appointment["status"], TranslationKey> = {
  agendado: "appointment.status.agendado",
  confirmado: "appointment.status.confirmado",
  cancelado: "appointment.status.cancelado",
  realizado: "appointment.status.realizado",
  falta: "appointment.status.falta",
  reagendado: "appointment.status.reagendado",
};

// ── Date helpers ──────────────────────────────────────────────────────────────

function toDateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function addDays(date: Date, n: number) {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

function addMonths(date: Date, n: number) {
  const d = new Date(date);
  d.setMonth(d.getMonth() + n);
  return d;
}

function startOfWeek(date: Date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d;
}

function startOfMonth(date: Date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(1);
  return d;
}

function buildRange(viewMode: AgendaViewMode, selectedDate: Date, dateKey: string): AppointmentsRange {
  if (viewMode === "week" || viewMode === "list") {
    const start = startOfWeek(selectedDate);
    return { key: `week:${toDateKey(start)}`, start: start.toISOString(), end: addDays(start, 7).toISOString() };
  }
  if (viewMode === "month") {
    const start = startOfMonth(selectedDate);
    return { key: `month:${toDateKey(start)}`, start: start.toISOString(), end: addMonths(start, 1).toISOString() };
  }
  const start = new Date(`${dateKey}T00:00:00`);
  return { key: `day:${dateKey}`, start: start.toISOString(), end: addDays(start, 1).toISOString() };
}

function formatRangeLabel(viewMode: AgendaViewMode, selectedDate: Date, locale: Locale) {
  if (viewMode === "month") {
    return new Intl.DateTimeFormat(locale, { month: "long", year: "numeric" }).format(selectedDate);
  }
  if (viewMode === "week" || viewMode === "list") {
    const start = startOfWeek(selectedDate);
    const end = addDays(start, 6);
    const fmt = new Intl.DateTimeFormat(locale, { day: "2-digit", month: "short" });
    return `${fmt.format(start)} – ${fmt.format(end)}`;
  }
  return new Intl.DateTimeFormat(locale, { weekday: "long", day: "2-digit", month: "long" }).format(selectedDate);
}

function formatTime(value: string, locale: Locale) {
  return new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

function formatDateHeader(date: Date, locale: Locale) {
  return new Intl.DateTimeFormat(locale, { weekday: "short", day: "2-digit", month: "short" }).format(date);
}

function toDateTimeLocal(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}T${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
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
  if (candidate.getMonth() !== targetMonth.getMonth()) candidate.setDate(candidate.getDate() - 7);
  return candidate;
}

// ── Grid helpers ──────────────────────────────────────────────────────────────

function aptStyle(scheduledAt: string, durationMinutes: number) {
  const d = new Date(scheduledAt);
  const startMins = (d.getHours() - GRID_START) * 60 + d.getMinutes();
  return {
    top: (startMins / 60) * HOUR_PX,
    height: Math.max((durationMinutes / 60) * HOUR_PX, 28),
  };
}

function timeFromY(y: number): string {
  const totalMins = Math.round((y / HOUR_PX) * (60 / 15)) * 15 + GRID_START * 60;
  const clamped = Math.max(GRID_START * 60, Math.min(GRID_END * 60 - 15, totalMins));
  return `${String(Math.floor(clamped / 60)).padStart(2, "0")}:${String(clamped % 60).padStart(2, "0")}`;
}

// ── Status colors ─────────────────────────────────────────────────────────────

function statusBadge(status: Appointment["status"]) {
  if (status === "agendado") return "border-amber-200 bg-amber-50 text-amber-700";
  if (status === "confirmado") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (status === "realizado") return "border-teal-200 bg-teal-50 text-teal-700";
  if (status === "falta") return "border-red-200 bg-red-50 text-red-700";
  return "border-zinc-200 bg-zinc-100 text-zinc-600";
}

function statusBlock(status: Appointment["status"]) {
  if (status === "agendado") return "border-amber-300 bg-amber-100 text-amber-900";
  if (status === "confirmado") return "border-emerald-300 bg-emerald-100 text-emerald-900";
  if (status === "realizado") return "border-teal-300 bg-teal-100 text-teal-900";
  if (status === "falta") return "border-red-300 bg-red-100 text-red-900";
  return "border-zinc-300 bg-zinc-100 text-zinc-700";
}

// ── Lookup helpers ────────────────────────────────────────────────────────────

function getClientName(clientId: string | null, clients: Client[], fallback: string) {
  return clients.find((c) => c.id === clientId)?.full_name ?? fallback;
}

function getServiceName(serviceId: string | null, services: Service[], fallback: string) {
  return services.find((s) => s.id === serviceId)?.name ?? fallback;
}

// ── NowIndicator ──────────────────────────────────────────────────────────────

function NowIndicator() {
  const now = new Date();
  const h = now.getHours();
  const m = now.getMinutes();
  if (h < GRID_START || h >= GRID_END) return null;
  const top = (h - GRID_START) * HOUR_PX + (m / 60) * HOUR_PX;
  return (
    <div className="pointer-events-none absolute inset-x-0 z-20 flex items-center" style={{ top }}>
      <div className="h-2 w-2 shrink-0 rounded-full bg-emerald-500 -ml-1" />
      <div className="h-px flex-1 bg-emerald-500" />
    </div>
  );
}

// ── DayTimeGrid ───────────────────────────────────────────────────────────────

function DayTimeGrid({
  appointments,
  clients,
  services,
  locale,
  t,
  onSlotClick,
  onAppointmentClick,
}: {
  appointments: Appointment[];
  clients: Client[];
  services: Service[];
  locale: Locale;
  t: (key: TranslationKey, params?: Record<string, string | number>) => string;
  onSlotClick: (time: string) => void;
  onAppointmentClick: (apt: Appointment) => void;
}) {
  const hours = Array.from({ length: TOTAL_HOURS }, (_, i) => GRID_START + i);

  return (
    <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white">
      <div className="flex" style={{ height: TOTAL_HOURS * HOUR_PX }}>
        {/* Time column */}
        <div className="w-12 shrink-0 border-r border-zinc-100">
          {hours.map((h) => (
            <div key={h} className="relative border-b border-zinc-100" style={{ height: HOUR_PX }}>
              <span className="absolute right-2 -top-2 text-[10px] leading-none text-zinc-400">
                {String(h).padStart(2, "0")}h
              </span>
            </div>
          ))}
        </div>

        {/* Grid area */}
        <div
          className="relative flex-1 cursor-crosshair"
          title={t("agenda.clickToSchedule")}
          onClick={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            onSlotClick(timeFromY(e.clientY - rect.top));
          }}
        >
          {hours.map((h) => (
            <div key={h} className="absolute left-0 right-0 border-b border-zinc-100" style={{ top: (h - GRID_START) * HOUR_PX }} />
          ))}
          {hours.map((h) => (
            <div key={`h${h}`} className="absolute left-0 right-0 border-b border-zinc-50" style={{ top: (h - GRID_START) * HOUR_PX + HOUR_PX / 2 }} />
          ))}

          <NowIndicator />

          {appointments.map((apt) => {
            const { top, height } = aptStyle(apt.scheduled_at, apt.duration_minutes);
            return (
              <button
                key={apt.id}
                type="button"
                className={cn(
                  "absolute left-1 right-1 z-10 overflow-hidden rounded-md border px-2 py-0.5 text-left shadow-sm transition-opacity hover:opacity-75",
                  statusBlock(apt.status),
                )}
                style={{ top, height }}
                onClick={(e) => { e.stopPropagation(); onAppointmentClick(apt); }}
              >
                <p className="truncate text-[11px] font-semibold leading-tight">
                  {formatTime(apt.scheduled_at, locale)} · {getClientName(apt.client_id, clients, "—")}
                </p>
                {height >= 40 && (
                  <p className="truncate text-[10px] leading-tight opacity-75">
                    {getServiceName(apt.service_id, services, "")}
                  </p>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── WeekTimeGrid ──────────────────────────────────────────────────────────────

function WeekTimeGrid({
  appointments,
  weekStart,
  clients,
  services: _services,
  locale,
  onSlotClick,
  onAppointmentClick,
}: {
  appointments: Appointment[];
  weekStart: Date;
  clients: Client[];
  services: Service[];
  locale: Locale;
  onSlotClick: (date: Date, time: string) => void;
  onAppointmentClick: (apt: Appointment) => void;
}) {
  const hours = Array.from({ length: TOTAL_HOURS }, (_, i) => GRID_START + i);
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const todayKey = toDateKey(new Date());

  return (
    <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white">
      {/* Day headers */}
      <div className="flex border-b border-zinc-200 bg-zinc-50">
        <div className="w-12 shrink-0" />
        {days.map((day) => {
          const isToday = toDateKey(day) === todayKey;
          return (
            <div key={toDateKey(day)} className="flex min-w-[72px] flex-1 flex-col items-center border-l border-zinc-100 py-2">
              <p className={cn("text-[10px] font-semibold uppercase tracking-wide", isToday ? "text-emerald-600" : "text-zinc-400")}>
                {new Intl.DateTimeFormat(locale, { weekday: "short" }).format(day)}
              </p>
              <span className={cn(
                "mt-1 flex h-6 w-6 items-center justify-center rounded-full text-sm font-bold leading-none",
                isToday ? "bg-emerald-600 text-white" : "text-zinc-900",
              )}>
                {day.getDate()}
              </span>
            </div>
          );
        })}
      </div>

      {/* Grid */}
      <div className="flex" style={{ height: TOTAL_HOURS * HOUR_PX }}>
        <div className="w-12 shrink-0 border-r border-zinc-100">
          {hours.map((h) => (
            <div key={h} className="relative border-b border-zinc-100" style={{ height: HOUR_PX }}>
              <span className="absolute right-2 -top-2 text-[10px] leading-none text-zinc-400">
                {String(h).padStart(2, "0")}h
              </span>
            </div>
          ))}
        </div>

        {days.map((day) => {
          const dayKey = toDateKey(day);
          const isToday = dayKey === todayKey;
          const dayApts = appointments.filter((a) => toDateKey(new Date(a.scheduled_at)) === dayKey);

          return (
            <div
              key={dayKey}
              className={cn("relative min-w-[72px] flex-1 cursor-crosshair border-l border-zinc-100", isToday && "bg-emerald-50/20")}
              onClick={(e) => {
                const rect = e.currentTarget.getBoundingClientRect();
                onSlotClick(day, timeFromY(e.clientY - rect.top));
              }}
            >
              {hours.map((h) => (
                <div key={h} className="absolute left-0 right-0 border-b border-zinc-100" style={{ top: (h - GRID_START) * HOUR_PX }} />
              ))}
              {isToday && <NowIndicator />}
              {dayApts.map((apt) => {
                const { top, height } = aptStyle(apt.scheduled_at, apt.duration_minutes);
                return (
                  <button
                    key={apt.id}
                    type="button"
                    className={cn(
                      "absolute left-0.5 right-0.5 z-10 overflow-hidden rounded border px-1 text-left shadow-sm transition-opacity hover:opacity-75",
                      statusBlock(apt.status),
                    )}
                    style={{ top, height }}
                    onClick={(e) => { e.stopPropagation(); onAppointmentClick(apt); }}
                  >
                    <p className="truncate text-[10px] font-semibold leading-tight">
                      {formatTime(apt.scheduled_at, locale)}
                    </p>
                    {height >= 36 && (
                      <p className="truncate text-[9px] leading-tight opacity-75">
                        {getClientName(apt.client_id, clients, "")}
                      </p>
                    )}
                  </button>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── MonthGrid ─────────────────────────────────────────────────────────────────

function MonthGrid({
  appointments,
  currentMonth,
  locale,
  onDayClick,
}: {
  appointments: Appointment[];
  currentMonth: Date;
  locale: Locale;
  onDayClick: (date: Date) => void;
}) {
  const todayKey = toDateKey(new Date());
  const monthStart = startOfMonth(currentMonth);
  const firstCell = startOfWeek(monthStart);
  const days = Array.from({ length: 42 }, (_, i) => addDays(firstCell, i));
  const weekDayHeaders = Array.from({ length: 7 }, (_, i) => addDays(firstCell, i));

  const countByDay = useMemo(() => {
    const map = new Map<string, number>();
    for (const apt of appointments) {
      const k = toDateKey(new Date(apt.scheduled_at));
      map.set(k, (map.get(k) ?? 0) + 1);
    }
    return map;
  }, [appointments]);

  return (
    <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white">
      <div className="grid grid-cols-7 border-b border-zinc-100 bg-zinc-50">
        {weekDayHeaders.map((d, i) => (
          <div key={i} className="py-2 text-center text-[10px] font-semibold uppercase tracking-wide text-zinc-400">
            {new Intl.DateTimeFormat(locale, { weekday: "narrow" }).format(d)}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {days.map((day, i) => {
          const key = toDateKey(day);
          const isThisMonth = day.getMonth() === currentMonth.getMonth();
          const isToday = key === todayKey;
          const count = countByDay.get(key) ?? 0;
          return (
            <button
              key={i}
              type="button"
              className={cn(
                "min-h-[56px] border-b border-r border-zinc-100 p-1.5 text-center transition-colors hover:bg-zinc-50",
                !isThisMonth && "opacity-30",
              )}
              onClick={() => onDayClick(day)}
            >
              <span className={cn(
                "mx-auto flex h-6 w-6 items-center justify-center rounded-full text-sm font-medium",
                isToday ? "bg-emerald-600 text-white" : "text-zinc-700",
              )}>
                {day.getDate()}
              </span>
              {count > 0 && (
                <div className="mt-1 flex justify-center gap-0.5">
                  {Array.from({ length: Math.min(count, 3) }, (_, j) => (
                    <div key={j} className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                  ))}
                  {count > 3 && <span className="text-[9px] text-zinc-400">+{count - 3}</span>}
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ── AppointmentCard (list view) ───────────────────────────────────────────────

function AppointmentCard({
  appointment,
  clients,
  services,
  locale,
  t,
  onSelect,
}: {
  appointment: Appointment;
  clients: Client[];
  services: Service[];
  locale: Locale;
  t: (key: TranslationKey, params?: Record<string, string | number>) => string;
  onSelect: (apt: Appointment) => void;
}) {
  return (
    <button type="button" className="w-full text-left" onClick={() => onSelect(appointment)}>
      <Card className="rounded-lg border-zinc-200 shadow-sm transition-colors hover:border-emerald-200">
        <CardContent className="space-y-3 p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="truncate text-base font-semibold text-zinc-950">
                {formatTime(appointment.scheduled_at, locale)} –{" "}
                {getClientName(appointment.client_id, clients, t("agenda.defaultClient"))}
              </h2>
              <p className="mt-1 truncate text-sm text-zinc-500">
                {getServiceName(appointment.service_id, services, t("agenda.noService"))}
              </p>
            </div>
            <Badge className={cn("shrink-0 border", statusBadge(appointment.status))}>
              {t(STATUS_KEYS[appointment.status])}
            </Badge>
          </div>
          {(appointment.source === "public_link" || appointment.booked_by_client) ? (
            <Badge className="w-fit border border-teal-200 bg-teal-50 text-teal-700">
              {t("agenda.source.publicLink")}
            </Badge>
          ) : null}
          {appointment.series_id ? (
            <Badge className="w-fit gap-1 border border-emerald-200 bg-emerald-50 text-emerald-700">
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
  );
}

// ── AgendaPage ────────────────────────────────────────────────────────────────

export default function AgendaPage() {
  const { locale, t } = useI18n();
  const { professionalId } = useAuth();

  // Navigation
  const [selectedDate, setSelectedDate] = useState(() => new Date());
  const [viewMode, setViewMode] = useState<AgendaViewMode>("week");
  const [activeTab, setActiveTab] = useState<AgendaTab>("agenda");

  // New appointment form
  const [isNewOpen, setIsNewOpen] = useState(false);
  const [clientId, setClientId] = useState("");
  const [serviceId, setServiceId] = useState("");
  const [time, setTime] = useState("09:00");
  const [duration, setDuration] = useState("60");
  const [notes, setNotes] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  // Send WhatsApp confirmation after creating
  const [sendAfterCreate, setSendAfterCreate] = useState(false);

  // Recurring series
  const [isRecurring, setIsRecurring] = useState(false);
  const [seriesFrequency, setSeriesFrequency] = useState<"weekly" | "biweekly" | "monthly_day" | "monthly_week">("weekly");
  const [seriesOccurrenceCount, setSeriesOccurrenceCount] = useState("4");
  const [seriesAdjustments, setSeriesAdjustments] = useState<Record<number, string>>({});

  // Detail sheet
  const [selectedAppointment, setSelectedAppointment] = useState<Appointment | null>(null);

  // Session form
  const [isSessionFormOpen, setIsSessionFormOpen] = useState(false);
  const [clinicalEvolution, setClinicalEvolution] = useState("");
  const [sessionNotes, setSessionNotes] = useState("");
  const [sessionValue, setSessionValue] = useState("0");
  const [selectedClientPackageId, setSelectedClientPackageId] = useState("");
  const [sessionError, setSessionError] = useState<string | null>(null);

  const dateKey = toDateKey(selectedDate);

  // Agenda range
  const range = useMemo(() => buildRange(viewMode, selectedDate, dateKey), [viewMode, selectedDate, dateKey]);

  // Histórico range (last 30 days, computed once)
  const historicoRange = useMemo((): AppointmentsRange => {
    const end = new Date();
    const start = addDays(end, -30);
    return { key: "historico:30d", start: start.toISOString(), end: end.toISOString() };
  }, []);

  const agendaQuery = useAppointments(professionalId, range);
  const historicoQuery = useAppointments(professionalId, historicoRange);
  const clientsQuery = useClients(professionalId);
  const servicesQuery = useServices(professionalId);
  const sessionsQuery = useSessions(professionalId);
  const clientPackagesQuery = useClientPackages(professionalId, selectedAppointment?.client_id ?? null);

  const clients = useMemo(() => clientsQuery.data ?? [], [clientsQuery.data]);
  const services = useMemo(() => servicesQuery.data?.services ?? [], [servicesQuery.data?.services]);
  const activeClients = useMemo(() => clients.filter((c) => c.is_active), [clients]);
  const activeServices = useMemo(() => services.filter((s) => s.is_active), [services]);
  const activeClientPackages = useMemo(
    () => (clientPackagesQuery.data ?? []).filter((p) => p.status === "ativo" && p.sessions_remaining > 0),
    [clientPackagesQuery.data],
  );

  const agendaAppointments = useMemo(() => agendaQuery.data ?? [], [agendaQuery.data]);

  const historicoAppointments = useMemo(() => {
    const now = new Date();
    return (historicoQuery.data ?? [])
      .filter((a) => new Date(a.scheduled_at) < now)
      .sort((a, b) => new Date(b.scheduled_at).getTime() - new Date(a.scheduled_at).getTime());
  }, [historicoQuery.data]);

  const groupedHistorico = useMemo(() => {
    const groups = new Map<string, Appointment[]>();
    for (const apt of historicoAppointments) {
      const k = toDateKey(new Date(apt.scheduled_at));
      const list = groups.get(k);
      if (list) list.push(apt);
      else groups.set(k, [apt]);
    }
    return Array.from(groups.entries());
  }, [historicoAppointments]);

  const groupedAgenda = useMemo(() => {
    const groups = new Map<string, Appointment[]>();
    for (const apt of agendaAppointments) {
      const k = toDateKey(new Date(apt.scheduled_at));
      const list = groups.get(k);
      if (list) list.push(apt);
      else groups.set(k, [apt]);
    }
    return Array.from(groups.entries());
  }, [agendaAppointments]);

  // Recurring preview dates
  const recurringPreview = useMemo(() => {
    if (!isRecurring) return [];
    const count = Number(seriesOccurrenceCount);
    if (!Number.isInteger(count) || count < 1 || count > 52) return [];
    const first = new Date(`${dateKey}T${time}:00`);
    if (Number.isNaN(first.getTime())) return [];
    return Array.from({ length: count }, (_, i) => {
      const index = i + 1;
      const base = (() => {
        if (seriesFrequency === "weekly") return addDays(first, i * 7);
        if (seriesFrequency === "biweekly") return addDays(first, i * 14);
        if (seriesFrequency === "monthly_day") return addMonths(first, i);
        return monthlyWeekOccurrence(first, i);
      })();
      const adjusted = seriesAdjustments[index];
      const date = adjusted ? new Date(adjusted) : base;
      return { index, base, value: adjusted ?? toDateTimeLocal(base), scheduledAt: date.toISOString(), adjusted: Boolean(adjusted) };
    });
  }, [dateKey, isRecurring, seriesAdjustments, seriesFrequency, seriesOccurrenceCount, time]);

  // ── Handlers ────────────────────────────────────────────────────────────────

  function goToday() {
    setSelectedDate(new Date());
  }

  function navigate(dir: -1 | 1) {
    setSelectedDate((d) => {
      if (viewMode === "week" || viewMode === "list") return addDays(d, dir * 7);
      if (viewMode === "month") return addMonths(d, dir);
      return addDays(d, dir);
    });
  }

  function handleSlotClick(date: Date, time: string) {
    setSelectedDate(date);
    setTime(time);
    setIsNewOpen(true);
  }

  function handleDaySlotClick(time: string) {
    handleSlotClick(selectedDate, time);
  }

  function handleMonthDayClick(date: Date) {
    setSelectedDate(date);
    setViewMode("day");
  }

  function resetSessionForm() {
    setClinicalEvolution("");
    setSessionNotes("");
    setSessionValue("0");
    setSelectedClientPackageId("");
    setSessionError(null);
    setIsSessionFormOpen(false);
  }

  function openSessionForm(apt: Appointment) {
    const svc = services.find((s) => s.id === apt.service_id);
    setSessionValue(String(svc?.price ?? 0));
    setClinicalEvolution("");
    setSessionNotes("");
    setSelectedClientPackageId("");
    setSessionError(null);
    setIsSessionFormOpen(true);
  }

  async function handleCreateAppointment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);

    if (!clientId) { setFormError(t("agenda.error.clientRequired")); return; }

    const durationMinutes = Number(duration);
    if (!Number.isFinite(durationMinutes) || durationMinutes <= 0) {
      setFormError(t("agenda.error.durationInvalid"));
      return;
    }

    try {
      const scheduledAt = new Date(`${dateKey}T${time}:00`).toISOString();

      if (isRecurring) {
        const count = Number(seriesOccurrenceCount);
        if (!serviceId) { setFormError(t("agenda.recurring.error.serviceRequired")); return; }
        if (!Number.isInteger(count) || count < 2 || count > 52) {
          setFormError(t("agenda.recurring.error.countInvalid"));
          return;
        }
        const result = await agendaQuery.createAppointmentSeries({
          clientId,
          serviceId,
          firstScheduledAt: scheduledAt,
          frequency: seriesFrequency,
          occurrenceCount: count,
          adjustedOccurrences: recurringPreview
            .filter((p) => p.adjusted)
            .map((p) => ({ index: p.index, scheduledAt: p.scheduledAt })),
        });
        if (!result.ok) {
          if (result.error === "series_conflicts" && result.conflicts?.length) {
            const times = result.conflicts
              .map((c: { index: number; scheduled_at: string }) => formatTime(c.scheduled_at, locale))
              .join(", ");
            setFormError(`${t("agenda.recurring.error.conflicts")}: ${times}`);
            return;
          }
          setFormError(t("agenda.recurring.error.create"));
          return;
        }
        // Send confirmation for first occurrence of series if requested
        if (sendAfterCreate && result.created_appointment_ids?.[0]) {
          try {
            await agendaQuery.sendWhatsappConfirmation({ appointmentId: result.created_appointment_ids[0] });
            toast.success(t("agenda.whatsapp.success"));
          } catch {
            toast.error(t("agenda.whatsapp.error"));
          }
        }
      } else {
        const created = await agendaQuery.createAppointment({
          clientId,
          serviceId: serviceId || null,
          scheduledAt,
          durationMinutes,
          notes: notes.trim() || null,
        });
        if (sendAfterCreate && created.appointment_id) {
          try {
            const result = await agendaQuery.sendWhatsappConfirmation({ appointmentId: created.appointment_id });
            if (result.skipped_reason) {
              toast.info(t("agenda.whatsapp.alreadySent"));
            } else {
              toast.success(t("agenda.whatsapp.success"));
            }
          } catch {
            toast.error(t("agenda.whatsapp.error"));
          }
        }
      }

      setClientId(""); setServiceId(""); setTime("09:00"); setDuration("60");
      setNotes(""); setIsRecurring(false); setSeriesFrequency("weekly");
      setSeriesOccurrenceCount("4"); setSeriesAdjustments({});
      setSendAfterCreate(false);
      setIsNewOpen(false);
    } catch (err) {
      setFormError(friendlyErrorMessage(err, t, "agenda.error.create"));
    }
  }

  async function handleCancel() {
    if (!selectedAppointment) return;
    await agendaQuery.cancelAppointment({ appointmentId: selectedAppointment.id, reason: t("agenda.cancelReason") });
    setSelectedAppointment(null);
  }

  async function handleCancelWithWhatsapp() {
    if (!selectedAppointment) return;
    try {
      await agendaQuery.cancelAppointment({ appointmentId: selectedAppointment.id, reason: t("agenda.cancelReason") });
      await agendaQuery.sendWhatsappCancellation({ appointmentId: selectedAppointment.id });
      toast.success(t("agenda.whatsapp.cancellationSent"));
    } catch {
      toast.error(t("agenda.whatsapp.cancellationError"));
    }
    setSelectedAppointment(null);
  }

  async function handleCancelSeries(scope: "from_here" | "all") {
    if (!selectedAppointment?.series_id) return;
    await agendaQuery.cancelAppointmentSeries({
      seriesId: selectedAppointment.series_id,
      scope,
      fromAppointmentId: scope === "from_here" ? selectedAppointment.id : null,
    });
    setSelectedAppointment(null);
  }

  async function handleNoShow() {
    if (!selectedAppointment) return;
    await agendaQuery.registerOutcome({ appointmentId: selectedAppointment.id, outcome: "falta", notes: t("agenda.noShowReason") });
    setSelectedAppointment(null);
  }

  async function handleSendWhatsappConfirmation() {
    if (!selectedAppointment) return;
    try {
      const result = await agendaQuery.sendWhatsappConfirmation({ appointmentId: selectedAppointment.id });
      if (result.skipped_reason) {
        toast.info(t("agenda.whatsapp.alreadySent"));
      } else {
        toast.success(t("agenda.whatsapp.success"));
      }
    } catch {
      toast.error(t("agenda.whatsapp.error"));
    }
  }

  async function handleRegisterSession(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSessionError(null);

    if (!selectedAppointment?.client_id) { setSessionError(t("session.register.error.clientRequired")); return; }
    if (!clinicalEvolution.trim()) { setSessionError(t("session.register.error.evolutionRequired")); return; }

    const parsedValue = Number(sessionValue);
    if (!Number.isFinite(parsedValue) || parsedValue < 0) {
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
        sessionValue: parsedValue,
      });
      if (selectedClientPackageId) {
        await clientPackagesQuery.useClientPackageSession({
          clientPackageId: selectedClientPackageId,
          sessionId: result.session_id,
          appointmentId: selectedAppointment.id,
        });
      }
      resetSessionForm();
      setSelectedAppointment(null);
    } catch (err) {
      setSessionError(friendlyErrorMessage(err, t, "session.register.error.save"));
    }
  }

  // ── Render ───────────────────────────────────────────────────────────────────

  const weekStart = startOfWeek(selectedDate);
  const isLoading = activeTab === "historico" ? historicoQuery.isLoading : agendaQuery.isLoading;

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-4 px-4 py-5 md:px-6">

      {/* Header */}
      <header className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-emerald-600">{t("agenda.eyebrow")}</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight text-zinc-950">{t("agenda.title")}</h1>
          <p className="mt-1 text-sm capitalize text-zinc-500">{formatRangeLabel(viewMode, selectedDate, locale)}</p>
        </div>
        <Button className="shrink-0 gap-2 bg-emerald-600 hover:bg-emerald-700" onClick={() => setIsNewOpen(true)}>
          <Plus className="h-4 w-4" />
          {t("agenda.schedule")}
        </Button>
      </header>

      {/* Tabs: Agenda / Histórico */}
      <div className="flex gap-1 border-b border-zinc-200">
        {(["agenda", "historico"] as const).map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => setActiveTab(tab)}
            className={cn(
              "px-4 pb-2.5 pt-1 text-sm font-medium transition-colors",
              activeTab === tab
                ? "border-b-2 border-emerald-600 text-emerald-700"
                : "text-zinc-500 hover:text-zinc-700",
            )}
          >
            {t(tab === "agenda" ? "agenda.tab.schedule" : "agenda.tab.historico")}
          </button>
        ))}
      </div>

      {/* Controls (only in agenda tab) */}
      {activeTab === "agenda" && (
        <>
          {/* View mode switcher */}
          <div className="flex items-center gap-1 rounded-lg bg-zinc-100 p-1">
            {(["day", "week", "month", "list"] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => setViewMode(mode)}
                className={cn(
                  "h-8 flex-1 rounded-md px-2 text-sm font-medium transition-colors",
                  viewMode === mode ? "bg-white text-zinc-950 shadow-sm" : "text-zinc-500",
                )}
              >
                {t(`agenda.view.${mode}` as TranslationKey)}
              </button>
            ))}
          </div>

          {/* Date navigator */}
          <div className="grid grid-cols-[auto_1fr_auto_auto] gap-2">
            <Button variant="outline" size="icon" aria-label={t("agenda.previousPeriod")} onClick={() => navigate(-1)}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Input
              type="date"
              value={dateKey}
              onChange={(e) => setSelectedDate(new Date(`${e.target.value}T00:00:00`))}
            />
            <Button variant="outline" size="icon" aria-label={t("agenda.nextPeriod")} onClick={() => navigate(1)}>
              <ChevronRight className="h-4 w-4" />
            </Button>
            <Button variant="outline" onClick={goToday} className="px-3 text-sm font-medium">
              {t("agenda.today")}
            </Button>
          </div>
        </>
      )}

      {/* Loading */}
      {isLoading && (
        <div className="space-y-3">
          <Skeleton className="h-24 w-full rounded-xl" />
          <Skeleton className="h-24 w-full rounded-xl" />
        </div>
      )}

      {/* ── HISTÓRICO TAB ── */}
      {activeTab === "historico" && !isLoading && (
        groupedHistorico.length === 0 ? (
          <div className="rounded-xl border border-dashed border-zinc-300 bg-white p-8 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-zinc-100">
              <CalendarDays className="h-5 w-5 text-zinc-400" />
            </div>
            <p className="mt-4 text-sm text-zinc-500">{t("agenda.historico.empty")}</p>
          </div>
        ) : (
          <section className="space-y-4">
            {groupedHistorico.map(([dayKey, items]) => (
              <div key={dayKey} className="space-y-2">
                <h2 className="text-sm font-semibold capitalize text-zinc-500">
                  {formatDateHeader(new Date(`${dayKey}T00:00:00`), locale)}
                </h2>
                <div className="space-y-2">
                  {items.map((apt) => (
                    <AppointmentCard
                      key={apt.id}
                      appointment={apt}
                      clients={clients}
                      services={services}
                      locale={locale}
                      t={t}
                      onSelect={setSelectedAppointment}
                    />
                  ))}
                </div>
              </div>
            ))}
          </section>
        )
      )}

      {/* ── AGENDA TAB ── */}
      {activeTab === "agenda" && !isLoading && !agendaQuery.error && (
        <>
          {/* Day view — time grid */}
          {viewMode === "day" && (
            agendaAppointments.length === 0 && (
              <div className="mb-3 rounded-xl border border-dashed border-zinc-300 bg-white px-4 py-3 text-center">
                <p className="text-sm text-zinc-400">{t("agenda.empty.title")} · {t("agenda.empty.description")}</p>
              </div>
            )
          )}
          {viewMode === "day" && (
            <DayTimeGrid
              appointments={agendaAppointments}
              clients={clients}
              services={services}
              locale={locale}
              t={t}
              onSlotClick={handleDaySlotClick}
              onAppointmentClick={setSelectedAppointment}
            />
          )}

          {/* Week view — time grid */}
          {viewMode === "week" && (
            <WeekTimeGrid
              appointments={agendaAppointments}
              weekStart={weekStart}
              clients={clients}
              services={services}
              locale={locale}
              onSlotClick={handleSlotClick}
              onAppointmentClick={setSelectedAppointment}
            />
          )}

          {/* Month view — calendar grid */}
          {viewMode === "month" && (
            <MonthGrid
              appointments={agendaAppointments}
              currentMonth={selectedDate}
              locale={locale}
              onDayClick={handleMonthDayClick}
            />
          )}

          {/* List view — grouped chronological */}
          {viewMode === "list" && (
            agendaAppointments.length === 0 ? (
              <div className="rounded-xl border border-dashed border-zinc-300 bg-white p-8 text-center">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-zinc-100">
                  <CalendarDays className="h-5 w-5 text-zinc-400" />
                </div>
                <h2 className="mt-4 text-base font-semibold text-zinc-950">{t("agenda.empty.titleRange")}</h2>
                <p className="mt-1 text-sm text-zinc-500">{t("agenda.empty.descriptionRange")}</p>
                <Button className="mt-4 gap-2 bg-emerald-600 hover:bg-emerald-700" onClick={() => setIsNewOpen(true)}>
                  <Plus className="h-4 w-4" />
                  {t("agenda.schedule")}
                </Button>
              </div>
            ) : (
              <section className="space-y-4">
                {groupedAgenda.map(([dayKey, items]) => (
                  <div key={dayKey} className="space-y-2">
                    <h2 className="text-sm font-semibold capitalize text-zinc-600">
                      {formatDateHeader(new Date(`${dayKey}T00:00:00`), locale)}
                    </h2>
                    <div className="space-y-2">
                      {items.map((apt) => (
                        <AppointmentCard
                          key={apt.id}
                          appointment={apt}
                          clients={clients}
                          services={services}
                          locale={locale}
                          t={t}
                          onSelect={setSelectedAppointment}
                        />
                      ))}
                    </div>
                  </div>
                ))}
              </section>
            )
          )}
        </>
      )}

      {agendaQuery.error && activeTab === "agenda" && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {t("agenda.error.load")}
        </div>
      )}

      {/* ── New appointment sheet ── */}
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
                  className="h-10 w-full rounded-md border border-zinc-200 bg-white px-3 text-sm shadow-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
                  value={clientId}
                  onChange={(e) => setClientId(e.target.value)}
                >
                  <option value="">{t("common.select")}</option>
                  {activeClients.map((c) => (
                    <option key={c.id} value={c.id}>{c.full_name}</option>
                  ))}
                </select>
              </label>

              <label className="block space-y-1.5">
                <span className="text-sm font-medium text-zinc-700">{t("agenda.service")}</span>
                <select
                  className="h-10 w-full rounded-md border border-zinc-200 bg-white px-3 text-sm shadow-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
                  value={serviceId}
                  onChange={(e) => {
                    setServiceId(e.target.value);
                    const svc = activeServices.find((s) => s.id === e.target.value);
                    if (svc) setDuration(String(svc.duration_minutes));
                  }}
                >
                  <option value="">{t("agenda.noService")}</option>
                  {activeServices.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </label>

              <div className="grid grid-cols-2 gap-3">
                <label className="block space-y-1.5">
                  <span className="text-sm font-medium text-zinc-700">{t("agenda.time")}</span>
                  <Input value={time} type="time" onChange={(e) => setTime(e.target.value)} />
                </label>
                <label className="block space-y-1.5">
                  <span className="text-sm font-medium text-zinc-700">{t("agenda.duration")}</span>
                  <Input value={duration} inputMode="numeric" onChange={(e) => setDuration(e.target.value)} />
                </label>
              </div>

              <label className="block space-y-1.5">
                <span className="text-sm font-medium text-zinc-700">{t("agenda.note")}</span>
                <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={t("common.optional")} />
              </label>

              {/* WhatsApp confirmation toggle */}
              <label className="flex items-center gap-3 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2.5">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-emerald-300 text-emerald-600"
                  checked={sendAfterCreate}
                  onChange={(e) => setSendAfterCreate(e.target.checked)}
                />
                <div className="flex items-center gap-2 text-sm font-medium text-zinc-700">
                  <MessageCircle className="h-4 w-4 text-emerald-600" />
                  {t("agenda.whatsapp.sendAfterCreate")}
                </div>
              </label>

              {/* Recurring */}
              <div className="rounded-lg border border-emerald-100 bg-emerald-50/60 p-3">
                <label className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    className="mt-1 h-4 w-4 rounded border-emerald-300 text-emerald-700"
                    checked={isRecurring}
                    onChange={(e) => setIsRecurring(e.target.checked)}
                  />
                  <span>
                    <span className="block text-sm font-semibold text-zinc-950">{t("agenda.recurring.enable")}</span>
                    <span className="mt-1 block text-xs leading-5 text-zinc-500">{t("agenda.recurring.description")}</span>
                  </span>
                </label>

                {isRecurring && (
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    <label className="block space-y-1.5">
                      <span className="text-sm font-medium text-zinc-700">{t("agenda.recurring.frequency")}</span>
                      <select
                        className="h-10 w-full rounded-md border border-zinc-200 bg-white px-3 text-sm shadow-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
                        value={seriesFrequency}
                        onChange={(e) => setSeriesFrequency(e.target.value as typeof seriesFrequency)}
                      >
                        <option value="weekly">{t("agenda.recurring.frequency.weekly")}</option>
                        <option value="biweekly">{t("agenda.recurring.frequency.biweekly")}</option>
                        <option value="monthly_day">{t("agenda.recurring.frequency.monthlyDay")}</option>
                        <option value="monthly_week">{t("agenda.recurring.frequency.monthlyWeek")}</option>
                      </select>
                    </label>
                    <label className="block space-y-1.5">
                      <span className="text-sm font-medium text-zinc-700">{t("agenda.recurring.count")}</span>
                      <Input
                        value={seriesOccurrenceCount}
                        inputMode="numeric"
                        onChange={(e) => { setSeriesOccurrenceCount(e.target.value); setSeriesAdjustments({}); }}
                      />
                    </label>
                  </div>
                )}

                {isRecurring && recurringPreview.length > 0 && (
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
                            onChange={(e) =>
                              setSeriesAdjustments((prev) => ({ ...prev, [item.index]: e.target.value }))
                            }
                          />
                        </label>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {formError && (
                <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{formError}</div>
              )}
            </div>
            <SheetFooter>
              <Button type="button" variant="outline" onClick={() => setIsNewOpen(false)}>{t("common.cancel")}</Button>
              <Button
                type="submit"
                className="bg-emerald-600 hover:bg-emerald-700"
                disabled={agendaQuery.isCreatingAppointment || agendaQuery.isCreatingAppointmentSeries}
              >
                {agendaQuery.isCreatingAppointment || agendaQuery.isCreatingAppointmentSeries
                  ? t("common.saving")
                  : isRecurring ? t("agenda.recurring.create") : t("common.save")}
              </Button>
            </SheetFooter>
          </form>
        </SheetContent>
      </Sheet>

      {/* ── Appointment detail sheet ── */}
      <Sheet
        open={Boolean(selectedAppointment)}
        onOpenChange={(open) => {
          if (!open) { resetSessionForm(); setSelectedAppointment(null); }
        }}
      >
        <SheetContent>
          {selectedAppointment && (
            <>
              <SheetHeader>
                <SheetTitle>{getClientName(selectedAppointment.client_id, clients, t("agenda.defaultClient"))}</SheetTitle>
              </SheetHeader>
              <div className="space-y-4 px-4 py-2">
                <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-4">
                  <p className="text-sm font-medium text-zinc-950">
                    {new Intl.DateTimeFormat(locale, { weekday: "long", day: "2-digit", month: "long" }).format(new Date(selectedAppointment.scheduled_at))}
                  </p>
                  <p className="mt-1 text-sm text-zinc-500">
                    {formatTime(selectedAppointment.scheduled_at, locale)} · {selectedAppointment.duration_minutes} {t("common.minutes.short")}
                  </p>
                  <p className="mt-1 text-sm text-zinc-500">
                    {getServiceName(selectedAppointment.service_id, services, t("agenda.noService"))}
                  </p>
                </div>

                <Badge className={cn("border", statusBadge(selectedAppointment.status))}>
                  {t(STATUS_KEYS[selectedAppointment.status])}
                </Badge>

                {(selectedAppointment.status === "agendado" || selectedAppointment.status === "confirmado") && (
                  <div className="grid gap-2">
                    {/* WhatsApp confirmation */}
                    {selectedAppointment.status === "agendado" && (
                      selectedAppointment.confirmation_sent_at ? (
                        <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
                          <MessageCircle className="h-4 w-4 shrink-0" />
                          {t("agenda.whatsapp.confirmationSent")}
                        </div>
                      ) : (
                        <Button
                          variant="outline"
                          className="gap-2 border-emerald-200 text-emerald-700 hover:bg-emerald-50"
                          onClick={handleSendWhatsappConfirmation}
                          disabled={agendaQuery.isSendingWhatsappConfirmation}
                        >
                          <MessageCircle className="h-4 w-4" />
                          {agendaQuery.isSendingWhatsappConfirmation ? t("common.saving") : t("agenda.whatsapp.sendConfirmation")}
                        </Button>
                      )
                    )}

                    <Button
                      className="gap-2 bg-emerald-600 hover:bg-emerald-700"
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
                      disabled={agendaQuery.isCancellingAppointment}
                    >
                      <XCircle className="h-4 w-4" />
                      {t("agenda.cancelAppointment")}
                    </Button>
                    <Button
                      variant="outline"
                      className="gap-2 border-red-300 text-red-700 hover:bg-red-50"
                      onClick={handleCancelWithWhatsapp}
                      disabled={agendaQuery.isCancellingAppointment || agendaQuery.isSendingWhatsappCancellation}
                    >
                      <MessageCircle className="h-4 w-4" />
                      {t("agenda.whatsapp.sendCancellation")}
                    </Button>
                    <Button
                      variant="outline"
                      className="gap-2"
                      onClick={handleNoShow}
                      disabled={agendaQuery.isRegisteringOutcome}
                    >
                      {t("agenda.markNoShow")}
                    </Button>
                  </div>
                )}

                {selectedAppointment.series_id && (
                  <div className="grid gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3">
                    <p className="text-sm font-semibold text-emerald-900">{t("agenda.recurring.manage")}</p>
                    <Button
                      variant="outline"
                      className="border-emerald-200 bg-white text-emerald-700 hover:bg-emerald-50"
                      onClick={() => handleCancelSeries("from_here")}
                      disabled={agendaQuery.isCancellingAppointmentSeries}
                    >
                      {t("agenda.recurring.cancelFromHere")}
                    </Button>
                    <Button
                      variant="outline"
                      className="border-red-200 bg-white text-red-700 hover:bg-red-50"
                      onClick={() => handleCancelSeries("all")}
                      disabled={agendaQuery.isCancellingAppointmentSeries}
                    >
                      {t("agenda.recurring.cancelAll")}
                    </Button>
                  </div>
                )}

                {isSessionFormOpen && (
                  <form onSubmit={handleRegisterSession} className="space-y-3 rounded-lg border border-zinc-200 p-3">
                    <h3 className="text-sm font-semibold text-zinc-950">{t("session.register.title")}</h3>
                    <label className="block space-y-1.5">
                      <span className="text-sm font-medium text-zinc-700">{t("session.register.clinicalEvolution")}</span>
                      <textarea
                        className="min-h-24 w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm shadow-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
                        value={clinicalEvolution}
                        onChange={(e) => setClinicalEvolution(e.target.value)}
                        placeholder={t("session.register.clinicalEvolutionPlaceholder")}
                      />
                    </label>
                    <label className="block space-y-1.5">
                      <span className="text-sm font-medium text-zinc-700">{t("session.register.notes")}</span>
                      <Input value={sessionNotes} onChange={(e) => setSessionNotes(e.target.value)} placeholder={t("common.optional")} />
                    </label>
                    <label className="block space-y-1.5">
                      <span className="text-sm font-medium text-zinc-700">{t("session.register.value")}</span>
                      <Input value={sessionValue} onChange={(e) => setSessionValue(e.target.value)} inputMode="decimal" />
                    </label>
                    {activeClientPackages.length > 0 && (
                      <label className="block space-y-1.5 rounded-lg border border-emerald-200 bg-emerald-50 p-3">
                        <span className="text-sm font-medium text-emerald-900">{t("session.register.packageUse")}</span>
                        <select
                          className="mt-2 h-10 w-full rounded-md border border-emerald-200 bg-white px-3 text-sm shadow-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
                          value={selectedClientPackageId}
                          onChange={(e) => setSelectedClientPackageId(e.target.value)}
                        >
                          <option value="">{t("session.register.packageNone")}</option>
                          {activeClientPackages.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.package_name ?? t("docs.tab.packages")} – {p.sessions_remaining}/{p.sessions_total}
                            </option>
                          ))}
                        </select>
                        <span className="mt-2 block text-xs leading-5 text-emerald-700">
                          {t("session.register.packageUseDescription")}
                        </span>
                      </label>
                    )}
                    {sessionError && (
                      <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{sessionError}</div>
                    )}
                    <div className="grid grid-cols-2 gap-2">
                      <Button type="button" variant="outline" onClick={resetSessionForm}>{t("common.cancel")}</Button>
                      <Button type="submit" className="bg-emerald-600 hover:bg-emerald-700" disabled={sessionsQuery.isRegisteringSession}>
                        {sessionsQuery.isRegisteringSession ? t("common.saving") : t("common.save")}
                      </Button>
                    </div>
                  </form>
                )}
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
