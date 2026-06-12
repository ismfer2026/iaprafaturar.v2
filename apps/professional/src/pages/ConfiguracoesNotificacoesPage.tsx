import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Bell, Building2, UserRound } from "lucide-react";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
  Skeleton,
} from "@iaprafaturar/ui";
import type { NotificationSettings, NotificationSettingsValue } from "@iaprafaturar/domain";
import { useAuth } from "@/contexts/AuthContext";
import { useNotificationSettings } from "@/hooks/useNotificationSettings";
import { useI18n, type TranslationKey } from "@/i18n";

interface NotificationFormState {
  channels: { whatsapp: boolean; email: boolean; push: boolean };
  events: {
    new_appointment: boolean;
    appointment_cancelled: boolean;
    appointment_reminder: boolean;
    new_message: boolean;
    payment_received: boolean;
    anamnese_submitted: boolean;
  };
  quiet_hours: { enabled: boolean; start: string; end: string };
}

const DEFAULT_FORM: NotificationFormState = {
  channels: { whatsapp: true, email: false, push: true },
  events: {
    new_appointment: true,
    appointment_cancelled: true,
    appointment_reminder: true,
    new_message: true,
    payment_received: true,
    anamnese_submitted: true,
  },
  quiet_hours: { enabled: false, start: "20:00", end: "08:00" },
};

const CHANNEL_OPTIONS = [
  { key: "whatsapp", labelKey: "settings.notifications.channels.whatsapp" },
  { key: "email", labelKey: "settings.notifications.channels.email" },
  { key: "push", labelKey: "settings.notifications.channels.push" },
] satisfies Array<{ key: keyof NotificationFormState["channels"]; labelKey: TranslationKey }>;

const EVENT_OPTIONS = [
  { key: "new_appointment", labelKey: "settings.notifications.events.newAppointment" },
  { key: "appointment_cancelled", labelKey: "settings.notifications.events.appointmentCancelled" },
  { key: "appointment_reminder", labelKey: "settings.notifications.events.appointmentReminder" },
  { key: "new_message", labelKey: "settings.notifications.events.newMessage" },
  { key: "payment_received", labelKey: "settings.notifications.events.paymentReceived" },
  { key: "anamnese_submitted", labelKey: "settings.notifications.events.anamneseSubmitted" },
] satisfies Array<{ key: keyof NotificationFormState["events"]; labelKey: TranslationKey }>;

function toFormState(value: NotificationSettingsValue): NotificationFormState {
  if (!value || Object.keys(value).length === 0) {
    return DEFAULT_FORM;
  }

  const settings = value as NotificationSettings;
  return {
    channels: { ...DEFAULT_FORM.channels, ...settings.channels },
    events: { ...DEFAULT_FORM.events, ...settings.events },
    quiet_hours: { ...DEFAULT_FORM.quiet_hours, ...settings.quiet_hours },
  };
}

function toPayload(form: NotificationFormState): NotificationSettings {
  return {
    schema_version: 1,
    channels: form.channels,
    events: form.events,
    quiet_hours: form.quiet_hours,
  };
}

