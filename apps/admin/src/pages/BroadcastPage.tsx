import { useState, type FormEvent } from "react";
import { Megaphone, Send } from "lucide-react";
import { Button, Card, CardContent } from "@iaprafaturar/ui";
import { useI18n } from "@/i18n";
import { supabase } from "@/lib/supabase";

type BroadcastTarget = "risk_professionals" | "trial_professionals" | "all_professionals";

interface BroadcastResult {
  selected: number;
  sent_or_dry_run: number;
  skipped: number;
  dry_run: boolean;
  reason?: string;
}

export default function BroadcastPage() {
  const { t } = useI18n();
  const [target, setTarget] = useState<BroadcastTarget>("risk_professionals");
  const [message, setMessage] = useState("");
  const [dryRun, setDryRun] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [result, setResult] = useState<BroadcastResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = message.trim();
    if (!text || isSubmitting) return;

    setIsSubmitting(true);
    setError(null);
    setResult(null);

    const { data, error: invokeError } = await supabase.functions.invoke<BroadcastResult>("admin-broadcast", {
      body: {
        target,
        message: text,
        dry_run: dryRun,
        limit: 50
      }
    });

    setIsSubmitting(false);

    if (invokeError || !data) {
      setError(t("broadcast.error"));
      return;
    }

    setResult(data);
  }

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-5xl flex-col gap-5 px-4 py-5 sm:px-6">
      <div>
        <p className="text-xs font-semibold uppercase text-violet-700">{t("broadcast.eyebrow")}</p>
        <h1 className="mt-1 text-2xl font-semibold text-zinc-950">{t("broadcast.title")}</h1>
        <p className="mt-1 max-w-2xl text-sm text-zinc-500">{t("broadcast.subtitle")}</p>
      </div>

      <Card className="rounded-lg">
        <CardContent className="p-4 sm:p-5">
          <form className="space-y-4" onSubmit={submit}>
            <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
              <label className="space-y-1">
                <span className="text-sm font-semibold text-zinc-800">{t("broadcast.target")}</span>
                <select
                  className="h-11 w-full rounded-lg border border-zinc-200 bg-white px-3 text-sm font-medium text-zinc-900 outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-100"
                  value={target}
                  onChange={(event) => setTarget(event.target.value as BroadcastTarget)}
                >
                  <option value="risk_professionals">{t("broadcast.target.risk")}</option>
                  <option value="trial_professionals">{t("broadcast.target.trial")}</option>
                  <option value="all_professionals">{t("broadcast.target.all")}</option>
                </select>
              </label>

              <label className="flex items-end gap-2 rounded-lg border border-zinc-200 px-3 py-2">
                <input
                  className="mb-1 h-4 w-4 accent-violet-600"
                  type="checkbox"
                  checked={dryRun}
                  onChange={(event) => setDryRun(event.target.checked)}
                />
                <span className="text-sm font-semibold text-zinc-800">{t("broadcast.dryRun")}</span>
              </label>
            </div>

            <label className="space-y-1">
              <span className="text-sm font-semibold text-zinc-800">{t("broadcast.message")}</span>
              <textarea
                className="min-h-40 w-full resize-y rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-100"
                value={message}
                maxLength={2000}
                onChange={(event) => setMessage(event.target.value)}
                placeholder={t("broadcast.placeholder")}
              />
            </label>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs leading-5 text-zinc-500">{t("broadcast.safety")}</p>
              <Button className="h-11" type="submit" disabled={isSubmitting || !message.trim()}>
                {isSubmitting ? <Megaphone className="mr-2 h-4 w-4 animate-pulse" /> : <Send className="mr-2 h-4 w-4" />}
                {t("broadcast.submit")}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">{error}</div>
      ) : null}

      {result ? (
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-lg border bg-white p-4">
            <div className="text-xs font-semibold uppercase text-zinc-500">{t("broadcast.result.selected")}</div>
            <div className="mt-2 text-2xl font-semibold text-zinc-950">{result.selected}</div>
          </div>
          <div className="rounded-lg border bg-white p-4">
            <div className="text-xs font-semibold uppercase text-zinc-500">{t("broadcast.result.sent")}</div>
            <div className="mt-2 text-2xl font-semibold text-zinc-950">{result.sent_or_dry_run}</div>
          </div>
          <div className="rounded-lg border bg-white p-4">
            <div className="text-xs font-semibold uppercase text-zinc-500">{t("broadcast.result.skipped")}</div>
            <div className="mt-2 text-2xl font-semibold text-zinc-950">{result.skipped}</div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
