import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Building2, Pencil, Save, UserRound, Users } from "lucide-react";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
  Sheet,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  Skeleton,
} from "@iaprafaturar/ui";
import type {
  BusinessHours,
  BusinessHoursException,
  BusinessHoursValue,
  ScheduleTeamMemberSummary,
  TimeInterval,
  Weekday,
} from "@iaprafaturar/domain";
import { useAuth } from "@/contexts/AuthContext";
import { useBusinessHours } from "@/hooks/useBusinessHours";
import { useI18n, type TranslationKey } from "@/i18n";

const DEFAULT_TIMEZONE = "America/Sao_Paulo";

const WEEKDAYS: Weekday[] = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];

const WEEKDAY_LABEL_KEYS: Record<Weekday, TranslationKey> = {
  monday: "settings.schedule.day.monday",
  tuesday: "settings.schedule.day.tuesday",
  wednesday: "settings.schedule.day.wednesday",
  thursday: "settings.schedule.day.thursday",
  friday: "settings.schedule.day.friday",
  saturday: "settings.schedule.day.saturday",
  sunday: "settings.schedule.day.sunday",
};

interface DayState {
  enabled: boolean;
  start: string;
  end: string;
  additionalIntervals: TimeInterval[];
}

type WeeklyFormState = Record<Weekday, DayState>;

const DEFAULT_OPEN_DAY: DayState = { enabled: true, start: "09:00", end: "18:00", additionalIntervals: [] };
const DEFAULT_CLOSED_DAY: DayState = { enabled: false, start: "09:00", end: "18:00", additionalIntervals: [] };

const DEFAULT_WEEKLY: WeeklyFormState = {
  monday: { ...DEFAULT_OPEN_DAY },
  tuesday: { ...DEFAULT_OPEN_DAY },
  wednesday: { ...DEFAULT_OPEN_DAY },
  thursday: { ...DEFAULT_OPEN_DAY },
  friday: { ...DEFAULT_OPEN_DAY },
  saturday: { ...DEFAULT_CLOSED_DAY },
  sunday: { ...DEFAULT_CLOSED_DAY },
};

function toWeeklyForm(hours: BusinessHoursValue): WeeklyFormState {
  const weekly = (hours as BusinessHours)?.weekly ?? {};
  const result = {} as WeeklyFormState;
  for (const day of WEEKDAYS) {
    const firstInterval = weekly[day]?.[0];
    if (firstInterval) {
      result[day] = {
        enabled: true,
        start: firstInterval.start,
        end: firstInterval.end,
        additionalIntervals: weekly[day]?.slice(1) ?? [],
      };
    } else {
      result[day] = { ...DEFAULT_CLOSED_DAY };
    }
  }
  return result;
}

function toExceptions(hours: BusinessHoursValue): BusinessHoursException[] {
  const exceptions = (hours as BusinessHours)?.exceptions;
  return Array.isArray(exceptions) ? exceptions : [];
}

function toTimezone(hours: BusinessHoursValue): string {
  const timezone = (hours as BusinessHours)?.timezone;
  return typeof timezone === "string" && timezone ? timezone : DEFAULT_TIMEZONE;
}

function toBusinessHoursPayload(
  weekly: WeeklyFormState,
  timezone: string,
  exceptions: BusinessHoursException[],
): BusinessHours {
  const weeklyPayload: Partial<Record<Weekday, TimeInterval[]>> = {};
  for (const day of WEEKDAYS) {
    const dayState = weekly[day];
    weeklyPayload[day] = dayState.enabled
      ? [{ start: dayState.start, end: dayState.end }, ...dayState.additionalIntervals]
      : [];
  }
  return { schema_version: 1, timezone, weekly: weeklyPayload, exceptions };
}

