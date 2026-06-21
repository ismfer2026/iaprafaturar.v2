import { useMemo, useState } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import { ArrowLeft, CalendarDays, DollarSign, FileHeart, History, UserRound } from "lucide-react";
import { Badge, Button, Card, CardContent, Skeleton, cn } from "@iaprafaturar/ui";
import type { Appointment, JourneyStage, Session } from "@iaprafaturar/domain";
import { useAuth } from "@/contexts/AuthContext";
import { useClient } from "@/hooks/useClients";
import { useClientAppointments } from "@/hooks/useAppointments";
import { useClientAnamneseFichas, useReviewAnamneseFicha, type AnamneseFicha } from "@/hooks/useAnamnese";
import { useClientPackages, useContracts } from "@/hooks/useDocumentsPackages";
import { useFinancialTransactions } from "@/hooks/useFinancial";
import { useSessions } from "@/hooks/useSessions";
import { useI18n, type Locale, type TranslationKey } from "@/i18n";

const STAGE_LABEL_KEYS: Record<JourneyStage, TranslationKey> = {
  lead: "stage.lead",
  agendado: "stage.agendado",
  em_tratamento: "stage.em_tratamento",
  pos_tratamento: "stage.pos_tratamento",
  cliente_fiel: "stage.cliente_fiel",
  inativo: "stage.inativo",
};

const APPOINTMENT_STATUS_LABEL_KEYS: Record<Appointment["status"], TranslationKey> = {
  agendado: "appointment.status.agendado",
  confirmado: "appointment.status.confirmado",
  cancelado: "appointment.status.cancelado",
  realizado: "appointment.status.realizado",
  falta: "appointment.status.falta",
  reagendado: "appointment.status.reagendado",
};

const DOCUMENT_TYPE_LABEL_KEYS = {
  contrato: "docs.modelo.type.contrato",
  termo_lgpd: "docs.modelo.type.termo_lgpd",
  consentimento_clinico: "docs.modelo.type.consentimento_clinico",
  responsabilidade: "docs.modelo.type.responsabilidade",
  contrato_pacote: "docs.modelo.type.contrato_pacote",
  orcamento: "docs.modelo.type.orcamento",
} as const satisfies Record<string, TranslationKey>;

const CONTRACT_STATUS_LABEL_KEYS = {
  rascunho: "docs.contract.status.rascunho",
  enviado: "docs.contract.status.enviado",
  assinado_manual: "docs.contract.status.assinado_manual",
  cancelado: "docs.contract.status.cancelado",
  expirado: "docs.contract.status.expirado",
} as const satisfies Record<string, TranslationKey>;

type Tab = "resumo" | "historico" | "anamnese" | "financeiro";

const TABS = [
  { value: "resumo", labelKey: "clientProfile.tab.summary", icon: UserRound },
  { value: "historico", labelKey: "clientProfile.tab.history", icon: History },
  { value: "anamnese", labelKey: "clientProfile.tab.anamnese", icon: FileHeart },
  { value: "financeiro", labelKey: "clientProfile.tab.finance", icon: DollarSign },
] satisfies Array<{ value: Tab; labelKey: TranslationKey; icon: typeof UserRound }>;

