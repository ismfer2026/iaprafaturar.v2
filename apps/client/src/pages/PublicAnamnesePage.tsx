import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { CheckCircle2, ClipboardCheck, FileHeart, ImagePlus, PenLine, ShieldCheck } from "lucide-react";
import { useParams } from "react-router-dom";
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, Skeleton } from "@iaprafaturar/ui";
import type {
  PublicAnamneseErrorOutput,
  PublicAnamneseFormOutput
} from "@iaprafaturar/contracts/edge-functions/anamnese-public-handler";
import { useI18n } from "@/i18n";
import { getPublicAnamneseForm, submitPublicAnamnese, type PublicAnamneseAssetInput } from "@/lib/public-anamnese-api";
import { PublicLayout } from "./PublicLayout";

type SectionKey = "dadosPessoais" | "queixas" | "historico" | "alergias" | "habitos" | "customData";

interface SectionConfig {
  key: SectionKey;
  labelKey:
    | "anamnese.section.personal"
    | "anamnese.section.complaints"
    | "anamnese.section.history"
    | "anamnese.section.allergies"
    | "anamnese.section.habits"
    | "anamnese.section.custom";
}

const sections: SectionConfig[] = [
  { key: "dadosPessoais", labelKey: "anamnese.section.personal" },
  { key: "queixas", labelKey: "anamnese.section.complaints" },
  { key: "historico", labelKey: "anamnese.section.history" },
  { key: "alergias", labelKey: "anamnese.section.allergies" },
  { key: "habitos", labelKey: "anamnese.section.habits" },
  { key: "customData", labelKey: "anamnese.section.custom" }
];

type Answers = Record<SectionKey, string>;

const initialAnswers: Answers = {
  dadosPessoais: "",
  queixas: "",
  historico: "",
  alergias: "",
  habitos: "",
  customData: ""
};

function isForm(data: unknown): data is PublicAnamneseFormOutput {
  return Boolean(data && typeof data === "object" && "sections" in data);
}

function isError(data: unknown): data is PublicAnamneseErrorOutput {
  return Boolean(data && typeof data === "object" && "ok" in data && (data as { ok?: unknown }).ok === false);
}

function toSectionRecord(value: string): Record<string, unknown> {
  return value.trim() ? { notes: value.trim() } : {};
}

const MAX_ANAMNESE_ASSET_SIZE = 5 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

function isAllowedImageType(value: string): value is PublicAnamneseAssetInput["type"] {
  return ALLOWED_IMAGE_TYPES.includes(value as PublicAnamneseAssetInput["type"]);
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error ?? new Error("file_read_failed"));
    reader.readAsDataURL(file);
  });
}

async function fileToAnamneseAsset(file: File): Promise<PublicAnamneseAssetInput> {
  if (!isAllowedImageType(file.type) || file.size > MAX_ANAMNESE_ASSET_SIZE) {
    throw new Error("invalid_asset");
  }

  return {
    name: file.name,
    type: file.type,
    size: file.size,
    data_url: await readFileAsDataUrl(file)
  };
}

