import { useParams } from "react-router-dom";
import { Card, CardContent } from "@iaprafaturar/ui";
import { useI18n } from "@/i18n";

export default function PublicIndicacaoPage() {
  const { t } = useI18n();
  const { codigo } = useParams<{ codigo: string }>();

  void codigo;

  return (
    <main className="flex min-h-dvh items-center justify-center bg-[#f7fbf9] px-4">
      <Card className="w-full max-w-sm rounded-lg">
        <CardContent className="space-y-5 p-6 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-teal-100 text-sm font-semibold text-teal-800">
            ia
          </div>
          <div className="space-y-2">
            <h1 className="text-2xl font-semibold text-zinc-950">
              {t("indicacao.title")}
            </h1>
            <p className="text-sm leading-6 text-zinc-600">
              {t("indicacao.description")}
            </p>
          </div>
        </CardContent>
      </Card>
    </main>
  );
}
