import type { JourneyStage } from "@iaprafaturar/domain";
import type { TranslationKey } from "@/i18n";

export const CLIENT_STAGES = [
  { value: null, labelKey: "clients.filter.all" },
  { value: "lead", labelKey: "clients.filter.leads" },
  { value: "agendado", labelKey: "clients.filter.scheduled" },
  { value: "em_tratamento", labelKey: "clients.filter.treatment" },
  { value: "pos_tratamento", labelKey: "clients.filter.postTreatment" },
  { value: "cliente_fiel", labelKey: "clients.filter.loyal" },
  { value: "inativo", labelKey: "clients.filter.inactive" },
] satisfies Array<{ value: JourneyStage | null; labelKey: TranslationKey }>;

export const STAGE_LABEL_KEYS: Record<JourneyStage, TranslationKey> = {
  lead: "stage.lead",
  agendado: "stage.agendado",
  em_tratamento: "stage.em_tratamento",
  pos_tratamento: "stage.pos_tratamento",
  cliente_fiel: "stage.cliente_fiel",
  inativo: "stage.inativo",
};

export function stageTone(stage: JourneyStage) {
  if (stage === "lead") return "bg-sky-50 text-sky-700 border-sky-200";
  if (stage === "agendado") return "bg-amber-50 text-amber-700 border-amber-200";
  if (stage === "em_tratamento") return "bg-emerald-50 text-emerald-700 border-emerald-200";
  if (stage === "pos_tratamento") return "bg-primary-50 text-primary-700 border-primary-200";
  if (stage === "cliente_fiel") return "bg-teal-50 text-teal-700 border-teal-200";
  return "bg-zinc-100 text-zinc-600 border-zinc-200";
}
