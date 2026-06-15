import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { useParams } from "react-router-dom";
import { Send } from "lucide-react";
import { Button, Card, CardContent, Input, Skeleton } from "@iaprafaturar/ui";
import { getPublicChatContext, sendPublicChatMessage } from "@/lib/public-chat-api";
import { useI18n } from "@/i18n";
import { PublicLayout } from "./PublicLayout";

export default function PublicChatPage() {
  const { slug = "" } = useParams();
  const { t } = useI18n();
  const [context, setContext] = useState<{ name: string; welcome: string; enabled: boolean } | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", email: "", phone: "", text: "", website: "" });

  useEffect(() => {
    getPublicChatContext(slug)
      .then((result) => {
        if (!result.ok) throw new Error(result.error);
        setContext({
          name: result.context.professional.name,
          welcome: result.context.config.welcome_message,
          enabled: result.context.config.enabled,
        });
      })
      .catch(() => setMessage(t("chat.error.load")))
      .finally(() => setIsLoading(false));
  }, [slug, t]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    setIsSending(true);

    try {
      const result = await sendPublicChatMessage({
        slug,
        name: form.name,
        email: form.email,
        phone: form.phone,
        message: form.text,
        website: form.website,
      });

      if (!result.ok) {
        setMessage(t(result.error === "rate_limited" ? "chat.error.rateLimited" : "chat.error.send"));
        return;
      }

      setMessage(t("chat.success"));
      setForm({ name: "", email: "", phone: "", text: "", website: "" });
    } catch {
      setMessage(t("chat.error.send"));
    } finally {
      setIsSending(false);
    }
  }

  if (isLoading) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-[#f7fbf9] px-4">
        <div className="w-full max-w-md space-y-3">
          <Skeleton className="h-10 w-2/3" />
          <Skeleton className="h-72 rounded-lg" />
        </div>
      </div>
    );
  }

  return (
    <PublicLayout eyebrow={t("chat.eyebrow")} title={context?.name ?? t("chat.title")} subtitle={context?.welcome ?? t("chat.subtitle")}>
      <main className="mx-auto flex w-full max-w-md flex-col gap-4">
        <Card className="rounded-lg border-emerald-100 bg-white">
          <CardContent className="p-4">
            {context?.enabled ? (
              <form className="space-y-3" onSubmit={submit}>
                <input className="hidden" tabIndex={-1} autoComplete="off" value={form.website} onChange={(event) => setForm((current) => ({ ...current, website: event.target.value }))} />
                <Field label={t("chat.name")}><Input value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} required /></Field>
                <Field label={t("chat.email")}><Input type="email" value={form.email} onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))} /></Field>
                <Field label={t("chat.phone")}><Input inputMode="tel" value={form.phone} onChange={(event) => setForm((current) => ({ ...current, phone: event.target.value }))} /></Field>
                <label className="block space-y-1">
                  <span className="text-xs font-semibold text-zinc-600">{t("chat.message")}</span>
                  <textarea className="min-h-28 w-full rounded-md border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100" value={form.text} onChange={(event) => setForm((current) => ({ ...current, text: event.target.value }))} required />
                </label>
                <Button className="w-full gap-2 bg-emerald-700 hover:bg-emerald-800" type="submit" disabled={isSending}>
                  <Send className="h-4 w-4" />
                  {isSending ? t("common.sending") : t("chat.send")}
                </Button>
              </form>
            ) : (
              <p className="text-sm text-zinc-600">{t("chat.unavailable")}</p>
            )}
          </CardContent>
        </Card>

        {message ? <div className="rounded-lg border border-emerald-100 bg-white px-3 py-2 text-sm text-zinc-700">{message}</div> : null}
      </main>
    </PublicLayout>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-xs font-semibold text-zinc-600">{label}</span>
      {children}
    </label>
  );
}
