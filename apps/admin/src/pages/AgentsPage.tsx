import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, Input } from "@iaprafaturar/ui";
import { useI18n } from "@/i18n";
import { supabase } from "@/lib/supabase";

interface Phase17Dashboard {
  agents: Array<Record<string, unknown> & { id: string; agent_slug: string; display_name: string; status: string }>;
}

async function loadPhase17(): Promise<Phase17Dashboard> {
  const { data, error } = await supabase.rpc("get_admin_phase17_dashboard");
  if (error) throw error;
  return data as Phase17Dashboard;
}

export default function AgentsPage() {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: ["admin-phase17"], queryFn: loadPhase17 });
  const [agentSlug, setAgentSlug] = useState("admin-ai-gateway");
  const [prompt, setPrompt] = useState("");
  const stagePrompt = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc("admin_register_agent_prompt_version", {
        p_agent_slug: agentSlug,
        p_display_name: agentSlug,
        p_prompt_body: prompt,
        p_changelog: "admin_update",
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setPrompt("");
      queryClient.invalidateQueries({ queryKey: ["admin-phase17"] });
    },
  });

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-5 px-4 py-5 sm:px-6">
      <header>
        <h1 className="text-2xl font-semibold text-zinc-950">{t("agents.title")}</h1>
        <p className="mt-1 max-w-2xl text-sm text-zinc-500">{t("agents.subtitle")}</p>
      </header>
      <section className="grid gap-3 lg:grid-cols-[1fr_360px]">
        <div className="space-y-3">
          {query.data?.agents.map((agent) => (
            <Card key={agent.id} className="rounded-lg">
              <CardContent className="flex items-center justify-between gap-3 p-4">
                <div>
                  <h2 className="text-sm font-semibold text-zinc-950">{agent.display_name}</h2>
                  <p className="text-xs text-zinc-500">{agent.agent_slug}</p>
                </div>
                <Badge>{agent.status}</Badge>
              </CardContent>
            </Card>
          ))}
        </div>
        <Card className="rounded-lg">
          <CardHeader><CardTitle>{t("agents.stagePrompt")}</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <Field label={t("agents.slug")} value={agentSlug} onChange={setAgentSlug} />
            <label className="block space-y-1">
              <span className="text-xs font-semibold text-zinc-600">{t("agents.prompt")}</span>
              <textarea className="min-h-32 w-full rounded-md border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-100" value={prompt} onChange={(event) => setPrompt(event.target.value)} />
            </label>
            <Button className="w-full" disabled={!agentSlug || !prompt || stagePrompt.isPending} onClick={() => stagePrompt.mutate()}>{t("agents.stage")}</Button>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return <label className="block space-y-1"><span className="text-xs font-semibold text-zinc-600">{label}</span><Input value={value} onChange={(event) => onChange(event.target.value)} /></label>;
}
