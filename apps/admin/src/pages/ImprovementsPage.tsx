import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Badge, Button, Card, CardContent, Input, Skeleton } from "@iaprafaturar/ui";
import { useAdminImprovements } from "@/hooks/useAdminCore";
import { useI18n } from "@/i18n";
import { supabase } from "@/lib/supabase";

export default function ImprovementsPage() {
  const { t } = useI18n();
  const query = useAdminImprovements();
  const client = useQueryClient();
  const [reason, setReason] = useState("");
  const [status, setStatus] = useState("");
  const mutation = useMutation({ mutationFn: async ({ id, next }: { id: string; next: string }) => { const { error } = await supabase.rpc("admin_update_feature_request_status", { p_feature_request_id: id, p_status: next, p_reason: reason }); if (error) throw error; }, onSuccess: () => client.invalidateQueries({ queryKey: ["admin-improvements"] }) });
  const items = query.data?.items.filter((item) => !status || item.status === status) ?? [];
  return <div className="mx-auto flex w-full max-w-6xl flex-col gap-5 px-4 py-5 sm:px-6"><header><h1 className="text-2xl font-semibold">{t("improvements.title")}</h1><p className="text-sm text-zinc-500">{t("improvements.subtitle")}</p></header><div className="grid gap-2 sm:grid-cols-2"><Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder={t("improvements.reason")} /><select className="h-10 rounded-md border bg-white px-3 text-sm" value={status} onChange={(e) => setStatus(e.target.value)}><option value="">{t("improvements.all")}</option>{["pending","reviewing","planned","in_progress","delivered","rejected"].map((x) => <option key={x}>{x}</option>)}</select></div>{query.isLoading ? <Skeleton className="h-40" /> : null}{query.isError ? <Card><CardContent className="p-5 text-red-700">{t("common.error")}</CardContent></Card> : null}<div className="grid gap-3 lg:grid-cols-2">{items.map((item) => <Card key={item.id}><CardContent className="space-y-3 p-4"><div className="flex justify-between gap-3"><div><h2 className="font-semibold">{item.title}</h2><p className="text-xs text-zinc-500">{item.professional_name} · {item.category}</p></div><Badge>{item.status}</Badge></div><p className="text-sm text-zinc-600">{item.description}</p><div className="flex gap-2"><Badge variant="secondary">{item.votes} votes</Badge><Badge variant="secondary">{item.comments} comments</Badge></div><div className="flex flex-wrap gap-2">{["reviewing","planned","in_progress","delivered","rejected"].map((next) => <Button key={next} size="sm" variant="outline" disabled={!reason || mutation.isPending || item.status === next} onClick={() => mutation.mutate({ id: item.id, next })}>{next}</Button>)}</div></CardContent></Card>)}</div></div>;
}
