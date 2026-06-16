import { type Dispatch, type FormEvent, type HTMLAttributes, type ReactNode, type SetStateAction, useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  Banknote,
  CalendarClock,
  CheckCircle2,
  PackageCheck,
  Plus,
  ReceiptText,
  Send,
  ShoppingCart,
  XCircle,
} from "lucide-react";
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
  Client,
  FinanceSettings,
  FinancialPaymentMethod,
  FinancialTransactionStatus,
  FinancialTransactionType,
  FinancialTransactionWithClient,
  PosSaleItemInput,
  Product,
  ProductBatch,
  Service,
  Session,
  TeamMember,
} from "@iaprafaturar/domain";
import { useAuth } from "@/contexts/AuthContext";
import { useClients } from "@/hooks/useClients";
import { useServicePackages } from "@/hooks/useDocumentsPackages";
import {
  useFinanceSettings,
  useFinancialSummary,
  useFinancialTransactions,
} from "@/hooks/useFinancial";
import { useServices } from "@/hooks/useServices";
import { useSessions } from "@/hooks/useSessions";
import { useInventory } from "@/hooks/useInventory";
import { useTeamMembers } from "@/hooks/useTeamMembers";
import { useI18n, type Locale, type TranslationKey } from "@/i18n";
import { friendlyErrorMessage } from "@/lib/friendlyError";

type FinanceTab = "extrato" | "pdv" | "caixa" | "conta_cliente" | "fluxo" | "repasses";
type FinanceDestination = FinanceTab | "conciliacao" | "configuracoes";

const INLINE_TABS: FinanceTab[] = ["extrato", "pdv", "caixa", "conta_cliente", "fluxo", "repasses"];

const FINANCE_TAB_PATHS: Record<FinanceDestination, string> = {
  extrato: "/financeiro",
  pdv: "/financeiro?tab=pdv",
  caixa: "/financeiro?tab=caixa",
  conta_cliente: "/financeiro?tab=conta_cliente",
  fluxo: "/financeiro?tab=fluxo",
  repasses: "/financeiro?tab=repasses",
  conciliacao: "/financeiro/conciliacao",
  configuracoes: "/financeiro/configuracoes",
};

function financeTabFromLocation(search: string): FinanceTab {
  const tab = new URLSearchParams(search).get("tab");
  if (tab === "pdv") return "pdv";
  if (tab === "caixa") return "caixa";
  if (tab === "conta_cliente") return "conta_cliente";
  if (tab === "fluxo") return "fluxo";
  if (tab === "repasses") return "repasses";
  return "extrato";
}

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

