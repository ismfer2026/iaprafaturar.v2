import { lazy, Suspense } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Skeleton } from "@iaprafaturar/ui";
import { AuthProvider } from "@/contexts/AuthContext";
import { I18nProvider, useI18n } from "@/i18n";
import AppShell from "@/components/layout/AppShell";
import ProtectedRoute from "@/components/layout/ProtectedRoute";

const LoginPage = lazy(() => import("@/pages/auth/LoginPage"));
const CadastroPage = lazy(() => import("@/pages/auth/CadastroPage"));
const OnboardingPage = lazy(() => import("@/pages/OnboardingPage"));
const DashboardPage = lazy(() => import("@/pages/DashboardPage"));
const AgendaPage = lazy(() => import("@/pages/AgendaPage"));
const ConfiguracoesPage = lazy(() => import("@/pages/ConfiguracoesPage"));
const ClientsPage = lazy(() => import("@/pages/ClientsPage"));
const ClientProfilePage = lazy(() => import("@/pages/ClientProfilePage"));
const ServicesPage = lazy(() => import("@/pages/ServicesPage"));

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

function ComingSoon({ labelKey }: { labelKey: "nav.comingSoon.finance" | "nav.comingSoon.conversations" }) {
  const { t } = useI18n();
  return <div className="p-4 text-zinc-400">{t(labelKey)}</div>;
}

function AppRoutes() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Suspense fallback={<PageLoader />}>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/cadastro" element={<CadastroPage />} />

            <Route element={<ProtectedRoute />}>
              <Route path="/onboarding" element={<OnboardingPage />} />
            </Route>

            <Route element={<ProtectedRoute />}>
              <Route element={<AppShell />}>
                <Route path="/dashboard" element={<DashboardPage />} />
                <Route path="/agenda" element={<AgendaPage />} />
                <Route path="/clientes" element={<ClientsPage />} />
                <Route path="/clientes/:id" element={<ClientProfilePage />} />
                <Route path="/servicos" element={<ServicesPage />} />
                <Route path="/financeiro" element={<ComingSoon labelKey="nav.comingSoon.finance" />} />
                <Route path="/conversas" element={<ComingSoon labelKey="nav.comingSoon.conversations" />} />
                <Route path="/configuracoes" element={<ConfiguracoesPage />} />
              </Route>
            </Route>

            <Route path="/" element={<Navigate to="/login" replace />} />
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
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
