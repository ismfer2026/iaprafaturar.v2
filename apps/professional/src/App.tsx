import { lazy, Suspense } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Skeleton } from "@iaprafaturar/ui";
import { AuthProvider } from "@/contexts/AuthContext";
import { I18nProvider } from "@/i18n";
import AppShell from "@/components/layout/AppShell";
import ProtectedRoute from "@/components/layout/ProtectedRoute";

const LoginPage = lazy(() => import("@/pages/auth/LoginPage"));
const PublicEntrarPage = lazy(() => import("@/pages/auth/PublicEntrarPage"));
const PublicCreateAccountPage = lazy(() => import("@/pages/auth/PublicCreateAccountPage"));
const OnboardingPage = lazy(() => import("@/pages/OnboardingPage"));
const DashboardPage = lazy(() => import("@/pages/DashboardPage"));
const AgendaPage = lazy(() => import("@/pages/AgendaPage"));
const ConfiguracoesPage = lazy(() => import("@/pages/ConfiguracoesPage"));
const ClientsPage = lazy(() => import("@/pages/ClientsPage"));
const ClientProfilePage = lazy(() => import("@/pages/ClientProfilePage"));
const ServicesPage = lazy(() => import("@/pages/ServicesPage"));
const FinanceiroPage = lazy(() => import("@/pages/FinanceiroPage"));
const ConversasPage = lazy(() => import("@/pages/ConversasPage"));
const DocumentsPackagesPage = lazy(() => import("@/pages/DocumentsPackagesPage"));
const GrowthPage = lazy(() => import("@/pages/GrowthPage"));
const FunilPage = lazy(() => import("@/pages/FunilPage"));
const ReportsPage = lazy(() => import("@/pages/ReportsPage"));
const PlanosPage = lazy(() => import("@/pages/PlanosPage"));
const MorePage = lazy(() => import("@/pages/MorePage"));

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
            <Route path="/criar-conta" element={<PublicCreateAccountPage />} />

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
                <Route path="/financeiro" element={<FinanceiroPage />} />
                <Route path="/conversas" element={<ConversasPage />} />
                <Route path="/funil" element={<FunilPage />} />
                <Route path="/growth" element={<GrowthPage />} />
                <Route path="/relatorios" element={<ReportsPage />} />
                <Route path="/planos" element={<PlanosPage />} />
                <Route path="/documentos-pacotes" element={<DocumentsPackagesPage />} />
                <Route path="/configuracoes" element={<ConfiguracoesPage />} />
                <Route path="/mais" element={<MorePage />} />
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
