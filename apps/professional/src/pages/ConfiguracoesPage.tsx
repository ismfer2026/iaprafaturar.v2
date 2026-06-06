import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Bot, MessageCircle, Save, ShieldCheck, SlidersHorizontal } from "lucide-react";
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
import { useAuth } from "@/contexts/AuthContext";
import { useAssistantSettings, type AssistantSettingsInput } from "@/hooks/useAssistantSettings";
import { useI18n, type TranslationKey } from "@/i18n";

const DEFAULT_ASSISTANT_NAME = "Rosane";

const AGENT_OPTIONS = [
  { key: "duvidas", labelKey: "settings.agent.questions" },
  { key: "agendamento", labelKey: "settings.agent.scheduling" },
  { key: "lembrete", labelKey: "settings.agent.reminders" },
] satisfies Array<{ key: string; labelKey: TranslationKey }>;

export default function ConfiguracoesPage() {
  const { t } = useI18n();
  const { professionalId } = useAuth();
  const settings = useAssistantSettings(professionalId);
  const [form, setForm] = useState<AssistantSettingsInput>({
    agentName: "Rosane",
    tone: "amigavel",
    shadowMode: true,
    autoRespond: true,
    enabledAgents: ["duvidas", "agendamento", "lembrete"],
  });
  const [saved, setSaved] = useState(false);
  const assistantName = form.agentName.trim() || DEFAULT_ASSISTANT_NAME;
  const assistantParams = { assistantName };

  useEffect(() => {
    if (settings.data?.form) {
      setForm(settings.data.form);
    }
  }, [settings.data?.form]);

  const whatsappStatus = useMemo(() => {
    const whatsapp = settings.data?.whatsapp;
    if (!whatsapp) return { label: t("settings.whatsapp.notConfigured"), variant: "secondary" as const };
    if (whatsapp.is_connected) return { label: t("settings.whatsapp.connected"), variant: "success" as const };
    if (whatsapp.status === "connecting") return { label: t("settings.whatsapp.connecting"), variant: "warning" as const };
    return { label: t("settings.whatsapp.disconnected"), variant: "secondary" as const };
  }, [settings.data?.whatsapp, t]);

  function toggleAgent(agentKey: string) {
    setForm((current) => {
      const enabled = current.enabledAgents.includes(agentKey);
      return {
        ...current,
        enabledAgents: enabled
          ? current.enabledAgents.filter((item) => item !== agentKey)
          : [...current.enabledAgents, agentKey],
      };
    });
  }

  async function handleSave() {
    setSaved(false);
    await settings.save(form);
    setSaved(true);
  }

  if (!professionalId || settings.isLoading) {
    return (
      <div className="space-y-4 p-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-56 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-4 p-4 pb-24 md:pb-4">
      <header>
        <p className="text-sm font-medium text-violet-700">{t("settings.eyebrow")}</p>
        <h1 className="mt-1 text-2xl font-semibold text-zinc-950">{t("settings.title", assistantParams)}</h1>
        <p className="mt-1 text-sm leading-6 text-zinc-500">{t("settings.subtitle", assistantParams)}</p>
      </header>

      {settings.isError && (
        <div className="rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-sm text-red-700">
          {t("settings.error.load")}
        </div>
      )}

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-violet-100 text-violet-700">
                <SlidersHorizontal className="h-5 w-5" />
              </div>
              <div>
                <CardTitle>{t("settings.services.title")}</CardTitle>
                <CardDescription>{t("settings.services.description")}</CardDescription>
              </div>
            </div>
            <Button asChild variant="outline">
              <Link to="/servicos">{t("common.open")}</Link>
            </Button>
          </div>
        </CardHeader>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-violet-100 text-violet-700">
              <Bot className="h-5 w-5" />
            </div>
            <div>
              <CardTitle>{t("settings.assistantIdentity.title")}</CardTitle>
              <CardDescription>{t("settings.assistantIdentity.description")}</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1">
            <label htmlFor="agentName" className="text-sm font-medium text-zinc-700">
              {t("settings.assistantName")}
            </label>
            <Input
              id="agentName"
              value={form.agentName}
              onChange={(event) => setForm((current) => ({ ...current, agentName: event.target.value }))}
              placeholder="Rosane"
            />
          </div>

          <div className="space-y-1">
            <label htmlFor="tone" className="text-sm font-medium text-zinc-700">
              {t("settings.tone")}
            </label>
            <select
              id="tone"
              className="h-10 w-full rounded-md border border-zinc-200 bg-white px-3 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
              value={form.tone}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  tone: event.target.value as AssistantSettingsInput["tone"],
                }))
              }
            >
              <option value="amigavel">{t("settings.tone.friendly")}</option>
              <option value="profissional">{t("settings.tone.professional")}</option>
              <option value="objetivo">{t("settings.tone.objective")}</option>
            </select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <div>
              <CardTitle>{t("settings.behavior.title")}</CardTitle>
              <CardDescription>{t("settings.behavior.description", assistantParams)}</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <label className="flex items-start gap-3 rounded-lg border border-zinc-200 px-3 py-3">
            <input
              type="checkbox"
              className="mt-1 h-4 w-4 rounded border-zinc-300 text-violet-600"
              checked={form.autoRespond}
              onChange={(event) =>
                setForm((current) => ({ ...current, autoRespond: event.target.checked }))
              }
            />
            <span>
              <span className="block text-sm font-medium text-zinc-900">{t("settings.autoRespond.title")}</span>
              <span className="mt-0.5 block text-sm leading-5 text-zinc-500">
                {t("settings.autoRespond.description", assistantParams)}
              </span>
            </span>
          </label>

          <label className="flex items-start gap-3 rounded-lg border border-zinc-200 px-3 py-3">
            <input
              type="checkbox"
              className="mt-1 h-4 w-4 rounded border-zinc-300 text-violet-600"
              checked={form.shadowMode}
              onChange={(event) =>
                setForm((current) => ({ ...current, shadowMode: event.target.checked }))
              }
            />
            <span>
              <span className="block text-sm font-medium text-zinc-900">{t("settings.shadowMode.title")}</span>
              <span className="mt-0.5 block text-sm leading-5 text-zinc-500">
                {t("settings.shadowMode.description")}
              </span>
            </span>
          </label>

          <div className="space-y-2">
            <p className="text-sm font-medium text-zinc-700">{t("settings.activeAgents")}</p>
            <div className="grid gap-2 sm:grid-cols-3">
              {AGENT_OPTIONS.map((agent) => (
                <label
                  key={agent.key}
                  className="flex items-center gap-2 rounded-lg border border-zinc-200 px-3 py-2 text-sm"
                >
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-zinc-300 text-violet-600"
                    checked={form.enabledAgents.includes(agent.key)}
                    onChange={() => toggleAgent(agent.key)}
                  />
                  {t(agent.labelKey)}
                </label>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-zinc-100 text-zinc-700">
                <MessageCircle className="h-5 w-5" />
              </div>
              <div>
                <CardTitle>{t("settings.whatsapp.title")}</CardTitle>
                <CardDescription>{t("settings.whatsapp.description", assistantParams)}</CardDescription>
              </div>
            </div>
            <Badge variant={whatsappStatus.variant}>{whatsappStatus.label}</Badge>
          </div>
        </CardHeader>
        <CardContent className="grid gap-2 text-sm sm:grid-cols-3">
          <div className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2">
            <p className="font-medium text-zinc-900">{t("settings.whatsapp.provider")}</p>
            <p className="mt-0.5 text-zinc-500">{settings.data?.whatsapp?.provider ?? t("common.pending")}</p>
          </div>
          <div className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2">
            <p className="font-medium text-zinc-900">{t("settings.whatsapp.connection")}</p>
            <p className="mt-0.5 text-zinc-500">{settings.data?.whatsapp?.connection_mode ?? t("common.pending")}</p>
          </div>
          <div className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2">
            <p className="font-medium text-zinc-900">{t("settings.whatsapp.numberType")}</p>
            <p className="mt-0.5 text-zinc-500">{settings.data?.whatsapp?.number_kind ?? t("settings.whatsapp.notInformed")}</p>
          </div>
        </CardContent>
      </Card>

      <div className="sticky bottom-20 z-10 md:bottom-4">
        <div className="rounded-xl border border-zinc-200 bg-white/95 p-3 shadow-lg backdrop-blur">
          <Button className="w-full" onClick={handleSave} disabled={settings.isSaving}>
            <Save className="mr-2 h-4 w-4" />
            {settings.isSaving ? t("common.saving") : t("settings.save")}
          </Button>
          {saved && <p className="mt-2 text-center text-sm text-emerald-700">{t("settings.saved")}</p>}
          {settings.saveError && (
            <p className="mt-2 text-center text-sm text-red-700">{t("settings.error.save")}</p>
          )}
        </div>
      </div>
    </div>
  );
}
