import { useState } from "react";
import { Link } from "react-router-dom";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  useDroppable,
  useDraggable,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { Button, Card, CardContent } from "@iaprafaturar/ui";
import type { Client, JourneyStage } from "@iaprafaturar/domain";
import { useI18n, type TranslationKey } from "@/i18n";
import { CLIENT_STAGES } from "@/lib/clientStages";

const PAGE_SIZE = 10;

const KANBAN_STAGES: Array<{ value: JourneyStage; labelKey: TranslationKey }> = CLIENT_STAGES.flatMap(
  (stage) => (stage.value ? [{ value: stage.value, labelKey: stage.labelKey }] : []),
);

interface ClientsKanbanProps {
  clients: Client[];
  onMoveStage: (clientId: string, stage: JourneyStage) => void;
  disabled: boolean;
}

// ── Card arrastável ──────────────────────────────────────────────────────────

function DraggableCard({
  client,
  isDragging = false,
}: {
  client: Client;
  isDragging?: boolean;
}) {
  const { t } = useI18n();
  const { attributes, listeners, setNodeRef, transform } = useDraggable({ id: client.id });

  const style = transform
    ? { transform: CSS.Translate.toString(transform) }
    : undefined;

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      className={isDragging ? "opacity-0" : undefined}
    >
      <Card className="cursor-grab rounded-lg border-zinc-200 bg-white shadow-sm active:cursor-grabbing select-none">
        <CardContent className="p-3">
          <Link
            to={`/clientes/${client.id}`}
            className="block min-w-0"
            onClick={(e) => {
              // impede navegação durante drag
              if (transform) e.preventDefault();
            }}
          >
            <h3 className="truncate text-sm font-semibold text-zinc-950">{client.full_name}</h3>
            <p className="truncate text-xs text-zinc-500">
              {client.phone_whatsapp || client.email || t("common.noContact")}
            </p>
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}

// ── Card fantasma (overlay durante drag) ────────────────────────────────────

function GhostCard({ client }: { client: Client }) {
  const { t } = useI18n();
  return (
    <Card className="w-[260px] rotate-2 cursor-grabbing rounded-lg border-violet-300 bg-white shadow-xl ring-2 ring-violet-300 select-none">
      <CardContent className="p-3">
        <h3 className="truncate text-sm font-semibold text-zinc-950">{client.full_name}</h3>
        <p className="truncate text-xs text-zinc-500">
          {client.phone_whatsapp || client.email || t("common.noContact")}
        </p>
      </CardContent>
    </Card>
  );
}

// ── Coluna droppable ─────────────────────────────────────────────────────────

function KanbanColumn({
  stage,
  labelKey,
  clients,
  isOver,
  visibleCount,
  onLoadMore,
}: {
  stage: JourneyStage;
  labelKey: TranslationKey;
  clients: Client[];
  isOver: boolean;
  visibleCount: number;
  onLoadMore: () => void;
}) {
  const { t } = useI18n();
  const { setNodeRef } = useDroppable({ id: stage });
  const visible = clients.slice(0, visibleCount);
  const hasMore = clients.length > visibleCount;

  return (
    <div
      ref={setNodeRef}
      className={[
        "flex min-h-[120px] min-w-[260px] flex-col gap-2 rounded-lg border p-3 transition-colors",
        isOver
          ? "border-violet-400 bg-violet-50/60"
          : "border-zinc-200 bg-zinc-50/60",
      ].join(" ")}
    >
      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-zinc-950">{t(labelKey)}</h2>
        <span className="rounded-full border border-zinc-200 bg-white px-2 py-0.5 text-xs font-medium text-zinc-500">
          {clients.length}
        </span>
      </div>

      {/* Cards */}
      <div className="flex flex-col gap-2">
        {visible.map((client) => (
          <DraggableCard key={client.id} client={client} />
        ))}

        {clients.length === 0 && (
          <div
            className={[
              "rounded-md border border-dashed p-4 text-center text-xs transition-colors",
              isOver ? "border-violet-300 text-violet-400" : "border-zinc-200 text-zinc-400",
            ].join(" ")}
          >
            {isOver ? "Soltar aqui" : t("clients.kanban.empty")}
          </div>
        )}

        {hasMore && (
          <Button variant="outline" className="w-full text-xs" onClick={onLoadMore}>
            {t("common.loadMore")}
          </Button>
        )}
      </div>
    </div>
  );
}

// ── Kanban principal ─────────────────────────────────────────────────────────

export function ClientsKanban({ clients, onMoveStage, disabled }: ClientsKanbanProps) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const [overStage, setOverStage] = useState<JourneyStage | null>(null);
  const [visibleCounts, setVisibleCounts] = useState<Partial<Record<JourneyStage, number>>>({});

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
  );

  const activeClient = activeId ? clients.find((c) => c.id === activeId) : null;

  function handleDragStart({ active }: DragStartEvent) {
    setActiveId(active.id as string);
  }

  function handleDragOver({ over }: { over: DragEndEvent["over"] }) {
    setOverStage(over ? (over.id as JourneyStage) : null);
  }

  function handleDragEnd({ active, over }: DragEndEvent) {
    setActiveId(null);
    setOverStage(null);

    if (!over || disabled) return;

    const clientId = active.id as string;
    const toStage = over.id as JourneyStage;
    const client = clients.find((c) => c.id === clientId);

    if (client && client.journey_stage !== toStage) {
      onMoveStage(clientId, toStage);
    }
  }

  function handleDragCancel() {
    setActiveId(null);
    setOverStage(null);
  }

  return (
    <DndContext
      sensors={sensors}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
      <div className="flex gap-3 overflow-x-auto pb-3">
        {KANBAN_STAGES.map(({ value: stage, labelKey }) => {
          const stageClients = clients.filter((c) => c.journey_stage === stage);
          const visible = visibleCounts[stage] ?? PAGE_SIZE;

          return (
            <KanbanColumn
              key={stage}
              stage={stage}
              labelKey={labelKey}
              clients={stageClients}
              isOver={overStage === stage}
              visibleCount={visible}
              onLoadMore={() =>
                setVisibleCounts((prev) => ({ ...prev, [stage]: (prev[stage] ?? PAGE_SIZE) + PAGE_SIZE }))
              }
            />
          );
        })}
      </div>

      <DragOverlay dropAnimation={{ duration: 150, easing: "ease" }}>
        {activeClient ? <GhostCard client={activeClient} /> : null}
      </DragOverlay>
    </DndContext>
  );
}
