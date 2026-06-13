import { useEffect, useState } from "react";
import { ArrowLeft, Building2, Save } from "lucide-react";
import { Link } from "react-router-dom";
import { Button, Input, Skeleton } from "@iaprafaturar/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { useI18n } from "@/i18n";
import { supabase } from "@/lib/supabase";

interface ClinicSettings {
  name: string;
  businessName: string | null;
  email: string;
  phoneWhatsapp: string | null;
  city: string | null;
  neighborhood: string | null;
  fullAddress: string | null;
  bio: string | null;
  instagramHandle: string | null;
}

const EMPTY_FORM = {
  name: "",
  businessName: "",
  phoneWhatsapp: "",
  city: "",
  neighborhood: "",
  fullAddress: "",
  bio: "",
  instagramHandle: "",
};

export default function ConfiguracoesClinicaPage() {
  const { t } = useI18n();
  const { professionalId, role } = useAuth();
  const queryClient = useQueryClient();
  const [form, setForm] = useState(EMPTY_FORM);
  const [saved, setSaved] = useState(false);

  const query = useQuery({
    queryKey: ["clinic-settings", professionalId],
    enabled: Boolean(professionalId && role === "gestor"),
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_professional_clinic_settings");
      if (error) throw error;
      return data as ClinicSettings;
    },
  });

  useEffect(() => {
    if (!query.data) return;
    setForm({
      name: query.data.name,
      businessName: query.data.businessName ?? "",
      phoneWhatsapp: query.data.phoneWhatsapp ?? "",
      city: query.data.city ?? "",
      neighborhood: query.data.neighborhood ?? "",
      fullAddress: query.data.fullAddress ?? "",
      bio: query.data.bio ?? "",
      instagramHandle: query.data.instagramHandle ?? "",
    });
  }, [query.data]);

  const save = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc("upsert_professional_clinic_settings", {
        p_name: form.name,
        p_business_name: form.businessName,
        p_phone_whatsapp: form.phoneWhatsapp,
        p_city: form.city,
        p_neighborhood: form.neighborhood,
        p_full_address: form.fullAddress,
        p_bio: form.bio,
        p_instagram_handle: form.instagramHandle,
      });
      if (error) throw error;
      return data as ClinicSettings;
    },
    onSuccess: async () => {
      setSaved(true);
      await queryClient.invalidateQueries({ queryKey: ["clinic-settings", professionalId] });
    },
  });

  if (!professionalId || query.isLoading) {
    return <div className="space-y-4 p-4"><Skeleton className="h-8 w-48" /><Skeleton className="h-80 w-full" /></div>;
  }

  if (role !== "gestor") {
    return <div className="p-6 text-sm text-zinc-600">{t("team.blocked.description")}</div>;
  }

  const field = (key: keyof typeof form, label: string) => (
    <label className="block space-y-1.5">
      <span className="text-sm font-medium text-zinc-700">{label}</span>
      <Input value={form[key]} onChange={(event) => setForm((current) => ({ ...current, [key]: event.target.value }))} />
    </label>
  );

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-5 px-4 py-5 md:px-6">
      <Button asChild variant="ghost" className="w-fit gap-2 px-0">
        <Link to="/configuracoes"><ArrowLeft className="h-4 w-4" />{t("team.back")}</Link>
      </Button>
      <header>
        <div className="flex items-center gap-3"><Building2 className="h-6 w-6 text-indigo-700" />
          <h1 className="text-2xl font-semibold text-zinc-950">{t("settings.clinic.title")}</h1>
        </div>
        <p className="mt-1 text-sm text-zinc-500">{t("settings.clinic.description")}</p>
      </header>
      <div className="grid gap-4 sm:grid-cols-2">
        {field("name", t("settings.clinic.name"))}
        {field("businessName", t("settings.clinic.businessName"))}
        {field("phoneWhatsapp", t("settings.clinic.phone"))}
        {field("instagramHandle", t("settings.clinic.instagram"))}
        {field("city", t("settings.clinic.city"))}
        {field("neighborhood", t("settings.clinic.neighborhood"))}
        <div className="sm:col-span-2">{field("fullAddress", t("settings.clinic.address"))}</div>
        <label className="block space-y-1.5 sm:col-span-2">
          <span className="text-sm font-medium text-zinc-700">{t("settings.clinic.bio")}</span>
          <textarea className="min-h-28 w-full rounded-md border border-zinc-200 px-3 py-2 text-sm" value={form.bio}
            onChange={(event) => setForm((current) => ({ ...current, bio: event.target.value }))} />
        </label>
      </div>
      <Button className="w-full gap-2" disabled={save.isPending || !form.name.trim()} onClick={() => save.mutate()}>
        <Save className="h-4 w-4" />{save.isPending ? t("common.saving") : t("common.save")}
      </Button>
      {saved ? <p className="text-center text-sm text-emerald-700">{t("settings.clinic.saved")}</p> : null}
    </div>
  );
}
