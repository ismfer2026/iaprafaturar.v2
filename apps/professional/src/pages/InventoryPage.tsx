import { useMemo, useState, type FormEvent, type ReactNode } from "react";
import { AlertTriangle, Boxes, CalendarClock, PackagePlus, Plus, RefreshCw } from "lucide-react";
import { Badge, Button, Card, CardContent, Input, Skeleton } from "@iaprafaturar/ui";
import { useAuth } from "@/contexts/AuthContext";
import { useInventory } from "@/hooks/useInventory";
import { useI18n } from "@/i18n";

function numberValue(value: string) {
  return Number(value.replace(",", "."));
}

export default function InventoryPage() {
  const { professionalId, role } = useAuth();
  const { t } = useI18n();
  const inventory = useInventory(professionalId);
  const [product, setProduct] = useState({ name: "", sku: "", price: "", stock: "", minStock: "" });
  const [adjustment, setAdjustment] = useState({ productId: "", quantity: "", note: "" });
  const [batch, setBatch] = useState({ productId: "", lotCode: "", quantity: "", expiresAt: "" });
  const [error, setError] = useState<string | null>(null);
  const isGestor = role === "gestor";
  const products = useMemo(() => inventory.data?.products ?? [], [inventory.data?.products]);
  const batches = useMemo(() => inventory.data?.batches ?? [], [inventory.data?.batches]);
  const movements = inventory.data?.movements ?? [];
  const lowStock = useMemo(() => products.filter((item) => item.low_stock), [products]);
  const expiring = useMemo(() => batches.filter((item) => item.expires_at).slice(0, 8), [batches]);

  async function submitProduct(event: FormEvent) {
    event.preventDefault();
    setError(null);
    try {
      await inventory.saveProduct({
        name: product.name,
        sku: product.sku || null,
        unitPrice: numberValue(product.price || "0"),
        initialStock: numberValue(product.stock || "0"),
        minStock: numberValue(product.minStock || "0"),
      });
      setProduct({ name: "", sku: "", price: "", stock: "", minStock: "" });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t("inventory.error.product"));
    }
  }

  async function submitAdjustment(event: FormEvent) {
    event.preventDefault();
    setError(null);
    try {
      await inventory.adjustStock({ productId: adjustment.productId, quantityChange: numberValue(adjustment.quantity), note: adjustment.note });
      setAdjustment({ productId: "", quantity: "", note: "" });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t("inventory.error.adjust"));
    }
  }

  async function submitBatch(event: FormEvent) {
    event.preventDefault();
    setError(null);
    try {
      await inventory.saveBatch({ productId: batch.productId, lotCode: batch.lotCode, quantity: numberValue(batch.quantity), expiresAt: batch.expiresAt || null });
      setBatch({ productId: "", lotCode: "", quantity: "", expiresAt: "" });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t("inventory.error.batch"));
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-5 px-4 py-5 md:px-6">
      <header>
        <p className="text-xs font-semibold uppercase text-teal-700">{t("inventory.eyebrow")}</p>
        <h1 className="mt-1 text-3xl font-semibold text-zinc-950">{t("inventory.title")}</h1>
        <p className="mt-1 text-sm text-zinc-500">{t("inventory.subtitle")}</p>
      </header>

      {inventory.isLoading ? <Skeleton className="h-32 w-full" /> : null}
      {error || inventory.error ? <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error ?? t("inventory.error.load")}</div> : null}

      <section className="grid gap-3 md:grid-cols-3">
        <Metric icon={Boxes} label={t("inventory.metric.active")} value={String(products.filter((item) => item.is_active).length)} />
        <Metric icon={AlertTriangle} label={t("inventory.metric.low")} value={String(lowStock.length)} />
        <Metric icon={CalendarClock} label={t("inventory.metric.batches")} value={String(batches.length)} />
      </section>

      {isGestor ? (
        <section className="grid gap-4 lg:grid-cols-3">
          <InventoryForm title={t("inventory.form.product")} icon={Plus} onSubmit={submitProduct} busy={inventory.isSaving}>
            <Input placeholder={t("inventory.field.name")} value={product.name} onChange={(e) => setProduct({ ...product, name: e.target.value })} required />
            <Input placeholder={t("inventory.field.sku")} value={product.sku} onChange={(e) => setProduct({ ...product, sku: e.target.value })} />
            <Input placeholder={t("inventory.field.price")} inputMode="decimal" value={product.price} onChange={(e) => setProduct({ ...product, price: e.target.value })} />
            <div className="grid grid-cols-2 gap-2"><Input placeholder={t("inventory.field.initial")} inputMode="decimal" value={product.stock} onChange={(e) => setProduct({ ...product, stock: e.target.value })} /><Input placeholder={t("inventory.field.minimum")} inputMode="decimal" value={product.minStock} onChange={(e) => setProduct({ ...product, minStock: e.target.value })} /></div>
          </InventoryForm>
          <InventoryForm title={t("inventory.form.adjust")} icon={RefreshCw} onSubmit={submitAdjustment} busy={inventory.isSaving} variant="secondary">
            <ProductSelect label={t("inventory.select.product")} value={adjustment.productId} products={products} onChange={(productId) => setAdjustment({ ...adjustment, productId })} />
            <Input placeholder={t("inventory.field.quantity")} inputMode="decimal" value={adjustment.quantity} onChange={(e) => setAdjustment({ ...adjustment, quantity: e.target.value })} required />
            <Input placeholder={t("inventory.field.reason")} value={adjustment.note} onChange={(e) => setAdjustment({ ...adjustment, note: e.target.value })} />
          </InventoryForm>
          <InventoryForm title={t("inventory.form.batch")} icon={PackagePlus} onSubmit={submitBatch} busy={inventory.isSaving} variant="secondary">
            <ProductSelect label={t("inventory.select.product")} value={batch.productId} products={products} onChange={(productId) => setBatch({ ...batch, productId })} />
            <Input placeholder={t("inventory.field.lot")} value={batch.lotCode} onChange={(e) => setBatch({ ...batch, lotCode: e.target.value })} required />
            <div className="grid grid-cols-2 gap-2"><Input placeholder={t("inventory.field.quantity")} inputMode="decimal" value={batch.quantity} onChange={(e) => setBatch({ ...batch, quantity: e.target.value })} required /><Input type="date" value={batch.expiresAt} onChange={(e) => setBatch({ ...batch, expiresAt: e.target.value })} /></div>
          </InventoryForm>
        </section>
      ) : null}

      <section className="grid gap-4 lg:grid-cols-[1.5fr_1fr]">
        <Card className="rounded-lg border-zinc-200"><CardContent className="p-4"><h2 className="font-semibold">{t("inventory.section.products")}</h2><div className="mt-3 space-y-2">{products.map((item) => <div key={item.id} className="grid gap-2 rounded-md border border-zinc-200 p-3 sm:grid-cols-[1fr_auto_auto] sm:items-center"><div><p className="font-medium">{item.name}</p><p className="text-xs text-zinc-500">{item.sku || t("inventory.noSku")}</p></div><div className="text-sm"><p>{item.stock_quantity} {t("inventory.total")}</p><p className="text-zinc-500">{item.tracked_quantity} {t("inventory.tracked")} · {item.untracked_quantity} {t("inventory.untracked")}</p></div>{item.low_stock ? <Badge className="border border-amber-200 bg-amber-50 text-amber-700">{t("inventory.low")}</Badge> : <Badge className="border border-emerald-200 bg-emerald-50 text-emerald-700">{t("inventory.normal")}</Badge>}</div>)}</div></CardContent></Card>
        <Card className="rounded-lg border-zinc-200"><CardContent className="p-4"><h2 className="font-semibold">{t("inventory.section.expirations")}</h2><div className="mt-3 space-y-2">{expiring.length ? expiring.map((item) => <div key={item.id} className="rounded-md bg-zinc-50 p-3 text-sm"><p className="font-medium">{item.lot_code}</p><p className="text-zinc-500">{item.quantity} · {item.expires_at}</p></div>) : <p className="text-sm text-zinc-500">{t("inventory.noExpiration")}</p>}</div></CardContent></Card>
      </section>
      <Card className="rounded-lg border-zinc-200"><CardContent className="p-4"><h2 className="font-semibold">{t("inventory.section.movements")}</h2><div className="mt-3 divide-y divide-zinc-100">{movements.slice(0, 20).map((item) => <div key={item.id} className="flex items-center justify-between py-2 text-sm"><span>{item.reason}{item.note ? ` · ${item.note}` : ""}</span><span className={item.quantity_change > 0 ? "text-emerald-700" : "text-red-700"}>{item.quantity_change > 0 ? "+" : ""}{item.quantity_change}</span></div>)}</div></CardContent></Card>
    </div>
  );
}

