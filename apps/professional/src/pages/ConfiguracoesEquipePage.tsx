import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Pencil, Plus, ShieldCheck, ShieldOff, Trash2, UserCog } from "lucide-react";
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
import type { NivelAcesso, TeamMember } from "@iaprafaturar/domain";
import { useAuth } from "@/contexts/AuthContext";
import { useTeamMembers } from "@/hooks/useTeamMembers";
import { useI18n } from "@/i18n";
import { friendlyErrorMessage } from "@/lib/friendlyError";

interface TeamMemberFormState {
  name: string;
  email: string;
  phoneWhatsapp: string;
  funcao: string;
  comissao: string;
  nivelAcesso: NivelAcesso;
  possuiAgenda: boolean;
}

const EMPTY_FORM: TeamMemberFormState = {
  name: "",
  email: "",
  phoneWhatsapp: "",
  funcao: "",
  comissao: "0",
  nivelAcesso: "operacional",
  possuiAgenda: false,
};

interface PermissionsFormState {
  nivelAcesso: NivelAcesso;
  possuiAgenda: boolean;
}

function mapTeamMemberError(error: unknown, t: ReturnType<typeof useI18n>["t"], fallbackKey: Parameters<ReturnType<typeof useI18n>["t"]>[0]) {
  const message = error instanceof Error ? error.message : "";
  if (message.includes("cannot_deactivate_last_gestor")) {
    return t("team.error.cannotDeactivateLastGestor");
  }
  if (message.includes("cannot_demote_last_gestor")) {
    return t("team.error.cannotDemoteLastGestor");
  }
  return friendlyErrorMessage(error, t, fallbackKey);
}