function NotificationForm({
  form,
  onChange,
  t,
}: {
  form: NotificationFormState;
  onChange: (next: NotificationFormState) => void;
  t: ReturnType<typeof useI18n>["t"];
}) {
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <p className="text-sm font-medium text-zinc-700">{t("settings.notifications.channels.title")}</p>
        <div className="grid gap-2 sm:grid-cols-3">
          {CHANNEL_OPTIONS.map((option) => (
            <label key={option.key} className="flex items-center gap-2 rounded-lg border border-zinc-200 px-3 py-2 text-sm">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-zinc-300 text-violet-600"
                checked={form.channels[option.key]}
                onChange={(event) =>
                  onChange({ ...form, channels: { ...form.channels, [option.key]: event.target.checked } })
                }
              />
              {t(option.labelKey)}
            </label>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <p className="text-sm font-medium text-zinc-700">{t("settings.notifications.events.title")}</p>
        <div className="grid gap-2 sm:grid-cols-2">
          {EVENT_OPTIONS.map((option) => (
            <label key={option.key} className="flex items-center gap-2 rounded-lg border border-zinc-200 px-3 py-2 text-sm">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-zinc-300 text-violet-600"
                checked={form.events[option.key]}
                onChange={(event) =>
                  onChange({ ...form, events: { ...form.events, [option.key]: event.target.checked } })
                }
              />
              {t(option.labelKey)}
            </label>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <label className="flex items-start gap-3 rounded-lg border border-zinc-200 px-3 py-3">
          <input
            type="checkbox"
            className="mt-1 h-4 w-4 rounded border-zinc-300 text-violet-600"
            checked={form.quiet_hours.enabled}
            onChange={(event) =>
              onChange({ ...form, quiet_hours: { ...form.quiet_hours, enabled: event.target.checked } })
            }
          />
          <span>
            <span className="block text-sm font-medium text-zinc-900">{t("settings.notifications.quietHours.enabled")}</span>
            <span className="mt-0.5 block text-sm leading-5 text-zinc-500">
              {t("settings.notifications.quietHours.description")}
            </span>
          </span>
        </label>

        {form.quiet_hours.enabled && (
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <label htmlFor="quietHoursStart" className="text-sm font-medium text-zinc-700">
                {t("settings.notifications.quietHours.start")}
              </label>
              <Input
                id="quietHoursStart"
                type="time"
                value={form.quiet_hours.start}
                onChange={(event) =>
                  onChange({ ...form, quiet_hours: { ...form.quiet_hours, start: event.target.value } })
                }
              />
            </div>
            <div className="space-y-1">
              <label htmlFor="quietHoursEnd" className="text-sm font-medium text-zinc-700">
                {t("settings.notifications.quietHours.end")}
              </label>
              <Input
                id="quietHoursEnd"
                type="time"
                value={form.quiet_hours.end}
                onChange={(event) =>
                  onChange({ ...form, quiet_hours: { ...form.quiet_hours, end: event.target.value } })
                }
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function ConfiguracoesNotificacoesPage() {
  const { t } = useI18n();
  const { professionalId, role } = useAuth();
  const query = useNotificationSettings(professionalId);

  const [mineForm, setMineForm] = useState<NotificationFormState>(DEFAULT_FORM);
  const [clinicForm, setClinicForm] = useState<NotificationFormState>(DEFAULT_FORM);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState(false);

  const isGestor = role === "gestor";

  useEffect(() => {
    if (query.data) {
      setMineForm(toFormState(query.data.myPreferences));
      setClinicForm(toFormState(query.data.clinicDefaults));
    }
  }, [query.data]);

  async function handleSave() {
    setSaved(false);
    setSaveError(false);
    try {
      await query.updateMyPreferences(toPayload(mineForm));
      if (isGestor) {
        await query.updateClinicSettings(toPayload(clinicForm));
      }
      setSaved(true);
    } catch {
      setSaveError(true);
    }
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

  const isSaving = query.isUpdatingMyPreferences || query.isUpdatingClinicSettings;
  const source = query.data?.myPreferencesSource ?? "clinic";

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-5 px-4 py-5 pb-28 md:px-6 md:pb-6">
      <header className="space-y-1">
        <Button asChild variant="ghost" className="w-fit gap-2 px-0">
          <Link to="/configuracoes">
            <ArrowLeft className="h-4 w-4" />
            {t("team.back")}
          </Link>
        </Button>
        <p className="text-xs font-semibold uppercase tracking-wide text-violet-600">
          {t("settings.notifications.eyebrow")}
        </p>
        <h1 className="text-2xl font-semibold text-zinc-950">{t("settings.notifications.title")}</h1>
        <p className="text-sm leading-6 text-zinc-500">{t("settings.notifications.subtitle")}</p>
      </header>

      {query.isError && (
        <div className="rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-sm text-red-700">
          {t("settings.notifications.error.load")}
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
                <CardTitle>{t("settings.notifications.mine.title")}</CardTitle>
                <CardDescription>{t("settings.notifications.mine.description")}</CardDescription>
              </div>
            </div>
            <Badge variant={source === "individual" ? "default" : "secondary"}>
              {source === "individual"
                ? t("settings.notifications.mine.source.individual")
                : t("settings.notifications.mine.source.clinic")}
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          <NotificationForm form={mineForm} onChange={setMineForm} t={t} />
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
                <CardTitle>{t("settings.notifications.clinic.title")}</CardTitle>
                <CardDescription>{t("settings.notifications.clinic.description")}</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <NotificationForm form={clinicForm} onChange={setClinicForm} t={t} />
          </CardContent>
        </Card>
      )}

      <div className="sticky bottom-20 z-10 md:bottom-4">
        <div className="rounded-xl border border-zinc-200 bg-white/95 p-3 shadow-lg backdrop-blur">
          <Button className="w-full" onClick={handleSave} disabled={isSaving}>
            <Bell className="mr-2 h-4 w-4" />
            {isSaving ? t("common.saving") : t("settings.notifications.save")}
          </Button>
          {saved && <p className="mt-2 text-center text-sm text-emerald-700">{t("settings.notifications.saved")}</p>}
          {saveError && <p className="mt-2 text-center text-sm text-red-700">{t("settings.notifications.error.save")}</p>}
        </div>
      </div>
    </div>
  );
}
