import { type Dispatch, type FormEvent, type HTMLAttributes, type ReactNode, type SetStateAction, useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  Banknote,
  CalendarClock,
  CheckCircle2,
  Download,
  Landmark,
  PackageCheck,
  Plus,
  ReceiptText,
  Send,
  Settings2,
  ShoppingCart,
  Upload,
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
  FinanceSettings,
  FinancialPaymentMethod,
  FinancialTransactionStatus,
  FinancialTransactionType,
  FinancialTransactionWithClient,
  PosSaleItemInput,
  Product,
  ReconciliationItem,
  Service,
  Session,
} from "@iaprafaturar/domain";
import { useAuth } from "@/contexts/AuthContext";
import { useClients } from "@/hooks/useClients";
import { useServicePackages } from "@/hooks/useDocumentsPackages";
import {
  useFinanceSettings,
  useFinancialSummary,
  useFinancialTransactions,
  useReconciliation,
} from "@/hooks/useFinancial";
import { useServices } from "@/hooks/useServices";
import { useSessions } from "@/hooks/useSessions";
import { useI18n, type Locale, type TranslationKey } from "@/i18n";
import { friendlyErrorMessage } from "@/lib/friendlyError";

type FinanceTab = "extrato" | "pdv" | "conciliacao" | "configuracoes";

const FINANCE_TAB_PATHS: Record<FinanceTab, string> = {
  extrato: "/financeiro",
  pdv: "/financeiro?tab=pdv",
  conciliacao: "/financeiro/conciliacao",
  configuracoes: "/financeiro/configuracoes",
};

