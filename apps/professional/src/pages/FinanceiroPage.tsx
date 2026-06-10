import { type FormEvent, useMemo, useState } from "react";
import { CalendarClock, CheckCircle2, DollarSign, Plus, ReceiptText, XCircle } from "lucide-react";
import {
  Badge,
  Button,
  Card,
  CardContent,
  Input,
  Sheet,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  Skeleton,
  cn,
} from "@iaprafaturar/ui";
import type {
  FinancialPaymentMethod,
  FinancialTransactionStatus,
  FinancialTransactionType,
  FinancialTransactionWithClient,
  Session,
} from "@iaprafaturar/domain";
import { useAuth } from "@/contexts/AuthContext";
import { useClients } from "@/hooks/useClients";
import { useFinancialSummary, useFinancialTransactions } from "@/hooks/useFinancial";
import { useSessions } from "@/hooks/useSessions";
import { useI18n, type Locale, type TranslationKey } from "@/i18n";

type FinanceTab = "extrato" | "pendentes" | "resumo";

interface TransactionFormState {
  type: FinancialTransactionType;
  amount: string;
  status: Extract<FinancialTransactionStatus, "pendente" | "pago">;
  paymentMethod: "" | FinancialPaymentMethod;
  description: string;
  dueDate: string;
  clientId: string;
  sessionId: string;
  notes: string;
}

const EMPTY_FORM: TransactionFormState = {
  type: "receita",
  amount: "",
  status: "pago",
  paymentMethod: "pix",
  description: "",
  dueDate: "",
  clientId: "",
  sessionId: "",
  notes: "",
};

const STATUS_LABEL_KEYS: Record<FinancialTransactionStatus, TranslationKey> = {
  pendente: "finance.status.pendente",
  pago: "finance.status.pago",
  cancelado: "finance.status.cancelado",
  estornado: "finance.status.estornado",
};

const TYPE_LABEL_KEYS: Record<FinancialTransactionType, TranslationKey> = {
  receita: "finance.type.receita",
  despesa: "finance.type.despesa",
};

const PAYMENT_METHOD_LABEL_KEYS: Record<FinancialPaymentMethod, TranslationKey> = {
  pix: "finance.method.pix",
  dinheiro: "finance.method.dinheiro",
  cartao_credito: "finance.method.cartao_credito",
  cartao_debito: "finance.method.cartao_debito",
  transferencia: "finance.method.transferencia",
  outros: "finance.method.outros",
};

function toDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function monthRange() {
  const now = new Date();
  const first = new Date(now.getFullYear(), now.getMonth(), 1);
  const next = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  return {
    from: toDateKey(first),
    to: toDateKey(new Date(next.getTime() - 24 * 60 * 60 * 1000)),
  };
}

function formatCurrency(value: number, locale: Locale) {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: "BRL",
  }).format(value);
}