function WeeklyHoursEditor({
  weekly,
  onChange,
  t,
}: {
  weekly: WeeklyFormState;
  onChange: (next: WeeklyFormState) => void;
  t: ReturnType<typeof useI18n>["t"];
}) {
  return (
    <div className="space-y-2">
      {WEEKDAYS.map((day) => (
        <div key={day} className="rounded-lg border border-zinc-200 px-3 py-3">
          <div className="flex items-center justify-between gap-3">
            <label className="flex items-center gap-2 text-sm font-medium text-zinc-900">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-zinc-300 text-violet-600"
                checked={weekly[day].enabled}
                onChange={(event) =>
                  onChange({ ...weekly, [day]: { ...weekly[day], enabled: event.target.checked } })
                }
              />
              {t(WEEKDAY_LABEL_KEYS[day])}
            </label>
            {!weekly[day].enabled && <span className="text-xs text-zinc-500">{t("settings.schedule.closed")}</span>}
          </div>
          {weekly[day].enabled && (
            <div className="mt-2 grid grid-cols-2 gap-2">
              <Input
                type="time"
                aria-label={t("settings.schedule.start")}
                value={weekly[day].start}
                onChange={(event) =>
                  onChange({ ...weekly, [day]: { ...weekly[day], start: event.target.value } })
                }
              />
              <Input
                type="time"
                aria-label={t("settings.schedule.end")}
                value={weekly[day].end}
                onChange={(event) =>
                  onChange({ ...weekly, [day]: { ...weekly[day], end: event.target.value } })
                }
              />
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function WeeklyHoursSummary({ weekly, t }: { weekly: WeeklyFormState; t: ReturnType<typeof useI18n>["t"] }) {
  return (
    <div className="grid gap-1.5 text-sm">
      {WEEKDAYS.map((day) => (
        <div key={day} className="flex items-center justify-between gap-3 rounded-lg border border-zinc-200 px-3 py-2">
          <span className="text-zinc-700">{t(WEEKDAY_LABEL_KEYS[day])}</span>
          <span className="text-zinc-500">
            {weekly[day].enabled ? `${weekly[day].start} – ${weekly[day].end}` : t("settings.schedule.closed")}
          </span>
        </div>
      ))}
    </div>
  );
}

interface MemberFormState {
  useClinic: boolean;
  weekly: WeeklyFormState;
  timezone: string;
  exceptions: BusinessHoursException[];
}

export default function ConfiguracoesAgendaPage() {
  const { t } = useI18n();
  const { professionalId, role } = useAuth();
  const query = useBusinessHours(professionalId);

  const [clinicWeekly, setClinicWeekly] = useState<WeeklyFormState>(DEFAULT_WEEKLY);
  const [clinicTimezone, setClinicTimezone] = useState(DEFAULT_TIMEZONE);
  const [clinicExceptions, setClinicExceptions] = useState<BusinessHoursException[]>([]);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState(false);

  const [editingMember, setEditingMember] = useState<ScheduleTeamMemberSummary | null>(null);
  const [memberForm, setMemberForm] = useState<MemberFormState | null>(null);
  const [isMemberSheetOpen, setIsMemberSheetOpen] = useState(false);

  const isGestor = role === "gestor";

  useEffect(() => {
    if (query.data?.clinicHours) {
      setClinicWeekly(toWeeklyForm(query.data.clinicHours));
      setClinicTimezone(toTimezone(query.data.clinicHours));
      setClinicExceptions(toExceptions(query.data.clinicHours));
    }
  }, [query.data?.clinicHours]);

  async function handleSaveClinic() {
    setSaved(false);
    setSaveError(false);
    try {
      await query.updateClinicHours(toBusinessHoursPayload(clinicWeekly, clinicTimezone, clinicExceptions));
      setSaved(true);
    } catch {
      setSaveError(true);
    }
  }

  function openMemberSheet(member: ScheduleTeamMemberSummary) {
    const hasIndividualHours = member.business_hours && Object.keys(member.business_hours).length > 0;
    setEditingMember(member);
    setMemberForm({
      useClinic: !hasIndividualHours,
      weekly: hasIndividualHours ? toWeeklyForm(member.business_hours) : clinicWeekly,
      timezone: hasIndividualHours ? toTimezone(member.business_hours) : clinicTimezone,
      exceptions: hasIndividualHours ? toExceptions(member.business_hours) : [],
    });
    setIsMemberSheetOpen(true);
  }

  async function handleSaveMember() {
    if (!editingMember || !memberForm) return;

    const businessHours: BusinessHoursValue = memberForm.useClinic
      ? {}
      : toBusinessHoursPayload(memberForm.weekly, memberForm.timezone, memberForm.exceptions);

    await query.updateTeamMemberHours({ teamMemberId: editingMember.id, businessHours });
    setIsMemberSheetOpen(false);
  }

  if (!professionalId || query.isLoading) {
    return (
      <div className="space-y-4 p-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  const myHours = query.data?.myHours ?? {};
  const myWeekly = toWeeklyForm(myHours);
  const mySource = query.data?.myHoursSource ?? "clinic";
  const teamMembers = query.data?.teamMembers ?? [];

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-5 px-4 py-5 pb-28 md:px-6 md:pb-6">
      <header className="space-y-1">
        <Button asChild variant="ghost" className="w-fit gap-2 px-0">
          <Link to="/configuracoes">
            <ArrowLeft className="h-4 w-4" />
            {t("team.back")}
          </Link>
        </Button>
        <p className="text-xs font-semibold uppercase tracking-wide text-violet-600">{t("settings.schedule.eyebrow")}</p>
        <h1 className="text-2xl font-semibold text-zinc-950">{t("settings.schedule.title")}</h1>
        <p className="text-sm leading-6 text-zinc-500">{t("settings.schedule.subtitle")}</p>
      </header>

      {query.isError && (
        <div className="rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-sm text-red-700">
          {t("settings.schedule.error.load")}
        </div>
      )}

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-violet-100 text-violet-700">
                <UserRound className="h-5 w-5" />
              </div>
              <div>
                <CardTitle>{t("settings.schedule.mine.title")}</CardTitle>
              </div>
            </div>
            <Badge variant={mySource === "individual" ? "default" : "secondary"}>
              {mySource === "individual"
                ? t("settings.schedule.mine.source.individual")
                : t("settings.schedule.mine.source.clinic")}
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          <WeeklyHoursSummary weekly={myWeekly} t={t} />
        </CardContent>
      </Card>

      {isGestor && (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-indigo-100 text-indigo-700">
                <Building2 className="h-5 w-5" />
              </div>
              <div>
                <CardTitle>{t("settings.schedule.clinic.title")}</CardTitle>
                <CardDescription>{t("settings.schedule.clinic.description")}</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1">
              <p className="text-sm font-medium text-zinc-700">{t("settings.schedule.timezone")}</p>
              <p className="text-sm text-zinc-500">{clinicTimezone}</p>
            </div>
            <WeeklyHoursEditor weekly={clinicWeekly} onChange={setClinicWeekly} t={t} />
          </CardContent>
        </Card>
      )}

      {isGestor && (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-100 text-amber-700">
                <Users className="h-5 w-5" />
              </div>
              <div>
                <CardTitle>{t("settings.schedule.team.title")}</CardTitle>
                <CardDescription>{t("settings.schedule.team.description")}</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-2">
            {teamMembers.length === 0 ? (
              <p className="rounded-lg border border-dashed border-zinc-300 p-4 text-center text-sm text-zinc-500">
                {t("settings.schedule.team.empty")}
              </p>
            ) : (
              teamMembers.map((member) => {
                const hasIndividualHours = member.business_hours && Object.keys(member.business_hours).length > 0;
                return (
                  <div
                    key={member.id}
                    className="flex items-center justify-between gap-3 rounded-lg border border-zinc-200 px-3 py-3"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-zinc-950">{member.name}</p>
                      <Badge variant={hasIndividualHours ? "default" : "secondary"} className="mt-1">
                        {hasIndividualHours
                          ? t("settings.schedule.mine.source.individual")
                          : t("settings.schedule.mine.source.clinic")}
                      </Badge>
                    </div>
                    <Button variant="outline" className="shrink-0 gap-2" onClick={() => openMemberSheet(member)}>
                      <Pencil className="h-4 w-4" />
                      {t("settings.schedule.team.edit")}
                    </Button>
                  </div>
                );
              })
            )}
          </CardContent>
        </Card>
      )}

      {isGestor && (
        <div className="sticky bottom-20 z-10 md:bottom-4">
          <div className="rounded-xl border border-zinc-200 bg-white/95 p-3 shadow-lg backdrop-blur">
            <Button className="w-full" onClick={handleSaveClinic} disabled={query.isUpdatingClinicHours}>
              <Save className="mr-2 h-4 w-4" />
              {query.isUpdatingClinicHours ? t("common.saving") : t("settings.schedule.save")}
            </Button>
            {saved && <p className="mt-2 text-center text-sm text-emerald-700">{t("settings.schedule.saved")}</p>}
            {saveError && <p className="mt-2 text-center text-sm text-red-700">{t("settings.schedule.error.save")}</p>}
          </div>
        </div>
      )}

      <Sheet open={isMemberSheetOpen} onOpenChange={setIsMemberSheetOpen}>
        <SheetContent className="max-h-[88vh] overflow-y-auto">
          <SheetHeader>
            <SheetTitle>{t("settings.schedule.team.editTitle", { name: editingMember?.name ?? "" })}</SheetTitle>
          </SheetHeader>

          {memberForm && (
            <div className="space-y-4 px-4 py-2">
              <label className="flex items-start gap-3 rounded-lg border border-zinc-200 px-3 py-3">
                <input
                  type="checkbox"
                  className="mt-1 h-4 w-4 rounded border-zinc-300 text-violet-600"
                  checked={memberForm.useClinic}
                  onChange={(event) =>
                    setMemberForm((current) => (current ? { ...current, useClinic: event.target.checked } : current))
                  }
                />
                <span className="text-sm font-medium text-zinc-900">{t("settings.schedule.team.useClinic")}</span>
              </label>

              {!memberForm.useClinic && (
                <WeeklyHoursEditor
                  weekly={memberForm.weekly}
                  onChange={(next) => setMemberForm((current) => (current ? { ...current, weekly: next } : current))}
                  t={t}
                />
              )}
            </div>
          )}

          <SheetFooter>
            <Button type="button" variant="outline" onClick={() => setIsMemberSheetOpen(false)}>
              {t("common.cancel")}
            </Button>
            <Button type="button" onClick={handleSaveMember} disabled={query.isUpdatingTeamMemberHours}>
              {query.isUpdatingTeamMemberHours ? t("common.saving") : t("common.save")}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </div>
  );
}
