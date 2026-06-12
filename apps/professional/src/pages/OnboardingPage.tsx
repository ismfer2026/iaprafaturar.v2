import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  Circle,
  MessageCircle,
  RefreshCw,
} from "lucide-react";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Skeleton,
  cn,
  Input,
} from "@iaprafaturar/ui";
import { useAuth } from "@/contexts/AuthContext";
import { useOnboardingSetup, type OnboardingItemStatus } from "@/hooks/useOnboardingSetup";
import { useI18n } from "@/i18n";
import { friendlyErrorMessage } from "@/lib/friendlyError";
import { supabase } from "@/lib/supabase";

const DEFAULT_ASSISTANT_NAME = "Rosane";

function statusVariant(status: OnboardingItemStatus) {
  if (status === "completed") return "success" as const;
  if (status === "in_progress") return "warning" as const;
  return "secondary" as const;
}

export default function OnboardingPage() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const {
    session,
    professionalId,
    onboardingCompleted,
    onboardingEssentialsCompleted,
    whatsappConnected,
  } = useAuth();
  const setupQuery = useOnboardingSetup(professionalId);
  const [businessName, setBusinessName] = useState("");
  const [phoneWhatsapp, setPhoneWhatsapp] = useState("");
  const [businessHours, setBusinessHours] = useState("");
  const [agentName, setAgentName] = useState(DEFAULT_ASSISTANT_NAME);
  const [serviceName, setServiceName] = useState("");
  const [servicePrice, setServicePrice] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const name = (session?.user?.user_metadata?.["name"] as string | undefined) ?? t("onboarding.defaultName");
  const assistantName =
    (session?.user?.user_metadata?.["assistant_name"] as string | undefined)?.trim() || DEFAULT_ASSISTANT_NAME;
  const assistantParams = { assistantName };
  const progress = Math.min(100, Math.max(0, setupQuery.data?.progressPercent ?? 0));
  const currentStep = setupQuery.data?.session?.current_step ?? "profile_basics";
  const hasActiveService = Boolean(setupQuery.data?.services?.length);

  useEffect(() => {
    if (!setupQuery.data) return;
    setBusinessName(setupQuery.data.profile.business_name ?? setupQuery.data.profile.name ?? "");
    setPhoneWhatsapp(setupQuery.data.profile.phone_whatsapp ?? "");
    setAgentName(setupQuery.data.agent?.agent_name ?? DEFAULT_ASSISTANT_NAME);

    const hours = setupQuery.data.profile.settings?.["business_hours"];
    if (typeof hours === "object" && hours !== null && "summary" in hours) {
      setBusinessHours(String((hours as { summary?: unknown }).summary ?? ""));
    }
  }, [setupQuery.data]);

  function statusLabel(status: OnboardingItemStatus) {
    if (status === "completed") return t("onboarding.status.completed");
    if (status === "in_progress") return t("onboarding.status.inProgress");
    if (status === "skipped") return t("onboarding.status.skipped");
    return t("onboarding.status.pending");
  }

  async function handleSaveEssentials(event: React.FormEvent) {
    event.preventDefault();
    setFormError(null);
    setIsSaving(true);

    try {
      if (!hasActiveService && serviceName.trim()) {
        const parsedPrice = Number(servicePrice.replace(",", "."));
        const { error: serviceError } = await supabase.rpc("create_service", {
          p_name: serviceName.trim(),
          p_duration_minutes: 60,
          p_price: Number.isFinite(parsedPrice) ? parsedPrice : 0,
          p_category_id: null,
          p_description: null,
        });

        if (serviceError) throw serviceError;
      }

      const { data, error } = await supabase.rpc("update_professional_onboarding_essentials", {
        p_business_name: businessName.trim() || null,
        p_phone_whatsapp: phoneWhatsapp.trim() || null,
        p_business_hours: businessHours.trim() ? { summary: businessHours.trim() } : {},
        p_agent_name: agentName.trim() || DEFAULT_ASSISTANT_NAME,
      });

      if (error) throw error;
      await setupQuery.refetch();

      if (typeof data === "object" && data && "completed" in data && data.completed === false) {
        setFormError(t("onboarding.form.incomplete"));
      }
    } catch (error) {
      setFormError(friendlyErrorMessage(error, t, "common.error.generic"));
    } finally {
      setIsSaving(false);
    }
  }

  if (!professionalId || setupQuery.isLoading) {
    return (
      <div className="min-h-screen bg-zinc-50 px-4 py-6">
        <div className="mx-auto w-full max-w-xl space-y-4">
          <Skeleton className="h-10 w-52" />
          <Skeleton className="h-28 w-full" />
          <Skeleton className="h-56 w-full" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-50 px-4 py-5 md:py-8">
      <div className="mx-auto w-full max-w-2xl space-y-4">
        <header className="space-y-2">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-violet-700">{t("onboarding.eyebrow")}</p>
              <h1 className="mt-1 text-2xl font-semibold text-zinc-950">
                {t("onboarding.title", assistantParams)}
              </h1>
            </div>
            <Badge variant={onboardingCompleted ? "success" : "warning"}>
              {onboardingCompleted ? t("onboarding.badge.ready") : t("onboarding.badge.setup")}
            </Badge>
          </div>
          <p className="text-sm leading-6 text-zinc-600">
            {name}, {t("onboarding.description")}
          </p>
        </header>

        <Card>
          <CardHeader className="pb-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <CardTitle>{t("onboarding.progress.title")}</CardTitle>
                <CardDescription>
                  {onboardingEssentialsCompleted
                    ? t("onboarding.progress.completed")
                    : t("onboarding.progress.collecting")}
                </CardDescription>
              </div>
              <span className="text-2xl font-semibold text-zinc-950">{progress}%</span>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="h-2 overflow-hidden rounded-full bg-zinc-100">
              <div className="h-full rounded-full bg-violet-600 transition-all" style={{ width: `${progress}%` }} />
            </div>

            <div className="grid gap-2 text-sm sm:grid-cols-2">
              <div className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2">
                <p className="font-medium text-zinc-900">{t("onboarding.currentStep")}</p>
                <p className="mt-0.5 text-zinc-500">{currentStep.replaceAll("_", " ")}</p>
              </div>
              <div className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2">
                <p className="font-medium text-zinc-900">{t("onboarding.whatsappAssistant", assistantParams)}</p>
                <p className={cn("mt-0.5", whatsappConnected ? "text-emerald-700" : "text-zinc-500")}>
                  {whatsappConnected ? t("onboarding.whatsappConnected") : t("onboarding.whatsappPending")}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-violet-100 text-violet-700">
                <MessageCircle className="h-5 w-5" />
              </div>
              <div>
                <CardTitle>{t("onboarding.nerissa.title")}</CardTitle>
                <CardDescription>{t("onboarding.nerissa.description")}</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="rounded-lg border border-violet-100 bg-violet-50 px-3 py-3 text-sm leading-6 text-violet-950">
              {t("onboarding.nerissa.instructions")}
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button className="w-full sm:w-auto" onClick={() => setupQuery.refetch()}>
                <RefreshCw className="mr-2 h-4 w-4" />
                {t("onboarding.refresh")}
              </Button>
              <Button variant="outline" className="w-full sm:w-auto" onClick={() => navigate("/dashboard")}>
                {t("onboarding.openDashboard")}
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t("onboarding.form.title")}</CardTitle>
            <CardDescription>{t("onboarding.form.description", assistantParams)}</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSaveEssentials} className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="space-y-1.5">
                  <span className="text-sm font-medium text-zinc-700">{t("onboarding.form.businessName")}</span>
                  <Input
                    value={businessName}
                    onChange={(event) => setBusinessName(event.target.value)}
                    placeholder={t("onboarding.form.businessNamePlaceholder")}
                  />
                </label>
                <label className="space-y-1.5">
                  <span className="text-sm font-medium text-zinc-700">WhatsApp</span>
                  <Input
                    type="tel"
                    value={phoneWhatsapp}
                    onChange={(event) => setPhoneWhatsapp(event.target.value)}
                    placeholder="(11) 99999-9999"
                  />
                </label>
              </div>

              <label className="block space-y-1.5">
                <span className="text-sm font-medium text-zinc-700">{t("onboarding.form.hours")}</span>
                <Input
                  value={businessHours}
                  onChange={(event) => setBusinessHours(event.target.value)}
                  placeholder={t("onboarding.form.hoursPlaceholder")}
                />
              </label>

              <div className="grid gap-3 sm:grid-cols-2">
                <label className="space-y-1.5">
                  <span className="text-sm font-medium text-zinc-700">{t("onboarding.form.agentName")}</span>
                  <Input
                    value={agentName}
                    onChange={(event) => setAgentName(event.target.value)}
                    placeholder={DEFAULT_ASSISTANT_NAME}
                  />
                </label>
                <label className="space-y-1.5">
                  <span className="text-sm font-medium text-zinc-700">{t("onboarding.form.firstService")}</span>
                  <Input
                    value={hasActiveService ? setupQuery.data?.services?.[0]?.name ?? "" : serviceName}
                    disabled={hasActiveService}
                    onChange={(event) => setServiceName(event.target.value)}
                    placeholder={t("onboarding.form.firstServicePlaceholder")}
                  />
                </label>
              </div>

              {!hasActiveService ? (
                <label className="block space-y-1.5">
                  <span className="text-sm font-medium text-zinc-700">{t("onboarding.form.servicePrice")}</span>
                  <Input
                    inputMode="decimal"
                    value={servicePrice}
                    onChange={(event) => setServicePrice(event.target.value)}
                    placeholder="120"
                  />
                </label>
              ) : null}

              {formError ? (
                <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                  {formError}
                </p>
              ) : null}

              <Button type="submit" className="w-full" size="lg" disabled={isSaving}>
                {isSaving ? t("onboarding.form.saving") : t("onboarding.form.save")}
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t("onboarding.checklist.title")}</CardTitle>
            <CardDescription>{t("onboarding.checklist.description", assistantParams)}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {setupQuery.isError && (
              <div className="flex gap-2 rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-sm text-red-700">
                <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
                {t("onboarding.error.load")}
              </div>
            )}

            {(setupQuery.data?.checklist ?? []).map((item) => {
              const done = item.status === "completed";
              return (
                <div key={item.key} className="flex gap-3 rounded-lg border border-zinc-200 bg-white px-3 py-3">
                  <div className={cn("mt-0.5", done ? "text-emerald-600" : "text-zinc-400")}>
                    {done ? <CheckCircle2 className="h-5 w-5" /> : <Circle className="h-5 w-5" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="font-medium text-zinc-950">{t(item.labelKey, assistantParams)}</p>
                      <Badge variant={statusVariant(item.status)}>{statusLabel(item.status)}</Badge>
                    </div>
                    <p className="mt-1 text-sm leading-5 text-zinc-500">
                      {t(item.descriptionKey, assistantParams)}
                    </p>
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
