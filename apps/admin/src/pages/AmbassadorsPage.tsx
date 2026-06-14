import { useState } from "react";
import { Badge, Button, Card, CardContent, Input, Skeleton } from "@iaprafaturar/ui";
import { CircleDollarSign, Handshake, Link2, UserPlus } from "lucide-react";
import { useAmbassadorActions, useAmbassadors } from "@/hooks/usePhase24";
import { useI18n } from "@/i18n";

const money = (cents: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);

export default function AmbassadorsPage() {
  const { t } = useI18n();
  const query = useAmbassadors();
  const actions = useAmbassadorActions();
  const [reason, setReason] = useState("phase24_admin_operation");
  const [professionalId, setProfessionalId] = useState("");
  const [code, setCode] = useState("");
  const [reference, setReference] = useState("");

  return <div className="mx-auto flex w-full max-w-6xl flex-col gap-5 px-4 py-5 sm:px-6">
    <header><h1 className="text-2xl font-semibold text-zinc-950">{t("ambassadors.title")}</h1><p className="mt-1 text-sm text-zinc-500">{t("ambassadors.subtitle")}</p></header>
    <div className="grid gap-3 sm:grid-cols-3">
      <Metric icon={Handshake} label={t("ambassadors.active")} value={query.data?.partners.filter((x) => x.status === "active").length ?? 0} />
      <Metric icon={Link2} label={t("ambassadors.referrals")} value={query.data?.partners.reduce((sum, x) => sum + x.referrals, 0) ?? 0} />
      <Metric icon={CircleDollarSign} label={t("ambassadors.pending")} value={money(query.data?.partners.reduce((sum, x) => sum + x.pending_balance_cents, 0) ?? 0)} />
    </div>
    <Card><CardContent className="grid gap-3 p-4 md:grid-cols-[1fr_1fr_1fr_auto]">
      <Input value={professionalId} onChange={(e) => setProfessionalId(e.target.value)} placeholder={t("ambassadors.professionalId")} />
      <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder={t("ambassadors.code")} />
      <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder={t("ambassadors.reason")} />
      <Button disabled={!professionalId || !code || !reason || actions.create.isPending} onClick={() => actions.create.mutate({ professionalId, code, rate: 15, reason })}><UserPlus className="mr-2 h-4 w-4" />{t("ambassadors.create")}</Button>
    </CardContent></Card>
    {query.isLoading ? <Skeleton className="h-40" /> : null}
    {query.isError ? <Error /> : null}
    <section className="grid gap-3 lg:grid-cols-2">{query.data?.partners.map((partner) => <Card key={partner.id}><CardContent className="space-y-3 p-4">
      <div className="flex items-start justify-between gap-3"><div><h2 className="font-semibold">{partner.professional_name}</h2><p className="text-xs text-zinc-500">{partner.affiliate_code} · {partner.business_name ?? partner.professional_id}</p></div><Badge>{partner.status}</Badge></div>
      <div className="grid grid-cols-3 gap-2 text-sm"><Stat label={t("ambassadors.referrals")} value={partner.referrals} /><Stat label={t("ambassadors.paid")} value={partner.paid_referrals} /><Stat label={t("ambassadors.pending")} value={money(partner.pending_balance_cents)} /></div>
      <div className="flex gap-2"><Button size="sm" disabled={!reason || actions.review.isPending} onClick={() => actions.review.mutate({ id: partner.id, decision: "active", reason })}>{t("ambassadors.approve")}</Button><Button size="sm" variant="outline" disabled={!reason || actions.review.isPending} onClick={() => actions.review.mutate({ id: partner.id, decision: "suspended", reason })}>{t("ambassadors.suspend")}</Button></div>
    </CardContent></Card>)}</section>
    <div className="grid gap-3 lg:grid-cols-2">
      <Card><CardContent className="space-y-3 p-4"><h2 className="font-semibold">{t("ambassadors.referrals")}</h2>{query.data?.referrals.map((item) => <div key={item.id} className="flex items-center justify-between gap-3 border-t py-3 text-sm"><div><p className="font-medium">{item.affiliate_code}</p><p className="text-xs text-zinc-500">{item.attribution_code}</p></div><Badge>{item.status}</Badge></div>)}</CardContent></Card>
      <Card><CardContent className="space-y-3 p-4"><h2 className="font-semibold">{t("ambassadors.commissions")}</h2>{query.data?.commissions.map((item) => <div key={item.id} className="flex items-center justify-between gap-3 border-t py-3 text-sm"><div><p className="font-medium">{item.affiliate_code}</p><p className="text-xs text-zinc-500">{item.reference_month}</p></div><div className="text-right"><p className="font-semibold">{money(item.amount_cents)}</p><Badge>{item.status}</Badge></div></div>)}</CardContent></Card>
    </div>
    <Card><CardContent className="space-y-3 p-4"><h2 className="font-semibold">{t("ambassadors.payments")}</h2><Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder={t("ambassadors.pixReference")} />
      {query.data?.payments.map((payment) => <div key={payment.id} className="flex flex-col gap-2 border-t py-3 sm:flex-row sm:items-center sm:justify-between"><div><p className="font-medium">{payment.affiliate_code} · {money(payment.amount_cents)}</p><p className="text-xs text-zinc-500">{payment.reference_month} · {payment.status}</p></div>{payment.status !== "paid" ? <Button size="sm" disabled={!reference || !reason || actions.pay.isPending} onClick={() => actions.pay.mutate({ id: payment.id, reference, reason })}>{t("ambassadors.confirmPix")}</Button> : <Badge variant="success">{t("ambassadors.paid")}</Badge>}</div>)}
    </CardContent></Card>
  </div>;
}
function Metric({ icon: Icon, label, value }: { icon: typeof Handshake; label: string; value: string | number }) { return <Card><CardContent className="p-4"><Icon className="h-4 w-4 text-violet-600" /><p className="mt-3 text-xs font-semibold uppercase text-zinc-500">{label}</p><p className="mt-1 text-2xl font-semibold">{value}</p></CardContent></Card>; }
function Stat({ label, value }: { label: string; value: string | number }) { return <div className="rounded-lg bg-zinc-50 p-2"><p className="text-xs text-zinc-500">{label}</p><p className="font-semibold">{value}</p></div>; }
function Error() { const { t } = useI18n(); return <Card><CardContent className="p-4 text-red-700">{t("common.error")}</CardContent></Card>; }
