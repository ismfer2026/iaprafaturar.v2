import { useState } from "react";
import { Link } from "react-router-dom";
import { Badge, Card, CardContent, Input, Skeleton } from "@iaprafaturar/ui";
import { useAdminProfessionals } from "@/hooks/useAdminCore";
import { useI18n } from "@/i18n";

export default function ProfessionalsPage() {
  const { t } = useI18n();
  const [search, setSearch] = useState("");
  const [plan, setPlan] = useState("");
  const [access, setAccess] = useState("");
  const [health, setHealth] = useState("");
  const query = useAdminProfessionals({ search, plan, access, health });
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-5 px-4 py-5 sm:px-6">
      <header><h1 className="text-2xl font-semibold">{t("professionals.title")}</h1><p className="text-sm text-zinc-500">{t("professionals.subtitle")}</p></header>
      <div className="grid gap-2 md:grid-cols-4">
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t("professionals.searchPlaceholder")} />
        <Select value={plan} onChange={setPlan} label={t("professionals.filter.plan")} options={["trial","individual","equipe","team","enterprise","free_internal"]} />
        <Select value={access} onChange={setAccess} label={t("professionals.filter.access")} options={["full","read_only","suspended"]} />
        <Select value={health} onChange={setHealth} label={t("professionals.filter.health")} options={["critico","baixo","medio","alto","excelente"]} />
      </div>
      {query.isLoading ? <div className="grid gap-3 lg:grid-cols-2">{[1,2,3,4].map((i) => <Skeleton className="h-36" key={i} />)}</div> : null}
      {query.isError ? <Error /> : null}
      {query.data?.length === 0 ? <Card><CardContent className="p-5 text-zinc-500">{t("professionals.empty")}</CardContent></Card> : null}
      <div className="grid gap-3 lg:grid-cols-2">
        {query.data?.map((row) => <Link key={row.id} to={`/profissionais/${row.id}`}><Card className="h-full rounded-lg hover:border-violet-300"><CardContent className="space-y-3 p-4">
          <div className="flex items-start justify-between gap-3"><div className="min-w-0"><h2 className="truncate text-sm font-semibold">{row.business_name || row.name}</h2><p className="truncate text-xs text-zinc-500">{row.email}</p></div><Badge>{row.plan_type}</Badge></div>
          <div className="flex flex-wrap gap-2"><Badge variant="secondary">{row.access_status}</Badge><Badge variant="secondary">{row.health_level ?? "-"}</Badge><Badge variant="secondary">{row.ai_credit_balance} {t("plans.credits")}</Badge><Badge variant={row.whatsapp_connected ? "success" : "secondary"}>{row.whatsapp_connected ? t("professionals.whatsapp.connected") : t("professionals.whatsapp.disconnected")}</Badge></div>
        </CardContent></Card></Link>)}
      </div>
    </div>
  );
}
function Select({ value, onChange, label, options }: { value: string; onChange: (v: string) => void; label: string; options: string[] }) {
  return <select className="h-10 rounded-md border bg-white px-3 text-sm" value={value} onChange={(e) => onChange(e.target.value)}><option value="">{label}</option>{options.map((x) => <option key={x} value={x}>{x}</option>)}</select>;
}
function Error() { const { t } = useI18n(); return <Card><CardContent className="p-5 text-red-700">{t("common.error")}</CardContent></Card>; }
