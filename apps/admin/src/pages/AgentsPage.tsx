import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, Input, Skeleton } from "@iaprafaturar/ui";
import { useAdminAgents } from "@/hooks/useAdminCore";
import { useI18n } from "@/i18n";
import { supabase } from "@/lib/supabase";

export default function AgentsPage() {
  const { t } = useI18n();
  const query = useAdminAgents();
  const client = useQueryClient();
  const [slug, setSlug] = useState("admin-ai-gateway");
  const [prompt, setPrompt] = useState("");
  const [reason, setReason] = useState("");
  const mutate = useMutation({
    mutationFn: async ({ type, value }: { type: "stage" | "promote" | "pause"; value?: string }) => {
      const result = type === "stage"
        ? await supabase.rpc("phase23_register_agent_prompt_version", { p_agent_slug: slug, p_display_name: slug, p_prompt_body: prompt, p_changelog: reason })
        : type === "promote"
          ? await supabase.rpc("phase23_activate_agent_prompt_version", { p_version_id: value, p_reason: reason })
          : await supabase.rpc("phase23_pause_agent", { p_agent_slug: slug, p_until: new Date(Date.now() + 60 * 60 * 1000).toISOString(), p_reason: reason });
      if (result.error) throw result.error;
    },
    onSuccess: async () => { setPrompt(""); await client.invalidateQueries({ queryKey: ["admin-agents"] }); },
  });
  return <div className="mx-auto flex w-full max-w-6xl flex-col gap-5 px-4 py-5 sm:px-6">
    <header><h1 className="text-2xl font-semibold">{t("agents.title")}</h1><p className="text-sm text-zinc-500">{t("agents.subtitle")}</p></header>
    {query.isLoading ? <Skeleton className="h-40" /> : null}
    {query.isError ? <Card><CardContent className="p-5 text-red-700">{t("common.error")}</CardContent></Card> : null}
    <div className="grid gap-3 lg:grid-cols-2">{query.data?.agents.map((agent) => <Card key={agent.id}><CardContent className="space-y-3 p-4"><div className="flex justify-between"><div><h2 className="font-semibold">{agent.display_name}</h2><p className="text-xs text-zinc-500">{agent.agent_slug}</p></div><Badge>{agent.status}</Badge></div><div className="flex flex-wrap gap-2"><Badge variant="secondary">active v{agent.active_version ?? "-"}</Badge><Badge variant="secondary">{agent.executions_30d} runs/30d</Badge></div><div className="flex flex-wrap gap-2">{agent.versions.map((version: { id: string; version: number; status: string }) => <Button key={version.id} size="sm" variant="outline" disabled={version.status === "active" || mutate.isPending} onClick={() => mutate.mutate({ type: "promote", value: version.id })}>v{version.version} · {version.status}</Button>)}</div></CardContent></Card>)}</div>
    <Card><CardHeader><CardTitle>{t("agents.stagePrompt")}</CardTitle></CardHeader><CardContent className="space-y-3"><Input value={slug} onChange={(e) => setSlug(e.target.value)} placeholder={t("agents.slug")} /><Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder={t("plans.reason")} /><textarea className="min-h-32 w-full rounded-md border px-3 py-2 text-sm" value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder={t("agents.prompt")} /><div className="flex gap-2"><Button disabled={!slug || !prompt || !reason || mutate.isPending} onClick={() => mutate.mutate({ type: "stage" })}>{t("agents.stage")}</Button><Button variant="outline" disabled={!slug || !reason || mutate.isPending} onClick={() => mutate.mutate({ type: "pause" })}>{t("agents.pause")}</Button></div></CardContent></Card>
  </div>;
}
