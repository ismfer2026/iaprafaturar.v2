import { useState } from "react";
import { ArrowLeft, Coins, ShieldCheck } from "lucide-react";
import { Link, useParams } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, Input, Skeleton } from "@iaprafaturar/ui";
import { useAdminProfessionalDetail, useSetProfessionalAccess } from "@/hooks/useAdminCore";
import { useI18n } from "@/i18n";
import { supabase } from "@/lib/supabase";

export default function ProfessionalDetailPage() {
  const { id = "" } = useParams();
  const { t } = useI18n();
  const query = useAdminProfessionalDetail(id);
  const client = useQueryClient();
  const [reason, setReason] = useState("");
  const [credits, setCredits] = useState("500");
  const access = useSetProfessionalAccess(id);
  const action = useMutation({
    mutationFn: async (type: "onboarding" | "free" | "credits") => {
      const result = type === "onboarding"
        ? await supabase.rpc("admin_complete_professional_onboarding", { p_professional_id: id, p_reason: reason })
        : type === "free"
          ? await supabase.rpc("admin_grant_free_internal", { p_professional_id: id, p_reason: reason, p_expires_at: null })
          : await supabase.rpc("admin_add_ai_credits", { p_professional_id: id, p_amount: Number(credits), p_reason: reason });
      if (result.error) throw result.error;
    },
    onSuccess: () => client.invalidateQueries({ queryKey: ["admin-professional", id] }),
  });
  const data = query.data;
  if (query.isLoading) return <div className="p-5"><Skeleton className="h-64" /></div>;
  if (query.isError || !data) return <div className="p-5 text-red-700">{t("common.error")}</div>;
  const professional = data.professional as Record<string, unknown>;
  const currentAccess = data.access as Record<string, unknown>;
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-5 px-4 py-5 sm:px-6">
      <Link className="flex items-center gap-2 text-sm font-semibold text-violet-700" to="/profissionais"><ArrowLeft className="h-4 w-4" />{t("professionals.back")}</Link>
      <header><h1 className="text-2xl font-semibold">{String(professional.business_name || professional.name)}</h1><p className="text-sm text-zinc-500">{String(professional.email)}</p></header>
      <div className="grid gap-3 lg:grid-cols-3">
        <Info title={t("professionals.detail.profile")} values={professional} />
        <Info title={t("professionals.detail.access")} values={currentAccess} />
        <Info title={t("professionals.detail.subscription")} values={(data.subscription ?? {}) as Record<string, unknown>} />
      </div>
      <Card><CardHeader><CardTitle>{t("professionals.detail.wallets")}</CardTitle></CardHeader><CardContent className="flex flex-wrap gap-2">{(data.wallets as Array<Record<string, unknown>>).map((w) => <Badge key={String(w.id)} variant="secondary">{String(w.wallet_type)}: {String(w.balance)}</Badge>)}</CardContent></Card>
      <Card><CardHeader><CardTitle>{t("professionals.detail.actions")}</CardTitle></CardHeader><CardContent className="space-y-3">
        <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder={t("plans.reason")} />
        <div className="grid gap-2 sm:grid-cols-3">
          {["full","read_only","suspended"].map((status) => <Button key={status} variant="outline" disabled={!reason || access.isPending} onClick={() => access.mutate({ access: status, reason })}>{status}</Button>)}
        </div>
        <div className="grid gap-2 sm:grid-cols-[1fr_auto_auto_auto]"><Input value={credits} onChange={(e) => setCredits(e.target.value)} /><Button disabled={!reason || action.isPending} onClick={() => action.mutate("credits")}><Coins className="mr-2 h-4 w-4" />{t("plans.addCredits")}</Button><Button variant="outline" disabled={!reason || action.isPending} onClick={() => action.mutate("free")}><ShieldCheck className="mr-2 h-4 w-4" />{t("plans.grantFree")}</Button><Button variant="outline" disabled={!reason || action.isPending} onClick={() => action.mutate("onboarding")}>{t("professionals.onboarding.complete")}</Button></div>
      </CardContent></Card>
    </div>
  );
}
function Info({ title, values }: { title: string; values: Record<string, unknown> }) { return <Card><CardHeader><CardTitle>{title}</CardTitle></CardHeader><CardContent className="space-y-2">{Object.entries(values).map(([k,v]) => <div className="flex justify-between gap-3 text-xs" key={k}><span className="font-semibold text-zinc-500">{k}</span><span className="max-w-[60%] truncate text-right">{v == null ? "-" : String(v)}</span></div>)}</CardContent></Card>; }