function financeTabFromLocation(pathname: string, search: string): FinanceTab {
  if (pathname === "/financeiro/conciliacao") return "conciliacao";
  if (pathname === "/financeiro/configuracoes") return "configuracoes";
  if (new URLSearchParams(search).get("tab") === "pdv") return "pdv";
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

interface EditableSettings {
  bankName: string;
  bankDisplayName: string;
  pixKey: string;
  incomeCategory: string;
  expenseCategory: string;
  costCenter: string;
  gatewayProvider: "manual" | "asaas" | "mercadopago" | "efibank" | "stripe" | "outros";
  gatewayName: string;
  gatewayActive: boolean;
  productName: string;
  productSku: string;
  productPrice: string;
  productStock: string;
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

function parseReconciliationText(fileName: string, content: string) {
  const fileType = fileName.toLowerCase().endsWith(".ofx") ? "ofx" : "csv";

  if (fileType === "ofx") {
    const entries = [...content.matchAll(/<STMTTRN>([\s\S]*?)(?=<STMTTRN>|<\/BANKTRANLIST>)/gi)];
    return entries.map((entry, index) => {
      const block = entry[1] ?? "";
      const amount = Number((block.match(/<TRNAMT>([^\r\n<]+)/i)?.[1] ?? "0").replace(",", "."));
      const rawDate = block.match(/<DTPOSTED>(\d{8})/i)?.[1] ?? toDateKey(new Date()).replaceAll("-", "");
      return {
        occurred_on: `${rawDate.slice(0, 4)}-${rawDate.slice(4, 6)}-${rawDate.slice(6, 8)}`,
        description: (block.match(/<MEMO>([^\r\n<]+)/i)?.[1] ?? block.match(/<NAME>([^\r\n<]+)/i)?.[1] ?? "OFX").trim(),
        amount,
        external_id: block.match(/<FITID>([^\r\n<]+)/i)?.[1] ?? `ofx-${index}`,
      };
    });
  }

  const lines = content.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  return lines.slice(lines[0]?.toLowerCase().includes("data") ? 1 : 0).map((line, index) => {
    const parts = line.includes(";") ? line.split(";") : line.split(",");
    return {
      occurred_on: parts[0]?.trim() ?? toDateKey(new Date()),
      description: parts[1]?.trim() ?? "CSV",
      amount: numberFromInput(parts[2]?.trim() ?? "0"),
      external_id: parts[3]?.trim() || `csv-${index}`,
    };
  });
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
  const [activeTab, setActiveTab] = useState<FinanceTab>(() => financeTabFromLocation(location.pathname, location.search));
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const [form, setForm] = useState<TransactionFormState>(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    setActiveTab(financeTabFromLocation(location.pathname, location.search));
  }, [location.pathname, location.search]);

  function selectTab(tab: FinanceTab) {
    setActiveTab(tab);
    navigate(FINANCE_TAB_PATHS[tab]);
  }
  const [posForm, setPosForm] = useState<PosFormState>(EMPTY_POS_FORM);
  const [posItems, setPosItems] = useState<PosSaleItemInput[]>([]);
  const [posError, setPosError] = useState<string | null>(null);
  const [settingsForm, setSettingsForm] = useState<EditableSettings>({
    bankName: "",
    bankDisplayName: "",
    pixKey: "",
    incomeCategory: "",
    expenseCategory: "",
    costCenter: "",
    gatewayProvider: "manual",
    gatewayName: "",
    gatewayActive: false,
    productName: "",
    productSku: "",
    productPrice: "",
    productStock: "",
  });
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [reconciliationError, setReconciliationError] = useState<string | null>(null);
  const range = useMemo(() => monthRange(), []);

  const transactionsQuery = useFinancialTransactions(professionalId);
  const summaryQuery = useFinancialSummary(professionalId, range.from, range.to);
  const settingsQuery = useFinanceSettings(professionalId);
  const reconciliationQuery = useReconciliation(professionalId);
  const clientsQuery = useClients(professionalId);
  const sessionsQuery = useSessions(professionalId);
  const servicesQuery = useServices(professionalId);
  const packagesQuery = useServicePackages(professionalId);

  const transactions = transactionsQuery.data ?? [];
  const settings = settingsQuery.data;
  const clients = clientsQuery.data ?? [];
  const sessions = sessionsQuery.data ?? [];
  const services = servicesQuery.data?.services ?? [];
  const servicePackages = packagesQuery.data ?? [];
  const summary = summaryQuery.data;
  const paidTransactions = transactions.filter((transaction) => transaction.status === "pago");

  if (settings && !settingsLoaded) {
    setSettingsLoaded(true);
    setSettingsForm({
      bankName: settings.bankAccounts[0]?.name ?? "",
      bankDisplayName: settings.bankAccounts[0]?.bank_name ?? "",
      pixKey: settings.bankAccounts[0]?.pix_key ?? "",
      incomeCategory: settings.categories.find((category) => category.type === "receita")?.name ?? "",
      expenseCategory: settings.categories.find((category) => category.type === "despesa")?.name ?? "",
      costCenter: settings.costCenters[0]?.name ?? "",
      gatewayProvider: settings.gateways[0]?.provider ?? "manual",
      gatewayName: settings.gateways[0]?.display_name ?? "",
      gatewayActive: settings.gateways[0]?.is_active ?? false,
      productName: "",
      productSku: "",
      productPrice: "",
      productStock: "",
    });
  }

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
        service_package_id: posForm.itemType === "package" ? posForm.itemId || null : null,
        description: posForm.description.trim(),
        quantity,
        unit_amount: unitAmount,
      },
    ]);
    setPosForm((current) => ({ ...current, itemId: "", description: "", quantity: "1", unitAmount: "" }));
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

  async function handleSaveSettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const current = settings ?? ({ bankAccounts: [], categories: [], costCenters: [], gateways: [], products: [] } as FinanceSettings);

    await settingsQuery.saveSettings({
      bankAccounts: settingsForm.bankName.trim()
        ? [{
          ...current.bankAccounts[0],
          id: current.bankAccounts[0]?.id ?? "",
          professional_id: professionalId ?? "",
          name: settingsForm.bankName.trim(),
          bank_name: settingsForm.bankDisplayName.trim() || null,
          account_type: current.bankAccounts[0]?.account_type ?? "corrente",
          pix_key: settingsForm.pixKey.trim() || null,
          opening_balance: current.bankAccounts[0]?.opening_balance ?? 0,
          is_default: true,
          is_active: true,
          created_at: current.bankAccounts[0]?.created_at ?? "",
          updated_at: current.bankAccounts[0]?.updated_at ?? "",
        }]
        : [],
      categories: [
        settingsForm.incomeCategory.trim()
          ? {
            ...current.categories.find((category) => category.type === "receita"),
            id: current.categories.find((category) => category.type === "receita")?.id ?? "",
            professional_id: professionalId ?? "",
            name: settingsForm.incomeCategory.trim(),
            type: "receita",
            is_default: true,
            is_active: true,
            created_at: "",
            updated_at: "",
          }
          : null,
        settingsForm.expenseCategory.trim()
          ? {
            ...current.categories.find((category) => category.type === "despesa"),
            id: current.categories.find((category) => category.type === "despesa")?.id ?? "",
            professional_id: professionalId ?? "",
            name: settingsForm.expenseCategory.trim(),
            type: "despesa",
            is_default: true,
            is_active: true,
            created_at: "",
            updated_at: "",
          }
          : null,
      ].filter(Boolean) as FinanceSettings["categories"],
      costCenters: settingsForm.costCenter.trim()
        ? [{
          ...current.costCenters[0],
          id: current.costCenters[0]?.id ?? "",
          professional_id: professionalId ?? "",
          name: settingsForm.costCenter.trim(),
          description: null,
          is_default: true,
          is_active: true,
          created_at: "",
          updated_at: "",
        }]
        : [],
      gateways: [{
        id: current.gateways[0]?.id ?? "",
        provider: settingsForm.gatewayProvider,
        display_name: settingsForm.gatewayName.trim() || settingsForm.gatewayProvider,
        is_active: settingsForm.gatewayActive,
        created_at: "",
        updated_at: "",
      }],
    });
  }

  async function handleImportFile(file: File | null) {
    if (!file) return;
    setReconciliationError(null);
    try {
      const text = await file.text();
      const items = parseReconciliationText(file.name, text).filter((item) => item.description && Number.isFinite(item.amount));
      if (!items.length) throw new Error(t("finance.conciliation.emptyFile"));
      await reconciliationQuery.importItems({
        bankAccountId: settings?.bankAccounts[0]?.id ?? null,
        fileName: file.name,
        fileType: file.name.toLowerCase().endsWith(".ofx") ? "ofx" : "csv",
        items,
      });
    } catch (err) {
      setReconciliationError(friendlyErrorMessage(err, t, "finance.conciliation.importError"));
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

      <div className="grid grid-cols-2 rounded-lg bg-zinc-100 p-1 md:grid-cols-4">
        {(["extrato", "pdv", "conciliacao", "configuracoes"] as const).map((tab) => (
          <button
            key={tab}
            type="button"
            className={cn(
              "rounded-md px-3 py-2 text-sm font-medium transition-colors",
              activeTab === tab ? "bg-white text-zinc-950 shadow-sm" : "text-zinc-500",
            )}
            onClick={() => selectTab(tab)}
          >
            {t(`finance.tab.${tab}` as TranslationKey)}
          </button>
        ))}
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

      {activeTab === "conciliacao" ? (
        <ReconciliationTab
          items={reconciliationQuery.data ?? []}
          transactions={paidTransactions}
          error={reconciliationError}
          isBusy={reconciliationQuery.isImportingItems || reconciliationQuery.isConfirmingMatch}
          onImportFile={handleImportFile}
          onConfirm={(item, transactionId) => reconciliationQuery.confirmMatch({ reconciliationItemId: item.id, transactionId })}
        />
      ) : null}

      {activeTab === "configuracoes" ? (
        <SettingsTab
          form={settingsForm}
          setForm={setSettingsForm}
          products={settings?.products ?? []}
          isBusy={settingsQuery.isSavingSettings || settingsQuery.isSavingProduct}
          onSubmit={handleSaveSettings}
          onSaveProduct={async () => {
            const unitPrice = numberFromInput(settingsForm.productPrice);
            const stockQuantity = numberFromInput(settingsForm.productStock);
            await settingsQuery.saveProduct({
              name: settingsForm.productName,
              sku: settingsForm.productSku || null,
              unitPrice: Number.isFinite(unitPrice) ? unitPrice : 0,
              stockQuantity: Number.isFinite(stockQuantity) ? stockQuantity : 0,
            });
            setSettingsForm((current) => ({ ...current, productName: "", productSku: "", productPrice: "", productStock: "" }));
          }}
        />
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
            <SelectField label={t("finance.pdv.itemType")} value={form.itemType} onChange={(value) => setForm((current) => ({ ...current, itemType: value as PosSaleItemInput["item_type"], itemId: "", description: "", unitAmount: "" }))} options={[{ value: "service", label: t("finance.pdv.service") }, { value: "product", label: t("finance.pdv.product") }, { value: "package", label: t("finance.pdv.package") }, { value: "custom", label: t("finance.pdv.custom") }]} />
            {form.itemType === "custom" ? (
              <TextField label={t("finance.form.description")} value={form.description} onChange={(value) => setForm((current) => ({ ...current, description: value }))} />
            ) : (
              <SelectField label={t("common.select")} value={form.itemId} onChange={(value) => onCatalogChange(form.itemType, value)} options={[{ value: "", label: t("common.select") }, ...catalogOptions]} />
            )}
            <TextField label={t("finance.form.amount")} value={form.unitAmount} onChange={(value) => setForm((current) => ({ ...current, unitAmount: value }))} inputMode="decimal" />
          </div>
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

function ReconciliationTab({ items, transactions, error, isBusy, onImportFile, onConfirm }: {
  items: ReconciliationItem[];
  transactions: FinancialTransactionWithClient[];
  error: string | null;
  isBusy: boolean;
  onImportFile: (file: File | null) => void;
  onConfirm: (item: ReconciliationItem, transactionId: string) => void;
}) {
  const { locale, t } = useI18n();
  const [selected, setSelected] = useState<Record<string, string>>({});

  return (
    <section className="space-y-4">
      <Card className="rounded-lg border-zinc-200">
        <CardContent className="flex flex-col gap-3 p-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-base font-semibold text-zinc-950">{t("finance.conciliation.title")}</h2>
            <p className="text-sm text-zinc-500">{t("finance.conciliation.subtitle")}</p>
          </div>
          <label className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-md bg-zinc-950 px-4 py-2 text-sm font-medium text-white">
            <Upload className="h-4 w-4" />
            {t("finance.conciliation.import")}
            <input className="hidden" type="file" accept=".csv,.ofx,text/csv" onChange={(event) => onImportFile(event.target.files?.[0] ?? null)} />
          </label>
        </CardContent>
      </Card>
      {error ? <ErrorBox>{error}</ErrorBox> : null}
      <div className="space-y-3">
        {items.length ? items.map((item) => (
          <Card key={item.id} className="rounded-lg border-zinc-200">
            <CardContent className="grid gap-3 p-4 md:grid-cols-[1fr_280px_auto] md:items-center">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge className={cn("border", item.status === "confirmed" ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-amber-200 bg-amber-50 text-amber-700")}>{t(`finance.conciliation.status.${item.status}` as TranslationKey)}</Badge>
                  {item.suggestion_score ? <span className="text-xs text-zinc-500">{Math.round(item.suggestion_score * 100)}%</span> : null}
                </div>
                <p className="mt-2 font-semibold text-zinc-950">{item.description}</p>
                <p className="text-sm text-zinc-500">{formatDate(item.occurred_on, locale)}</p>
              </div>
              <div>
                <p className={cn("text-lg font-semibold", item.amount >= 0 ? "text-emerald-700" : "text-red-700")}>{formatCurrency(item.amount, locale)}</p>
                <select className="mt-2 h-10 w-full rounded-md border border-zinc-200 bg-white px-3 text-sm shadow-sm outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-100" value={selected[item.id] ?? item.suggested_transaction_id ?? ""} onChange={(event) => setSelected((current) => ({ ...current, [item.id]: event.target.value }))} disabled={item.status === "confirmed"}>
                  <option value="">{t("finance.conciliation.noMatch")}</option>
                  {transactions.map((transaction) => <option key={transaction.id} value={transaction.id}>{transaction.description} - {formatCurrency(transaction.net_amount, locale)}</option>)}
                </select>
              </div>
              <Button variant="outline" className="gap-2" disabled={isBusy || item.status === "confirmed" || !(selected[item.id] ?? item.suggested_transaction_id)} onClick={() => onConfirm(item, selected[item.id] ?? item.suggested_transaction_id ?? "")}>
                <CheckCircle2 className="h-4 w-4" />{t("finance.conciliation.confirm")}
              </Button>
            </CardContent>
          </Card>
        )) : <p className="rounded-lg border border-dashed border-zinc-300 bg-white p-6 text-center text-sm text-zinc-500">{t("finance.conciliation.empty")}</p>}
      </div>
    </section>
  );
}

function SettingsTab({ form, setForm, products, isBusy, onSubmit, onSaveProduct }: {
  form: EditableSettings;
  setForm: Dispatch<SetStateAction<EditableSettings>>;
  products: Product[];
  isBusy: boolean;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onSaveProduct: () => void;
}) {
  const { t } = useI18n();
  return (
    <form onSubmit={onSubmit} className="grid gap-4 lg:grid-cols-4">
      <SettingsCard icon={Landmark} title={t("finance.settings.bankTitle")}>
        <TextField label={t("finance.settings.bankAccount")} value={form.bankName} onChange={(value) => setForm((current) => ({ ...current, bankName: value }))} />
        <TextField label={t("finance.settings.bankName")} value={form.bankDisplayName} onChange={(value) => setForm((current) => ({ ...current, bankDisplayName: value }))} />
        <TextField label={t("finance.settings.pixKey")} value={form.pixKey} onChange={(value) => setForm((current) => ({ ...current, pixKey: value }))} />
      </SettingsCard>
      <SettingsCard icon={Settings2} title={t("finance.settings.categoriesTitle")}>
        <TextField label={t("finance.settings.incomeCategory")} value={form.incomeCategory} onChange={(value) => setForm((current) => ({ ...current, incomeCategory: value }))} />
        <TextField label={t("finance.settings.expenseCategory")} value={form.expenseCategory} onChange={(value) => setForm((current) => ({ ...current, expenseCategory: value }))} />
        <TextField label={t("finance.settings.costCenter")} value={form.costCenter} onChange={(value) => setForm((current) => ({ ...current, costCenter: value }))} />
      </SettingsCard>
      <SettingsCard icon={Download} title={t("finance.settings.gatewayTitle")}>
        <SelectField label={t("finance.settings.gateway")} value={form.gatewayProvider} onChange={(value) => setForm((current) => ({ ...current, gatewayProvider: value as EditableSettings["gatewayProvider"] }))} options={["manual", "asaas", "mercadopago", "efibank", "stripe", "outros"].map((value) => ({ value, label: value }))} />
        <TextField label={t("finance.settings.gatewayName")} value={form.gatewayName} onChange={(value) => setForm((current) => ({ ...current, gatewayName: value }))} />
        <label className="flex items-center gap-2 text-sm text-zinc-700">
          <input type="checkbox" checked={form.gatewayActive} onChange={(event) => setForm((current) => ({ ...current, gatewayActive: event.target.checked }))} />
          {t("finance.settings.gatewayActive")}
        </label>
        <Button type="submit" disabled={isBusy}>{isBusy ? t("common.saving") : t("common.save")}</Button>
      </SettingsCard>
      <SettingsCard icon={PackageCheck} title={t("finance.settings.productsTitle")}>
        <TextField label={t("finance.settings.productName")} value={form.productName} onChange={(value) => setForm((current) => ({ ...current, productName: value }))} />
        <TextField label={t("finance.settings.productSku")} value={form.productSku} onChange={(value) => setForm((current) => ({ ...current, productSku: value }))} />
        <div className="grid grid-cols-2 gap-2">
          <TextField label={t("finance.settings.productPrice")} value={form.productPrice} onChange={(value) => setForm((current) => ({ ...current, productPrice: value }))} inputMode="decimal" />
          <TextField label={t("finance.settings.productStock")} value={form.productStock} onChange={(value) => setForm((current) => ({ ...current, productStock: value }))} inputMode="decimal" />
        </div>
        <Button type="button" variant="outline" disabled={isBusy || !form.productName.trim()} onClick={onSaveProduct}>{t("finance.settings.addProduct")}</Button>
        <div className="space-y-2">
          {products.slice(0, 4).map((product) => (
            <div key={product.id} className="rounded-md bg-zinc-50 px-3 py-2 text-sm">
              <p className="font-medium text-zinc-950">{product.name}</p>
              <p className="text-zinc-500">{product.stock_quantity} · {product.sku || t("common.none")}</p>
            </div>
          ))}
        </div>
      </SettingsCard>
    </form>
  );
}

function SettingsCard({ icon: Icon, title, children }: { icon: typeof Landmark; title: string; children: ReactNode }) {
  return (
    <Card className="rounded-lg border-zinc-200">
      <CardContent className="space-y-4 p-4">
        <div className="flex items-center gap-2">
          <Icon className="h-5 w-5 text-teal-700" />
          <h2 className="text-base font-semibold text-zinc-950">{title}</h2>
        </div>
        {children}
      </CardContent>
    </Card>
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
