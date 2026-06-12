import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Badge, Button, Card, CardContent, Input } from "@iaprafaturar/ui";
import { useI18n } from "@/i18n";
import { supabase } from "@/lib/supabase";

interface Phase17Dashboard {
  ambassadors: Array<Record<string, unknown> & { id: string; professional_id: string; affiliate_code: string; status: string; pending_balance_cents: number }>;
}

async function loadPhase17(): Promise<Phase17Dashboard> {
  const { data, error } = await supabase.rpc("get_admin_phase17_dashboard");
  if (error) throw error;
  return data as Phase17Dashboard;
}

export default function AmbassadorsPage() {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: ["admin-phase17"], queryFn: loadPhase17 });
  const [reason, setReason] = useState("approved_by_admin");
  const review = useMutation({
    mutationFn: async ({ id, decision }: { id: string; decision: "active" | "rejected" | "suspended" }) => {
      const { error } = await supabase.rpc("admin_review_ambassador_request", {
        p_partner_id: id,
        p_decision: decision,
        p_reason: reason,
      });
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin-phase17"] }),
  });

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-5 px-4 py-5 sm:px-6">
      <header>
        <h1 className="text-2xl font-semibold text-zinc-950">{t("ambassadors.title")}</h1>
        <p className="mt-1 max-w-2xl text-sm text-zinc-500">{t("ambassadors.subtitle")}</p>
      </header>
      <Input value={reason} onChange={(event) => setReason(event.target.value)} placeholder={t("ambassadors.reason")} />
      <section className="grid gap-3 lg:grid-cols-2">
        {query.data?.ambassadors.map((partner) => (
          <Card key={partner.id} className="rounded-lg">
            <CardContent className="space-y-3 p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-sm font-semibold text-zinc-950">{partner.affiliate_code}</h2>
                  <p className="text-xs text-zinc-500">{partner.professional_id}</p>
                </div>
                <Badge>{partner.status}</Badge>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Button size="sm" disabled={review.isPending} onClick={() => review.mutate({ id: partner.id, decision: "active" })}>{t("ambassadors.approve")}</Button>
                <Button size="sm" variant="outline" disabled={review.isPending || !reason} onClick={() => review.mutate({ id: partner.id, decision: "suspended" })}>{t("ambassadors.suspend")}</Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </section>
    </div>
  );
}
