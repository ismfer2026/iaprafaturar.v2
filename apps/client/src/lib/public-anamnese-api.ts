import type {
  PublicAnamneseErrorOutput,
  PublicAnamneseFormOutput,
  PublicAnamneseSubmitOutput
} from "@iaprafaturar/contracts/edge-functions/anamnese-public-handler";
import type { Locale } from "@/i18n";
import { supabase } from "@/lib/supabase";

export type PublicAnamneseFormResult = PublicAnamneseFormOutput | PublicAnamneseErrorOutput;

export interface SubmitPublicAnamneseInput {
  token: string;
  lang: Locale;
  dadosPessoais: Record<string, unknown>;
  queixas: Record<string, unknown>;
  historico: Record<string, unknown>;
  alergias: Record<string, unknown>;
  habitos: Record<string, unknown>;
  customData: Record<string, unknown>;
}

export async function getPublicAnamneseForm(params: {
  token: string;
  lang: Locale;
}): Promise<PublicAnamneseFormResult> {
  const { data, error } = await supabase.functions.invoke<PublicAnamneseFormResult>("anamnese-public-handler", {
    body: {
      mode: "get_form",
      token: params.token,
      lang: params.lang
    }
  });

  if (error) throw error;
  if (!data) throw new Error("empty_public_anamnese_form");
  return data;
}

export async function submitPublicAnamnese(
  input: SubmitPublicAnamneseInput
): Promise<PublicAnamneseSubmitOutput | PublicAnamneseErrorOutput> {
  const { data, error } = await supabase.functions.invoke<PublicAnamneseSubmitOutput | PublicAnamneseErrorOutput>(
    "anamnese-public-handler",
    {
      body: {
        mode: "submit_form",
        token: input.token,
        dados_pessoais: input.dadosPessoais,
        queixas: input.queixas,
        historico: input.historico,
        alergias: input.alergias,
        habitos: input.habitos,
        custom_data: input.customData,
        lgpd_aceito: true,
        lang: input.lang
      }
    }
  );

  if (error) throw error;
  if (!data) throw new Error("empty_public_anamnese_submit");
  return data;
}
