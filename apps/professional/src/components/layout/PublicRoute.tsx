import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Skeleton } from "@iaprafaturar/ui";

/** Rotas públicas de autenticação (login, cadastro) — se já houver sessão, redireciona para dentro do app. */
export default function PublicRoute() {
  const { session, isLoading, chatOnboardingCompleted } = useAuth();

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="space-y-3 w-64">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-3/4" />
        </div>
      </div>
    );
  }

  if (session) {
    return <Navigate to={chatOnboardingCompleted ? "/dashboard" : "/onboarding"} replace />;
  }

  return <Outlet />;
}
