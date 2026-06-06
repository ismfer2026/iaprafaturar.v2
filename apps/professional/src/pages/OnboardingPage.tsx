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
} from "@iaprafaturar/ui";
import { useAuth } from "@/contexts/AuthContext";
import { useOnboardingSetup, type OnboardingItemStatus } from "@/hooks/useOnboardingSetup";
import { useI18n } from "@/i18n";

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

  const name = (session?.user?.user_metadata?.["name"] as string | undefined) ?? t("onboarding.defaultName");
  const assistantName =
    (session?.user?.user_metadata?.["assistant_name"] as string | undefined)?.trim() || DEFAULT_ASSISTANT_NAME;
  const assistantParams = { assistantName };
  const progress = Math.min(100, Math.max(0, setupQuery.data?.progressPercent ?? 0));
  const currentStep = setupQuery.data?.session?.current_step ?? "profile_basics";

  function statusLabel(status: OnboardingItemStatus) {
    if (status === "completed") return t("onboarding.status.completed");
    if (status === "in_progress") return t("onboarding.status.inProgress");
    if (status === "skipped") return t("onboarding.status.skipped");
    return t("onboarding.status.pending");
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
