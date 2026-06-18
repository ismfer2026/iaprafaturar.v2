import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { Landmark, Plus, ReceiptText, Settings2, WalletCards } from "lucide-react";
import { Button, Card, CardContent, Input, Skeleton, cn } from "@iaprafaturar/ui";
import type { FinanceSettings } from "@iaprafaturar/domain";
import { useAuth } from "@/contexts/AuthContext";
import { useFinanceReceiptSettings, useFinanceSettings } from "@/hooks/useFinancial";
import { useI18n, type TranslationKey } from "@/i18n";

const FINANCE_TABS = [
  { key: "extrato", path: "/financeiro" },
  { key: "pdv", path: "/financeiro?tab=pdv" },
  { key: "caixa", path: "/financeiro?tab=caixa" },
  { key: "conta_cliente", path: "/financeiro?tab=conta_cliente" },
  { key: "fluxo", path: "/financeiro?tab=fluxo" },
  { key: "repasses", path: "/financeiro?tab=repasses" },
  { key: "conciliacao", path: "/financeiro/conciliacao" },
  { key: "configuracoes", path: "/financeiro/configuracoes" },
] as const;

export default function FinanceSettingsPage() {
  const { professionalId, role } = useAuth();
  const { t } = useI18n();
  const navigate = useNavigate();
  const gestorProfessionalId = role === "gestor" ? professionalId : null;
  const settings = useFinanceSettings(gestorProfessionalId);
  const receipts = useFinanceReceiptSettings(gestorProfessionalId);
  const [draft, setDraft] = useState<FinanceSettings | null>(null);
  const [newBank, setNewBank] = useState("");
  const [newPix, setNewPix] = useState("");
  const [newCategory, setNewCategory] = useState("");
  const [categoryType, setCategoryType] = useState<"receita" | "despesa">("receita");
  const [newCost, setNewCost] = useState("");
  const [newGateway, setNewGateway] = useState("");
  const [gatewayProvider, setGatewayProvider] = useState<"manual" | "asaas" | "mercadopago" | "efibank" | "stripe" | "outros">("manual");
  useEffect(() => { if (settings.data && !draft) setDraft(settings.data); }, [settings.data, draft]);
  if (role !== "gestor") return <div className="mx-auto max-w-3xl px-4 py-8"><div className="rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">{t("finance.access.settings")}</div></div>;
  if (!draft || settings.isLoading) return <div className="p-6"><Skeleton className="h-40 w-full" /></div>;
  const toggle = <T extends { id: string; is_active: boolean }>(list: T[], id: string) => list.map((item) => item.id === id ? { ...item, is_active: !item.is_active } : item);
  async function save(event: FormEvent) { event.preventDefault(); if (draft) await settings.saveSettings(draft); }
  return <form onSubmit={save} className="mx-auto w-full max-w-6xl space-y-5 px-4 py-5 md:px-6">
    <div className="overflow-x-auto">
      <div className="flex min-w-max gap-1 rounded-lg bg-zinc-100 p-1">
        {FINANCE_TABS.map(({ key, path }) => (
          <button key={key} type="button" className={cn("whitespace-nowrap rounded-md px-3 py-2 text-sm font-medium transition-colors", key === "configuracoes" ? "bg-white text-zinc-950 shadow-sm" : "text-zinc-500")} onClick={() => navigate(path)}>
            {t(`finance.tab.${key}` as TranslationKey)}
          </button>
        ))}
      </div>
    </div>
    <header><h1 className="text-3xl font-semibold">{t("finance.settings.pageTitle")}</h1><p className="text-sm text-zinc-500">{t("finance.settings.pageSubtitle")}</p></header>
    <div className="grid gap-4 lg:grid-cols-2">
      <ListCard icon={Landmark} title={t("finance.settings.banks")} value={newBank} onChange={setNewBank} secondaryValue={newPix} onSecondaryChange={setNewPix} secondaryPlaceholder={t("finance.settings.pixKey")} onAdd={() => { if (newBank.trim()) setDraft({ ...draft, bankAccounts: [...draft.bankAccounts, { id: crypto.randomUUID(), professional_id: professionalId ?? "", name: newBank.trim(), bank_name: null, account_type: "corrente", pix_key: newPix.trim() || null, opening_balance: 0, is_default: false, is_active: true, created_at: "", updated_at: "" }] }); setNewBank(""); setNewPix(""); }} items={draft.bankAccounts} onToggle={(id) => setDraft({ ...draft, bankAccounts: toggle(draft.bankAccounts, id) })} />
      <ListCard icon={Settings2} title={t("finance.settings.categories")} value={newCategory} onChange={setNewCategory} extra={<select className="h-10 rounded-md border border-zinc-200 px-3 text-sm" value={categoryType} onChange={(event) => setCategoryType(event.target.value as "receita" | "despesa")}><option value="receita">{t("finance.settings.income")}</option><option value="despesa">{t("finance.settings.expense")}</option></select>} onAdd={() => { if (newCategory.trim()) setDraft({ ...draft, categories: [...draft.categories, { id: crypto.randomUUID(), professional_id: professionalId ?? "", name: newCategory.trim(), type: categoryType, is_default: false, is_active: true, created_at: "", updated_at: "" }] }); setNewCategory(""); }} items={draft.categories} onToggle={(id) => setDraft({ ...draft, categories: toggle(draft.categories, id) })} />
      <ListCard icon={WalletCards} title={t("finance.settings.costCenters")} value={newCost} onChange={setNewCost} onAdd={() => { if (newCost.trim()) setDraft({ ...draft, costCenters: [...draft.costCenters, { id: crypto.randomUUID(), professional_id: professionalId ?? "", name: newCost.trim(), description: null, is_default: false, is_active: true, created_at: "", updated_at: "" }] }); setNewCost(""); }} items={draft.costCenters} onToggle={(id) => setDraft({ ...draft, costCenters: toggle(draft.costCenters, id) })} />
      <ListCard icon={WalletCards} title={t("finance.settings.gateways")} value={newGateway} onChange={setNewGateway} extra={<select className="h-10 rounded-md border border-zinc-200 px-3 text-sm" value={gatewayProvider} onChange={(event) => setGatewayProvider(event.target.value as typeof gatewayProvider)}>{(["manual", "asaas", "mercadopago", "efibank", "stripe", "outros"] as const).map((provider) => <option key={provider} value={provider}>{provider}</option>)}</select>} onAdd={() => { if (newGateway.trim() && !draft.gateways.some((item) => item.provider === gatewayProvider)) setDraft({ ...draft, gateways: [...draft.gateways, { id: crypto.randomUUID(), provider: gatewayProvider, display_name: newGateway.trim(), is_active: true, created_at: "", updated_at: "" }] }); setNewGateway(""); }} items={draft.gateways.map((item) => ({ id: item.id, name: `${item.display_name} (${item.provider})`, is_active: item.is_active }))} onToggle={(id) => setDraft({ ...draft, gateways: toggle(draft.gateways, id) })} />
      <Card className="rounded-lg border-zinc-200"><CardContent className="space-y-3 p-4"><div className="flex items-center gap-2 font-semibold"><ReceiptText className="h-5 w-5 text-teal-700" />{t("finance.settings.receipts")}</div><label className="flex gap-2 text-sm"><input type="checkbox" checked={receipts.data?.enabled ?? true} onChange={(e) => receipts.save({ ...(receipts.data ?? {}), enabled: e.target.checked })} />{t("finance.settings.receiptEnabled")}</label><label className="flex gap-2 text-sm"><input type="checkbox" checked={receipts.data?.auto_send ?? false} onChange={(e) => receipts.save({ ...(receipts.data ?? {}), auto_send: e.target.checked })} />{t("finance.settings.receiptAuto")}</label><Input placeholder={t("finance.settings.receiptFooter")} value={receipts.data?.footer ?? ""} onChange={(e) => receipts.setLocal({ ...(receipts.data ?? {}), footer: e.target.value })} /><Button type="button" variant="outline" onClick={() => receipts.save(receipts.data ?? {})}>{t("common.save")}</Button></CardContent></Card>
    </div><Button disabled={settings.isSavingSettings}>{settings.isSavingSettings ? t("common.saving") : t("common.save")}</Button></form>;
}
function ListCard({ icon: Icon, title, value, onChange, secondaryValue, onSecondaryChange, secondaryPlaceholder, extra, onAdd, items, onToggle }: { icon: typeof Landmark; title: string; value: string; onChange: (value: string) => void; secondaryValue?: string; onSecondaryChange?: (value: string) => void; secondaryPlaceholder?: string; extra?: ReactNode; onAdd: () => void; items: Array<{ id: string; name: string; is_active: boolean }>; onToggle: (id: string) => void }) {
  const { t } = useI18n();
  return <Card className="rounded-lg border-zinc-200"><CardContent className="space-y-3 p-4"><div className="flex items-center gap-2 font-semibold"><Icon className="h-5 w-5 text-teal-700" />{title}</div><div className="flex flex-wrap gap-2"><Input className="min-w-40 flex-1" value={value} onChange={(e) => onChange(e.target.value)} />{onSecondaryChange ? <Input className="min-w-40 flex-1" value={secondaryValue ?? ""} placeholder={secondaryPlaceholder} onChange={(e) => onSecondaryChange(e.target.value)} /> : null}{extra}<Button type="button" variant="outline" onClick={onAdd}><Plus className="h-4 w-4" /></Button></div>{items.map((item) => <div key={item.id} className="flex items-center justify-between rounded-md bg-zinc-50 px-3 py-2 text-sm"><span>{item.name}</span><Button type="button" variant="outline" onClick={() => onToggle(item.id)}>{item.is_active ? t("common.active") : t("common.inactive")}</Button></div>)}</CardContent></Card>;
}
