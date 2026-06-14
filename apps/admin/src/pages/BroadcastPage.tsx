import { useRef, useState, type FormEvent } from "react";
import { Megaphone, Send } from "lucide-react";
import { Button, Card, CardContent } from "@iaprafaturar/ui";
import { useI18n } from "@/i18n";
import { supabase } from "@/lib/supabase";
import { useBroadcastHistory } from "@/hooks/usePhase24";

type BroadcastTarget = "risk_professionals" | "trial_professionals" | "all_professionals";

interface BroadcastResult {
  selected: number;
  sent_or_dry_run: number;
  skipped: number;
  dry_run: boolean;
  reason?: string;
  broadcast_id?: string;
  status?: string;
}

export default function BroadcastPage() {
  const { t } = useI18n();
  const [target, setTarget] = useState<BroadcastTarget>("risk_professionals");
  const [message, setMessage] = useState("");
  const [dryRun, setDryRun] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [result, setResult] = useState<BroadcastResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reason, setReason] = useState("phase24_admin_communication");
  const history = useBroadcastHistory();
  const idempotencyKey = useRef(crypto.randomUUID());

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
        limit: 50,
        reason,
        idempotency_key: idempotencyKey.current,
      }
    });

    setIsSubmitting(false);

    if (invokeError || !data) {
      setError(t("broadcast.error"));
      return;
    }

    setResult(data);
    idempotencyKey.current = crypto.randomUUID();
  }

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-5xl flex-col gap-5 px-4 py-5 sm:px-6">
      <div>
        <p className="text-xs font-semibold uppercase text-violet-700">{t("broadcast.eyebrow")}</p>
        <h1 className="mt-1 text-2xl font-semibold text-zinc-950">{t("broadcast.title")}</h1>
        <p className="mt-1 max-w-2xl text-sm text-zinc-500">{t("broadcast.subtitle")}</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-4">
        <Metric label={t("broadcast.metrics.total")} value={history.data?.metrics.total ?? 0} />
        <Metric label={t("broadcast.metrics.sent")} value={history.data?.metrics.sent ?? 0} />
        <Metric label={t("broadcast.metrics.failed")} value={history.data?.metrics.failed ?? 0} />
        <Metric label={t("broadcast.metrics.active")} value={history.data?.metrics.active ?? 0} />
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
            <label className="space-y-1">
              <span className="text-sm font-semibold text-zinc-800">{t("broadcast.reason")}</span>
              <input className="h-11 w-full rounded-lg border border-zinc-200 px-3 text-sm" value={reason} onChange={(event) => setReason(event.target.value)} />
            </label>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs leading-5 text-zinc-500">{t("broadcast.safety")}</p>
              <Button className="h-11" type="submit" disabled={isSubmitting || !message.trim() || !reason.trim()}>
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

      <Card className="rounded-lg"><CardContent className="space-y-3 p-4 sm:p-5">
        <h2 className="font-semibold text-zinc-950">{t("broadcast.history")}</h2>
        {history.isError ? <p className="text-sm text-red-700">{t("common.error")}</p> : null}
        {history.data?.items.map((item) => <div key={item.id} className="border-t py-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between"><div><p className="font-medium text-zinc-900">{item.message}</p><p className="text-xs text-zinc-500">{t(`broadcast.target.${item.audience_type === "all_professionals" ? "all" : item.audience_type === "risk_professionals" ? "risk" : "trial"}`)} · {item.channel}</p></div><span className="text-xs font-semibold uppercase text-violet-700">{item.status}</span></div>
          <div className="mt-2 flex flex-wrap gap-3 text-xs text-zinc-500"><span>{item.selected_count} {t("broadcast.result.selected")}</span><span>{item.sent_count} {t("broadcast.result.sent")}</span><span>{item.failed_count} {t("broadcast.metrics.failed")}</span></div>
        </div>)}
      </CardContent></Card>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return <div className="rounded-lg border bg-white p-4"><div className="text-xs font-semibold uppercase text-zinc-500">{label}</div><div className="mt-2 text-2xl font-semibold text-zinc-950">{value}</div></div>;
}