export default function PublicAnamnesePage() {
  const { token = "" } = useParams<{ token: string }>();
  const { locale, t } = useI18n();
  const [answers, setAnswers] = useState<Answers>(initialAnswers);
  const [lgpdAccepted, setLgpdAccepted] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [photos, setPhotos] = useState<PublicAnamneseAssetInput[]>([]);
  const [signature, setSignature] = useState<PublicAnamneseAssetInput | null>(null);

  const formQuery = useQuery({
    queryKey: ["public-anamnese-form", token, locale],
    queryFn: () => getPublicAnamneseForm({ token, lang: locale }),
    enabled: Boolean(token)
  });

  const form = isForm(formQuery.data) ? formQuery.data : null;
  const errorState = isError(formQuery.data) ? formQuery.data : null;

  const submitMutation = useMutation({
    mutationFn: () =>
      submitPublicAnamnese({
        token,
        lang: locale,
        dadosPessoais: toSectionRecord(answers.dadosPessoais),
        queixas: toSectionRecord(answers.queixas),
        historico: toSectionRecord(answers.historico),
        alergias: toSectionRecord(answers.alergias),
        habitos: toSectionRecord(answers.habitos),
        customData: toSectionRecord(answers.customData),
        fotos: photos,
        assinaturaUrl: signature?.data_url ?? null
      }),
    onSuccess(data) {
      if (isError(data)) {
        if (data.error === "lgpd_required") {
          setFormError(t("anamnese.error.lgpd"));
          return;
        }
        if (data.error === "invalid_input") {
          setFormError(t("anamnese.error.invalidInput"));
          return;
        }
        if (data.error !== "expired" && data.error !== "already_completed" && data.error !== "not_found") {
          setFormError(t("anamnese.error.submit"));
        }
        return;
      }
      setFormError(null);
    },
    onError() {
      setFormError(t("anamnese.error.submit"));
    }
  });

  const submitErrorState = isError(submitMutation.data) ? submitMutation.data : null;
  const terminalErrorState =
    submitErrorState?.error === "expired" || submitErrorState?.error === "already_completed" || submitErrorState?.error === "not_found"
      ? submitErrorState
      : errorState;

  const completed = useMemo(() => {
    return submitMutation.data && !isError(submitMutation.data);
  }, [submitMutation.data]);

  function updateAnswer(key: SectionKey, value: string) {
    setAnswers((current) => ({ ...current, [key]: value }));
  }

  async function handlePhotosChange(files: FileList | null) {
    setFormError(null);
    if (!files?.length) return;

    try {
      const nextFiles = Array.from(files).slice(0, Math.max(0, 4 - photos.length));
      const nextAssets = await Promise.all(nextFiles.map(fileToAnamneseAsset));
      setPhotos((current) => [...current, ...nextAssets].slice(0, 4));
    } catch {
      setFormError(t("anamnese.error.asset"));
    }
  }

  async function handleSignatureChange(files: FileList | null) {
    setFormError(null);
    const file = files?.[0];
    if (!file) return;

    try {
      setSignature(await fileToAnamneseAsset(file));
    } catch {
      setFormError(t("anamnese.error.asset"));
    }
  }

  function submit() {
    setFormError(null);
    if (!lgpdAccepted) {
      setFormError(t("anamnese.error.lgpd"));
      return;
    }
    submitMutation.mutate();
  }

  if (formQuery.isLoading) {
    return (
      <PublicLayout eyebrow={t("shell.anamnese")} title={t("anamnese.title")} subtitle={t("common.loading")}>
        <Card className="rounded-lg">
          <CardContent className="space-y-4 p-5">
            <Skeleton className="h-8 w-2/3" />
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
          </CardContent>
        </Card>
      </PublicLayout>
    );
  }

  if (terminalErrorState) {
    const isExpired = terminalErrorState.error === "expired";
    const isCompleted = terminalErrorState.error === "already_completed";
    return (
      <PublicLayout
        eyebrow={t("shell.anamnese")}
        title={isExpired ? t("anamnese.expired.title") : isCompleted ? t("anamnese.completed.title") : t("common.notFound.title")}
        subtitle={isExpired ? t("anamnese.expired.description") : isCompleted ? t("anamnese.completed.description") : t("anamnese.error.load")}
      >
        <Card className="rounded-lg">
          <CardContent className="space-y-4 p-5 text-center">
            <FileHeart className="mx-auto h-10 w-10 text-brand" aria-hidden="true" />
            <p className="text-sm leading-6 text-zinc-600">
              {isExpired
                ? t("anamnese.expired.description")
                : isCompleted
                  ? t("anamnese.completed.description")
                  : t("common.notFound.description")}
            </p>
            <Button type="button" className="w-full bg-brand text-white hover:bg-brand/90" onClick={() => formQuery.refetch()}>
              {t("common.tryAgain")}
            </Button>
          </CardContent>
        </Card>
      </PublicLayout>
    );
  }

  if (!form) {
    return (
      <PublicLayout eyebrow={t("shell.anamnese")} title={t("common.notFound.title")} subtitle={t("anamnese.error.load")}>
        <Card className="rounded-lg">
          <CardContent className="p-5">
            <p className="text-sm leading-6 text-zinc-600">{t("common.notFound.description")}</p>
          </CardContent>
        </Card>
      </PublicLayout>
    );
  }

  return (
    <PublicLayout
      eyebrow={t("shell.anamnese")}
      title={t("anamnese.title")}
      subtitle={t("anamnese.subtitle")}
      {...(form.professional.brand_color ? { brandColor: form.professional.brand_color } : {})}
    >
      <Card className="overflow-hidden rounded-lg border-zinc-200 shadow-lg shadow-teal-950/5">
        <CardHeader className="space-y-3 border-b border-zinc-100 bg-white">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary">{t("anamnese.token.label")}</Badge>
            <span className="max-w-full truncate text-sm font-medium text-zinc-700">{token}</span>
          </div>
          <CardTitle className="text-xl">{form.professional.public_name}</CardTitle>
          <p className="text-sm leading-6 text-zinc-600">{t("anamnese.form.description")}</p>
        </CardHeader>
        <CardContent className="space-y-5 p-5">
          {completed ? (
            <div className="space-y-4 text-center">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-teal-100 text-teal-700">
                <CheckCircle2 className="h-7 w-7" aria-hidden="true" />
              </div>
              <div className="space-y-2">
                <h2 className="text-2xl font-semibold text-zinc-950">{t("anamnese.success.title")}</h2>
                <p className="text-sm leading-6 text-zinc-600">{t("anamnese.success.description")}</p>
              </div>
            </div>
          ) : (
            <>
              <div className="space-y-4">
                {sections.map((section) => (
                  <label key={section.key} className="block space-y-2">
                    <span className="flex items-center gap-2 text-sm font-semibold text-zinc-900">
                      <FileHeart className="h-4 w-4 text-brand" aria-hidden="true" />
                      {t(section.labelKey)}
                    </span>
                    <textarea
                      value={answers[section.key]}
                      placeholder={t("anamnese.field.placeholder")}
                      className="min-h-24 w-full resize-y rounded-lg border border-zinc-200 bg-white px-3 py-3 text-sm outline-none transition placeholder:text-zinc-400 focus:border-brand focus:ring-2 focus:ring-teal-100"
                      onChange={(event) => updateAnswer(section.key, event.target.value)}
                    />
                  </label>
                ))}
              </div>

              <section className="space-y-3 rounded-lg border border-zinc-200 bg-white p-3">
                <div className="flex items-start gap-2">
                  <ImagePlus className="mt-0.5 h-4 w-4 text-brand" aria-hidden="true" />
                  <div>
                    <h3 className="text-sm font-semibold text-zinc-950">{t("anamnese.photos.title")}</h3>
                    <p className="mt-1 text-xs leading-5 text-zinc-500">{t("anamnese.photos.description")}</p>
                  </div>
                </div>
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  multiple
                  className="block w-full text-sm text-zinc-700 file:mr-3 file:rounded-md file:border-0 file:bg-teal-50 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-teal-800"
                  onChange={(event) => {
                    void handlePhotosChange(event.target.files);
                    event.target.value = "";
                  }}
                />
                {photos.length ? (
                  <div className="flex flex-wrap gap-2">
                    {photos.map((photo) => (
                      <span key={`${photo.name}-${photo.size}`} className="rounded-full bg-zinc-100 px-3 py-1 text-xs text-zinc-700">
                        {photo.name}
                      </span>
                    ))}
                  </div>
                ) : null}
              </section>

              <section className="space-y-3 rounded-lg border border-zinc-200 bg-white p-3">
                <div className="flex items-start gap-2">
                  <PenLine className="mt-0.5 h-4 w-4 text-brand" aria-hidden="true" />
                  <div>
                    <h3 className="text-sm font-semibold text-zinc-950">{t("anamnese.signature.title")}</h3>
                    <p className="mt-1 text-xs leading-5 text-zinc-500">{t("anamnese.signature.description")}</p>
                  </div>
                </div>
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="block w-full text-sm text-zinc-700 file:mr-3 file:rounded-md file:border-0 file:bg-teal-50 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-teal-800"
                  onChange={(event) => {
                    void handleSignatureChange(event.target.files);
                    event.target.value = "";
                  }}
                />
                {signature ? <p className="text-xs font-medium text-teal-700">{t("anamnese.signature.selected")}</p> : null}
              </section>

              <label className="flex items-start gap-3 rounded-lg bg-teal-50 p-3 text-sm text-teal-950">
                <input
                  type="checkbox"
                  className="mt-1 h-4 w-4 rounded border-zinc-300 accent-teal-700"
                  checked={lgpdAccepted}
                  onChange={(event) => setLgpdAccepted(event.target.checked)}
                />
                <span className="flex-1">
                  <ShieldCheck className="mr-1 inline h-4 w-4" aria-hidden="true" />
                  {t("anamnese.lgpd")}
                </span>
              </label>

              {formError ? <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{formError}</p> : null}

              <Button
                type="button"
                className="h-12 w-full bg-brand text-white hover:bg-brand/90"
                disabled={submitMutation.isPending}
                onClick={submit}
              >
                <ClipboardCheck className="h-4 w-4" aria-hidden="true" />
                {submitMutation.isPending ? t("common.sending") : t("anamnese.submit")}
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    </PublicLayout>
  );
}
