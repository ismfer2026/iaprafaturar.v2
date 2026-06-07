import { type FormEvent, useMemo, useState } from "react";
import { FileSignature, FileText, PackageCheck, Plus, Send, Stethoscope } from "lucide-react";
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
import type { ClientPackageStatus, ContractStatus, FinancialPaymentMethod, ModeloType, QuoteItem, QuoteStatus } from "@iaprafaturar/domain";
import { useAuth } from "@/contexts/AuthContext";
import { useClients } from "@/hooks/useClients";
import {
  useAnamneseTemplates,
  useClientPackages,
  useContracts,
  useModelos,
  useQuotes,
  useServicePackages,
} from "@/hooks/useDocumentsPackages";
import { useServices } from "@/hooks/useServices";
import { useI18n, type Locale, type TranslationKey } from "@/i18n";

type Tab = "packages" | "quotes" | "documents" | "anamnese";
type SheetMode = "package" | "sell-package" | "quote" | "modelo" | "contract" | "anamnese" | null;

const TABS = [
  { value: "packages", labelKey: "docs.tab.packages", icon: PackageCheck },
  { value: "quotes", labelKey: "docs.tab.quotes", icon: FileText },
  { value: "documents", labelKey: "docs.tab.documents", icon: FileSignature },
  { value: "anamnese", labelKey: "docs.tab.anamnese", icon: Stethoscope },
] satisfies Array<{ value: Tab; labelKey: TranslationKey; icon: typeof PackageCheck }>;

const PAYMENT_METHODS: FinancialPaymentMethod[] = [
  "pix",
  "dinheiro",
  "cartao_credito",
  "cartao_debito",
  "transferencia",
  "outros",
];

const QUOTE_STATUS_KEYS: Record<QuoteStatus, TranslationKey> = {
  rascunho: "docs.quote.status.rascunho",
  enviado: "docs.quote.status.enviado",
  aprovado: "docs.quote.status.aprovado",
  rejeitado: "docs.quote.status.rejeitado",
  expirado: "docs.quote.status.expirado",
};

const CLIENT_PACKAGE_STATUS_KEYS: Record<ClientPackageStatus, TranslationKey> = {
  ativo: "docs.package.status.ativo",
  esgotado: "docs.package.status.esgotado",
  expirado: "docs.package.status.expirado",
  cancelado: "docs.package.status.cancelado",
};

const MODELO_TYPE_KEYS: Record<ModeloType, TranslationKey> = {
  contrato: "docs.modelo.type.contrato",
  termo: "docs.modelo.type.termo",
  orientacao: "docs.modelo.type.orientacao",
  outro: "docs.modelo.type.outro",
};

const CONTRACT_STATUS_KEYS: Record<ContractStatus, TranslationKey> = {
  rascunho: "docs.contract.status.rascunho",
  enviado: "docs.contract.status.enviado",
  assinado_manual: "docs.contract.status.assinado_manual",
  cancelado: "docs.contract.status.cancelado",
  expirado: "docs.contract.status.expirado",
};

function formatCurrency(value: number, locale: Locale) {
  return new Intl.NumberFormat(locale, { style: "currency", currency: "BRL" }).format(value);
}

function parseMoney(value: string) {
  return Number(value.replace(",", "."));
}

function parseJsonObject(value: string): Record<string, unknown> {
  const parsed = JSON.parse(value) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("invalid_json");
  }
  return parsed as Record<string, unknown>;
}

