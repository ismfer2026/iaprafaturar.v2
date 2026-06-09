import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { CalendarClock, CheckCircle2, XCircle } from "lucide-react";
import { useParams } from "react-router-dom";
import { Button, Card, CardContent, CardHeader, CardTitle, Input, cn } from "@iaprafaturar/ui";
import { useI18n } from "@/i18n";
import {
  cancelPublicAppointment,
  reschedulePublicAppointment,
} from "@/lib/public-appointment-actions-api";
import { PublicLayout } from "./PublicLayout";

type ActionMode = "cancel" | "reschedule";

function toIsoFromLocal(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString();
}

function actionErrorKey(error: string | undefined) {
  if (error === "appointment_not_found") return "appointmentActions.error.notFound";
  if (error === "token_expired") return "appointmentActions.error.expired";
  if (error === "cancel_window_closed") return "appointmentActions.error.cancelWindow";
  if (error === "reschedule_window_closed") return "appointmentActions.error.rescheduleWindow";
  if (error === "slot_unavailable") return "appointmentActions.error.slotUnavailable";
  if (error === "scheduled_at_must_be_future") return "appointmentActions.error.futureTime";
  return "appointmentActions.error.submit";
}

export default function PublicAppointmentActionsPage() {
  const { token = "" } = useParams<{ token: string }>();
  const { t } = useI18n();
  const [mode, setMode] = useState<ActionMode>("cancel");
  const [reason, setReason] = useState("");
  const [newScheduledAt, setNewScheduledAt] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [successKey, setSuccessKey] = useState<"appointmentActions.success.cancel" | "appointmentActions.success.reschedule" | null>(null);

  const actionMutation = useMutation({
    mutationFn: async () => {
      setFormError(null);

      if (mode === "cancel") {
        return cancelPublicAppointment({ appointmentToken: token, reason });
      }

      const iso = toIsoFromLocal(newScheduledAt);
      if (!iso) throw new Error("invalid_datetime");
      return reschedulePublicAppointment({ appointmentToken: token, newScheduledAt: iso });
    },
    onSuccess(data) {
      if (!data.ok) {
        setFormError(t(actionErrorKey(data.error)));
        return;
      }
      setSuccessKey(mode === "cancel" ? "appointmentActions.success.cancel" : "appointmentActions.success.reschedule");
    },
    onError(error) {
      setFormError(error instanceof Error && error.message === "invalid_datetime"
        ? t("appointmentActions.error.invalidTime")
        : t("appointmentActions.error.submit"));
    },
  });

  return (
    <PublicLayout
      eyebrow={t("shell.appointmentActions")}
      title={t("appointmentActions.title")}
      subtitle={t("appointmentActions.subtitle")}
    >
      <Card className="overflow-hidden rounded-lg border-zinc-200 shadow-lg shadow-teal-950/5">
        <CardHeader className="border-b border-zinc-100 bg-white">
          <CardTitle className="text-xl">{t("appointmentActions.card.title")}</CardTitle>
          <p className="text-sm leading-6 text-zinc-600">{t("appointmentActions.card.description")}</p>
        </CardHeader>
        <CardContent className="space-y-5 p-5">
          <div className="grid grid-cols-2 gap-2">
            {(["cancel", "reschedule"] as const).map((item) => {
              const Icon = item === "cancel" ? XCircle : CalendarClock;
              return (
                <button
                  key={item}
                  type="button"
                  className={cn(
                    "flex min-h-20 flex-col items-center justify-center rounded-lg border px-2 py-3 text-sm font-semibold",
                    mode === item ? "border-brand bg-teal-50 text-brand" : "border-zinc-200 bg-white text-zinc-700",
                  )}
                  onClick={() => {
                    setMode(item);
                    setFormError(null);
                    setSuccessKey(null);
                  }}
                >
                  <Icon className="mb-2 h-5 w-5" aria-hidden="true" />
                  {t(item === "cancel" ? "appointmentActions.cancel" : "appointmentActions.reschedule")}
                </button>
              );
            })}
          </div>

          {mode === "cancel" ? (
            <label className="block space-y-2">
              <span className="text-sm font-semibold text-zinc-800">{t("appointmentActions.reason")}</span>
              <textarea
                className="min-h-28 w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-teal-700"
                value={reason}
                maxLength={500}
                onChange={(event) => setReason(event.target.value)}
                placeholder={t("appointmentActions.reasonPlaceholder")}
              />
            </label>
          ) : (
            <label className="block space-y-2">
              <span className="text-sm font-semibold text-zinc-800">{t("appointmentActions.newTime")}</span>
              <Input
                type="datetime-local"
                value={newScheduledAt}
                onChange={(event) => setNewScheduledAt(event.target.value)}
              />
            </label>
          )}

          {formError ? <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{formError}</p> : null}

          {successKey ? (
            <div className="rounded-lg border border-teal-100 bg-teal-50 p-4 text-center text-sm font-medium text-teal-800">
              <CheckCircle2 className="mx-auto mb-2 h-6 w-6" aria-hidden="true" />
              {t(successKey)}
            </div>
          ) : null}

          <Button
            type="button"
            className="h-12 w-full bg-brand text-white hover:bg-brand/90"
            disabled={actionMutation.isPending || Boolean(successKey)}
            onClick={() => actionMutation.mutate()}
          >
            {actionMutation.isPending
              ? t("common.sending")
              : t(mode === "cancel" ? "appointmentActions.submitCancel" : "appointmentActions.submitReschedule")}
          </Button>
        </CardContent>
      </Card>
    </PublicLayout>
  );
}
