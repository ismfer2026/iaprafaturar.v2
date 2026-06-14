import { useState } from "react";
import { Input, Skeleton } from "@iaprafaturar/ui";
import { DataRow, GrowthPageHeader } from "@/components/growth/GrowthShared";
import { useAuth } from "@/contexts/AuthContext";
import { useBirthdays } from "@/hooks/useGrowth";
import { useI18n } from "@/i18n";

export default function BirthdaysPage() {
  const { professionalId } = useAuth();
  const { t } = useI18n();
  const [month, setMonth] = useState<number | null>(new Date().getMonth() + 1);
  const [search, setSearch] = useState("");
  const query = useBirthdays(professionalId, month, search);
  return <main className="mx-auto w-full max-w-5xl space-y-5 px-4 py-5 sm:px-6"><GrowthPageHeader title={t("growth.birthdays.title")} description={t("growth.birthdays.description")} /><div className="grid gap-2 sm:grid-cols-[180px_1fr]"><select className="h-10 rounded-md border border-zinc-200 px-3 text-sm" value={month ?? ""} onChange={(e) => setMonth(e.target.value ? Number(e.target.value) : null)}><option value="">{t("growth.birthdays.allMonths")}</option>{Array.from({ length: 12 }, (_, index) => <option key={index + 1} value={index + 1}>{index + 1}</option>)}</select><Input value={search} placeholder={t("growth.birthdays.search")} onChange={(e) => setSearch(e.target.value)} /></div><section className="space-y-3">{query.isLoading ? <Skeleton className="h-40 w-full" /> : query.data?.map((item) => <DataRow key={item.id} title={item.full_name} subtitle={item.whatsapp_opt_out ? t("growth.birthdays.optOut") : item.phone_whatsapp ?? item.email ?? ""} value={`${item.birth_day}/${item.birth_month}`} />)}</section></main>;
}
