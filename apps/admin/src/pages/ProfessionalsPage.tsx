import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Badge, Card, CardContent, Input, Skeleton } from "@iaprafaturar/ui";
import { useI18n } from "@/i18n";
import { supabase } from "@/lib/supabase";

interface ProfessionalRow {
  id: string;
  name: string;
  business_name: string | null;
  email: string;
  plan_type: string;
  whatsapp_connected: boolean;
  onboarding_completed: boolean;
  total_score: number | null;
  health_level: string | null;
  active_clients: number;
  total_sessions: number;
}

async function loadProfessionals(search: string): Promise<ProfessionalRow[]> {
  const { data, error } = await supabase.rpc("get_admin_professionals_rpc", {
    p_limit: 50,
    p_cursor: null,
    p_search: search || null,
    p_health_level: null
  });

  if (error) throw error;
  return (data?.items ?? []) as ProfessionalRow[];
}

export default function ProfessionalsPage() {
  const { t } = useI18n();
  const [search, setSearch] = useState("");
  const query = useQuery({
    queryKey: ["admin-professionals", search],
    queryFn: () => loadProfessionals(search)
  });

  const rows = query.data ?? [];

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-5 px-4 py-5 sm:px-6">
      <div>
        <h1 className="text-2xl font-semibold text-zinc-950">{t("professionals.title")}</h1>
        <p className="mt-1 max-w-2xl text-sm text-zinc-500">{t("professionals.subtitle")}</p>
      </div>

      <Input
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        placeholder={t("professionals.searchPlaceholder")}
      />

      {query.isLoading ? <ListSkeleton /> : null}
      {query.isError ? <Card className="rounded-lg"><CardContent className="p-5 text-sm font-semibold text-red-700">{t("common.error")}</CardContent></Card> : null}
      {!query.isLoading && !query.isError && rows.length === 0 ? (
        <Card className="rounded-lg"><CardContent className="p-5 text-sm text-zinc-500">{t("professionals.empty")}</CardContent></Card>
      ) : null}

      <div className="grid gap-3 lg:grid-cols-2">
        {rows.map((row) => (
          <Card key={row.id} className="rounded-lg">
            <CardContent className="space-y-3 p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="truncate text-sm font-semibold text-zinc-950">{row.business_name || row.name}</h2>
                  <p className="truncate text-xs text-zinc-500">{row.email}</p>
                </div>
                <Badge>{row.plan_type}</Badge>
              </div>
              <div className="flex flex-wrap gap-2 text-xs font-semibold text-zinc-600">
                <Badge variant={row.whatsapp_connected ? "default" : "secondary"}>
                  {row.whatsapp_connected ? t("professionals.whatsapp.connected") : t("professionals.whatsapp.disconnected")}
                </Badge>
                <Badge variant="secondary">{row.health_level ?? "-"}</Badge>
                <Badge variant="secondary">{row.total_score ?? 0}/100</Badge>
                <Badge variant="secondary">{row.active_clients} {t("professionals.clients")}</Badge>
                <Badge variant="secondary">{row.total_sessions} {t("professionals.sessions")}</Badge>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

function ListSkeleton() {
  return (
    <div className="grid gap-3 lg:grid-cols-2">
      {Array.from({ length: 4 }).map((_, index) => (
        <Card key={index} className="rounded-lg">
          <CardContent className="space-y-3 p-4">
            <Skeleton className="h-5 w-48" />
            <Skeleton className="h-4 w-32" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