function Metric({ icon: Icon, label, value }: { icon: typeof Boxes; label: string; value: string }) {
  return <Card className="rounded-lg border-zinc-200"><CardContent className="flex items-center gap-3 p-4"><Icon className="h-5 w-5 text-teal-700" /><div><p className="text-2xl font-semibold">{value}</p><p className="text-sm text-zinc-500">{label}</p></div></CardContent></Card>;
}
function InventoryForm({ title, icon: Icon, onSubmit, busy, variant, children }: { title: string; icon: typeof Plus; onSubmit: (event: FormEvent) => void; busy: boolean; variant?: "default" | "secondary"; children: ReactNode }) {
  const { t } = useI18n();
  return <Card className="rounded-lg border-zinc-200"><CardContent className="p-4"><form className="space-y-3" onSubmit={onSubmit}><div className="flex items-center gap-2 font-semibold"><Icon className="h-4 w-4 text-teal-700" />{title}</div>{children}<Button className="w-full" variant={variant} disabled={busy}>{t("common.save")}</Button></form></CardContent></Card>;
}
function ProductSelect({ label, value, products, onChange }: { label: string; value: string; products: Array<{ id: string; name: string }>; onChange: (value: string) => void }) {
  return <select className="h-10 w-full rounded-md border border-zinc-200 bg-white px-3 text-sm" value={value} onChange={(e) => onChange(e.target.value)} required><option value="">{label}</option>{products.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>;
}
