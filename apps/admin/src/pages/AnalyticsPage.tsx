import { useState } from "react";
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, Skeleton } from "@iaprafaturar/ui";
import { useAdminAnalytics, useAdminDashboard, useAdminAgents } from "@/hooks/useAdminCore";
import { useI18n } from "@/i18n";

type Tab = "growth" | "financial" | "engagement" | "agents" | "health";

const TABS: { id: Tab; label: string }[] = [
  { id: "growth", label: "Crescimento" },
  { id: "financial", label: "Financeiro" },
  { id: "engagement", label: "Engajamento" },
  { id: "agents", label: "Agentes" },
  { id: "health", label: "Saúde" },
];

function money(value: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}

function trend(rows: Array<Record<string, number | string>>, key: string): { delta: number; direction: "up" | "down" | "flat" } {
  if (rows.length < 2) return { delta: 0, direction: "flat" };
  const last = Number(rows.at(-1)?.[key] ?? 0);
  const prev = Number(rows.at(-2)?.[key] ?? 0);
  const delta = last - prev;
  return { delta, direction: delta > 0 ? "up" : delta < 0 ? "down" : "flat" };
}

function TrendBadge({ delta, direction, format }: { delta: number; direction: string; format?: (v: number) => string }) {
  const label = (format ? format(Math.abs(delta)) : String(Math.abs(delta)));
  if (direction === "flat") return <span className="text-xs text-zinc-400">= {label}</span>;
  return (
    <span className={`text-xs font-medium ${direction === "up" ? "text-emerald-600" : "text-red-600"}`}>
      {direction === "up" ? "▲" : "▼"} {label}
    </span>
  );
}

function StatCard({ label, value, badge }: { label: string; value: string; badge?: React.ReactNode }) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">{label}</p>
        <p className="mt-1 text-2xl font-semibold text-zinc-950">{value}</p>
        {badge ? <div className="mt-1">{badge}</div> : null}
      </CardContent>
    </Card>
  );
}

function AlertBar({ label, value, color }: { label: string; value: number; color: string }) {
  if (!value) return null;
  return (
    <div className={`flex items-center justify-between rounded-lg px-3 py-2 text-sm ${color}`}>
      <span>{label}</span>
      <Badge variant="secondary">{value}</Badge>
    </div>
  );
}