export default function ConfiguracoesEquipePage() {
  const { t } = useI18n();
  const { professionalId, role } = useAuth();
  const teamQuery = useTeamMembers(professionalId);

  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const [editingMember, setEditingMember] = useState<TeamMember | null>(null);
  const [form, setForm] = useState<TeamMemberFormState>(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);

  const [isPermissionsSheetOpen, setIsPermissionsSheetOpen] = useState(false);
  const [permissionsMember, setPermissionsMember] = useState<TeamMember | null>(null);
  const [permissionsForm, setPermissionsForm] = useState<PermissionsFormState>({
    nivelAcesso: "operacional",
    possuiAgenda: false,
  });
  const [permissionsError, setPermissionsError] = useState<string | null>(null);

  const isGestor = role === "gestor";

  function openCreateSheet() {
    setEditingMember(null);
    setForm(EMPTY_FORM);
    setFormError(null);
    setIsSheetOpen(true);
  }

  function openEditSheet(member: TeamMember) {
    setEditingMember(member);
    setForm({
      name: member.name,
      email: member.email,
      phoneWhatsapp: member.phone_whatsapp ?? "",
      funcao: member.funcao ?? "",
      comissao: String(member.comissao),
      nivelAcesso: member.nivel_acesso,
      possuiAgenda: member.possui_agenda,
    });
    setFormError(null);
    setIsSheetOpen(true);
  }

  function openPermissionsSheet(member: TeamMember) {
    setPermissionsMember(member);
    setPermissionsForm({
      nivelAcesso: member.nivel_acesso,
      possuiAgenda: member.possui_agenda,
    });
    setPermissionsError(null);
    setIsPermissionsSheetOpen(true);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);

    if (!form.name.trim()) {
      setFormError(t("team.error.nameRequired"));
      return;
    }

    if (!form.email.trim()) {
      setFormError(t("team.error.emailRequired"));
      return;
    }

    const comissao = Number(form.comissao);

    try {
      if (editingMember) {
        await teamQuery.updateTeamMember({
          teamMemberId: editingMember.id,
          name: form.name.trim(),
          email: form.email.trim(),
          phoneWhatsapp: form.phoneWhatsapp.trim() || null,
          funcao: form.funcao.trim() || null,
          comissao: Number.isFinite(comissao) ? comissao : null,
        });
      } else {
        await teamQuery.createTeamMember({
          name: form.name.trim(),
          email: form.email.trim(),
          phoneWhatsapp: form.phoneWhatsapp.trim() || null,
          funcao: form.funcao.trim() || null,
          nivelAcesso: form.nivelAcesso,
          possuiAgenda: form.possuiAgenda,
          comissao: Number.isFinite(comissao) ? comissao : 0,
        });
      }

      setIsSheetOpen(false);
    } catch (err) {
      setFormError(mapTeamMemberError(err, t, "team.error.save"));
    }
  }

  async function handleDeactivate(teamMemberId: string) {
    try {
      await teamQuery.deactivateTeamMember(teamMemberId);
    } catch {
      // erro exibido via estado de mutação do React Query
    }
  }

  async function handlePermissionsSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPermissionsError(null);

    if (!permissionsMember) return;

    try {
      await teamQuery.updateTeamMemberPermissions({
        teamMemberId: permissionsMember.id,
        nivelAcesso: permissionsForm.nivelAcesso,
        possuiAgenda: permissionsForm.possuiAgenda,
      });
      setIsPermissionsSheetOpen(false);
    } catch (err) {
      setPermissionsError(mapTeamMemberError(err, t, "team.error.permissions"));
    }
  }

  if (!professionalId) {
    return (
      <div className="space-y-4 p-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }

  if (!isGestor) {
    return (
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-5 px-4 py-5 md:px-6">
        <Button asChild variant="ghost" className="w-fit gap-2 px-0">
          <Link to="/configuracoes">
            <ArrowLeft className="h-4 w-4" />
            {t("team.back")}
          </Link>
        </Button>
        <div className="rounded-lg border border-dashed border-zinc-300 bg-white p-6 text-center">
          <h2 className="text-base font-semibold text-zinc-950">{t("team.blocked.title")}</h2>
          <p className="mt-1 text-sm text-zinc-500">{t("team.blocked.description")}</p>
        </div>
      </div>
    );
  }

  const members = teamQuery.data ?? [];
  const activeMembers = members.filter((member) => member.is_active);
  const inactiveMembers = members.filter((member) => !member.is_active);

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-5 px-4 py-5 md:px-6">
      <header className="space-y-4">
        <Button asChild variant="ghost" className="w-fit gap-2 px-0">
          <Link to="/configuracoes">
            <ArrowLeft className="h-4 w-4" />
            {t("team.back")}
          </Link>
        </Button>

        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-primary-600">{t("team.eyebrow")}</p>
            <h1 className="mt-1 text-3xl font-semibold tracking-tight text-zinc-950">{t("team.title")}</h1>
            <p className="mt-1 text-sm text-zinc-500">{t("team.subtitle")}</p>
          </div>
          <Button className="shrink-0 gap-2" onClick={openCreateSheet}>
            <Plus className="h-4 w-4" />
            {t("common.new")}
          </Button>
        </div>
      </header>

      {teamQuery.isLoading ? (
        <div className="space-y-3">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      ) : null}

      {teamQuery.error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {t("team.error.load")}
        </div>
      ) : null}

      {!teamQuery.isLoading && !teamQuery.error && members.length === 0 ? (
        <div className="rounded-lg border border-dashed border-zinc-300 bg-white p-6 text-center">
          <h2 className="text-base font-semibold text-zinc-950">{t("team.empty.title")}</h2>
          <p className="mt-1 text-sm text-zinc-500">{t("team.empty.description")}</p>
          <Button className="mt-4 gap-2" onClick={openCreateSheet}>
            <Plus className="h-4 w-4" />
            {t("team.new")}
          </Button>
        </div>
      ) : null}

      {members.length > 0 ? (
        <section className="grid gap-3 md:grid-cols-2">
          {[...activeMembers, ...inactiveMembers].map((member) => (
            <Card key={member.id} className="rounded-lg border-zinc-200">
              <CardContent className="space-y-4 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="truncate text-base font-semibold text-zinc-950">{member.name}</h2>
                    <p className="mt-1 truncate text-sm text-zinc-500">{member.funcao || member.email}</p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <Badge variant={member.is_active ? "success" : "secondary"}>
                      {member.is_active ? t("common.active") : t("team.deactivate")}
                    </Badge>
                    <Badge variant={member.nivel_acesso === "gestor" ? "default" : "secondary"}>
                      {member.nivel_acesso === "gestor" ? t("team.role.gestor") : t("team.role.operacional")}
                    </Badge>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <Button variant="outline" className="gap-2" onClick={() => openEditSheet(member)}>
                    <Pencil className="h-4 w-4" />
                    {t("team.editAction")}
                  </Button>
                  <Button variant="outline" className="gap-2" onClick={() => openPermissionsSheet(member)}>
                    <UserCog className="h-4 w-4" />
                    {t("team.permissionsAction")}
                  </Button>
                  {member.is_active ? (
                    <Button
                      variant="outline"
                      className="col-span-2 gap-2 border-red-200 text-red-700 hover:bg-red-50"
                      onClick={() => handleDeactivate(member.id)}
                      disabled={teamQuery.isDeactivatingTeamMember}
                    >
                      <Trash2 className="h-4 w-4" />
                      {t("team.deactivate")}
                    </Button>
                  ) : null}
                </div>
              </CardContent>
            </Card>
          ))}
        </section>
      ) : null}

      <Sheet open={isSheetOpen} onOpenChange={setIsSheetOpen}>
        <SheetContent className="max-h-[88vh] overflow-y-auto">
          <form onSubmit={handleSubmit}>
            <SheetHeader>
              <SheetTitle>{editingMember ? t("team.edit") : t("team.new")}</SheetTitle>
            </SheetHeader>

            <div className="space-y-4 px-4 py-2">
              <label className="block space-y-1.5">
                <span className="text-sm font-medium text-zinc-700">{t("team.form.name")}</span>
                <Input
                  value={form.name}
                  onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                  autoFocus
                />
              </label>

              <label className="block space-y-1.5">
                <span className="text-sm font-medium text-zinc-700">{t("team.form.email")}</span>
                <Input
                  type="email"
                  value={form.email}
                  onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))}
                />
              </label>

              <label className="block space-y-1.5">
                <span className="text-sm font-medium text-zinc-700">{t("team.form.phone")}</span>
                <Input
                  value={form.phoneWhatsapp}
                  onChange={(event) => setForm((current) => ({ ...current, phoneWhatsapp: event.target.value }))}
                  placeholder={t("common.optional")}
                  inputMode="tel"
                />
              </label>

              <label className="block space-y-1.5">
                <span className="text-sm font-medium text-zinc-700">{t("team.form.funcao")}</span>
                <Input
                  value={form.funcao}
                  onChange={(event) => setForm((current) => ({ ...current, funcao: event.target.value }))}
                  placeholder={t("team.form.funcaoPlaceholder")}
                />
              </label>

              <label className="block space-y-1.5">
                <span className="text-sm font-medium text-zinc-700">{t("team.form.comissao")}</span>
                <Input
                  value={form.comissao}
                  onChange={(event) => setForm((current) => ({ ...current, comissao: event.target.value }))}
                  inputMode="decimal"
                />
              </label>

              {!editingMember ? (
                <>
                  <label className="block space-y-1.5">
                    <span className="text-sm font-medium text-zinc-700">{t("team.form.nivelAcesso")}</span>
                    <select
                      className="h-10 w-full rounded-md border border-zinc-200 bg-white px-3 text-sm shadow-sm outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-100"
                      value={form.nivelAcesso}
                      onChange={(event) =>
                        setForm((current) => ({ ...current, nivelAcesso: event.target.value as NivelAcesso }))
                      }
                    >
                      <option value="operacional">{t("team.role.operacional")}</option>
                      <option value="gestor">{t("team.role.gestor")}</option>
                    </select>
                  </label>

                  <label className="flex items-start gap-3 rounded-lg border border-zinc-200 px-3 py-3">
                    <input
                      type="checkbox"
                      className="mt-1 h-4 w-4 rounded border-zinc-300 text-primary-600"
                      checked={form.possuiAgenda}
                      onChange={(event) => setForm((current) => ({ ...current, possuiAgenda: event.target.checked }))}
                    />
                    <span>
                      <span className="block text-sm font-medium text-zinc-900">{t("team.form.possuiAgenda")}</span>
                      <span className="mt-0.5 block text-sm leading-5 text-zinc-500">
                        {t("team.form.possuiAgendaDescription")}
                      </span>
                    </span>
                  </label>
                </>
              ) : null}

              {formError ? (
                <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{formError}</div>
              ) : null}
            </div>

            <SheetFooter>
              <Button type="button" variant="outline" onClick={() => setIsSheetOpen(false)}>
                {t("common.cancel")}
              </Button>
              <Button type="submit" disabled={teamQuery.isCreatingTeamMember || teamQuery.isUpdatingTeamMember}>
                {teamQuery.isCreatingTeamMember || teamQuery.isUpdatingTeamMember
                  ? t("common.saving")
                  : t("common.save")}
              </Button>
            </SheetFooter>
          </form>
        </SheetContent>
      </Sheet>

      <Sheet open={isPermissionsSheetOpen} onOpenChange={setIsPermissionsSheetOpen}>
        <SheetContent className="max-h-[88vh] overflow-y-auto">
          <form onSubmit={handlePermissionsSubmit}>
            <SheetHeader>
              <SheetTitle>{t("team.permissions.title")}</SheetTitle>
            </SheetHeader>

            <div className="space-y-4 px-4 py-2">
              <label className="block space-y-1.5">
                <span className="text-sm font-medium text-zinc-700">{t("team.form.nivelAcesso")}</span>
                <select
                  className="h-10 w-full rounded-md border border-zinc-200 bg-white px-3 text-sm shadow-sm outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-100"
                  value={permissionsForm.nivelAcesso}
                  onChange={(event) =>
                    setPermissionsForm((current) => ({ ...current, nivelAcesso: event.target.value as NivelAcesso }))
                  }
                >
                  <option value="operacional">{t("team.role.operacional")}</option>
                  <option value="gestor">{t("team.role.gestor")}</option>
                </select>
              </label>

              <label className="flex items-start gap-3 rounded-lg border border-zinc-200 px-3 py-3">
                <input
                  type="checkbox"
                  className="mt-1 h-4 w-4 rounded border-zinc-300 text-primary-600"
                  checked={permissionsForm.possuiAgenda}
                  onChange={(event) =>
                    setPermissionsForm((current) => ({ ...current, possuiAgenda: event.target.checked }))
                  }
                />
                <span>
                  <span className="block text-sm font-medium text-zinc-900">{t("team.form.possuiAgenda")}</span>
                  <span className="mt-0.5 block text-sm leading-5 text-zinc-500">
                    {t("team.form.possuiAgendaDescription")}
                  </span>
                </span>
              </label>

              {permissionsForm.nivelAcesso === "gestor" ? (
                <div className="flex items-start gap-2 rounded-lg border border-primary-200 bg-primary-50 px-3 py-2 text-sm text-primary-700">
                  <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
                  {t("team.role.gestor")}
                </div>
              ) : (
                <div className="flex items-start gap-2 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-600">
                  <ShieldOff className="mt-0.5 h-4 w-4 shrink-0" />
                  {t("team.role.operacional")}
                </div>
              )}

              {permissionsError ? (
                <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                  {permissionsError}
                </div>
              ) : null}
            </div>

            <SheetFooter>
              <Button type="button" variant="outline" onClick={() => setIsPermissionsSheetOpen(false)}>
                {t("common.cancel")}
              </Button>
              <Button type="submit" disabled={teamQuery.isUpdatingTeamMemberPermissions}>
                {teamQuery.isUpdatingTeamMemberPermissions ? t("common.saving") : t("common.save")}
              </Button>
            </SheetFooter>
          </form>
        </SheetContent>
      </Sheet>
    </div>
  );
}