function formatDate(value: string | null, locale: Locale) {
  if (!value) return null;
  return new Intl.DateTimeFormat(locale, {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(value));
}

function statusTone(status: FinancialTransactionStatus) {
  if (status === "pago") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (status === "pendente") return "border-amber-200 bg-amber-50 text-amber-700";
  if (status === "cancelado") return "border-zinc-200 bg-zinc-100 text-zinc-600";
  return "border-red-200 bg-red-50 text-red-700";
}

function transactionTone(type: FinancialTransactionType) {
  return type === "receita" ? "text-emerald-700" : "text-red-700";
}

function sessionLabel(session: Session, locale: Locale) {
  const date = formatDate(session.session_date, locale);
  return `${date ?? ""} - ${formatCurrency(session.session_value, locale)}`.trim();
}

function TransactionCard({
  transaction,
  onMarkPaid,
  onCancel,
  onApproveCollection,
  isBusy,
}: {
  transaction: FinancialTransactionWithClient;
  onMarkPaid: (transaction: FinancialTransactionWithClient) => void;
  onCancel: (transaction: FinancialTransactionWithClient) => void;
  onApproveCollection: (transaction: FinancialTransactionWithClient) => void;
  isBusy: boolean;
}) {
  const { locale, t } = useI18n();
  const displayDate = formatDate(transaction.paid_at ?? transaction.due_date ?? transaction.created_at, locale);

  return (
    <Card className="rounded-lg border-zinc-200">
      <CardContent className="space-y-4 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <Badge className={cn("border", statusTone(transaction.status))}>
                {t(STATUS_LABEL_KEYS[transaction.status])}
              </Badge>
              <span className="text-xs font-medium text-zinc-500">{t(TYPE_LABEL_KEYS[transaction.type])}</span>
            </div>
            <h2 className="mt-2 line-clamp-2 text-base font-semibold text-zinc-950">{transaction.description}</h2>
            <p className="mt-1 text-sm text-zinc-500">
              {transaction.client_name || t("finance.noClient")} {displayDate ? `- ${displayDate}` : ""}
            </p>
          </div>
          <p className={cn("shrink-0 text-right text-lg font-semibold", transactionTone(transaction.type))}>
            {transaction.type === "despesa" ? "-" : ""}
            {formatCurrency(transaction.net_amount, locale)}
          </p>
        </div>

        {transaction.status === "pendente" ? (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <Button
              className="gap-2"
              onClick={() => onMarkPaid(transaction)}
              disabled={isBusy}
            >
              <CheckCircle2 className="h-4 w-4" />
              {t("finance.action.markPaid")}
            </Button>
            <Button
              variant="outline"
              className="gap-2 border-red-200 text-red-700 hover:bg-red-50"
              onClick={() => onCancel(transaction)}
              disabled={isBusy}
            >
              <XCircle className="h-4 w-4" />
              {t("finance.action.cancel")}
            </Button>
            <Button
              variant="outline"
              className="gap-2 border-emerald-200 text-emerald-700 hover:bg-emerald-50"
              onClick={() => onApproveCollection(transaction)}
              disabled={isBusy || Boolean(transaction.collection_sent_at)}
            >
              <ReceiptText className="h-4 w-4" />
              {transaction.collection_sent_at ? t("finance.action.collectionSent") : t("finance.action.approveCollection")}
            </Button>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

export default function FinanceiroPage() {
  const { locale, t } = useI18n();
  const { professionalId } = useAuth();
  const [activeTab, setActiveTab] = useState<FinanceTab>("extrato");
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const [form, setForm] = useState<TransactionFormState>(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);
  const range = useMemo(() => monthRange(), []);

  const filters = activeTab === "pendentes" ? { status: "pendente" as const } : {};
  const transactionsQuery = useFinancialTransactions(professionalId, filters);
  const summaryQuery = useFinancialSummary(professionalId, range.from, range.to);
  const clientsQuery = useClients(professionalId);
  const sessionsQuery = useSessions(professionalId);

  const transactions = transactionsQuery.data ?? [];
  const clients = clientsQuery.data ?? [];
  const sessions = sessionsQuery.data ?? [];
  const summary = summaryQuery.data;

  function openSheet() {
    setForm(EMPTY_FORM);
    setFormError(null);
    setIsSheetOpen(true);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);

    const amount = Number(form.amount.replace(",", "."));
    if (!Number.isFinite(amount) || amount <= 0) {
      setFormError(t("finance.error.amount"));
      return;
    }

    if (!form.description.trim()) {
      setFormError(t("finance.error.description"));
      return;
    }

    if (form.status === "pago" && !form.paymentMethod) {
      setFormError(t("finance.error.paymentMethod"));
      return;
    }

    const selectedSession = sessions.find((session) => session.id === form.sessionId);

    try {
      await transactionsQuery.createTransaction({
        type: form.type,
        amount,
        status: form.status,
        paymentMethod: form.status === "pago" && form.paymentMethod ? form.paymentMethod : null,
        dueDate: form.status === "pendente" && form.dueDate ? form.dueDate : null,
        description: form.description.trim(),
        notes: form.notes.trim() || null,
        clientId: form.clientId || selectedSession?.client_id || null,
        sessionId: form.sessionId || null,
        appointmentId: selectedSession?.appointment_id ?? null,
      });

      setIsSheetOpen(false);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : t("finance.error.create"));
    }
  }

  async function handleMarkPaid(transaction: FinancialTransactionWithClient) {
    await transactionsQuery.markPaid({
      transactionId: transaction.id,
      paymentMethod: "pix",
    });
  }

  async function handleCancel(transaction: FinancialTransactionWithClient) {
    await transactionsQuery.cancelTransaction({
      transactionId: transaction.id,
      reason: t("finance.action.cancelReason"),
    });
  }

  async function handleApproveCollection(transaction: FinancialTransactionWithClient) {
    await transactionsQuery.approveBillingCollection({
      transactionId: transaction.id,
      message: t("finance.collection.defaultMessage", {
        amount: formatCurrency(transaction.net_amount, locale),
        description: transaction.description,
      }),
    });
  }

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-5 px-4 py-5 md:px-6">
      <header className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-violet-600">{t("finance.eyebrow")}</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight text-zinc-950">{t("finance.title")}</h1>
          <p className="mt-1 text-sm text-zinc-500">{t("finance.subtitle")}</p>
        </div>
        <Button className="shrink-0 gap-2" onClick={openSheet}>
          <Plus className="h-4 w-4" />
          {t("finance.new")}
        </Button>
      </header>

      <section className="grid gap-3 md:grid-cols-3">
        <Card className="rounded-lg border-zinc-200">
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-50 text-emerald-700">
              <DollarSign className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xl font-semibold text-zinc-950">
                {formatCurrency(summary?.paidIncome ?? 0, locale)}
              </p>
              <p className="text-sm text-zinc-500">{t("finance.summary.paid")}</p>
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-lg border-zinc-200">
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-50 text-amber-700">
              <CalendarClock className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xl font-semibold text-zinc-950">
                {formatCurrency(summary?.pendingIncome ?? 0, locale)}
              </p>
              <p className="text-sm text-zinc-500">{t("finance.summary.pending")}</p>
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-lg border-zinc-200">
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-red-50 text-red-700">
              <ReceiptText className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xl font-semibold text-zinc-950">
                {formatCurrency(summary?.expenses ?? 0, locale)}
              </p>
              <p className="text-sm text-zinc-500">{t("finance.summary.expenses")}</p>
            </div>
          </CardContent>
        </Card>
      </section>

      <div className="grid grid-cols-3 rounded-lg bg-zinc-100 p-1">
        {(["extrato", "pendentes", "resumo"] as const).map((tab) => (
          <button
            key={tab}
            type="button"
            className={cn(
              "rounded-md px-3 py-2 text-sm font-medium transition-colors",
              activeTab === tab ? "bg-white text-zinc-950 shadow-sm" : "text-zinc-500",
            )}
            onClick={() => setActiveTab(tab)}
          >
            {t(`finance.tab.${tab}` as TranslationKey)}
          </button>
        ))}
      </div>

      {transactionsQuery.isLoading || summaryQuery.isLoading ? (
        <div className="space-y-3">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      ) : null}

      {transactionsQuery.error || summaryQuery.error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {t("finance.error.load")}
        </div>
      ) : null}

      {activeTab === "resumo" ? (
        <Card className="rounded-lg border-zinc-200">
          <CardContent className="grid gap-3 p-4 sm:grid-cols-2">
            <div className="rounded-md bg-zinc-50 px-3 py-3">
              <p className="text-sm text-zinc-500">{t("finance.summary.net")}</p>
              <p className="mt-1 text-xl font-semibold text-zinc-950">
                {formatCurrency(summary?.net ?? 0, locale)}
              </p>
            </div>
            <div className="rounded-md bg-zinc-50 px-3 py-3">
              <p className="text-sm text-zinc-500">{t("finance.summary.transactionCount")}</p>
              <p className="mt-1 text-xl font-semibold text-zinc-950">{summary?.transactionCount ?? 0}</p>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {activeTab !== "resumo" && !transactionsQuery.isLoading && !transactionsQuery.error ? (
        transactions.length === 0 ? (
          <div className="rounded-lg border border-dashed border-zinc-300 bg-white p-6 text-center">
            <h2 className="text-base font-semibold text-zinc-950">{t("finance.empty.title")}</h2>
            <p className="mt-1 text-sm text-zinc-500">{t("finance.empty.description")}</p>
            <Button className="mt-4 gap-2" onClick={openSheet}>
              <Plus className="h-4 w-4" />
              {t("finance.new")}
            </Button>
          </div>
        ) : (
          <section className="space-y-3">
            {transactions.map((transaction) => (
              <TransactionCard
                key={transaction.id}
                transaction={transaction}
                onMarkPaid={handleMarkPaid}
                onCancel={handleCancel}
                onApproveCollection={handleApproveCollection}
                isBusy={
                  transactionsQuery.isMarkingPaid ||
                  transactionsQuery.isCancellingTransaction ||
                  transactionsQuery.isApprovingBillingCollection
                }
              />
            ))}
          </section>
        )
      ) : null}

      <Sheet open={isSheetOpen} onOpenChange={setIsSheetOpen}>
        <SheetContent className="max-h-[88vh] overflow-y-auto">
          <form onSubmit={handleSubmit}>
            <SheetHeader>
              <SheetTitle>{t("finance.form.title")}</SheetTitle>
            </SheetHeader>

            <div className="space-y-4 px-4 py-2">
              <div className="grid grid-cols-2 gap-2">
                <label className="block space-y-1.5">
                  <span className="text-sm font-medium text-zinc-700">{t("finance.form.type")}</span>
                  <select
                    className="h-10 w-full rounded-md border border-zinc-200 bg-white px-3 text-sm shadow-sm outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-100"
                    value={form.type}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        type: event.target.value as FinancialTransactionType,
                      }))
                    }
                  >
                    <option value="receita">{t("finance.type.receita")}</option>
                    <option value="despesa">{t("finance.type.despesa")}</option>
                  </select>
                </label>

                <label className="block space-y-1.5">
                  <span className="text-sm font-medium text-zinc-700">{t("finance.form.status")}</span>
                  <select
                    className="h-10 w-full rounded-md border border-zinc-200 bg-white px-3 text-sm shadow-sm outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-100"
                    value={form.status}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        status: event.target.value as Extract<FinancialTransactionStatus, "pendente" | "pago">,
                      }))
                    }
                  >
                    <option value="pago">{t("finance.status.pago")}</option>
                    <option value="pendente">{t("finance.status.pendente")}</option>
                  </select>
                </label>
              </div>

              <label className="block space-y-1.5">
                <span className="text-sm font-medium text-zinc-700">{t("finance.form.amount")}</span>
                <Input
                  value={form.amount}
                  onChange={(event) => setForm((current) => ({ ...current, amount: event.target.value }))}
                  inputMode="decimal"
                  placeholder="0,00"
                />
              </label>

              <label className="block space-y-1.5">
                <span className="text-sm font-medium text-zinc-700">{t("finance.form.description")}</span>
                <Input
                  value={form.description}
                  onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
                  placeholder={t("finance.form.descriptionPlaceholder")}
                />
              </label>

              <details className="rounded-lg border border-zinc-200 bg-zinc-50 p-3">
                <summary className="cursor-pointer text-sm font-medium text-zinc-700">
                  {t("finance.form.optionalDetails")}
                </summary>
                <div className="mt-4 space-y-4">
                  {form.status === "pago" ? (
                    <label className="block space-y-1.5">
                      <span className="text-sm font-medium text-zinc-700">{t("finance.form.paymentMethod")}</span>
                      <select
                        className="h-10 w-full rounded-md border border-zinc-200 bg-white px-3 text-sm shadow-sm outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-100"
                        value={form.paymentMethod}
                        onChange={(event) =>
                          setForm((current) => ({
                            ...current,
                            paymentMethod: event.target.value as FinancialPaymentMethod,
                          }))
                        }
                      >
                        {Object.entries(PAYMENT_METHOD_LABEL_KEYS).map(([method, labelKey]) => (
                          <option key={method} value={method}>
                            {t(labelKey)}
                          </option>
                        ))}
                      </select>
                    </label>
                  ) : (
                    <label className="block space-y-1.5">
                      <span className="text-sm font-medium text-zinc-700">{t("finance.form.dueDate")}</span>
                      <Input
                        type="date"
                        value={form.dueDate}
                        onChange={(event) => setForm((current) => ({ ...current, dueDate: event.target.value }))}
                      />
                    </label>
                  )}

                  <label className="block space-y-1.5">
                    <span className="text-sm font-medium text-zinc-700">{t("finance.form.client")}</span>
                    <select
                      className="h-10 w-full rounded-md border border-zinc-200 bg-white px-3 text-sm shadow-sm outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-100"
                      value={form.clientId}
                      onChange={(event) => setForm((current) => ({ ...current, clientId: event.target.value }))}
                    >
                      <option value="">{t("common.optional")}</option>
                      {clients.map((client) => (
                        <option key={client.id} value={client.id}>
                          {client.full_name}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="block space-y-1.5">
                    <span className="text-sm font-medium text-zinc-700">{t("finance.form.session")}</span>
                    <select
                      className="h-10 w-full rounded-md border border-zinc-200 bg-white px-3 text-sm shadow-sm outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-100"
                      value={form.sessionId}
                      onChange={(event) => setForm((current) => ({ ...current, sessionId: event.target.value }))}
                    >
                      <option value="">{t("common.optional")}</option>
                      {sessions.map((session) => (
                        <option key={session.id} value={session.id}>
                          {sessionLabel(session, locale)}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="block space-y-1.5">
                    <span className="text-sm font-medium text-zinc-700">{t("finance.form.notes")}</span>
                    <Input
                      value={form.notes}
                      onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))}
                      placeholder={t("common.optional")}
                    />
                  </label>
                </div>
              </details>

              {formError ? (
                <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                  {formError}
                </div>
              ) : null}
            </div>

            <SheetFooter>
              <Button type="button" variant="outline" onClick={() => setIsSheetOpen(false)}>
                {t("common.cancel")}
              </Button>
              <Button type="submit" disabled={transactionsQuery.isCreatingTransaction}>
                {transactionsQuery.isCreatingTransaction ? t("common.saving") : t("common.save")}
              </Button>
            </SheetFooter>
          </form>
        </SheetContent>
      </Sheet>
    </div>
  );
}
