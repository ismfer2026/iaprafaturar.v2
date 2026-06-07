import { Link } from "react-router-dom";
import { Button, Card, CardContent } from "@iaprafaturar/ui";
import { useI18n } from "@/i18n";

export default function PublicNotFoundPage() {
  const { t } = useI18n();

  return (
    <main className="flex min-h-dvh items-center justify-center bg-[#f7fbf9] px-4">
      <Card className="w-full max-w-sm rounded-lg">
        <CardContent className="space-y-5 p-6 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-teal-100 text-sm font-semibold text-teal-800">
            ia
          </div>
          <div className="space-y-2">
            <h1 className="text-2xl font-semibold text-zinc-950">{t("common.notFound.title")}</h1>
            <p className="text-sm leading-6 text-zinc-600">{t("common.notFound.description")}</p>
          </div>
          <Button asChild className="w-full bg-brand text-white hover:bg-brand/90">
            <Link to="/">{t("common.tryAgain")}</Link>
          </Button>
        </CardContent>
      </Card>
    </main>
  );
}