function formatDate(value: string | null, locale: Locale, noDateLabel: string) {
  if (!value) return noDateLabel;
  return new Intl.DateTimeFormat(locale, {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function TimelineItem({ item }: { item: Appointment | Session }) {
  const { locale, t } = useI18n();
  const isSession = "session_date" in item;
  const title = isSession ? t("clientProfile.timeline.session") : t("clientProfile.timeline.appointment");
  const date = isSession ? item.session_date : item.scheduled_at;
  const status = isSession ? t("appointment.status.realizado") : t(APPOINTMENT_STATUS_LABEL_KEYS[item.status]);

  return (
    <Card className="rounded-lg border-zinc-200">
      <CardContent className="flex gap-3 p-4">
        <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary-50 text-primary-700">
          <CalendarDays className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <h3 className="truncate text-sm font-semibold text-zinc-950">{title}</h3>
            <Badge className="shrink-0 border border-zinc-200 bg-white text-zinc-600">{status}</Badge>
          </div>
          <p className="mt-1 text-sm text-zinc-500">{formatDate(date, locale, t("common.noDate"))}</p>
          {isSession && item.clinical_evolution ? (
            <p className="mt-2 line-clamp-2 text-sm text-zinc-600">{item.clinical_evolution}</p>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}

const ANAMNESE_SECTION_KEYS = [
  ["dados_pessoais", "clientProfile.anamnese.section.dadosPessoais"],
  ["queixas", "clientProfile.anamnese.section.queixas"],
  ["historico", "clientProfile.anamnese.section.historico"],
  ["alergias", "clientProfile.anamnese.section.alergias"],
  ["habitos", "clientProfile.anamnese.section.habitos"],
  ["custom_data", "clientProfile.anamnese.section.customData"],
] satisfies Array<[keyof AnamneseFicha, TranslationKey]>;

function stringifySection(value: unknown) {
  if (!value || typeof value !== "object") return "";
  const record = value as Record<string, unknown>;
  const notes = record.notes;
  if (typeof notes === "string") return notes;
  return Object.entries(record)
    .filter(([, item]) => item !== null && item !== undefined && item !== "")
    .map(([key, item]) => `${key}: ${String(item)}`)
    .join("\n");
}

function AnamneseCard({
  ficha,
  reviewNotes,
  reviewPending,
  onReview,
  onReviewNotesChange
}: {
  ficha: AnamneseFicha;
  reviewNotes: string;
  reviewPending: boolean;
  onReview: () => void;
  onReviewNotesChange: (value: string) => void;
}) {
  const { locale, t } = useI18n();

  return (
    <Card className="rounded-lg border-zinc-200">
      <CardContent className="space-y-4 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-base font-semibold text-zinc-950">{t("clientProfile.anamnese.available")}</h2>
            <p className="mt-1 text-sm text-zinc-500">
              {formatDate(ficha.preenchido_em ?? ficha.created_at, locale, t("common.noDate"))}
            </p>
          </div>
          <Badge className="border border-teal-200 bg-teal-50 text-teal-700">{ficha.status}</Badge>
        </div>

        <dl className="grid gap-2 text-sm sm:grid-cols-2">
          <div className="rounded-md bg-zinc-50 p-3">
            <dt className="text-zinc-500">{t("clientProfile.anamnese.status")}</dt>
            <dd className="mt-1 font-medium text-zinc-950">{ficha.status}</dd>
          </div>
          <div className="rounded-md bg-zinc-50 p-3">
            <dt className="text-zinc-500">{t("clientProfile.anamnese.lgpd")}</dt>
            <dd className="mt-1 font-medium text-zinc-950">{ficha.lgpd_aceito ? t("common.active") : t("common.pending")}</dd>
          </div>
        </dl>

        <div className="space-y-3">
          {ANAMNESE_SECTION_KEYS.map(([field, labelKey]) => {
            const text = stringifySection(ficha[field]);
            if (!text) return null;
            return (
              <section key={field} className="rounded-lg border border-zinc-200 bg-white p-3">
                <h3 className="text-sm font-semibold text-zinc-950">{t(labelKey)}</h3>
                <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-zinc-600">{text}</p>
              </section>
            );
          })}
        </div>

        {ficha.fotos?.length ? (
          <section className="rounded-lg border border-zinc-200 bg-white p-3">
            <h3 className="text-sm font-semibold text-zinc-950">{t("clientProfile.anamnese.photos")}</h3>
            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
              {ficha.fotos.map((photo) => (
                <a
                  key={photo.path}
                  href={photo.signedUrl ?? "#"}
                  target="_blank"
                  rel="noreferrer"
                  className="block overflow-hidden rounded-md border border-zinc-200 bg-zinc-50"
                >
                  {photo.signedUrl ? (
                    <img src={photo.signedUrl} alt={photo.name ?? t("clientProfile.anamnese.photos")} className="aspect-square w-full object-cover" />
                  ) : (
                    <span className="flex aspect-square items-center justify-center px-2 text-center text-xs text-zinc-500">
                      {photo.name ?? t("clientProfile.anamnese.photos")}
                    </span>
                  )}
                </a>
              ))}
            </div>
          </section>
        ) : null}

        {ficha.assinatura_signed_url ? (
          <section className="rounded-lg border border-zinc-200 bg-white p-3">
            <h3 className="text-sm font-semibold text-zinc-950">{t("clientProfile.anamnese.signature")}</h3>
            <a href={ficha.assinatura_signed_url} target="_blank" rel="noreferrer" className="mt-3 block w-fit overflow-hidden rounded-md border border-zinc-200 bg-zinc-50">
              <img src={ficha.assinatura_signed_url} alt={t("clientProfile.anamnese.signature")} className="max-h-36 max-w-full object-contain" />
            </a>
          </section>
        ) : null}

        <section className="space-y-3 rounded-lg border border-zinc-200 bg-white p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-zinc-950">{t("clientProfile.anamnese.reviewNotes")}</h3>
            {ficha.revisado_em ? (
              <span className="text-xs text-zinc-500">
                {t("clientProfile.anamnese.reviewedAt")}: {formatDate(ficha.revisado_em, locale, t("common.noDate"))}
              </span>
            ) : null}
          </div>
          <textarea
            value={reviewNotes}
            placeholder={t("clientProfile.anamnese.reviewPlaceholder")}
            className="min-h-24 w-full resize-y rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm outline-none transition focus:border-primary-500 focus:ring-2 focus:ring-primary-100"
            onChange={(event) => onReviewNotesChange(event.target.value)}
          />
          <Button type="button" className="w-full sm:w-fit" disabled={reviewPending} onClick={onReview}>
            {reviewPending ? t("common.saving") : t("clientProfile.anamnese.reviewAction")}
          </Button>
        </section>
      </CardContent>
    </Card>
  );
}

export default function ClientProfilePage() {
  const { locale, t } = useI18n();
  const { id } = useParams<{ id: string }>();
  const location = useLocation();
  const { professionalId } = useAuth();
  const [activeTab, setActiveTab] = useState<Tab>(() =>
    location.pathname.endsWith("/anamnese") ? "anamnese" : "resumo",
  );
  const [reviewNotesByFichaId, setReviewNotesByFichaId] = useState<Record<string, string>>({});

  const clientQuery = useClient(professionalId, id ?? null);
  const appointmentsQuery = useClientAppointments(professionalId, id ?? null);
  const sessionsQuery = useSessions(professionalId, id ?? null);
  const anamneseQuery = useClientAnamneseFichas(professionalId, id ?? null);
  const reviewAnamneseMutation = useReviewAnamneseFicha(professionalId, id ?? null);
  const clientPackagesQuery = useClientPackages(professionalId, id ?? null);
  const contractsQuery = useContracts(professionalId, id ?? null);
  const financialTransactionsQuery = useFinancialTransactions(professionalId, { clientId: id ?? null });

  const timeline = useMemo(() => {
    const appointments = appointmentsQuery.data ?? [];
    const sessions = sessionsQuery.data ?? [];

    return [...appointments, ...sessions].sort((a, b) => {
      const aDate = "session_date" in a ? a.session_date : a.scheduled_at;
      const bDate = "session_date" in b ? b.session_date : b.scheduled_at;
      return new Date(bDate).getTime() - new Date(aDate).getTime();
    });
  }, [appointmentsQuery.data, sessionsQuery.data]);

  if (clientQuery.isLoading) {
    return (
      <div className="mx-auto w-full max-w-4xl space-y-4 px-4 py-5 md:px-6">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  if (clientQuery.error || !clientQuery.data) {
    return (
      <div className="mx-auto w-full max-w-4xl px-4 py-5 md:px-6">
        <Button asChild variant="ghost" className="mb-4 gap-2">
          <Link to="/clientes">
            <ArrowLeft className="h-4 w-4" />
            {t("clientProfile.back")}
          </Link>
        </Button>
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {t("clientProfile.error.load")}
        </div>
      </div>
    );
  }

  const client = clientQuery.data;

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-5 px-4 py-5 md:px-6">
      <header className="space-y-4">
        <Button asChild variant="ghost" className="w-fit gap-2 px-0">
          <Link to="/clientes">
            <ArrowLeft className="h-4 w-4" />
            {t("clientProfile.back")}
          </Link>
        </Button>

        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="truncate text-3xl font-semibold tracking-tight text-zinc-950">
              {client.full_name}
            </h1>
            <p className="mt-1 text-sm text-zinc-500">
              {client.phone_whatsapp || client.email || t("common.noContact")}
            </p>
          </div>
          <Badge className="shrink-0 border border-primary-200 bg-primary-50 text-primary-700">
            {t(STAGE_LABEL_KEYS[client.journey_stage])}
          </Badge>
        </div>
      </header>

      <div className="grid grid-cols-4 rounded-lg bg-zinc-100 p-1">
        {TABS.map(({ value, labelKey, icon: Icon }) => {
          const isActive = activeTab === value;
          return (
            <button
              key={value}
              type="button"
              onClick={() => setActiveTab(value)}
              className={cn(
                "flex h-10 items-center justify-center gap-2 rounded-md text-sm font-medium transition-colors",
                isActive ? "bg-white text-zinc-950 shadow-sm" : "text-zinc-500",
              )}
            >
              <Icon className="h-4 w-4" />
              <span className="hidden sm:inline">{t(labelKey)}</span>
            </button>
          );
        })}
      </div>

      {activeTab === "resumo" ? (
        <section className="grid gap-3 md:grid-cols-2">
          <Card className="rounded-lg border-zinc-200">
            <CardContent className="space-y-3 p-4">
              <h2 className="text-sm font-semibold text-zinc-950">{t("clientProfile.contact")}</h2>
              <dl className="space-y-2 text-sm">
                <div className="flex justify-between gap-3">
                  <dt className="text-zinc-500">{t("clientProfile.whatsapp")}</dt>
                  <dd className="text-right text-zinc-900">{client.phone_whatsapp || "-"}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-zinc-500">{t("clientProfile.email")}</dt>
                  <dd className="truncate text-right text-zinc-900">{client.email || "-"}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-zinc-500">{t("clientProfile.city")}</dt>
                  <dd className="text-right text-zinc-900">{client.city || "-"}</dd>
                </div>
              </dl>
            </CardContent>
          </Card>

          <Card className="rounded-lg border-zinc-200">
            <CardContent className="space-y-3 p-4">
              <h2 className="text-sm font-semibold text-zinc-950">{t("clientProfile.journey")}</h2>
              <dl className="space-y-2 text-sm">
                <div className="flex justify-between gap-3">
                  <dt className="text-zinc-500">{t("clientProfile.stage")}</dt>
                  <dd className="text-right text-zinc-900">{t(STAGE_LABEL_KEYS[client.journey_stage])}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-zinc-500">{t("clientProfile.source")}</dt>
                  <dd className="text-right text-zinc-900">{client.source}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-zinc-500">{t("clientProfile.createdAt")}</dt>
                  <dd className="text-right text-zinc-900">
                    {formatDate(client.created_at, locale, t("common.noDate"))}
                  </dd>
                </div>
              </dl>
            </CardContent>
          </Card>
        </section>
      ) : null}

      {activeTab === "historico" ? (
        <section className="space-y-3">
          {appointmentsQuery.isLoading || sessionsQuery.isLoading ? (
            <>
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-20 w-full" />
            </>
          ) : null}

          {!appointmentsQuery.isLoading && !sessionsQuery.isLoading && timeline.length === 0 ? (
            <div className="rounded-lg border border-dashed border-zinc-300 bg-white p-6 text-center">
              <h2 className="text-base font-semibold text-zinc-950">{t("clientProfile.history.emptyTitle")}</h2>
              <p className="mt-1 text-sm text-zinc-500">{t("clientProfile.history.emptyDescription")}</p>
              <Button asChild className="mt-4">
                <Link to="/agenda">{t("clientProfile.history.openAgenda")}</Link>
              </Button>
            </div>
          ) : null}

          {timeline.map((item) => (
            <TimelineItem key={`${"session_date" in item ? "session" : "appointment"}-${item.id}`} item={item} />
          ))}
        </section>
      ) : null}

      {activeTab === "financeiro" ? (
        <section className="space-y-3">
          <Card className="rounded-lg border-zinc-200">
            <CardContent className="space-y-3 p-4">
              <h2 className="text-base font-semibold text-zinc-950">{t("clientProfile.finance.title")}</h2>
              {financialTransactionsQuery.isLoading ? <Skeleton className="h-16 w-full" /> : null}
              {!financialTransactionsQuery.isLoading && !financialTransactionsQuery.data?.length ? (
                <p className="text-sm text-zinc-500">{t("clientProfile.finance.description")}</p>
              ) : null}
              {financialTransactionsQuery.data?.map((transaction) => (
                <div key={transaction.id} className="flex items-center justify-between gap-3 rounded-lg bg-zinc-50 p-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-zinc-950">{transaction.description}</p>
                    <p className="mt-0.5 text-xs text-zinc-500">
                      {formatDate(transaction.paid_at ?? transaction.created_at, locale, t("common.noDate"))}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-sm font-semibold text-zinc-950">
                      {new Intl.NumberFormat(locale, { style: "currency", currency: "BRL" }).format(transaction.net_amount)}
                    </p>
                    <Badge className="mt-1 border border-zinc-200 bg-white text-zinc-700">{transaction.status}</Badge>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card className="rounded-lg border-zinc-200">
            <CardContent className="space-y-3 p-4">
              <h2 className="text-base font-semibold text-zinc-950">{t("clientProfile.packages.title")}</h2>
              {clientPackagesQuery.isLoading ? <Skeleton className="h-16 w-full" /> : null}
              {!clientPackagesQuery.isLoading && !clientPackagesQuery.data?.length ? (
                <p className="text-sm text-zinc-500">{t("clientProfile.packages.empty")}</p>
              ) : null}
              {clientPackagesQuery.data?.map((item) => (
                <div key={item.id} className="flex items-center justify-between gap-3 rounded-lg bg-zinc-50 p-3">
                  <div>
                    <p className="text-sm font-semibold text-zinc-950">{item.package_name}</p>
                    <p className="mt-0.5 text-xs text-zinc-500">{item.status}</p>
                  </div>
                  <Badge className="border border-primary-200 bg-primary-50 text-primary-700">
                    {item.sessions_remaining}/{item.sessions_total}
                  </Badge>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card className="rounded-lg border-zinc-200">
            <CardContent className="space-y-3 p-4">
              <h2 className="text-base font-semibold text-zinc-950">{t("clientProfile.documents.title")}</h2>
              {contractsQuery.isLoading ? <Skeleton className="h-16 w-full" /> : null}
              {!contractsQuery.isLoading && !contractsQuery.data?.length ? (
                <p className="text-sm text-zinc-500">{t("clientProfile.documents.empty")}</p>
              ) : null}
              {contractsQuery.data?.map((contract) => (
                <div key={contract.id} className="flex items-center justify-between gap-3 rounded-lg bg-zinc-50 p-3">
                  <div>
                    <p className="text-sm font-semibold text-zinc-950">{contract.modelo_name ?? t(DOCUMENT_TYPE_LABEL_KEYS[contract.type])}</p>
                    <p className="mt-0.5 text-xs text-zinc-500">{t(DOCUMENT_TYPE_LABEL_KEYS[contract.type])}</p>
                  </div>
                  <Badge className="border border-zinc-200 bg-white text-zinc-700">{t(CONTRACT_STATUS_LABEL_KEYS[contract.status])}</Badge>
                </div>
              ))}
            </CardContent>
          </Card>
        </section>
      ) : null}

      {activeTab === "anamnese" ? (
        <section className="space-y-3">
          {anamneseQuery.isLoading ? (
            <>
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-24 w-full" />
            </>
          ) : null}

          {!anamneseQuery.isLoading && !anamneseQuery.data?.length ? (
            <div className="rounded-lg border border-dashed border-zinc-300 bg-white p-6 text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-teal-50 text-teal-700">
                <FileHeart className="h-5 w-5" />
              </div>
              <h2 className="mt-4 text-base font-semibold text-zinc-950">{t("clientProfile.anamnese.missing")}</h2>
              <p className="mt-1 text-sm text-zinc-500">{t("clientProfile.anamnese.missingDescription")}</p>
            </div>
          ) : null}

          {anamneseQuery.data?.map((ficha) => (
            <AnamneseCard
              key={ficha.id}
              ficha={ficha}
              reviewNotes={reviewNotesByFichaId[ficha.id] ?? ficha.notas_profissional ?? ""}
              reviewPending={reviewAnamneseMutation.isPending}
              onReview={() =>
                reviewAnamneseMutation.mutate({
                  fichaId: ficha.id,
                  notasProfissional: reviewNotesByFichaId[ficha.id] ?? ficha.notas_profissional ?? ""
                })
              }
              onReviewNotesChange={(value) =>
                setReviewNotesByFichaId((current) => ({
                  ...current,
                  [ficha.id]: value
                }))
              }
            />
          ))}
        </section>
      ) : null}
    </div>
  );
}
