import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { Card, CardContent } from "@iaprafaturar/ui";
import { useI18n } from "@/i18n";

export function GrowthAccessDenied() {
  const { t } = useI18n();
  return <div className="mx-auto max-w-3xl px-4 py-8"><div className="rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">{t("growth.access.gestor")}</div></div>;
}

export function GrowthPageHeader({ title, description, action }: { title: string; description: string; action?: ReactNode }) {
  const { t } = useI18n();
  return <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"><div><p className="text-xs font-semibold uppercase text-primary-700">{t("growth.eyebrow")}</p><h1 className="mt-1 text-2xl font-semibold text-zinc-950">{title}</h1><p className="mt-1 max-w-2xl text-sm text-zinc-500">{description}</p></div>{action}</header>;
}

export function MetricCard({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: string }) {
  return <Card className="rounded-lg"><CardContent className="flex items-center gap-3 p-4"><div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary-50 text-primary-700"><Icon className="h-5 w-5" /></div><div className="min-w-0"><p className="truncate text-xs font-semibold text-zinc-500">{label}</p><p className="text-xl font-semibold text-zinc-950">{value}</p></div></CardContent></Card>;
}

export function DataRow({ title, subtitle, value }: { title: string; subtitle: string; value: string }) {
  return <Card className="rounded-lg"><CardContent className="flex items-center justify-between gap-3 p-4"><div className="min-w-0"><h2 className="truncate text-sm font-semibold text-zinc-950">{title}</h2><p className="mt-1 truncate text-xs text-zinc-500">{subtitle}</p></div><span className="shrink-0 text-xs font-semibold text-zinc-600">{value}</span></CardContent></Card>;
}

export function relationName(value: { full_name: string } | Array<{ full_name: string }> | null) {
  return (Array.isArray(value) ? value[0]?.full_name : value?.full_name) ?? "";
}
