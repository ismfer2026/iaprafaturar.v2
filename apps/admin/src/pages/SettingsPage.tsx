import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, Input, Skeleton } from "@iaprafaturar/ui";
import { useAdminSettings } from "@/hooks/useAdminCore";
import { useI18n } from "@/i18n";
import { supabase } from "@/lib/supabase";

export default function SettingsPage() {
  const { t } = useI18n();
  const query = useAdminSettings();
  const client = useQueryClient();
  const [reason, setReason] = useState("");
  const mutation = useMutation({ mutationFn: async ({ key, status }: { key: string; status: string }) => { const { error } = await supabase.rpc("phase23_update_admin_setting_status", { p_setting_key: key, p_status: status, p_public_status: {}, p_reason: reason }); if (error) throw error; }, onSuccess: () => client.invalidateQueries({ queryKey: ["admin-settings"] }) });
  return <div className="mx-auto flex w-full max-w-6xl flex-col gap-5 px-4 py-5 sm:px-6"><header><h1 className="text-2xl font-semibold">{t("settings.title")}</h1><p className="text-sm text-zinc-500">{t("settings.subtitle")}</p></header><Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder={t("plans.reason")} />{query.isLoading ? <Skeleton className="h-40" /> : null}{query.isError ? <Card><CardContent className="p-5 text-red-700">{t("common.error")}</CardContent></Card> : null}<div className="grid gap-3 md:grid-cols-2">{query.data?.items.map((item) => <Card key={item.setting_key}><CardHeader><div className="flex items-center justify-between"><CardTitle>{item.setting_key}</CardTitle><Badge variant={item.status === "healthy" ? "success" : "secondary"}>{item.status}</Badge></div></CardHeader><CardContent className="space-y-3"><p className="text-sm text-zinc-500">{item.secret_configured ? t("settings.secretConfigured") : t("settings.secretMissing")}</p><div className="flex flex-wrap gap-2">{["configured","healthy","degraded","offline"].map((status) => <Button size="sm" variant="outline" key={status} disabled={!reason || mutation.isPending} onClick={() => mutation.mutate({ key: item.setting_key, status })}>{status}</Button>)}</div></CardContent></Card>)}</div><Card><CardContent className="p-4 text-sm text-zinc-600">{t("settings.securityNotice")}</CardContent></Card></div>;
}
