import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { Button } from "@iaprafaturar/ui";

export default function NotFoundPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-zinc-50 px-4">
      <div className="w-full max-w-md text-center">
        <p className="text-sm font-semibold text-violet-700">404</p>
        <h1 className="mt-2 text-2xl font-semibold text-zinc-950">Pagina admin nao encontrada</h1>
        <p className="mt-2 text-sm leading-6 text-zinc-500">A rota nao existe ou nao pertence ao painel administrativo.</p>
        <Button asChild className="mt-6">
          <Link to="/dashboard">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Voltar ao dashboard
          </Link>
        </Button>
      </div>
    </main>
  );
}
