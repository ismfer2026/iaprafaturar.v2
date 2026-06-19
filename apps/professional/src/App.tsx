import { lazy, Suspense } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Skeleton } from "@iaprafaturar/ui";
import { AuthProvider } from "@/contexts/AuthContext";
import { I18nProvider } from "@/i18n";
import AppShell from "@/components/layout/AppShell";
import ProtectedRoute from "@/components/layout/ProtectedRoute";
import { professionalAliases, professionalRoutes } from "@/routes";

const LoginPage = lazy(() => import("@/pages/auth/LoginPage"));
const PublicEntrarPage = lazy(() => import("@/pages/auth/PublicEntrarPage"));
const PublicInviteLandingPage = lazy(() => import("@/pages/auth/PublicInviteLandingPage"));
const PublicCreateAccountPage = lazy(() => import("@/pages/auth/PublicCreateAccountPage"));
const RecoverPasswordPage = lazy(() => import("@/pages/auth/RecoverPasswordPage"));
const ResetPasswordPage = lazy(() => import("@/pages/auth/ResetPasswordPage"));
const NotFoundPage = lazy(() => import("@/pages/NotFoundPage"));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

function PageLoader() {
  return (
    <div className="flex h-screen items-center justify-center">
      <div className="w-64 space-y-3">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-3/4" />
      </div>
    </div>
  );
}

function AppRoutes() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Suspense fallback={<PageLoader />}>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/entrar" element={<PublicEntrarPage />} />
            <Route path="/cadastro" element={<PublicEntrarPage />} />
            <Route path="/cadastro/:codigo" element={<PublicInviteLandingPage />} />
            <Route path="/convite/:codigo" element={<PublicInviteLandingPage />} />
            <Route path="/criar-conta" element={<PublicCreateAccountPage />} />
            <Route path="/recuperar-senha" element={<RecoverPasswordPage />} />
            <Route path="/reset-password" element={<ResetPasswordPage />} />

            <Route element={<ProtectedRoute />}>
              {professionalRoutes
                .filter((route) => route.path === "/onboarding")
                .map(({ path, component: Component }) => <Route key={path} path={path} element={<Component />} />)}
            </Route>

            <Route element={<ProtectedRoute />}>
              <Route element={<AppShell />}>
                {professionalRoutes
                  .filter((route) => route.path !== "/onboarding")
                  .map(({ path, component: Component }) => <Route key={path} path={path} element={<Component />} />)}
              </Route>
            </Route>

            {professionalAliases.map(({ from, to }) => (
              <Route key={from} path={from} element={<Navigate to={to} replace />} />
            ))}
            <Route path="/" element={<Navigate to="/login" replace />} />
            <Route path="*" element={<NotFoundPage />} />
          </Routes>
        </Suspense>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <I18nProvider>
        <AppRoutes />
      </I18nProvider>
    </QueryClientProvider>
  );
}
