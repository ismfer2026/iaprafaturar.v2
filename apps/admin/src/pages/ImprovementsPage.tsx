import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Badge, Button, Card, CardContent, Input } from "@iaprafaturar/ui";
import { useI18n } from "@/i18n";
import { supabase } from "@/lib/supabase";

interface Phase17Dashboard {
  feature_requests: Array<Record<string, unknown> & { id: string; title: string; category: string; status: string; created_at: string }>;
}

async function loadPhase17(): Promise<Phase17Dashboard> {
  const { data, error } = await supabase.rpc("get_admin_phase17_dashboard");
  if (error) throw error;
  return data as Phase17Dashboard;
}

export default function ImprovementsPage() {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: ["admin-phase17"], queryFn: loadPhase17 });
  const [reason, setReason] = useState("planned_by_admin");
  const updateStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await supabase.rpc("admin_update_feature_request_status", {
        p_feature_request_id: id,
        p_status: status,
        p_reason: reason,
      });
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin-phase17"] }),
  });

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-5 px-4 py-5 sm:px-6">
      <header>
        <h1 className="text-2xl font-semibold text-zinc-950">{t("improvements.title")}</h1>
        <p className="mt-1 max-w-2xl text-sm text-zinc-500">{t("improvements.subtitle")}</p>
      </header>
      <Input value={reason} onChange={(event) => setReason(event.target.value)} placeholder={t("improvements.reason")} />
      <section className="grid gap-3 lg:grid-cols-2">
        {query.data?.feature_requests.map((item) => (
          <Card key={item.id} className="rounded-lg">
            <CardContent className="space-y-3 p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-sm font-semibold text-zinc-950">{item.title}</h2>
                  <p className="text-xs text-zinc-500">{item.category}</p>
                </div>
                <Badge>{item.status}</Badge>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <Button size="sm" disabled={updateStatus.isPending} onClick={() => updateStatus.mutate({ id: item.id, status: "planned" })}>{t("improvements.plan")}</Button>
                <Button size="sm" variant="outline" disabled={updateStatus.isPending} onClick={() => updateStatus.mutate({ id: item.id, status: "delivered" })}>{t("improvements.deliver")}</Button>
                <Button size="sm" variant="outline" disabled={updateStatus.isPending || !reason} onClick={() => updateStatus.mutate({ id: item.id, status: "rejected" })}>{t("improvements.reject")}</Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </section>
    </div>
  );
}
