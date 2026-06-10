import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { CheckCircle2, FileText, XCircle } from "lucide-react";
import { useParams } from "react-router-dom";
import { Button, Card, CardContent, CardHeader, CardTitle, Input, cn } from "@iaprafaturar/ui";
import { useI18n } from "@/i18n";
import { decidePublicQuote, getPublicQuoteContext } from "@/lib/public-quote-api";
import { PublicLayout } from "./PublicLayout";

function currency(value: number, locale: string) {
  return new Intl.NumberFormat(locale, { style: "currency", currency: "BRL" }).format(value);
}

function quoteErrorKey(error: string | undefined) {
  if (error === "not_found") return "quote.error.notFound";
  if (error === "expired") return "quote.error.expired";
  if (error === "already_approved") return "quote.error.alreadyApproved";
  if (error === "already_rejected") return "quote.error.alreadyRejected";
  if (error === "already_converted") return "quote.error.alreadyConverted";
  if (error === "signature_required") return "quote.error.signature";
  if (error === "invalid_input") return "quote.error.invalidInput";
  return "quote.error.submit";
}

function itemLabel(item: Record<string, unknown>, index: number) {
  const name = item.name ?? item.description ?? item.title;
  return typeof name === "string" && name.trim() ? name : `Item ${index + 1}`;
}

function itemTotal(item: Record<string, unknown>) {
  const quantity = Number(item.quantity ?? 1);
  const unitPrice = Number(item.unit_price ?? item.price ?? 0);
  return Number.isFinite(quantity * unitPrice) ? quantity * unitPrice : 0;
}