export default function DocumentsPackagesPage() {
  const { locale, t } = useI18n();
  const { professionalId } = useAuth();
  const [activeTab, setActiveTab] = useState<Tab>("packages");
  const [sheetMode, setSheetMode] = useState<SheetMode>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const clientsQuery = useClients(professionalId);
  const servicesQuery = useServices(professionalId);
  const servicePackagesQuery = useServicePackages(professionalId);
  const clientPackagesQuery = useClientPackages(professionalId);
  const quotesQuery = useQuotes(professionalId);
  const modelosQuery = useModelos(professionalId);
  const contractsQuery = useContracts(professionalId);
  const anamneseTemplatesQuery = useAnamneseTemplates(professionalId);

  const clients = useMemo(() => clientsQuery.data ?? [], [clientsQuery.data]);
  const services = useMemo(() => servicesQuery.data?.services ?? [], [servicesQuery.data?.services]);
  const servicePackages = useMemo(() => servicePackagesQuery.data ?? [], [servicePackagesQuery.data]);
  const clientPackages = useMemo(() => clientPackagesQuery.data ?? [], [clientPackagesQuery.data]);
  const quotes = useMemo(() => quotesQuery.data ?? [], [quotesQuery.data]);
  const modelos = useMemo(() => modelosQuery.data ?? [], [modelosQuery.data]);
  const contracts = useMemo(() => contractsQuery.data ?? [], [contractsQuery.data]);
  const anamneseTemplates = useMemo(() => anamneseTemplatesQuery.data ?? [], [anamneseTemplatesQuery.data]);

  const [packageForm, setPackageForm] = useState({
    name: "",
    serviceId: "",
    totalSessions: "5",
    price: "",
    validityDays: "90",
    description: "",
    isPublic: true,
  });
  const [sellForm, setSellForm] = useState({
    clientId: "",
    servicePackageId: "",
    paymentMethod: "pix" as FinancialPaymentMethod,
    amount: "",
  });
  const [quoteForm, setQuoteForm] = useState({
    clientId: "",
    title: "",
    itemDescription: "",
    itemQuantity: "1",
    itemPrice: "",
    discountAmount: "0",
    expiresAt: "",
    notes: "",
  });
  const [modeloForm, setModeloForm] = useState({
    name: "",
    type: "contrato" as ModeloType,
    content: "",
    variables: "",
  });
  const [contractForm, setContractForm] = useState({
    clientId: "",
    modeloId: "",
    title: "",
    content: "",
  });
  const [anamneseForm, setAnamneseForm] = useState({
    templateId: "",
    name: "",
    fields: "",
  });

  const selectedTemplate = useMemo(() => {
    return anamneseTemplates.find((template) => template.id === anamneseForm.templateId) ?? null;
  }, [anamneseForm.templateId, anamneseTemplates]);

  function openSheet(mode: SheetMode) {
    setFormError(null);
    if (mode === "anamnese") {
      const template = anamneseTemplates[0];
      setAnamneseForm({
        templateId: template?.id ?? "",
        name: template?.name ?? "",
        fields: template ? JSON.stringify(template.fields, null, 2) : "",
      });
    }
    setSheetMode(mode);
  }

  async function submitPackage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);

    const totalSessions = Number(packageForm.totalSessions);
    const price = parseMoney(packageForm.price);
    const validityDays = packageForm.validityDays ? Number(packageForm.validityDays) : null;

    if (!packageForm.name.trim()) return setFormError(t("docs.error.nameRequired"));
    if (!Number.isInteger(totalSessions) || totalSessions <= 0) return setFormError(t("docs.error.sessionsInvalid"));
    if (!Number.isFinite(price) || price <= 0) return setFormError(t("docs.error.priceInvalid"));
    if (validityDays !== null && (!Number.isInteger(validityDays) || validityDays <= 0)) {
      return setFormError(t("docs.error.validityInvalid"));
    }

    try {
      await servicePackagesQuery.createServicePackage({
        name: packageForm.name.trim(),
        serviceId: packageForm.serviceId || null,
        totalSessions,
        price,
        validityDays,
        description: packageForm.description.trim() || null,
        isPublic: packageForm.isPublic,
      });
      setSheetMode(null);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : t("docs.error.save"));
    }
  }

  async function submitSellPackage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    const selectedPackage = servicePackages.find((item) => item.id === sellForm.servicePackageId);
    const amount = sellForm.amount ? parseMoney(sellForm.amount) : selectedPackage?.price ?? NaN;

    if (!sellForm.clientId) return setFormError(t("docs.error.clientRequired"));
    if (!sellForm.servicePackageId) return setFormError(t("docs.error.packageRequired"));
    if (!Number.isFinite(amount) || amount <= 0) return setFormError(t("docs.error.priceInvalid"));

    try {
      await clientPackagesQuery.sellClientPackage({
        clientId: sellForm.clientId,
        servicePackageId: sellForm.servicePackageId,
        paymentMethod: sellForm.paymentMethod,
        amount,
      });
      setSheetMode(null);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : t("docs.error.save"));
    }
  }

  async function submitQuote(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);

    const quantity = Number(quoteForm.itemQuantity);
    const unitPrice = parseMoney(quoteForm.itemPrice);
    const discountAmount = quoteForm.discountAmount ? parseMoney(quoteForm.discountAmount) : 0;
    if (!quoteForm.clientId) return setFormError(t("docs.error.clientRequired"));
    if (!quoteForm.title.trim()) return setFormError(t("docs.error.titleRequired"));
    if (!quoteForm.itemDescription.trim()) return setFormError(t("docs.error.itemRequired"));
    if (!Number.isFinite(quantity) || quantity <= 0) return setFormError(t("docs.error.quantityInvalid"));
    if (!Number.isFinite(unitPrice) || unitPrice <= 0) return setFormError(t("docs.error.priceInvalid"));

    const items: QuoteItem[] = [
      {
        description: quoteForm.itemDescription.trim(),
        quantity,
        unit_price: unitPrice,
      },
    ];

    try {
      await quotesQuery.createQuote({
        clientId: quoteForm.clientId,
        title: quoteForm.title.trim(),
        items,
        discountAmount,
        expiresAt: quoteForm.expiresAt || null,
        notes: quoteForm.notes.trim() || null,
      });
      setSheetMode(null);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : t("docs.error.save"));
    }
  }

  async function submitModelo(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    if (!modeloForm.name.trim()) return setFormError(t("docs.error.nameRequired"));
    if (!modeloForm.content.trim()) return setFormError(t("docs.error.contentRequired"));

    try {
      await modelosQuery.createModelo({
        name: modeloForm.name.trim(),
        type: modeloForm.type,
        content: modeloForm.content.trim(),
        variables: modeloForm.variables
          .split(",")
          .map((item) => item.trim())
          .filter(Boolean),
      });
      setSheetMode(null);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : t("docs.error.save"));
    }
  }

  async function submitContract(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    if (!contractForm.clientId) return setFormError(t("docs.error.clientRequired"));
    if (!contractForm.title.trim()) return setFormError(t("docs.error.titleRequired"));

    try {
      await contractsQuery.createContractFromModelo({
        clientId: contractForm.clientId,
        modeloId: contractForm.modeloId || null,
        title: contractForm.title.trim(),
        content: contractForm.content.trim() || null,
      });
      setSheetMode(null);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : t("docs.error.save"));
    }
  }

  async function submitAnamneseTemplate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    if (!anamneseForm.templateId) return setFormError(t("docs.error.templateRequired"));
    if (!anamneseForm.name.trim()) return setFormError(t("docs.error.nameRequired"));

    try {
      await anamneseTemplatesQuery.updateAnamneseTemplate({
        templateId: anamneseForm.templateId,
        name: anamneseForm.name.trim(),
        fields: parseJsonObject(anamneseForm.fields),
      });
      setSheetMode(null);
    } catch (err) {
      setFormError(err instanceof Error && err.message === "invalid_json" ? t("docs.error.jsonInvalid") : t("docs.error.save"));
    }
  }

  const isLoading =
    servicePackagesQuery.isLoading ||
    clientPackagesQuery.isLoading ||
    quotesQuery.isLoading ||
    modelosQuery.isLoading ||
    contractsQuery.isLoading ||
    anamneseTemplatesQuery.isLoading;

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-5 px-4 py-5 md:px-6">
      <header className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-violet-600">{t("docs.eyebrow")}</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight text-zinc-950">{t("docs.title")}</h1>
          <p className="mt-1 text-sm text-zinc-500">{t("docs.subtitle")}</p>
        </div>
      </header>

      <div className="grid grid-cols-4 rounded-lg bg-zinc-100 p-1">
        {TABS.map(({ value, labelKey, icon: Icon }) => (
          <button
            key={value}
            type="button"
            onClick={() => setActiveTab(value)}
            className={cn(
              "flex h-10 items-center justify-center gap-2 rounded-md text-sm font-medium transition-colors",
              activeTab === value ? "bg-white text-zinc-950 shadow-sm" : "text-zinc-500",
            )}
          >
            <Icon className="h-4 w-4" />
            <span className="hidden sm:inline">{t(labelKey)}</span>
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="space-y-3">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      ) : null}

      {activeTab === "packages" ? (
        <section className="space-y-4">
          <div className="flex gap-2">
            <Button className="gap-2" onClick={() => openSheet("package")}>
              <Plus className="h-4 w-4" />
              {t("docs.package.new")}
            </Button>
            <Button variant="outline" className="gap-2" onClick={() => openSheet("sell-package")}>
              <PackageCheck className="h-4 w-4" />
              {t("docs.package.sell")}
            </Button>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            {servicePackages.map((item) => (
              <Card key={item.id} className="rounded-lg border-zinc-200">
                <CardContent className="space-y-3 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h2 className="text-base font-semibold text-zinc-950">{item.name}</h2>
                      <p className="mt-1 text-sm text-zinc-500">{item.service_name || t("docs.package.noService")}</p>
                    </div>
                    <Badge className="border border-emerald-200 bg-emerald-50 text-emerald-700">
                      {item.is_public ? t("docs.package.public") : t("docs.package.private")}
                    </Badge>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-sm">
                    <div className="rounded-md bg-zinc-50 p-2">
                      <p className="font-semibold text-zinc-950">{item.total_sessions}</p>
                      <p className="text-zinc-500">{t("docs.package.sessions")}</p>
                    </div>
                    <div className="rounded-md bg-zinc-50 p-2">
                      <p className="font-semibold text-zinc-950">{formatCurrency(item.price, locale)}</p>
                      <p className="text-zinc-500">{t("docs.package.price")}</p>
                    </div>
                    <div className="rounded-md bg-zinc-50 p-2">
                      <p className="font-semibold text-zinc-950">{item.validity_days ?? "-"}</p>
                      <p className="text-zinc-500">{t("docs.package.validity")}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          <div className="space-y-2">
            <h2 className="text-sm font-semibold text-zinc-950">{t("docs.package.clientPackages")}</h2>
            {clientPackages.map((item) => (
              <Card key={item.id} className="rounded-lg border-zinc-200">
                <CardContent className="flex items-center justify-between gap-3 p-4">
                  <div>
                    <h3 className="text-sm font-semibold text-zinc-950">{item.client_name}</h3>
                    <p className="mt-1 text-sm text-zinc-500">{item.package_name}</p>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <Badge className="border border-violet-200 bg-violet-50 text-violet-700">
                      {item.sessions_remaining}/{item.sessions_total}
                    </Badge>
                    <span className="text-xs text-zinc-500">{t(CLIENT_PACKAGE_STATUS_KEYS[item.status])}</span>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      ) : null}

      {activeTab === "quotes" ? (
        <section className="space-y-4">
          <Button className="gap-2" onClick={() => openSheet("quote")}>
            <Plus className="h-4 w-4" />
            {t("docs.quote.new")}
          </Button>
          {quotes.map((quote) => (
            <Card key={quote.id} className="rounded-lg border-zinc-200">
              <CardContent className="space-y-3 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className="text-base font-semibold text-zinc-950">{quote.title}</h2>
                    <p className="mt-1 text-sm text-zinc-500">{quote.client_name}</p>
                  </div>
                  <Badge className="border border-zinc-200 bg-white text-zinc-700">{t(QUOTE_STATUS_KEYS[quote.status])}</Badge>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <p className="text-lg font-semibold text-zinc-950">{formatCurrency(quote.total_amount, locale)}</p>
                  {quote.status === "rascunho" ? (
                    <Button
                      variant="outline"
                      className="gap-2"
                      disabled={quotesQuery.isSendingQuoteDryRun}
                      onClick={() => quotesQuery.sendQuoteDryRun(quote.id)}
                    >
                      <Send className="h-4 w-4" />
                      {t("docs.quote.sendDryRun")}
                    </Button>
                  ) : null}
                </div>
              </CardContent>
            </Card>
          ))}
        </section>
      ) : null}

      {activeTab === "documents" ? (
        <section className="space-y-4">
          <div className="flex gap-2">
            <Button className="gap-2" onClick={() => openSheet("modelo")}>
              <Plus className="h-4 w-4" />
              {t("docs.modelo.new")}
            </Button>
            <Button variant="outline" className="gap-2" onClick={() => openSheet("contract")}>
              <FileSignature className="h-4 w-4" />
              {t("docs.contract.new")}
            </Button>
          </div>
          {contracts.map((contract) => (
            <Card key={contract.id} className="rounded-lg border-zinc-200">
              <CardContent className="space-y-3 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className="text-base font-semibold text-zinc-950">{contract.title}</h2>
                    <p className="mt-1 text-sm text-zinc-500">{contract.client_name}</p>
                  </div>
                  <Badge className="border border-zinc-200 bg-white text-zinc-700">{t(CONTRACT_STATUS_KEYS[contract.status])}</Badge>
                </div>
                {contract.status !== "assinado_manual" ? (
                  <Button
                    variant="outline"
                    onClick={() => contractsQuery.markContractSignedManual(contract.id)}
                    disabled={contractsQuery.isMarkingContractSignedManual}
                  >
                    {t("docs.contract.markSigned")}
                  </Button>
                ) : null}
              </CardContent>
            </Card>
          ))}
        </section>
      ) : null}

      {activeTab === "anamnese" ? (
        <section className="space-y-4">
          <Button className="gap-2" onClick={() => openSheet("anamnese")} disabled={!anamneseTemplates.length}>
            <Stethoscope className="h-4 w-4" />
            {t("docs.anamnese.edit")}
          </Button>
          {anamneseTemplates.map((template) => (
            <Card key={template.id} className="rounded-lg border-zinc-200">
              <CardContent className="space-y-2 p-4">
                <div className="flex items-center justify-between gap-3">
                  <h2 className="text-base font-semibold text-zinc-950">{template.name}</h2>
                  {template.is_default ? <Badge>{t("docs.anamnese.default")}</Badge> : null}
                </div>
                <pre className="max-h-44 overflow-auto rounded-md bg-zinc-50 p-3 text-xs text-zinc-600">
                  {JSON.stringify(template.fields, null, 2)}
                </pre>
              </CardContent>
            </Card>
          ))}
        </section>
      ) : null}

      <Sheet open={Boolean(sheetMode)} onOpenChange={(open) => !open && setSheetMode(null)}>
        <SheetContent className="max-h-[88vh] overflow-y-auto">
          {sheetMode === "package" ? (
            <form onSubmit={submitPackage}>
              <SheetHeader><SheetTitle>{t("docs.package.new")}</SheetTitle></SheetHeader>
              <div className="space-y-4 px-4 py-2">
                <TextInput label={t("docs.form.name")} value={packageForm.name} onChange={(name) => setPackageForm((current) => ({ ...current, name }))} />
                <SelectInput label={t("docs.form.service")} value={packageForm.serviceId} onChange={(serviceId) => setPackageForm((current) => ({ ...current, serviceId }))} options={[{ value: "", label: t("common.optional") }, ...services.map((service) => ({ value: service.id, label: service.name }))]} />
                <div className="grid grid-cols-2 gap-3">
                  <TextInput label={t("docs.package.sessions")} value={packageForm.totalSessions} onChange={(totalSessions) => setPackageForm((current) => ({ ...current, totalSessions }))} inputMode="numeric" />
                  <TextInput label={t("docs.package.price")} value={packageForm.price} onChange={(price) => setPackageForm((current) => ({ ...current, price }))} inputMode="decimal" />
                </div>
                <TextInput label={t("docs.package.validity")} value={packageForm.validityDays} onChange={(validityDays) => setPackageForm((current) => ({ ...current, validityDays }))} inputMode="numeric" />
                <TextInput label={t("docs.form.description")} value={packageForm.description} onChange={(description) => setPackageForm((current) => ({ ...current, description }))} />
                <CheckboxInput label={t("docs.package.public")} checked={packageForm.isPublic} onChange={(isPublic) => setPackageForm((current) => ({ ...current, isPublic }))} />
                <FormError message={formError} />
              </div>
              <SheetFooter><SheetActions onCancel={() => setSheetMode(null)} isBusy={servicePackagesQuery.isCreatingServicePackage} /></SheetFooter>
            </form>
          ) : null}

          {sheetMode === "sell-package" ? (
            <form onSubmit={submitSellPackage}>
              <SheetHeader><SheetTitle>{t("docs.package.sell")}</SheetTitle></SheetHeader>
              <div className="space-y-4 px-4 py-2">
                <SelectInput label={t("docs.form.client")} value={sellForm.clientId} onChange={(clientId) => setSellForm((current) => ({ ...current, clientId }))} options={[{ value: "", label: t("common.select") }, ...clients.map((client) => ({ value: client.id, label: client.full_name }))]} />
                <SelectInput label={t("docs.form.package")} value={sellForm.servicePackageId} onChange={(servicePackageId) => setSellForm((current) => ({ ...current, servicePackageId }))} options={[{ value: "", label: t("common.select") }, ...servicePackages.map((item) => ({ value: item.id, label: item.name }))]} />
                <SelectInput label={t("docs.form.paymentMethod")} value={sellForm.paymentMethod} onChange={(paymentMethod) => setSellForm((current) => ({ ...current, paymentMethod: paymentMethod as FinancialPaymentMethod }))} options={PAYMENT_METHODS.map((method) => ({ value: method, label: t(`finance.method.${method}` as TranslationKey) }))} />
                <TextInput label={t("docs.form.amount")} value={sellForm.amount} onChange={(amount) => setSellForm((current) => ({ ...current, amount }))} inputMode="decimal" />
                <FormError message={formError} />
              </div>
              <SheetFooter><SheetActions onCancel={() => setSheetMode(null)} isBusy={clientPackagesQuery.isSellingClientPackage} /></SheetFooter>
            </form>
          ) : null}

          {sheetMode === "quote" ? (
            <form onSubmit={submitQuote}>
              <SheetHeader><SheetTitle>{t("docs.quote.new")}</SheetTitle></SheetHeader>
              <div className="space-y-4 px-4 py-2">
                <SelectInput label={t("docs.form.client")} value={quoteForm.clientId} onChange={(clientId) => setQuoteForm((current) => ({ ...current, clientId }))} options={[{ value: "", label: t("common.select") }, ...clients.map((client) => ({ value: client.id, label: client.full_name }))]} />
                <TextInput label={t("docs.form.title")} value={quoteForm.title} onChange={(title) => setQuoteForm((current) => ({ ...current, title }))} />
                <TextInput label={t("docs.form.item")} value={quoteForm.itemDescription} onChange={(itemDescription) => setQuoteForm((current) => ({ ...current, itemDescription }))} />
                <div className="grid grid-cols-2 gap-3">
                  <TextInput label={t("docs.form.quantity")} value={quoteForm.itemQuantity} onChange={(itemQuantity) => setQuoteForm((current) => ({ ...current, itemQuantity }))} inputMode="numeric" />
                  <TextInput label={t("docs.form.price")} value={quoteForm.itemPrice} onChange={(itemPrice) => setQuoteForm((current) => ({ ...current, itemPrice }))} inputMode="decimal" />
                </div>
                <TextInput label={t("docs.form.discount")} value={quoteForm.discountAmount} onChange={(discountAmount) => setQuoteForm((current) => ({ ...current, discountAmount }))} inputMode="decimal" />
                <TextInput label={t("docs.form.expiresAt")} value={quoteForm.expiresAt} onChange={(expiresAt) => setQuoteForm((current) => ({ ...current, expiresAt }))} type="date" />
                <FormError message={formError} />
              </div>
              <SheetFooter><SheetActions onCancel={() => setSheetMode(null)} isBusy={quotesQuery.isCreatingQuote} /></SheetFooter>
            </form>
          ) : null}

          {sheetMode === "modelo" ? (
            <form onSubmit={submitModelo}>
              <SheetHeader><SheetTitle>{t("docs.modelo.new")}</SheetTitle></SheetHeader>
              <div className="space-y-4 px-4 py-2">
                <TextInput label={t("docs.form.name")} value={modeloForm.name} onChange={(name) => setModeloForm((current) => ({ ...current, name }))} />
                <SelectInput label={t("docs.form.type")} value={modeloForm.type} onChange={(type) => setModeloForm((current) => ({ ...current, type: type as ModeloType }))} options={(["contrato", "termo", "orientacao", "outro"] as ModeloType[]).map((type) => ({ value: type, label: t(MODELO_TYPE_KEYS[type]) }))} />
                <TextAreaInput label={t("docs.form.content")} value={modeloForm.content} onChange={(content) => setModeloForm((current) => ({ ...current, content }))} />
                <TextInput label={t("docs.form.variables")} value={modeloForm.variables} onChange={(variables) => setModeloForm((current) => ({ ...current, variables }))} />
                <FormError message={formError} />
              </div>
              <SheetFooter><SheetActions onCancel={() => setSheetMode(null)} isBusy={modelosQuery.isCreatingModelo} /></SheetFooter>
            </form>
          ) : null}

          {sheetMode === "contract" ? (
            <form onSubmit={submitContract}>
              <SheetHeader><SheetTitle>{t("docs.contract.new")}</SheetTitle></SheetHeader>
              <div className="space-y-4 px-4 py-2">
                <SelectInput label={t("docs.form.client")} value={contractForm.clientId} onChange={(clientId) => setContractForm((current) => ({ ...current, clientId }))} options={[{ value: "", label: t("common.select") }, ...clients.map((client) => ({ value: client.id, label: client.full_name }))]} />
                <SelectInput label={t("docs.form.model")} value={contractForm.modeloId} onChange={(modeloId) => setContractForm((current) => ({ ...current, modeloId }))} options={[{ value: "", label: t("common.optional") }, ...modelos.map((modelo) => ({ value: modelo.id, label: modelo.name }))]} />
                <TextInput label={t("docs.form.title")} value={contractForm.title} onChange={(title) => setContractForm((current) => ({ ...current, title }))} />
                <TextAreaInput label={t("docs.form.content")} value={contractForm.content} onChange={(content) => setContractForm((current) => ({ ...current, content }))} />
                <FormError message={formError} />
              </div>
              <SheetFooter><SheetActions onCancel={() => setSheetMode(null)} isBusy={contractsQuery.isCreatingContract} /></SheetFooter>
            </form>
          ) : null}

          {sheetMode === "anamnese" ? (
            <form onSubmit={submitAnamneseTemplate}>
              <SheetHeader><SheetTitle>{t("docs.anamnese.edit")}</SheetTitle></SheetHeader>
              <div className="space-y-4 px-4 py-2">
                <SelectInput label={t("docs.form.template")} value={anamneseForm.templateId} onChange={(templateId) => {
                  const template = anamneseTemplates.find((item) => item.id === templateId);
                  setAnamneseForm({
                    templateId,
                    name: template?.name ?? "",
                    fields: template ? JSON.stringify(template.fields, null, 2) : "",
                  });
                }} options={anamneseTemplates.map((template) => ({ value: template.id, label: template.name }))} />
                <TextInput label={t("docs.form.name")} value={anamneseForm.name} onChange={(name) => setAnamneseForm((current) => ({ ...current, name }))} />
                <TextAreaInput label={t("docs.form.fieldsJson")} value={anamneseForm.fields || (selectedTemplate ? JSON.stringify(selectedTemplate.fields, null, 2) : "")} onChange={(fields) => setAnamneseForm((current) => ({ ...current, fields }))} rows={12} />
                <FormError message={formError} />
              </div>
              <SheetFooter><SheetActions onCancel={() => setSheetMode(null)} isBusy={anamneseTemplatesQuery.isUpdatingAnamneseTemplate} /></SheetFooter>
            </form>
          ) : null}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function TextInput({
  label,
  value,
  onChange,
  inputMode,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  inputMode?: "decimal" | "numeric";
  type?: string;
}) {
  return (
    <label className="block space-y-1.5">
      <span className="text-sm font-medium text-zinc-700">{label}</span>
      <Input type={type} value={value} onChange={(event) => onChange(event.target.value)} inputMode={inputMode} />
    </label>
  );
}

function TextAreaInput({
  label,
  value,
  onChange,
  rows = 6,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  rows?: number;
}) {
  return (
    <label className="block space-y-1.5">
      <span className="text-sm font-medium text-zinc-700">{label}</span>
      <textarea
        className="w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm shadow-sm outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-100"
        value={value}
        rows={rows}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

function SelectInput({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <label className="block space-y-1.5">
      <span className="text-sm font-medium text-zinc-700">{label}</span>
      <select
        className="h-10 w-full rounded-md border border-zinc-200 bg-white px-3 text-sm shadow-sm outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-100"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function CheckboxInput({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex items-center gap-2 rounded-lg border border-zinc-200 px-3 py-2 text-sm">
      <input
        type="checkbox"
        className="h-4 w-4 rounded border-zinc-300 text-violet-600"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
      {label}
    </label>
  );
}

function FormError({ message }: { message: string | null }) {
  if (!message) return null;
  return <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{message}</div>;
}

function SheetActions({ onCancel, isBusy }: { onCancel: () => void; isBusy: boolean }) {
  const { t } = useI18n();
  return (
    <>
      <Button type="button" variant="outline" onClick={onCancel}>
        {t("common.cancel")}
      </Button>
      <Button type="submit" disabled={isBusy}>
        {isBusy ? t("common.saving") : t("common.save")}
      </Button>
    </>
  );
}
