import { useState } from "react";
import { CheckCircle2, Upload, XCircle } from "lucide-react";
import { Badge, Button, Card, CardContent, Skeleton } from "@iaprafaturar/ui";
import { useAuth } from "@/contexts/AuthContext";
import { useFinanceSettings, useFinancialTransactions, useReconciliation } from "@/hooks/useFinancial";
import { useI18n } from "@/i18n";

function parseFile(name: string, text: string) {
  if (name.toLowerCase().endsWith(".ofx")) {
    return [...text.matchAll(/<STMTTRN>([\s\S]*?)(?=<STMTTRN>|<\/BANKTRANLIST>)/gi)].map((entry, index) => {
      const block = entry[1] ?? "";
      const rawDate = block.match(/<DTPOSTED>(\d{8})/i)?.[1] ?? "";
      return { occurred_on: `${rawDate.slice(0, 4)}-${rawDate.slice(4, 6)}-${rawDate.slice(6, 8)}`, description: (block.match(/<MEMO>([^\r\n<]+)/i)?.[1] ?? "OFX").trim(), amount: Number(block.match(/<TRNAMT>([^\r\n<]+)/i)?.[1] ?? 0), external_id: block.match(/<FITID>([^\r\n<]+)/i)?.[1] ?? `ofx-${index}` };
    });
  }
  const lines = text.split(/\r?\n/).filter(Boolean);
  return lines.slice(lines[0]?.toLowerCase().includes("data") ? 1 : 0).map((line, index) => {
    const parts = line.includes(";") ? line.split(";") : line.split(",");
    return { occurred_on: parts[0]?.trim() ?? "", description: parts[1]?.trim() ?? "CSV", amount: Number((parts[2] ?? "0").replace(",", ".")), external_id: parts[3]?.trim() || `csv-${index}` };
  });
}

export default function FinanceReconciliationPage() {
  const { professionalId, role } = useAuth();
  const { t, locale } = useI18n();
  const gestorProfessionalId = role === "gestor" ? professionalId : null;
  const reconciliation = useReconciliation(gestorProfessionalId);
  const settings = useFinanceSettings(gestorProfessionalId);
  const transactions = useFinancialTransactions(gestorProfessionalId, { status: "pago" });
  const [selected, setSelected] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  if (role !== "gestor") return <AccessDenied text={t("finance.access.reconciliation")} />;

  async function importFile(file: File | null) {
    if (!file) return;
    setError(null);
    try {
      const items = parseFile(file.name, await file.text()).filter((item) => item.occurred_on && item.description && Number.isFinite(item.amount) && item.amount !== 0);
      if (!items.length) throw new Error(t("finance.conciliation.emptyFile"));
      await reconciliation.importItems({ bankAccountId: settings.data?.bankAccounts.find((item) => item.is_default)?.id ?? null, fileName: file.name, fileType: file.name.toLowerCase().endsWith(".ofx") ? "ofx" : "csv", items });
    } catch (cause) { setError(cause instanceof Error ? cause.message : t("finance.conciliation.importError")); }
  }

  const busy = reconciliation.isImportingItems || reconciliation.isConfirmingMatch || reconciliation.isIgnoringItem;
  return <div className="mx-auto w-full max-w-6xl space-y-5 px-4 py-5 md:px-6">
    <header><h1 className="text-3xl font-semibold">{t("finance.conciliation.title")}</h1><p className="text-sm text-zinc-500">{t("finance.conciliation.subtitle")}</p></header>
    <label className="inline-flex cursor-pointer items-center gap-2 rounded-md bg-zinc-950 px-4 py-2 text-sm font-medium text-white"><Upload className="h-4 w-4" />{t("finance.conciliation.import")}<input className="hidden" type="file" accept=".csv,.ofx" onChange={(event) => importFile(event.target.files?.[0] ?? null)} /></label>
    {error ? <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div> : null}
    {reconciliation.isLoading ? <Skeleton className="h-32 w-full" /> : null}
    <div className="space-y-3">{(reconciliation.data ?? []).map((item) => <Card key={item.id} className="rounded-lg border-zinc-200"><CardContent className="grid gap-3 p-4 md:grid-cols-[1fr_280px_auto] md:items-center"><div><Badge className="border border-zinc-200 bg-white">{item.status}</Badge><p className="mt-2 font-medium">{item.description}</p><p className="text-sm text-zinc-500">{new Intl.DateTimeFormat(locale).format(new Date(item.occurred_on))}</p></div><select className="h-10 rounded-md border border-zinc-200 px-3 text-sm" disabled={item.status === "confirmed"} value={selected[item.id] ?? item.suggested_transaction_id ?? ""} onChange={(event) => setSelected({ ...selected, [item.id]: event.target.value })}><option value="">{t("finance.conciliation.noMatch")}</option>{(transactions.data ?? []).map((transaction) => <option key={transaction.id} value={transaction.id}>{transaction.description}</option>)}</select><div className="flex gap-2"><Button variant="outline" disabled={busy || (!selected[item.id] && !item.suggested_transaction_id) || item.status === "confirmed"} onClick={() => reconciliation.confirmMatch({ reconciliationItemId: item.id, transactionId: selected[item.id] ?? item.suggested_transaction_id ?? "" })}><CheckCircle2 className="h-4 w-4" /></Button><Button variant="outline" disabled={busy || item.status === "confirmed" || item.status === "ignored"} onClick={() => reconciliation.ignoreItem(item.id)}><XCircle className="h-4 w-4" /></Button></div></CardContent></Card>)}</div>
  </div>;
}
function AccessDenied({ text }: { text: string }) { return <div className="mx-auto max-w-3xl px-4 py-8"><div className="rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">{text}</div></div>; }