export default function PublicQuotePage() {
  const { token = "" } = useParams<{ token: string }>();
  const { locale, t } = useI18n();
  const [decision, setDecision] = useState<"approved" | "rejected">("approved");
  const [typedName, setTypedName] = useState("");
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [successStatus, setSuccessStatus] = useState<string | null>(null);

  const quoteQuery = useQuery({
    queryKey: ["public-quote", token],
    queryFn: () => getPublicQuoteContext(token),
    enabled: Boolean(token)
  });

  const context = quoteQuery.data?.ok ? quoteQuery.data : null;
  const loadError = quoteQuery.data && !quoteQuery.data.ok ? quoteQuery.data.error : null;

  const totals = useMemo(() => {
    if (!context) return [];
    return [
      { label: t("quote.summary.subtotal"), value: currency(context.quote.subtotal, locale) },
      { label: t("quote.summary.discount"), value: currency(context.quote.discount_amount, locale) },
      { label: t("quote.summary.total"), value: currency(context.quote.total_amount, locale) }
    ];
  }, [context, locale, t]);

  const decisionMutation = useMutation({
    mutationFn: () => {
      setFormError(null);
      if (decision === "approved" && (!typedName.trim() || !acceptedTerms)) {
        throw new Error("signature_required");
      }
      return decidePublicQuote({
        token,
        decision,
        acceptedTerms,
        ...(typedName.trim() ? { typedName: typedName.trim() } : {})
      });
    },
    onSuccess(data) {
      if (!data.ok) {
        setFormError(t(quoteErrorKey(data.error)));
        return;
      }
      setSuccessStatus(data.status);
    },
    onError(error) {
      setFormError(error instanceof Error && error.message === "signature_required" ? t("quote.error.signature") : t("quote.error.submit"));
    }
  });

  return (
    <PublicLayout
      eyebrow={t("shell.quote")}
      title={context?.quote.title ?? t(loadError ? "common.notFound.title" : "quote.title")}
      subtitle={context ? t("quote.subtitle", { professionalName: context.professional.name }) : t("quote.loadingSubtitle")}
    >
      <Card className="overflow-hidden rounded-lg border-zinc-200 shadow-lg shadow-teal-950/5">
        <CardHeader className="border-b border-zinc-100 bg-white">
          <CardTitle className="flex items-center gap-2 text-xl">
            <FileText className="h-5 w-5 text-brand" aria-hidden="true" />
            {context?.quote.title ?? t("quote.card.title")}
          </CardTitle>
          {context ? <p className="text-sm text-zinc-600">{t("quote.client", { clientName: context.client.full_name })}</p> : null}
        </CardHeader>
        <CardContent className="space-y-5 p-5">
          {quoteQuery.isLoading ? <p className="text-sm text-zinc-600">{t("common.loading")}</p> : null}

          {loadError ? (
            <div className="rounded-lg bg-red-50 p-4 text-sm text-red-700">
              {t(quoteErrorKey(loadError))}
            </div>
          ) : null}

          {context ? (
            <>
              <div className="space-y-2">
                {context.quote.items.map((item, index) => (
                  <div key={`${itemLabel(item, index)}-${index}`} className="flex items-start justify-between gap-3 rounded-lg border border-zinc-200 bg-white p-3">
                    <div className="min-w-0">
                      <p className="break-words text-sm font-semibold text-zinc-900">{itemLabel(item, index)}</p>
                      <p className="text-xs text-zinc-500">{t("quote.item.quantity", { count: Number(item.quantity ?? 1) })}</p>
                    </div>
                    <p className="shrink-0 text-sm font-semibold text-zinc-900">{currency(itemTotal(item), locale)}</p>
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                {totals.map((item) => (
                  <div key={item.label} className="rounded-lg border border-zinc-200 bg-zinc-50 p-3">
                    <p className="text-xs font-medium text-zinc-500">{item.label}</p>
                    <p className="mt-1 text-base font-semibold text-zinc-950">{item.value}</p>
                  </div>
                ))}
              </div>

              {context.quote.notes ? <p className="rounded-lg bg-zinc-50 p-3 text-sm leading-6 text-zinc-600">{context.quote.notes}</p> : null}

              {successStatus ? (
                <div className="rounded-lg border border-teal-100 bg-teal-50 p-4 text-center text-sm font-medium text-teal-800">
                  <CheckCircle2 className="mx-auto mb-2 h-6 w-6" aria-hidden="true" />
                  {t(successStatus === "aprovado" ? "quote.success.approved" : "quote.success.rejected")}
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-2">
                    {(["approved", "rejected"] as const).map((item) => {
                      const Icon = item === "approved" ? CheckCircle2 : XCircle;
                      return (
                        <button
                          key={item}
                          type="button"
                          className={cn(
                            "flex min-h-20 flex-col items-center justify-center rounded-lg border px-2 py-3 text-sm font-semibold",
                            decision === item ? "border-brand bg-teal-50 text-brand" : "border-zinc-200 bg-white text-zinc-700"
                          )}
                          onClick={() => {
                            setDecision(item);
                            setFormError(null);
                          }}
                        >
                          <Icon className="mb-2 h-5 w-5" aria-hidden="true" />
                          {t(item === "approved" ? "quote.approve" : "quote.reject")}
                        </button>
                      );
                    })}
                  </div>

                  {decision === "approved" ? (
                    <>
                      <label className="block space-y-2">
                        <span className="text-sm font-semibold text-zinc-800">{t("quote.signature.name")}</span>
                        <Input value={typedName} onChange={(event) => setTypedName(event.target.value)} placeholder={t("quote.signature.placeholder")} />
                      </label>
                      <label className="flex items-start gap-2 rounded-lg border border-zinc-200 p-3 text-sm text-zinc-700">
                        <input
                          type="checkbox"
                          className="mt-1"
                          checked={acceptedTerms}
                          onChange={(event) => setAcceptedTerms(event.target.checked)}
                        />
                        <span>{t("quote.signature.terms")}</span>
                      </label>
                    </>
                  ) : null}

                  {formError ? <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{formError}</p> : null}

                  <Button
                    type="button"
                    className="h-12 w-full bg-brand text-white hover:bg-brand/90"
                    disabled={decisionMutation.isPending}
                    onClick={() => decisionMutation.mutate()}
                  >
                    {decisionMutation.isPending ? t("common.sending") : t(decision === "approved" ? "quote.submitApprove" : "quote.submitReject")}
                  </Button>
                </div>
              )}
            </>
          ) : null}
        </CardContent>
      </Card>
    </PublicLayout>
  );
}
