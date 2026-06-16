import { useState } from "react";
import { Badge, Button, Card, CardContent, Input, Skeleton } from "@iaprafaturar/ui";
import { LayoutTemplate, Plus, X } from "lucide-react";
import { useI18n } from "@/i18n";
import { useCampaignTemplates, useSaveCampaignTemplate, useToggleCampaignTemplate, type CampaignTemplate, type CampaignTemplateInput } from "@/hooks/useCampaignTemplates";

const CHANNELS = ["all", "whatsapp", "email", "sms"] as const;
type Channel = (typeof CHANNELS)[number];

function variablesToJson(vars: Array<{ key: string; label: string }>): string {
  return JSON.stringify(vars, null, 2);
}

function parseVariables(raw: string): Array<{ key: string; label: string }> {
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed;
  } catch {
    // invalid json — return empty
  }
  return [];
}

interface TemplateFormProps {
  initial?: CampaignTemplate;
  onSave: (data: CampaignTemplateInput & { id?: string }) => void;
  onCancel: () => void;
  isPending: boolean;
}

function TemplateForm({ initial, onSave, onCancel, isPending }: TemplateFormProps) {
  const { t } = useI18n();
  const [form, setForm] = useState<CampaignTemplateInput>({
    name: initial?.name ?? "",
    description: initial?.description ?? "",
    content: initial?.content ?? "",
    channel: initial?.channel ?? "whatsapp",
    category: initial?.category ?? "",
    variables: initial?.variables ?? [],
    is_active: initial?.is_active ?? true,
  });
  const [variablesRaw, setVariablesRaw] = useState(
    variablesToJson(initial?.variables ?? [])
  );

  function submit(e: React.FormEvent) {
    e.preventDefault();
    onSave({
      ...(initial?.id ? { id: initial.id } : {}),
      ...form,
      variables: parseVariables(variablesRaw),
    });
  }

  return (
    <form onSubmit={submit} className="space-y-3 rounded-lg border bg-zinc-50 p-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <label className="text-xs font-medium text-zinc-700">{t("templates.field.name")} *</label>
          <Input
            required
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-zinc-700">{t("templates.field.channel")} *</label>
          <select
            className="h-10 w-full rounded-md border bg-white px-3 text-sm"
            value={form.channel}
            onChange={(e) => setForm((f) => ({ ...f, channel: e.target.value as CampaignTemplateInput["channel"] }))}
          >
            {(["whatsapp", "email", "sms"] as const).map((ch) => (
              <option key={ch} value={ch}>{t(`templates.channel.${ch}` as Parameters<typeof t>[0])}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="space-y-1">
        <label className="text-xs font-medium text-zinc-700">{t("templates.field.description")}</label>
        <Input
          value={form.description ?? ""}
          onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
        />
      </div>

      <div className="space-y-1">
        <label className="text-xs font-medium text-zinc-700">{t("templates.field.category")}</label>
        <Input
          value={form.category ?? ""}
          onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
        />
      </div>

      <div className="space-y-1">
        <label className="text-xs font-medium text-zinc-700">{t("templates.field.content")} *</label>
        <textarea
          required
          rows={4}
          className="w-full rounded-md border bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
          value={form.content}
          onChange={(e) => setForm((f) => ({ ...f, content: e.target.value }))}
        />
        <p className="text-xs text-zinc-500">Use {"{nome_cliente}"} para placeholders.</p>
      </div>

      <div className="space-y-1">
        <label className="text-xs font-medium text-zinc-700">{t("templates.field.variables")}</label>
        <textarea
          rows={3}
          className="w-full rounded-md border bg-white px-3 py-2 font-mono text-xs focus:outline-none focus:ring-2 focus:ring-violet-500"
          value={variablesRaw}
          onChange={(e) => setVariablesRaw(e.target.value)}
          placeholder='[{"key":"nome_cliente","label":"Nome do cliente"}]'
        />
      </div>

      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          id="is_active"
          checked={form.is_active}
          onChange={(e) => setForm((f) => ({ ...f, is_active: e.target.checked }))}
        />
        <label htmlFor="is_active" className="text-sm">{t("templates.field.active")}</label>
      </div>

      <div className="flex gap-2">
        <Button type="submit" disabled={isPending} size="sm">
          {t("templates.action.save")}
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={onCancel}>
          {t("templates.action.cancel")}
        </Button>
      </div>
    </form>
  );
}

export default function CampaignTemplatesPage() {
  const { t } = useI18n();
  const [channelFilter, setChannelFilter] = useState<Channel>("all");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [feedback, setFeedback] = useState<{ message: string; kind: "ok" | "err" } | null>(null);

  const query = useCampaignTemplates(channelFilter === "all" ? undefined : channelFilter);
  const saveMutation = useSaveCampaignTemplate();
  const toggleMutation = useToggleCampaignTemplate();

  const templates = query.data ?? [];

  function flash(message: string, kind: "ok" | "err") {
    setFeedback({ message, kind });
    setTimeout(() => setFeedback(null), 3000);
  }

  async function handleSave(data: CampaignTemplateInput & { id?: string }) {
    try {
      await saveMutation.mutateAsync(data);
      flash(t("templates.success.save"), "ok");
      setEditingId(null);
      setShowNew(false);
    } catch {
      flash(t("templates.error.save"), "err");
    }
  }

  async function handleToggle(id: string, current: boolean) {
    try {
      await toggleMutation.mutateAsync({ id, is_active: !current });
      flash(t("templates.success.toggle"), "ok");
    } catch {
      flash(t("templates.error.toggle"), "err");
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-5 px-4 py-5 sm:px-6">
      <header className="flex items-start justify-between gap-3">
        <div>
          <div className="mb-1 flex items-center gap-2">
            <LayoutTemplate className="h-5 w-5 text-violet-600" />
            <h1 className="text-2xl font-semibold">{t("templates.title")}</h1>
          </div>
          <p className="text-sm text-zinc-500">{t("templates.subtitle")}</p>
        </div>
        <Button size="sm" onClick={() => { setShowNew(true); setEditingId(null); }}>
          <Plus className="mr-1 h-4 w-4" />
          {t("templates.new")}
        </Button>
      </header>

      {/* Feedback inline */}
      {feedback && (
        <div className={`rounded-md px-4 py-2 text-sm font-medium ${feedback.kind === "ok" ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}>
          {feedback.message}
        </div>
      )}

      {/* Filtro de canal */}
      <div className="flex flex-wrap gap-2">
        {CHANNELS.map((ch) => (
          <button
            key={ch}
            onClick={() => setChannelFilter(ch)}
            className={`rounded-full px-3 py-1 text-sm font-medium transition-colors ${
              channelFilter === ch
                ? "bg-violet-600 text-white"
                : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200"
            }`}
          >
            {t(`templates.channel.${ch}` as Parameters<typeof t>[0])}
          </button>
        ))}
      </div>

      {/* Formulário de novo template */}
      {showNew && !editingId && (
        <TemplateForm
          onSave={handleSave}
          onCancel={() => setShowNew(false)}
          isPending={saveMutation.isPending}
        />
      )}

      {/* Lista */}
      {query.isLoading && <Skeleton className="h-40 w-full" />}
      {query.isError && (
        <Card>
          <CardContent className="p-5 text-red-700">{t("common.error")}</CardContent>
        </Card>
      )}

      {!query.isLoading && templates.length === 0 && (
        <Card>
          <CardContent className="p-5 text-center text-zinc-500">{t("templates.empty")}</CardContent>
        </Card>
      )}

      <div className="grid gap-3 lg:grid-cols-2">
        {templates.map((tpl) => (
          <Card key={tpl.id} className={tpl.is_active ? "" : "opacity-60"}>
            <CardContent className="space-y-3 p-4">
              {editingId === tpl.id ? (
                <TemplateForm
                  initial={tpl}
                  onSave={handleSave}
                  onCancel={() => setEditingId(null)}
                  isPending={saveMutation.isPending}
                />
              ) : (
                <>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="font-semibold leading-tight">{tpl.name}</h2>
                        <Badge variant={tpl.is_active ? "default" : "secondary"}>
                          {tpl.channel}
                        </Badge>
                        {tpl.category && (
                          <Badge variant="outline">{tpl.category}</Badge>
                        )}
                      </div>
                      {tpl.description && (
                        <p className="mt-0.5 text-xs text-zinc-500">{tpl.description}</p>
                      )}
                    </div>
                    <button
                      className="shrink-0 text-zinc-400 hover:text-zinc-600"
                      onClick={() => setEditingId(tpl.id)}
                      title={t("templates.action.edit")}
                    >
                      <X className="h-4 w-4 rotate-45" />
                    </button>
                  </div>

                  <p className="rounded bg-zinc-50 p-2 text-sm text-zinc-700 whitespace-pre-wrap">
                    {tpl.content}
                  </p>

                  {tpl.variables.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {tpl.variables.map((v) => (
                        <Badge key={v.key} variant="outline" className="font-mono text-xs">
                          {"{" + v.key + "}"}
                        </Badge>
                      ))}
                    </div>
                  )}

                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs text-zinc-400">
                      {new Date(tpl.updated_at).toLocaleDateString("pt-BR")}
                    </p>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => { setEditingId(tpl.id); setShowNew(false); }}
                      >
                        {t("templates.action.edit")}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={toggleMutation.isPending}
                        onClick={() => handleToggle(tpl.id, tpl.is_active)}
                      >
                        {tpl.is_active
                          ? t("templates.action.deactivate")
                          : t("templates.action.activate")}
                      </Button>
                    </div>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