export default function AnalyticsPage() {
  const { t } = useI18n();
  const [tab, setTab] = useState<Tab>("growth");
  const [days, setDays] = useState(90);
  const analytics = useAdminAnalytics(days);
  const dashboard = useAdminDashboard();
  const agentsQuery = useAdminAgents();

  const metrics = analytics.data?.metrics ?? [];
  const last = metrics.at(-1);
  const alerts = (dashboard.data as Record<string, unknown> | undefined)?.alerts as Record<string, number> | undefined;

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-5 px-4 py-5 sm:px-6">
      <header>
        <h1 className="text-2xl font-semibold text-zinc-950">{t("analytics.title")}</h1>
        <p className="text-sm text-zinc-500">{t("analytics.subtitle")}</p>
      </header>

      {/* Period selector */}
      <div className="flex gap-2">
        {[7, 30, 90, 365].map((d) => (
          <Button key={d} size="sm" variant={days === d ? "default" : "outline"} onClick={() => setDays(d)}>
            {d}d
          </Button>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 rounded-xl border border-zinc-200 bg-zinc-50 p-1">
        {TABS.map((t_) => (
          <button
            key={t_.id}
            type="button"
            onClick={() => setTab(t_.id)}
            className={`flex-1 rounded-lg py-1.5 text-xs font-medium transition-colors ${
              tab === t_.id ? "bg-white text-violet-700 shadow-sm" : "text-zinc-500 hover:text-zinc-700"
            }`}
          >
            {t_.label}
          </button>
        ))}
      </div>

      {analytics.isLoading || dashboard.isLoading ? <Skeleton className="h-64" /> : null}
      {analytics.isError ? (
        <Card><CardContent className="p-5 text-red-700">{t("common.error")}</CardContent></Card>
      ) : null}

      {/* ── CRESCIMENTO ── */}
      {tab === "growth" && analytics.data ? (
        <div className="flex flex-col gap-4">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              label="Profissionais ativos"
              value={String(last?.active_professionals ?? 0)}
              badge={<TrendBadge {...trend(metrics, "active_professionals")} />}
            />
            <StatCard
              label="Novos no período"
              value={String(metrics.reduce((s, r) => s + Number(r.new_professionals ?? 0), 0))}
            />
            <StatCard
              label="Churns no período"
              value={String(metrics.reduce((s, r) => s + Number(r.churned_professionals ?? 0), 0))}
            />
            <StatCard
              label="Total cadastrados"
              value={String(last?.total_professionals ?? 0)}
              badge={<TrendBadge {...trend(metrics, "total_professionals")} />}
            />
          </div>
          {alerts ? (
            <Card>
              <CardHeader><CardTitle>Alertas de onboarding</CardTitle></CardHeader>
              <CardContent className="flex flex-col gap-2">
                <AlertBar label="Onboarding pendente" value={alerts.onboarding_pending ?? 0} color="bg-amber-50 text-amber-800" />
                <AlertBar label="WhatsApp desconectado" value={alerts.whatsapp_offline ?? 0} color="bg-orange-50 text-orange-800" />
              </CardContent>
            </Card>
          ) : null}
          <Card>
            <CardHeader><CardTitle>Evolução de profissionais</CardTitle></CardHeader>
            <CardContent className="overflow-x-auto">
              <table className="w-full min-w-[540px] text-left text-sm">
                <thead>
                  <tr className="border-b text-xs text-zinc-500">
                    <th className="p-2">Data</th><th>Total</th><th>Ativos</th><th>Novos</th><th>Churns</th>
                  </tr>
                </thead>
                <tbody>
                  {[...metrics].reverse().slice(0, 30).map((row) => (
                    <tr key={String(row.date)} className="border-b hover:bg-zinc-50">
                      <td className="p-2 text-zinc-500">{String(row.date)}</td>
                      <td>{String(row.total_professionals ?? 0)}</td>
                      <td className="font-medium text-emerald-700">{String(row.active_professionals ?? 0)}</td>
                      <td className="text-violet-700">+{String(row.new_professionals ?? 0)}</td>
                      <td className="text-red-600">{Number(row.churned_professionals ?? 0) > 0 ? `-${row.churned_professionals}` : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </div>
      ) : null}

      {/* ── FINANCEIRO ── */}
      {tab === "financial" && analytics.data ? (
        <div className="flex flex-col gap-4">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            <StatCard
              label="MRR atual"
              value={money(Number(last?.mrr ?? 0))}
              badge={<TrendBadge {...trend(metrics, "mrr")} format={money} />}
            />
            <StatCard
              label="MRR acumulado no período"
              value={money(metrics.reduce((s, r) => s + Number(r.mrr ?? 0), 0) / Math.max(metrics.length, 1))}
            />
            <StatCard
              label="Planos ativos"
              value={String(analytics.data.plans.reduce((s, p) => s + p.professionals, 0))}
            />
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader><CardTitle>{t("analytics.plans")}</CardTitle></CardHeader>
              <CardContent>
                <table className="w-full text-sm">
                  <thead><tr className="border-b text-xs text-zinc-500"><th className="p-2 text-left">Plano</th><th className="text-right">Profissionais</th></tr></thead>
                  <tbody>
                    {analytics.data.plans.map((p) => (
                      <tr key={p.plan} className="border-b">
                        <td className="p-2 font-medium">{p.plan}</td>
                        <td className="p-2 text-right">
                          <Badge variant="secondary">{p.professionals}</Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle>Histórico de MRR</CardTitle></CardHeader>
              <CardContent className="overflow-x-auto">
                <table className="w-full min-w-[300px] text-left text-sm">
                  <thead><tr className="border-b text-xs text-zinc-500"><th className="p-2">Data</th><th>MRR</th></tr></thead>
                  <tbody>
                    {[...metrics].reverse().slice(0, 30).map((row) => (
                      <tr key={String(row.date)} className="border-b hover:bg-zinc-50">
                        <td className="p-2 text-zinc-500">{String(row.date)}</td>
                        <td className="font-medium">{money(Number(row.mrr ?? 0))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          </div>
        </div>
      ) : null}

      {/* ── ENGAJAMENTO ── */}
      {tab === "engagement" && analytics.data ? (
        <div className="flex flex-col gap-4">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              label="Mensagens no período"
              value={String(metrics.reduce((s, r) => s + Number(r.total_messages_sent ?? 0), 0))}
            />
            <StatCard
              label="Méd. mensagens/dia"
              value={String(Math.round(metrics.reduce((s, r) => s + Number(r.total_messages_sent ?? 0), 0) / Math.max(metrics.length, 1)))}
            />
            <StatCard label={t("analytics.aiCredits")} value={String(analytics.data.ai.credits_used)} />
            <StatCard label={t("analytics.aiEvents")} value={String(analytics.data.ai.events)} />
          </div>
          <Card>
            <CardHeader><CardTitle>Mensagens por dia</CardTitle></CardHeader>
            <CardContent className="overflow-x-auto">
              <table className="w-full min-w-[400px] text-left text-sm">
                <thead>
                  <tr className="border-b text-xs text-zinc-500">
                    <th className="p-2">Data</th><th>Mensagens enviadas</th><th>Variação</th>
                  </tr>
                </thead>
                <tbody>
                  {[...metrics].reverse().slice(0, 30).map((row, idx, arr) => {
                    const curr = Number(row.total_messages_sent ?? 0);
                    const prev = Number(arr[idx + 1]?.total_messages_sent ?? curr);
                    const diff = curr - prev;
                    return (
                      <tr key={String(row.date)} className="border-b hover:bg-zinc-50">
                        <td className="p-2 text-zinc-500">{String(row.date)}</td>
                        <td className="font-medium">{curr}</td>
                        <td className={diff > 0 ? "text-emerald-600" : diff < 0 ? "text-red-600" : "text-zinc-400"}>
                          {diff > 0 ? `+${diff}` : diff < 0 ? String(diff) : "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </div>
      ) : null}

      {/* ── AGENTES ── */}
      {tab === "agents" ? (
        <div className="flex flex-col gap-4">
          {analytics.data ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <StatCard label={t("analytics.aiCredits")} value={String(analytics.data.ai.credits_used)} />
              <StatCard label={t("analytics.aiEvents")} value={String(analytics.data.ai.events)} />
            </div>
          ) : null}
          {agentsQuery.isLoading ? <Skeleton className="h-40" /> : null}
          {agentsQuery.data ? (
            <Card>
              <CardHeader><CardTitle>Agentes registrados</CardTitle></CardHeader>
              <CardContent className="overflow-x-auto">
                <table className="w-full min-w-[560px] text-left text-sm">
                  <thead>
                    <tr className="border-b text-xs text-zinc-500">
                      <th className="p-2">Agente</th><th>Status</th><th>Owner</th><th>Versão ativa</th><th>Exec. 30d</th>
                    </tr>
                  </thead>
                  <tbody>
                    {agentsQuery.data.agents.map((agent) => (
                      <tr key={agent.id} className="border-b hover:bg-zinc-50">
                        <td className="p-2">
                          <p className="font-medium">{agent.display_name}</p>
                          <p className="text-xs text-zinc-400">{agent.agent_slug}</p>
                        </td>
                        <td>
                          <Badge variant={agent.status === "active" ? "secondary" : "outline"}>
                            {agent.status}
                          </Badge>
                        </td>
                        <td className="text-zinc-500">{agent.owner}</td>
                        <td>{agent.active_version ?? "—"}</td>
                        <td className="font-medium">{agent.executions_30d}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          ) : null}
        </div>
      ) : null}

      {/* ── SAÚDE ── */}
      {tab === "health" && analytics.data ? (
        <div className="flex flex-col gap-4">
          {alerts ? (
            <Card>
              <CardHeader><CardTitle>Alertas críticos</CardTitle></CardHeader>
              <CardContent className="flex flex-col gap-2">
                <AlertBar label="Saúde crítica" value={alerts.critical_health ?? 0} color="bg-red-50 text-red-800" />
                <AlertBar label="Suspensos" value={alerts.suspended ?? 0} color="bg-red-50 text-red-800" />
                <AlertBar label="Créditos zerados" value={alerts.credits_zero ?? 0} color="bg-amber-50 text-amber-800" />
                <AlertBar label="WhatsApp desconectado" value={alerts.whatsapp_offline ?? 0} color="bg-orange-50 text-orange-800" />
                <AlertBar label="Onboarding pendente" value={alerts.onboarding_pending ?? 0} color="bg-sky-50 text-sky-800" />
              </CardContent>
            </Card>
          ) : null}
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader><CardTitle>{t("dashboard.health")}</CardTitle></CardHeader>
              <CardContent>
                <table className="w-full text-sm">
                  <thead><tr className="border-b text-xs text-zinc-500"><th className="p-2 text-left">Nível</th><th className="text-right">Profissionais</th></tr></thead>
                  <tbody>
                    {analytics.data.health.map((h) => (
                      <tr key={h.level} className="border-b">
                        <td className="p-2">
                          <Badge variant={h.level === "critico" ? "urgent" : h.level === "saudavel" ? "secondary" : "outline"}>
                            {h.level}
                          </Badge>
                        </td>
                        <td className="p-2 text-right font-medium">{h.professionals}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle>Histórico completo</CardTitle></CardHeader>
              <CardContent className="overflow-x-auto">
                <table className="w-full min-w-[480px] text-left text-sm">
                  <thead>
                    <tr className="border-b text-xs text-zinc-500">
                      <th className="p-2">Data</th><th>Ativos</th><th>Mensagens</th><th>MRR</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...metrics].reverse().slice(0, 30).map((row) => (
                      <tr key={String(row.date)} className="border-b hover:bg-zinc-50">
                        <td className="p-2 text-zinc-500">{String(row.date)}</td>
                        <td>{String(row.active_professionals ?? 0)}</td>
                        <td>{String(row.total_messages_sent ?? 0)}</td>
                        <td>{money(Number(row.mrr ?? 0))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          </div>
        </div>
      ) : null}
    </div>
  );
}
