import { useMemo, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { Columns3, List, Plus, Search, Users } from "lucide-react";
import {
  Badge,
  Button,
  Card,
  CardContent,
  Input,
  Sheet,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  Skeleton,
  cn,
} from "@iaprafaturar/ui";
import type { Client, JourneyStage } from "@iaprafaturar/domain";
import { ClientsKanban } from "@/components/clients/ClientsKanban";
import { useAuth } from "@/contexts/AuthContext";
import { useClients } from "@/hooks/useClients";
import { useI18n } from "@/i18n";
import { friendlyErrorMessage } from "@/lib/friendlyError";
import { CLIENT_STAGES, STAGE_LABEL_KEYS, stageTone } from "@/lib/clientStages";

type ClientsView = "list" | "kanban";

function normalizeSearch(value: string) {
  return value.trim().toLowerCase();
}

function ClientCard({
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
    <Card className="rounded-lg border-zinc-200 shadow-sm">
      <CardContent className="space-y-3 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="truncate text-base font-semibold text-zinc-950">{client.full_name}</h2>
            <p className="mt-0.5 truncate text-sm text-zinc-500">
              {client.phone_whatsapp || client.email || t("common.noContact")}
            </p>
          </div>
          <Badge className={cn("shrink-0 border", stageTone(client.journey_stage))}>
            {t(STAGE_LABEL_KEYS[client.journey_stage])}
          </Badge>
        </div>

        <div className="grid grid-cols-[1fr_auto] items-center gap-3">
          <label className="text-xs font-medium uppercase tracking-wide text-zinc-400">
            {t("clients.stageLabel")}
          </label>
          <select
            className="h-9 rounded-md border border-zinc-200 bg-white px-2 text-sm text-zinc-700 shadow-sm outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-100"
            value={client.journey_stage}
            disabled={disabled}
            onChange={(event) => onMoveStage(client.id, event.target.value as JourneyStage)}
          >
            {CLIENT_STAGES.filter((stage) => stage.value).map((stage) => (
              <option key={stage.value} value={stage.value ?? ""}>
                {t(stage.labelKey)}
              </option>
            ))}
          </select>
        </div>

        <Button asChild variant="outline" className="w-full">
          <Link to={`/clientes/${client.id}`}>{t("clients.openProfile")}</Link>
        </Button>
      </CardContent>
    </Card>
  );
}

function ClientsSkeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 4 }).map((_, index) => (
        <Card key={index} className="rounded-lg border-zinc-200">
          <CardContent className="space-y-3 p-4">
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-9 w-full" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export default function ClientsPage() {
  const { t } = useI18n();
  const { professionalId } = useAuth();
  const [stage, setStage] = useState<JourneyStage | null>(null);
  const [view, setView] = useState<ClientsView>("list");
  const [search, setSearch] = useState("");
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const [fullName, setFullName] = useState("");
  const [phoneWhatsapp, setPhoneWhatsapp] = useState("");
  const [email, setEmail] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  const effectiveStage = view === "kanban" ? null : stage;

  const {
    data: clients = [],
    isLoading,
    error,
    createClient,
    isCreatingClient,
    moveStage,
    isMovingStage,
  } = useClients(professionalId, effectiveStage);

  const filteredClients = useMemo(() => {
    const needle = normalizeSearch(search);
    if (!needle) return clients;

    return clients.filter((client) =>
      [client.full_name, client.phone_whatsapp, client.email]
        .filter(Boolean)
        .some((value) => value!.toLowerCase().includes(needle)),
    );
  }, [clients, search]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);

    if (!fullName.trim()) {
      setFormError(t("clients.error.nameRequired"));
      return;
    }

    try {
      await createClient({
        fullName: fullName.trim(),
        phoneWhatsapp: phoneWhatsapp.trim() || null,
        email: email.trim() || null,
        journeyStage: "lead",
        source: "manual",
      });

      setFullName("");
      setPhoneWhatsapp("");
      setEmail("");
      setIsSheetOpen(false);
    } catch (err) {
      setFormError(friendlyErrorMessage(err, t, "clients.error.create"));
    }
  }

  async function handleMoveStage(clientId: string, toStage: JourneyStage) {
    await moveStage({ clientId, toStage });
  }

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-5 px-4 py-5 md:px-6">
      <header className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-primary-600">{t("clients.eyebrow")}</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight text-zinc-950">{t("clients.title")}</h1>
          <p className="mt-1 text-sm text-zinc-500">{t("clients.subtitle")}</p>
        </div>

        <Button className="shrink-0 gap-2" onClick={() => setIsSheetOpen(true)}>
          <Plus className="h-4 w-4" />
          {t("common.new")}
        </Button>
      </header>

      <div className="hidden items-center gap-1 rounded-lg bg-zinc-100 p-1 md:flex md:w-fit">
        <button
          type="button"
          onClick={() => setView("list")}
          className={cn(
            "flex h-9 items-center gap-2 rounded-md px-3 text-sm font-medium transition-colors",
            view === "list" ? "bg-white text-zinc-950 shadow-sm" : "text-zinc-500",
          )}
        >
          <List className="h-4 w-4" />
          {t("clients.view.list")}
        </button>
        <button
          type="button"
          onClick={() => setView("kanban")}
          className={cn(
            "flex h-9 items-center gap-2 rounded-md px-3 text-sm font-medium transition-colors",
            view === "kanban" ? "bg-white text-zinc-950 shadow-sm" : "text-zinc-500",
          )}
        >
          <Columns3 className="h-4 w-4" />
          {t("clients.view.kanban")}
        </button>
      </div>

      <div className={cn("flex gap-2 overflow-x-auto pb-1", view === "kanban" && "md:hidden")}>
        {CLIENT_STAGES.map((item) => {
          const isActive = stage === item.value;
          return (
            <button
              key={item.labelKey}
              type="button"
              onClick={() => setStage(item.value)}
              className={cn(
                "h-9 shrink-0 rounded-full border px-4 text-sm font-medium transition-colors",
                isActive
                  ? "border-primary-600 bg-primary-600 text-white shadow-sm"
                  : "border-zinc-200 bg-white text-zinc-600 hover:border-zinc-300",
              )}
            >
              {t(item.labelKey)}
            </button>
          );
        })}
      </div>

      <div className={cn("relative", view === "kanban" && "md:hidden")}>
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
        <Input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          className="h-11 pl-9"
          placeholder={t("clients.searchPlaceholder")}
        />
      </div>

      {isLoading ? <ClientsSkeleton /> : null}

      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {t("clients.error.load")}
        </div>
      ) : null}

      {!isLoading && !error && filteredClients.length === 0 ? (
        <div className={cn("rounded-lg border border-dashed border-zinc-300 bg-white p-6 text-center", view === "kanban" && "md:hidden")}>
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary-50 text-primary-700">
            <Users className="h-5 w-5" />
          </div>
          <h2 className="mt-4 text-base font-semibold text-zinc-950">{t("clients.empty.title")}</h2>
          <p className="mt-1 text-sm text-zinc-500">{t("clients.empty.description")}</p>
          <Button className="mt-4 gap-2" onClick={() => setIsSheetOpen(true)}>
            <Plus className="h-4 w-4" />
            {t("clients.new")}
          </Button>
        </div>
      ) : null}

      {!isLoading && !error && filteredClients.length > 0 ? (
        <section className={cn("space-y-3", view === "kanban" && "md:hidden")}>
          {filteredClients.map((client) => (
            <ClientCard
              key={client.id}
              client={client}
              disabled={isMovingStage}
              onMoveStage={handleMoveStage}
            />
          ))}
        </section>
      ) : null}

      {!isLoading && !error && view === "kanban" ? (
        <section className="hidden md:block">
          <ClientsKanban clients={clients} onMoveStage={handleMoveStage} disabled={isMovingStage} />
        </section>
      ) : null}

      <Sheet open={isSheetOpen} onOpenChange={setIsSheetOpen}>
        <SheetContent className="max-h-[88vh] overflow-y-auto">
          <form onSubmit={handleSubmit}>
            <SheetHeader>
              <SheetTitle>{t("clients.new")}</SheetTitle>
            </SheetHeader>

            <div className="space-y-4 px-4 py-2">
              <label className="block space-y-1.5">
                <span className="text-sm font-medium text-zinc-700">{t("clients.form.name")}</span>
                <Input
                  value={fullName}
                  onChange={(event) => setFullName(event.target.value)}
                  autoFocus
                  placeholder={t("clients.form.namePlaceholder")}
                />
              </label>

              <label className="block space-y-1.5">
                <span className="text-sm font-medium text-zinc-700">{t("clients.form.whatsapp")}</span>
                <Input
                  value={phoneWhatsapp}
                  onChange={(event) => setPhoneWhatsapp(event.target.value)}
                  inputMode="tel"
                  placeholder="5511999999999"
                />
              </label>

              <label className="block space-y-1.5">
                <span className="text-sm font-medium text-zinc-700">{t("clients.form.email")}</span>
                <Input
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  inputMode="email"
                  placeholder={t("clients.form.emailPlaceholder")}
                />
              </label>

              {formError ? (
                <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                  {formError}
                </div>
              ) : null}
            </div>

            <SheetFooter>
              <Button type="button" variant="outline" onClick={() => setIsSheetOpen(false)}>
                {t("common.cancel")}
              </Button>
              <Button type="submit" disabled={isCreatingClient}>
                {isCreatingClient ? t("common.saving") : t("clients.form.save")}
              </Button>
            </SheetFooter>
          </form>
        </SheetContent>
      </Sheet>
    </div>
  );
}