interface PosFormState {
  clientId: string;
  itemType: PosSaleItemInput["item_type"];
  itemId: string;
  batchId: string;
  description: string;
  quantity: string;
  unitAmount: string;
  discountAmount: string;
  paymentMethod: FinancialPaymentMethod;
  bankAccountId: string;
  categoryId: string;
  costCenterId: string;
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

const EMPTY_POS_FORM: PosFormState = {
  clientId: "",
  itemType: "service",
  itemId: "",
  batchId: "",
  description: "",
  quantity: "1",
  unitAmount: "",
  discountAmount: "0",
  paymentMethod: "pix",
  bankAccountId: "",
  categoryId: "",
  costCenterId: "",
  notes: "",
};

const PAYMENT_METHOD_LABEL_KEYS: Record<FinancialPaymentMethod, TranslationKey> = {
  pix: "finance.method.pix",
  dinheiro: "finance.method.dinheiro",
  cartao_credito: "finance.method.cartao_credito",
  cartao_debito: "finance.method.cartao_debito",
  transferencia: "finance.method.transferencia",
  outros: "finance.method.outros",
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

function toDateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function monthRange() {
  const now = new Date();
  const first = new Date(now.getFullYear(), now.getMonth(), 1);
  const next = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  return { from: toDateKey(first), to: toDateKey(new Date(next.getTime() - 24 * 60 * 60 * 1000)) };
}

function formatCurrency(value: number, locale: Locale) {
  return new Intl.NumberFormat(locale, { style: "currency", currency: "BRL" }).format(value);
}

function formatDate(value: string | null, locale: Locale) {
  if (!value) return null;
  return new Intl.DateTimeFormat(locale, { day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(value));
}

function numberFromInput(value: string) {
  const normalized = value.replace(/\./g, "").replace(",", ".");
  return Number(normalized);
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
  onReceipt,
  isBusy,
}: {
  transaction: FinancialTransactionWithClient;
  onMarkPaid: (transaction: FinancialTransactionWithClient) => void;
  onCancel: (transaction: FinancialTransactionWithClient) => void;
  onApproveCollection: (transaction: FinancialTransactionWithClient) => void;
  onReceipt: (transaction: FinancialTransactionWithClient) => void;
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
              <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-600">
                {transaction.source.toUpperCase()}
              </span>
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

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-4">
          {transaction.status === "pendente" ? (
            <>
              <Button className="gap-2" onClick={() => onMarkPaid(transaction)} disabled={isBusy}>
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
            </>
          ) : null}
          {transaction.status === "pago" ? (
            <Button
              variant="outline"
              className="gap-2"
              onClick={() => onReceipt(transaction)}
              disabled={isBusy || Boolean(transaction.receipt_sent_at)}
            >
              <Send className="h-4 w-4" />
              {transaction.receipt_sent_at ? t("finance.receipt.sent") : t("finance.receipt.send")}
            </Button>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}

export default function FinanceiroPage() {
  const { locale, t } = useI18n();
  const { professionalId } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<FinanceTab>(() => financeTabFromLocation(location.search));
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const [form, setForm] = useState<TransactionFormState>(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    setActiveTab(financeTabFromLocation(location.search));
  }, [location.search]);

  function selectTab(tab: FinanceDestination) {
    if ((INLINE_TABS as string[]).includes(tab)) setActiveTab(tab as FinanceTab);
    navigate(FINANCE_TAB_PATHS[tab]);
  }
  const [posForm, setPosForm] = useState<PosFormState>(EMPTY_POS_FORM);
  const [posItems, setPosItems] = useState<PosSaleItemInput[]>([]);
  const [posError, setPosError] = useState<string | null>(null);
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
  const range = useMemo(() => monthRange(), []);

  const transactionsQuery = useFinancialTransactions(professionalId);
  const clientTransactionsQuery = useFinancialTransactions(
    activeTab === "conta_cliente" && selectedClientId ? professionalId : null,
    { clientId: selectedClientId },
  );
  const summaryQuery = useFinancialSummary(professionalId, range.from, range.to);
  const pdvProfessionalId = activeTab === "pdv" ? professionalId : null;
  const settingsQuery = useFinanceSettings(pdvProfessionalId);
  const inventoryQuery = useInventory(pdvProfessionalId);
  const clientsQuery = useClients(professionalId);
  const sessionsQuery = useSessions(professionalId);
  const servicesQuery = useServices(pdvProfessionalId);
  const teamMembersQuery = useTeamMembers(activeTab === "repasses" ? professionalId : null);
  const packagesQuery = useServicePackages(pdvProfessionalId);

  const transactions = transactionsQuery.data ?? [];
  const settings = settingsQuery.data;
  const clients = clientsQuery.data ?? [];
  const sessions = sessionsQuery.data ?? [];
  const services = servicesQuery.data?.services ?? [];
  const servicePackages = packagesQuery.data ?? [];
  const summary = summaryQuery.data;

  const posTotal = posItems.reduce((total, item) => total + item.quantity * item.unit_amount, 0);
  const posDiscount = numberFromInput(posForm.discountAmount || "0");
  const posNet = Math.max(posTotal - (Number.isFinite(posDiscount) ? posDiscount : 0), 0);

  function openSheet() {
    setForm(EMPTY_FORM);
    setFormError(null);
    setIsSheetOpen(true);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);

    const amount = numberFromInput(form.amount);
    if (!Number.isFinite(amount) || amount <= 0) return setFormError(t("finance.error.amount"));
    if (!form.description.trim()) return setFormError(t("finance.error.description"));
    if (form.status === "pago" && !form.paymentMethod) return setFormError(t("finance.error.paymentMethod"));

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
      setFormError(friendlyErrorMessage(err, t, "finance.error.create"));
    }
  }

  function applySelectedCatalogItem(itemType: PosSaleItemInput["item_type"], itemId: string) {
    if (itemType === "service") {
      const service = services.find((candidate) => candidate.id === itemId);
      setPosForm((current) => ({
        ...current,
        itemType,
        itemId,
        description: service?.name ?? "",
        unitAmount: service ? String(service.price) : current.unitAmount,
      }));
      return;
    }

    if (itemType === "package") {
      const servicePackage = servicePackages.find((candidate) => candidate.id === itemId);
      setPosForm((current) => ({
        ...current,
        itemType,
        itemId,
        description: servicePackage?.name ?? "",
        unitAmount: servicePackage ? String(servicePackage.price) : current.unitAmount,
      }));
      return;
    }

    const product = settings?.products.find((candidate) => candidate.id === itemId);
    setPosForm((current) => ({
      ...current,
      itemType,
      itemId,
      batchId: "",
      description: product?.name ?? "",
      unitAmount: product ? String(product.unit_price) : current.unitAmount,
    }));
  }

  function addPosItem() {
    setPosError(null);
    const quantity = numberFromInput(posForm.quantity);
    const unitAmount = numberFromInput(posForm.unitAmount);
    if (!posForm.description.trim()) return setPosError(t("finance.error.description"));
    if (!Number.isFinite(quantity) || quantity <= 0 || !Number.isFinite(unitAmount) || unitAmount < 0) {
      return setPosError(t("finance.error.amount"));
    }

    const product = settings?.products.find((candidate) => candidate.id === posForm.itemId);
    if (posForm.itemType === "product" && product && product.stock_quantity < quantity) {
      return setPosError(t("finance.pdv.stockError"));
    }

    setPosItems((current) => [
      ...current,
      {
        item_type: posForm.itemType,
        service_id: posForm.itemType === "service" ? posForm.itemId || null : null,
        product_id: posForm.itemType === "product" ? posForm.itemId || null : null,
        batch_id: posForm.itemType === "product" ? posForm.batchId || null : null,
        service_package_id: posForm.itemType === "package" ? posForm.itemId || null : null,
        description: posForm.description.trim(),
        quantity,
        unit_amount: unitAmount,
      },
    ]);
    setPosForm((current) => ({ ...current, itemId: "", batchId: "", description: "", quantity: "1", unitAmount: "" }));
  }

  async function createPosSale() {
    setPosError(null);
    if (!posItems.length) return setPosError(t("finance.pdv.itemsRequired"));
    if (!Number.isFinite(posDiscount) || posDiscount < 0 || posDiscount > posTotal) {
      return setPosError(t("finance.error.amount"));
    }

    try {
      await transactionsQuery.createPosSale({
        clientId: posForm.clientId || null,
        items: posItems,
        paymentMethod: posForm.paymentMethod,
        discountAmount: posDiscount,
        bankAccountId: posForm.bankAccountId || settings?.bankAccounts.find((item) => item.is_default)?.id || null,
        categoryId: posForm.categoryId || settings?.categories.find((item) => item.type === "receita" && item.is_default)?.id || null,
        costCenterId: posForm.costCenterId || settings?.costCenters.find((item) => item.is_default)?.id || null,
        notes: posForm.notes || null,
      });
      setPosItems([]);
      setPosForm(EMPTY_POS_FORM);
    } catch (err) {
      setPosError(friendlyErrorMessage(err, t, "finance.pdv.error"));
    }
  }

  async function handleMarkPaid(transaction: FinancialTransactionWithClient) {
    await transactionsQuery.markPaid({ transactionId: transaction.id, paymentMethod: "pix" });
  }

  async function handleCancel(transaction: FinancialTransactionWithClient) {
    await transactionsQuery.cancelTransaction({ transactionId: transaction.id, reason: t("finance.action.cancelReason") });
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

  async function handleReceipt(transaction: FinancialTransactionWithClient) {
    await transactionsQuery.markReceiptSent(transaction.id);
  }

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-5 px-4 py-5 md:px-6">
      <header className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-teal-700">{t("finance.eyebrow")}</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight text-zinc-950">{t("finance.title")}</h1>
          <p className="mt-1 text-sm text-zinc-500">{t("finance.subtitle")}</p>
        </div>
        <Button className="shrink-0 gap-2" onClick={openSheet}>
          <Plus className="h-4 w-4" />
          {t("finance.new")}
        </Button>
      </header>

      <section className="grid gap-3 md:grid-cols-3">
        <SummaryCard icon={Banknote} value={formatCurrency(summary?.paidIncome ?? 0, locale)} label={t("finance.summary.paid")} tone="emerald" />
        <SummaryCard icon={CalendarClock} value={formatCurrency(summary?.pendingIncome ?? 0, locale)} label={t("finance.summary.pending")} tone="amber" />
        <SummaryCard icon={ReceiptText} value={formatCurrency(summary?.net ?? 0, locale)} label={t("finance.summary.net")} tone="sky" />
      </section>

      <div className="overflow-x-auto">
        <div className="flex min-w-max gap-1 rounded-lg bg-zinc-100 p-1">
          {(INLINE_TABS as FinanceDestination[]).concat(["conciliacao", "configuracoes"]).map((tab) => (
            <button
              key={tab}
              type="button"
              className={cn(
                "whitespace-nowrap rounded-md px-3 py-2 text-sm font-medium transition-colors",
                activeTab === tab ? "bg-white text-zinc-950 shadow-sm" : "text-zinc-500",
              )}
              onClick={() => selectTab(tab)}
            >
              {t(`finance.tab.${tab}` as TranslationKey)}
            </button>
          ))}
        </div>
      </div>

      {transactionsQuery.isLoading || summaryQuery.isLoading || settingsQuery.isLoading ? (
        <div className="space-y-3">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      ) : null}

      {transactionsQuery.error || summaryQuery.error || settingsQuery.error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {t("finance.error.load")}
        </div>
      ) : null}

      {activeTab === "extrato" ? (
        <StatementTab
          transactions={transactions}
          isBusy={transactionsQuery.isMarkingPaid || transactionsQuery.isCancellingTransaction || transactionsQuery.isApprovingBillingCollection || transactionsQuery.isMarkingReceiptSent}
          onMarkPaid={handleMarkPaid}
          onCancel={handleCancel}
          onApproveCollection={handleApproveCollection}
          onReceipt={handleReceipt}
          onNew={openSheet}
        />
      ) : null}

      {activeTab === "pdv" ? (
        <PosTab
          form={posForm}
          setForm={setPosForm}
          items={posItems}
          setItems={setPosItems}
          settings={settings}
          clients={clients}
          services={services}
          products={settings?.products ?? []}
          batches={inventoryQuery.data?.batches ?? []}
          packages={servicePackages}
          total={posTotal}
          net={posNet}
          error={posError}
          isBusy={transactionsQuery.isCreatingPosSale}
          onCatalogChange={applySelectedCatalogItem}
          onAddItem={addPosItem}
          onCreateSale={createPosSale}
        />
      ) : null}

      {activeTab === "caixa" ? (
        <CaixaTab transactions={transactionsQuery.data ?? []} />
      ) : null}

      {activeTab === "fluxo" ? (
        <FluxoTab transactions={transactionsQuery.data ?? []} />
      ) : null}

      {activeTab === "conta_cliente" ? (
        <ContaClienteTab
          clients={clients}
          selectedClientId={selectedClientId}
          onSelectClient={setSelectedClientId}
          transactions={clientTransactionsQuery.data ?? []}
          isLoading={clientTransactionsQuery.isLoading}
        />
      ) : null}

      {activeTab === "repasses" ? (
        <RepassesTab members={teamMembersQuery.data ?? []} isLoading={teamMembersQuery.isLoading} />
      ) : null}

      <Sheet open={isSheetOpen} onOpenChange={setIsSheetOpen}>
        <SheetContent className="max-h-[88vh] overflow-y-auto">
          <form onSubmit={handleSubmit}>
            <SheetHeader>
              <SheetTitle>{t("finance.form.title")}</SheetTitle>
            </SheetHeader>

            <div className="space-y-4 px-4 py-2">
              <div className="grid grid-cols-2 gap-2">
                <SelectField label={t("finance.form.type")} value={form.type} onChange={(value) => setForm((current) => ({ ...current, type: value as FinancialTransactionType }))} options={[{ value: "receita", label: t("finance.type.receita") }, { value: "despesa", label: t("finance.type.despesa") }]} />
                <SelectField label={t("finance.form.status")} value={form.status} onChange={(value) => setForm((current) => ({ ...current, status: value as Extract<FinancialTransactionStatus, "pendente" | "pago"> }))} options={[{ value: "pago", label: t("finance.status.pago") }, { value: "pendente", label: t("finance.status.pendente") }]} />
              </div>

              <TextField label={t("finance.form.amount")} value={form.amount} onChange={(value) => setForm((current) => ({ ...current, amount: value }))} inputMode="decimal" placeholder="0,00" />
              <TextField label={t("finance.form.description")} value={form.description} onChange={(value) => setForm((current) => ({ ...current, description: value }))} placeholder={t("finance.form.descriptionPlaceholder")} />

              <details className="rounded-lg border border-zinc-200 bg-zinc-50 p-3">
                <summary className="cursor-pointer text-sm font-medium text-zinc-700">{t("finance.form.optionalDetails")}</summary>
                <div className="mt-4 space-y-4">
                  {form.status === "pago" ? (
                    <SelectField label={t("finance.form.paymentMethod")} value={form.paymentMethod} onChange={(value) => setForm((current) => ({ ...current, paymentMethod: value as FinancialPaymentMethod }))} options={Object.entries(PAYMENT_METHOD_LABEL_KEYS).map(([value, labelKey]) => ({ value, label: t(labelKey) }))} />
                  ) : (
                    <TextField label={t("finance.form.dueDate")} type="date" value={form.dueDate} onChange={(value) => setForm((current) => ({ ...current, dueDate: value }))} />
                  )}
                  <SelectField label={t("finance.form.client")} value={form.clientId} onChange={(value) => setForm((current) => ({ ...current, clientId: value }))} options={[{ value: "", label: t("common.optional") }, ...clients.map((client) => ({ value: client.id, label: client.full_name }))]} />
                  <SelectField label={t("finance.form.session")} value={form.sessionId} onChange={(value) => setForm((current) => ({ ...current, sessionId: value }))} options={[{ value: "", label: t("common.optional") }, ...sessions.map((session) => ({ value: session.id, label: sessionLabel(session, locale) }))]} />
                  <TextField label={t("finance.form.notes")} value={form.notes} onChange={(value) => setForm((current) => ({ ...current, notes: value }))} placeholder={t("common.optional")} />
                </div>
              </details>

              {formError ? <ErrorBox>{formError}</ErrorBox> : null}
            </div>

            <SheetFooter>
              <Button type="button" variant="outline" onClick={() => setIsSheetOpen(false)}>{t("common.cancel")}</Button>
              <Button type="submit" disabled={transactionsQuery.isCreatingTransaction}>{transactionsQuery.isCreatingTransaction ? t("common.saving") : t("common.save")}</Button>
            </SheetFooter>
          </form>
        </SheetContent>
      </Sheet>
    </div>
  );
}

function SummaryCard({ icon: Icon, value, label, tone }: { icon: typeof Banknote; value: string; label: string; tone: "emerald" | "amber" | "sky" }) {
  const toneClass = {
    emerald: "bg-emerald-50 text-emerald-700",
    amber: "bg-amber-50 text-amber-700",
    sky: "bg-sky-50 text-sky-700",
  }[tone];

  return (
    <Card className="rounded-lg border-zinc-200">
      <CardContent className="flex items-center gap-3 p-4">
        <div className={cn("flex h-10 w-10 items-center justify-center rounded-full", toneClass)}>
          <Icon className="h-5 w-5" />
        </div>
        <div>
          <p className="text-xl font-semibold text-zinc-950">{value}</p>
          <p className="text-sm text-zinc-500">{label}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function StatementTab(props: {
  transactions: FinancialTransactionWithClient[];
  isBusy: boolean;
  onMarkPaid: (transaction: FinancialTransactionWithClient) => void;
  onCancel: (transaction: FinancialTransactionWithClient) => void;
  onApproveCollection: (transaction: FinancialTransactionWithClient) => void;
  onReceipt: (transaction: FinancialTransactionWithClient) => void;
  onNew: () => void;
}) {
  const { t } = useI18n();
  if (!props.transactions.length) {
    return (
      <div className="rounded-lg border border-dashed border-zinc-300 bg-white p-6 text-center">
        <h2 className="text-base font-semibold text-zinc-950">{t("finance.empty.title")}</h2>
        <p className="mt-1 text-sm text-zinc-500">{t("finance.empty.description")}</p>
        <Button className="mt-4 gap-2" onClick={props.onNew}><Plus className="h-4 w-4" />{t("finance.new")}</Button>
      </div>
    );
  }

  return (
    <section className="space-y-3">
      {props.transactions.map((transaction) => (
        <TransactionCard key={transaction.id} transaction={transaction} onMarkPaid={props.onMarkPaid} onCancel={props.onCancel} onApproveCollection={props.onApproveCollection} onReceipt={props.onReceipt} isBusy={props.isBusy} />
      ))}
    </section>
  );
}

function PosTab({
  form,
  setForm,
  items,
  setItems,
  settings,
  clients,
  services,
  products,
  batches,
  packages,
  total,
  net,
  error,
  isBusy,
  onCatalogChange,
  onAddItem,
  onCreateSale,
}: {
  form: PosFormState;
  setForm: Dispatch<SetStateAction<PosFormState>>;
  items: PosSaleItemInput[];
  setItems: Dispatch<SetStateAction<PosSaleItemInput[]>>;
  settings: FinanceSettings | undefined;
  clients: Array<{ id: string; full_name: string }>;
  services: Service[];
  products: Product[];
  batches: ProductBatch[];
  packages: Array<{ id: string; name: string; price: number }>;
  total: number;
  net: number;
  error: string | null;
  isBusy: boolean;
  onCatalogChange: (itemType: PosSaleItemInput["item_type"], itemId: string) => void;
  onAddItem: () => void;
  onCreateSale: () => void;
}) {
  const { locale, t } = useI18n();
  const catalogOptions = form.itemType === "service"
    ? services.map((service) => ({ value: service.id, label: service.name }))
    : form.itemType === "product"
      ? products.map((product) => ({ value: product.id, label: `${product.name} (${product.stock_quantity})` }))
      : form.itemType === "package"
        ? packages.map((item) => ({ value: item.id, label: item.name }))
        : [];

  return (
    <section className="grid gap-4 lg:grid-cols-[1fr_360px]">
      <Card className="rounded-lg border-zinc-200">
        <CardContent className="space-y-4 p-4">
          <div className="flex items-center gap-2">
            <ShoppingCart className="h-5 w-5 text-teal-700" />
            <h2 className="text-base font-semibold text-zinc-950">{t("finance.pdv.title")}</h2>
          </div>
          <SelectField label={t("finance.form.client")} value={form.clientId} onChange={(value) => setForm((current) => ({ ...current, clientId: value }))} options={[{ value: "", label: t("finance.noClient") }, ...clients.map((client) => ({ value: client.id, label: client.full_name }))]} />
          <div className="grid gap-3 md:grid-cols-3">
            <SelectField label={t("finance.pdv.itemType")} value={form.itemType} onChange={(value) => setForm((current) => ({ ...current, itemType: value as PosSaleItemInput["item_type"], itemId: "", batchId: "", description: "", unitAmount: "" }))} options={[{ value: "service", label: t("finance.pdv.service") }, { value: "product", label: t("finance.pdv.product") }, { value: "package", label: t("finance.pdv.package") }, { value: "custom", label: t("finance.pdv.custom") }]} />
            {form.itemType === "custom" ? (
              <TextField label={t("finance.form.description")} value={form.description} onChange={(value) => setForm((current) => ({ ...current, description: value }))} />
            ) : (
              <SelectField label={t("common.select")} value={form.itemId} onChange={(value) => onCatalogChange(form.itemType, value)} options={[{ value: "", label: t("common.select") }, ...catalogOptions]} />
            )}
            <TextField label={t("finance.form.amount")} value={form.unitAmount} onChange={(value) => setForm((current) => ({ ...current, unitAmount: value }))} inputMode="decimal" />
          </div>
          {form.itemType === "product" && batches.some((item) => item.product_id === form.itemId) ? (
            <SelectField label={t("inventory.batch.optional")} value={form.batchId} onChange={(value) => setForm((current) => ({ ...current, batchId: value }))} options={[{ value: "", label: t("inventory.batch.useUntracked") }, ...batches.filter((item) => item.product_id === form.itemId).map((item) => ({ value: item.id, label: `${item.lot_code} (${item.quantity})` }))]} />
          ) : null}
          <div className="grid gap-3 md:grid-cols-[120px_1fr]">
            <TextField label={t("finance.pdv.quantity")} value={form.quantity} onChange={(value) => setForm((current) => ({ ...current, quantity: value }))} inputMode="decimal" />
            {form.itemType !== "custom" ? <TextField label={t("finance.form.description")} value={form.description} onChange={(value) => setForm((current) => ({ ...current, description: value }))} /> : null}
          </div>
          <Button type="button" variant="outline" className="gap-2" onClick={onAddItem}><Plus className="h-4 w-4" />{t("finance.pdv.addItem")}</Button>
          {error ? <ErrorBox>{error}</ErrorBox> : null}
        </CardContent>
      </Card>

      <Card className="rounded-lg border-zinc-200">
        <CardContent className="space-y-4 p-4">
          <div className="flex items-center gap-2">
            <ReceiptText className="h-5 w-5 text-zinc-700" />
            <h2 className="text-base font-semibold text-zinc-950">{t("finance.pdv.cart")}</h2>
          </div>
          <div className="space-y-2">
            {items.length ? items.map((item, index) => (
              <div key={`${item.description}-${index}`} className="flex items-center justify-between gap-3 rounded-md bg-zinc-50 px-3 py-2 text-sm">
                <div className="min-w-0">
                  <p className="truncate font-medium text-zinc-950">{item.description}</p>
                  <p className="text-zinc-500">{item.quantity} x {formatCurrency(item.unit_amount, locale)}</p>
                </div>
                <button type="button" className="text-xs font-medium text-red-600" onClick={() => setItems((current) => current.filter((_, itemIndex) => itemIndex !== index))}>{t("common.remove")}</button>
              </div>
            )) : <p className="text-sm text-zinc-500">{t("finance.pdv.emptyCart")}</p>}
          </div>
          <TextField label={t("finance.pdv.discount")} value={form.discountAmount} onChange={(value) => setForm((current) => ({ ...current, discountAmount: value }))} inputMode="decimal" />
          <SelectField label={t("finance.form.paymentMethod")} value={form.paymentMethod} onChange={(value) => setForm((current) => ({ ...current, paymentMethod: value as FinancialPaymentMethod }))} options={Object.entries(PAYMENT_METHOD_LABEL_KEYS).map(([value, labelKey]) => ({ value, label: t(labelKey) }))} />
          <SelectField label={t("finance.settings.bankAccount")} value={form.bankAccountId} onChange={(value) => setForm((current) => ({ ...current, bankAccountId: value }))} options={[{ value: "", label: t("common.optional") }, ...(settings?.bankAccounts ?? []).map((item) => ({ value: item.id, label: item.name }))]} />
          <div className="rounded-md bg-zinc-950 px-3 py-3 text-white">
            <p className="text-xs text-zinc-300">{t("finance.pdv.total")}</p>
            <p className="text-2xl font-semibold">{formatCurrency(net, locale)}</p>
            <p className="text-xs text-zinc-400">{formatCurrency(total, locale)} {t("finance.pdv.beforeDiscount")}</p>
          </div>
          <Button className="w-full gap-2" disabled={isBusy || !items.length} onClick={onCreateSale}><PackageCheck className="h-4 w-4" />{isBusy ? t("common.saving") : t("finance.pdv.finish")}</Button>
        </CardContent>
      </Card>
    </section>
  );
}

function TextField({ label, value, onChange, type = "text", inputMode, placeholder }: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  inputMode?: HTMLAttributes<HTMLInputElement>["inputMode"];
  placeholder?: string;
}) {
  return (
    <label className="block space-y-1.5">
      <span className="text-sm font-medium text-zinc-700">{label}</span>
      <Input type={type} value={value} onChange={(event) => onChange(event.target.value)} inputMode={inputMode} placeholder={placeholder} />
    </label>
  );
}

function SelectField({ label, value, onChange, options }: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <label className="block space-y-1.5">
      <span className="text-sm font-medium text-zinc-700">{label}</span>
      <select className="h-10 w-full rounded-md border border-zinc-200 bg-white px-3 text-sm shadow-sm outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-100" value={value} onChange={(event) => onChange(event.target.value)}>
        {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
    </label>
  );
}

function ErrorBox({ children }: { children: ReactNode }) {
  return <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{children}</div>;
}

function formatCurrencyBRL(value: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}

function CaixaTab({ transactions }: { transactions: FinancialTransactionWithClient[] }) {
  const { t } = useI18n();

  const byDay = useMemo(() => {
    const map = new Map<string, { income: number; expenses: number }>();
    for (const tx of transactions) {
      if (tx.status !== "pago") continue;
      const day = (tx.paid_at ?? tx.created_at ?? "").slice(0, 10);
      if (!day) continue;
      const existing = map.get(day) ?? { income: 0, expenses: 0 };
      if (tx.type === "receita") existing.income += Number(tx.net_amount ?? tx.amount);
      else existing.expenses += Number(tx.net_amount ?? tx.amount);
      map.set(day, existing);
    }
    return Array.from(map.entries())
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([day, { income, expenses }]) => ({ day, income, expenses, balance: income - expenses }));
  }, [transactions]);

  if (!byDay.length) {
    return <p className="py-8 text-center text-sm text-zinc-500">{t("finance.caixa.empty")}</p>;
  }

  return (
    <section className="overflow-x-auto">
      <table className="w-full min-w-[480px] text-sm">
        <thead>
          <tr className="border-b border-zinc-200 text-left text-xs font-semibold uppercase tracking-wide text-zinc-500">
            <th className="pb-2 pr-4">{t("finance.caixa.date")}</th>
            <th className="pb-2 pr-4 text-right">{t("finance.caixa.income")}</th>
            <th className="pb-2 pr-4 text-right">{t("finance.caixa.expenses")}</th>
            <th className="pb-2 text-right">{t("finance.caixa.balance")}</th>
          </tr>
        </thead>
        <tbody>
          {byDay.map(({ day, income, expenses, balance }) => (
            <tr key={day} className="border-b border-zinc-100 last:border-0">
              <td className="py-3 pr-4 font-medium text-zinc-900">{new Date(`${day}T12:00:00`).toLocaleDateString("pt-BR")}</td>
              <td className="py-3 pr-4 text-right text-emerald-700">{formatCurrencyBRL(income)}</td>
              <td className="py-3 pr-4 text-right text-red-600">{formatCurrencyBRL(expenses)}</td>
              <td className={cn("py-3 text-right font-semibold", balance >= 0 ? "text-emerald-700" : "text-red-600")}>
                {formatCurrencyBRL(balance)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

function FluxoTab({ transactions }: { transactions: FinancialTransactionWithClient[] }) {
  const { t } = useI18n();

  const byMonth = useMemo(() => {
    const map = new Map<string, { paid: number; pending: number; expenses: number }>();
    for (const tx of transactions) {
      const month = (tx.created_at ?? "").slice(0, 7);
      if (!month) continue;
      const existing = map.get(month) ?? { paid: 0, pending: 0, expenses: 0 };
      if (tx.type === "receita") {
        if (tx.status === "pago") existing.paid += Number(tx.net_amount ?? tx.amount);
        else if (tx.status === "pendente") existing.pending += Number(tx.net_amount ?? tx.amount);
      } else if (tx.type === "despesa" && tx.status === "pago") {
        existing.expenses += Number(tx.net_amount ?? tx.amount);
      }
      map.set(month, existing);
    }
    return Array.from(map.entries())
      .sort((a, b) => b[0].localeCompare(a[0]))
      .slice(0, 12)
      .map(([month, { paid, pending, expenses }]) => ({ month, paid, pending, expenses, net: paid - expenses }));
  }, [transactions]);

  if (!byMonth.length) {
    return <p className="py-8 text-center text-sm text-zinc-500">{t("finance.fluxo.empty")}</p>;
  }

  return (
    <section className="overflow-x-auto">
      <table className="w-full min-w-[560px] text-sm">
        <thead>
          <tr className="border-b border-zinc-200 text-left text-xs font-semibold uppercase tracking-wide text-zinc-500">
            <th className="pb-2 pr-4">{t("finance.fluxo.month")}</th>
            <th className="pb-2 pr-4 text-right">{t("finance.fluxo.paid")}</th>
            <th className="pb-2 pr-4 text-right">{t("finance.fluxo.pending")}</th>
            <th className="pb-2 pr-4 text-right">{t("finance.fluxo.expenses")}</th>
            <th className="pb-2 text-right">{t("finance.fluxo.net")}</th>
          </tr>
        </thead>
        <tbody>
          {byMonth.map(({ month, paid, pending, expenses, net }) => (
            <tr key={month} className="border-b border-zinc-100 last:border-0">
              <td className="py-3 pr-4 font-medium text-zinc-900">
                {new Date(`${month}-01T12:00:00`).toLocaleDateString("pt-BR", { month: "short", year: "numeric" })}
              </td>
              <td className="py-3 pr-4 text-right text-emerald-700">{formatCurrencyBRL(paid)}</td>
              <td className="py-3 pr-4 text-right text-amber-600">{formatCurrencyBRL(pending)}</td>
              <td className="py-3 pr-4 text-right text-red-600">{formatCurrencyBRL(expenses)}</td>
              <td className={cn("py-3 text-right font-semibold", net >= 0 ? "text-emerald-700" : "text-red-600")}>
                {formatCurrencyBRL(net)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

function ContaClienteTab({
  clients,
  selectedClientId,
  onSelectClient,
  transactions,
  isLoading,
}: {
  clients: Client[];
  selectedClientId: string | null;
  onSelectClient: (id: string | null) => void;
  transactions: FinancialTransactionWithClient[];
  isLoading: boolean;
}) {
  const { t, locale } = useI18n();

  return (
    <section className="grid gap-4">
      <div>
        <label className="block space-y-1.5 text-sm">
          <span className="font-medium text-zinc-700">{t("finance.conta_cliente.select")}</span>
          <select
            className="h-10 w-full max-w-sm rounded-md border border-zinc-200 bg-white px-3 text-sm shadow-sm outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-100"
            value={selectedClientId ?? ""}
            onChange={(e) => onSelectClient(e.target.value || null)}
          >
            <option value="">{t("finance.conta_cliente.select")}</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>{c.full_name}</option>
            ))}
          </select>
        </label>
      </div>

      {!selectedClientId ? (
        <p className="py-8 text-center text-sm text-zinc-500">{t("finance.conta_cliente.empty")}</p>
      ) : isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      ) : !transactions.length ? (
        <p className="py-8 text-center text-sm text-zinc-500">{t("finance.conta_cliente.noTransactions")}</p>
      ) : (
        <section className="space-y-2">
          {transactions.map((tx) => (
            <div key={tx.id} className="flex items-center justify-between gap-3 rounded-lg border border-zinc-200 bg-white px-4 py-3">
              <div>
                <p className="text-sm font-medium text-zinc-900">{tx.description}</p>
                <p className="mt-0.5 text-xs text-zinc-500">
                  {tx.paid_at
                    ? new Date(tx.paid_at).toLocaleDateString(locale)
                    : tx.due_date
                    ? new Date(`${tx.due_date}T12:00:00`).toLocaleDateString(locale)
                    : new Date(tx.created_at ?? "").toLocaleDateString(locale)}
                </p>
              </div>
              <div className="text-right">
                <p className={cn("text-sm font-semibold", tx.type === "receita" ? "text-emerald-700" : "text-red-600")}>
                  {tx.type === "despesa" ? "- " : ""}{formatCurrencyBRL(Number(tx.net_amount ?? tx.amount))}
                </p>
                <Badge variant={tx.status === "pago" ? "success" : "secondary"} className="text-xs">
                  {tx.status}
                </Badge>
              </div>
            </div>
          ))}
        </section>
      )}
    </section>
  );
}

function RepassesTab({ members, isLoading }: { members: TeamMember[]; isLoading: boolean }) {
  const { t } = useI18n();

  const withComissao = members.filter((m) => Number(m.comissao) > 0);

  if (isLoading) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
      </div>
    );
  }

  if (!withComissao.length) {
    return <p className="py-8 text-center text-sm text-zinc-500">{t("finance.repasses.empty")}</p>;
  }

  return (
    <section className="grid gap-3">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[360px] text-sm">
          <thead>
            <tr className="border-b border-zinc-200 text-left text-xs font-semibold uppercase tracking-wide text-zinc-500">
              <th className="pb-2 pr-4">{t("finance.repasses.member")}</th>
              <th className="pb-2 text-right">{t("finance.repasses.comissao")}</th>
            </tr>
          </thead>
          <tbody>
            {withComissao.map((m) => (
              <tr key={m.id} className="border-b border-zinc-100 last:border-0">
                <td className="py-3 pr-4">
                  <p className="font-medium text-zinc-900">{m.name}</p>
                  {m.funcao ? <p className="text-xs text-zinc-500">{m.funcao}</p> : null}
                </td>
                <td className="py-3 text-right font-semibold text-zinc-900">{Number(m.comissao).toFixed(1)}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-zinc-400">{t("finance.repasses.note")}</p>
    </section>
  );
}
