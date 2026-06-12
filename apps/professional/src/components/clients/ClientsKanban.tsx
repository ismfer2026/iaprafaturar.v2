import { useState } from "react";
import { Link } from "react-router-dom";
import { Button, Card, CardContent } from "@iaprafaturar/ui";
import type { Client, JourneyStage } from "@iaprafaturar/domain";
import { useI18n, type TranslationKey } from "@/i18n";
import { CLIENT_STAGES } from "@/lib/clientStages";

const PAGE_SIZE = 6;

const KANBAN_STAGES: Array<{ value: JourneyStage; labelKey: TranslationKey }> = CLIENT_STAGES.flatMap((stage) =>
  stage.value ? [{ value: stage.value, labelKey: stage.labelKey }] : [],
);

interface ClientsKanbanProps {
  clients: Client[];
  onMoveStage: (clientId: string, stage: JourneyStage) => void;
  disabled: boolean;
}

export function ClientsKanban({ clients, onMoveStage, disabled }: ClientsKanbanProps) {
  const { t } = useI18n();
  const [visibleCounts, setVisibleCounts] = useState<Partial<Record<JourneyStage, number>>>({});

  return (
    <div className="flex gap-3 overflow-x-auto pb-2">
      {KANBAN_STAGES.map(({ value: stage, labelKey }) => {
        const items = clients.filter((client) => client.journey_stage === stage);
        const visibleCount = visibleCounts[stage] ?? PAGE_SIZE;
        const visibleItems = items.slice(0, visibleCount);
        const hasMore = items.length > visibleCount;

        return (
          <div
            key={stage}
            className="flex min-w-[260px] flex-col gap-3 rounded-lg border border-zinc-200 bg-zinc-50/60 p-3"
          >
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm font-semibold text-zinc-950">{t(labelKey)}</h2>
              <span className="rounded-full border border-zinc-200 bg-white px-2 py-0.5 text-xs font-medium text-zinc-500">
                {items.length}
              </span>
            </div>

            <div className="flex flex-col gap-2">
              {visibleItems.map((client) => (
                <ClientKanbanCard key={client.id} client={client} onMoveStage={onMoveStage} disabled={disabled} />
              ))}

              {items.length === 0 ? (
                <p className="rounded-md border border-dashed border-zinc-200 bg-white p-3 text-center text-xs text-zinc-400">
                  {t("clients.kanban.empty")}
                </p>
              ) : null}

              {hasMore ? (
                <Button
                  type="button"
                  variant="outline"
                  className="w-full"
                  onClick={() =>
                    setVisibleCounts((current) => ({
                      ...current,
                      [stage]: (current[stage] ?? PAGE_SIZE) + PAGE_SIZE,
                    }))
                  }
                >
                  {t("common.loadMore")}
                </Button>
              ) : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ClientKanbanCard({
  client,
  onMoveStage,
  disabled,
}: {
  client: Client;
  onMoveStage: (clientId: string, stage: JourneyStage) => void;
  disabled: boolean;
}) {
  const { t } = useI18n();

  return (
    <Card className="rounded-lg border-zinc-200 bg-white shadow-sm">
      <CardContent className="space-y-2 p-3">
        <Link to={`/clientes/${client.id}`} className="block min-w-0">
          <h3 className="truncate text-sm font-semibold text-zinc-950">{client.full_name}</h3>
          <p className="truncate text-xs text-zinc-500">
            {client.phone_whatsapp || client.email || t("common.noContact")}
          </p>
        </Link>

        <label className="sr-only" htmlFor={`kanban-move-${client.id}`}>
          {t("clients.kanban.moveTo")}
        </label>
        <select
          id={`kanban-move-${client.id}`}
          className="h-9 w-full rounded-md border border-zinc-200 bg-white px-2 text-xs text-zinc-700 shadow-sm outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-100"
          value={client.journey_stage}
          disabled={disabled}
          onChange={(event) => onMoveStage(client.id, event.target.value as JourneyStage)}
        >
          {KANBAN_STAGES.map(({ value, labelKey }) => (
            <option key={value} value={value}>
              {t(labelKey)}
            </option>
          ))}
        </select>
      </CardContent>
    </Card>
  );
}
