import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Link, useLocation } from "react-router-dom";
import { ArrowLeft, Clock, Pencil, Plus, Trash2 } from "lucide-react";
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
} from "@iaprafaturar/ui";
import type { Service } from "@iaprafaturar/domain";
import { useAuth } from "@/contexts/AuthContext";
import { useServices } from "@/hooks/useServices";
import { useI18n } from "@/i18n";
import { friendlyErrorMessage } from "@/lib/friendlyError";

interface ServiceFormState {
  name: string;
  description: string;
  durationMinutes: string;
  price: string;
  categoryId: string;
  isPublic: boolean;
}

const EMPTY_FORM: ServiceFormState = {
  name: "",
  description: "",
  durationMinutes: "60",
  price: "0",
  categoryId: "",
  isPublic: true,
};

function formatCurrency(value: number, locale: string) {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: "BRL",
  }).format(value);
}

export default function ServicesPage() {
  const { locale, t } = useI18n();
  const { professionalId, role } = useAuth();
  const location = useLocation();
  const servicesQuery = useServices(professionalId);
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const [editingService, setEditingService] = useState<Service | null>(null);
  const [form, setForm] = useState<ServiceFormState>(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);

  const isGestor = role === "gestor";
  const isNewRoute = location.pathname === "/servicos/novo";

  const activeServices = useMemo(() => {
    return (servicesQuery.data?.services ?? []).filter((service) => service.is_active);
  }, [servicesQuery.data?.services]);

  function openCreateSheet() {
    setEditingService(null);
    setForm(EMPTY_FORM);
    setFormError(null);
    setIsSheetOpen(true);
  }

  useEffect(() => {
    if (isNewRoute && isGestor) {
      setEditingService(null);
      setForm(EMPTY_FORM);
      setFormError(null);
      setIsSheetOpen(true);
    }
  }, [isNewRoute, isGestor]);

  function openEditSheet(service: Service) {
    setEditingService(service);
    setForm({
      name: service.name,
      description: service.description ?? "",
      durationMinutes: String(service.duration_minutes),
      price: String(service.price),
      categoryId: service.category_id ?? "",
      isPublic: service.is_public,
    });
    setFormError(null);
    setIsSheetOpen(true);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);

    const durationMinutes = Number(form.durationMinutes);
    const price = Number(form.price);

    if (!form.name.trim()) {
      setFormError(t("services.error.nameRequired"));
      return;
    }

    if (!Number.isFinite(durationMinutes) || durationMinutes <= 0) {
      setFormError(t("services.error.durationInvalid"));
      return;
    }

    if (!Number.isFinite(price) || price < 0) {
      setFormError(t("services.error.priceInvalid"));
      return;
    }

    try {
      if (editingService) {
        await servicesQuery.updateService({
          serviceId: editingService.id,
          name: form.name.trim(),
          description: form.description.trim() || null,
          durationMinutes,
          price,
          categoryId: form.categoryId || null,
          isPublic: form.isPublic,
        });
      } else {
        await servicesQuery.createService({
          name: form.name.trim(),
          description: form.description.trim() || null,
          durationMinutes,
          price,
          categoryId: form.categoryId || null,
        });
      }

      setIsSheetOpen(false);
    } catch (err) {
      setFormError(friendlyErrorMessage(err, t, "services.error.save"));
    }
  }

  async function handleDeactivate(serviceId: string) {
    await servicesQuery.deactivateService(serviceId);
  }

  if (isNewRoute && !isGestor) {
    return (
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-5 px-4 py-5 md:px-6">
        <Button asChild variant="ghost" className="w-fit gap-2 px-0">
          <Link to="/servicos">
            <ArrowLeft className="h-4 w-4" />
            {t("services.back")}
          </Link>
        </Button>
        <div className="rounded-lg border border-dashed border-zinc-300 bg-white p-6 text-center">
          <h2 className="text-base font-semibold text-zinc-950">{t("services.blocked.title")}</h2>
          <p className="mt-1 text-sm text-zinc-500">{t("services.blocked.description")}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-5 px-4 py-5 md:px-6">
      <header className="space-y-4">
        <Button asChild variant="ghost" className="w-fit gap-2 px-0">
          <Link to="/configuracoes">
            <ArrowLeft className="h-4 w-4" />
            {t("services.back")}
          </Link>
        </Button>

        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-primary-600">{t("services.eyebrow")}</p>
            <h1 className="mt-1 text-3xl font-semibold tracking-tight text-zinc-950">{t("services.title")}</h1>
            <p className="mt-1 text-sm text-zinc-500">{t("services.subtitle")}</p>
          </div>
          {isGestor ? (
            <Button className="shrink-0 gap-2" onClick={openCreateSheet}>
              <Plus className="h-4 w-4" />
              {t("common.new")}
            </Button>
          ) : null}
        </div>
      </header>

      {servicesQuery.isLoading ? (
        <div className="space-y-3">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      ) : null}

      {servicesQuery.error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {t("services.error.load")}
        </div>
      ) : null}

      {!servicesQuery.isLoading && !servicesQuery.error && activeServices.length === 0 ? (
        <div className="rounded-lg border border-dashed border-zinc-300 bg-white p-6 text-center">
          <h2 className="text-base font-semibold text-zinc-950">{t("services.empty.title")}</h2>
          <p className="mt-1 text-sm text-zinc-500">{t("services.empty.description")}</p>
          {isGestor ? (
            <Button className="mt-4 gap-2" onClick={openCreateSheet}>
              <Plus className="h-4 w-4" />
              {t("services.new")}
            </Button>
          ) : null}
        </div>
      ) : null}

      {activeServices.length > 0 ? (
        <section className="grid gap-3 md:grid-cols-2">
          {activeServices.map((service) => (
            <Card key={service.id} className="rounded-lg border-zinc-200">
              <CardContent className="space-y-4 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="truncate text-base font-semibold text-zinc-950">{service.name}</h2>
                    <p className="mt-1 line-clamp-2 text-sm text-zinc-500">
                      {service.description || t("services.noDescription")}
                    </p>
                  </div>
                  <Badge className="border border-emerald-200 bg-emerald-50 text-emerald-700">
                    {t("common.active")}
                  </Badge>
                </div>

                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div className="rounded-md bg-zinc-50 px-3 py-2">
                    <p className="font-medium text-zinc-950">{formatCurrency(service.price, locale)}</p>
                    <p className="text-zinc-500">{t("services.value")}</p>
                  </div>
                  <div className="rounded-md bg-zinc-50 px-3 py-2">
                    <p className="flex items-center gap-1 font-medium text-zinc-950">
                      <Clock className="h-3.5 w-3.5" />
                      {service.duration_minutes} {t("common.minutes.short")}
                    </p>
                    <p className="text-zinc-500">{t("services.duration")}</p>
                  </div>
                </div>

                {isGestor ? (
                  <div className="grid grid-cols-2 gap-2">
                    <Button variant="outline" className="gap-2" onClick={() => openEditSheet(service)}>
                      <Pencil className="h-4 w-4" />
                      {t("services.editAction")}
                    </Button>
                    <Button
                      variant="outline"
                      className="gap-2 border-red-200 text-red-700 hover:bg-red-50"
                      onClick={() => handleDeactivate(service.id)}
                      disabled={servicesQuery.isDeactivatingService}
                    >
                      <Trash2 className="h-4 w-4" />
                      {t("services.deactivate")}
                    </Button>
                  </div>
                ) : null}
              </CardContent>
            </Card>
          ))}
        </section>
      ) : null}

      <Sheet open={isSheetOpen} onOpenChange={setIsSheetOpen}>
        <SheetContent className="max-h-[88vh] overflow-y-auto">
          <form onSubmit={handleSubmit}>
            <SheetHeader>
              <SheetTitle>{editingService ? t("services.edit") : t("services.new")}</SheetTitle>
            </SheetHeader>

            <div className="space-y-4 px-4 py-2">
              <label className="block space-y-1.5">
                <span className="text-sm font-medium text-zinc-700">{t("services.form.name")}</span>
                <Input
                  value={form.name}
                  onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                  autoFocus
                  placeholder={t("services.form.namePlaceholder")}
                />
              </label>

              <label className="block space-y-1.5">
                <span className="text-sm font-medium text-zinc-700">{t("services.form.description")}</span>
                <Input
                  value={form.description}
                  onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
                  placeholder={t("common.optional")}
                />
              </label>

              <div className="grid grid-cols-2 gap-3">
                <label className="block space-y-1.5">
                  <span className="text-sm font-medium text-zinc-700">{t("services.duration")}</span>
                  <Input
                    value={form.durationMinutes}
                    onChange={(event) =>
                      setForm((current) => ({ ...current, durationMinutes: event.target.value }))
                    }
                    inputMode="numeric"
                  />
                </label>

                <label className="block space-y-1.5">
                  <span className="text-sm font-medium text-zinc-700">{t("services.value")}</span>
                  <Input
                    value={form.price}
                    onChange={(event) => setForm((current) => ({ ...current, price: event.target.value }))}
                    inputMode="decimal"
                  />
                </label>
              </div>

              {servicesQuery.data?.categories.length ? (
                <label className="block space-y-1.5">
                  <span className="text-sm font-medium text-zinc-700">{t("services.form.category")}</span>
                  <select
                    className="h-10 w-full rounded-md border border-zinc-200 bg-white px-3 text-sm shadow-sm outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-100"
                    value={form.categoryId}
                    onChange={(event) => setForm((current) => ({ ...current, categoryId: event.target.value }))}
                  >
                    <option value="">{t("services.noCategory")}</option>
                    {servicesQuery.data.categories.map((category) => (
                      <option key={category.id} value={category.id}>
                        {category.name}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}

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
              <Button
                type="submit"
                disabled={servicesQuery.isCreatingService || servicesQuery.isUpdatingService}
              >
                {servicesQuery.isCreatingService || servicesQuery.isUpdatingService
                  ? t("common.saving")
                  : t("common.save")}
              </Button>
            </SheetFooter>
          </form>
        </SheetContent>
      </Sheet>
    </div>
  );
}
