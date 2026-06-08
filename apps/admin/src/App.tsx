import { lazy, Suspense } from "react";
import { BrowserRouter, Navigate, Outlet, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Skeleton } from "@iaprafaturar/ui";
import AdminShell from "@/components/AdminShell";
import { AdminAuthProvider, useAdminAuth } from "@/contexts/AdminAuthContext";
import { I18nProvider, useI18n } from "@/i18n";

const LoginPage = lazy(() => import("@/pages/LoginPage"));
const DashboardPage = lazy(() => import("@/pages/DashboardPage"));
const ProfessionalsPage = lazy(() => import("@/pages/ProfessionalsPage"));
const NexusPage = lazy(() => import("@/pages/NexusPage"));
const BroadcastPage = lazy(() => import("@/pages/BroadcastPage"));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60,
      retry: 1,
      refetchOnWindowFocus: false
    }
  }
});

function PageLoader() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="w-64 space-y-3">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-3/4" />
      </div>
    </div>
  );
}

function AdminRoute() {
  const { session, isMasterAdmin, isLoading } = useAdminAuth();
  const { t } = useI18n();

  if (isLoading) return <PageLoader />;
  if (!session) return <Navigate to="/login" replace />;
  if (!isMasterAdmin) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4">
        <div className="max-w-sm rounded-lg border bg-white p-5 text-center">
          <h1 className="text-base font-semibold text-zinc-950">{t("auth.notAdmin")}</h1>
        </div>
      </div>
    );
  }

  return <Outlet />;
}

function AppRoutes() {
  return (
    <AdminAuthProvider>
      <BrowserRouter>
        <Suspense fallback={<PageLoader />}>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route element={<AdminRoute />}>
              <Route element={<AdminShell />}>
                <Route path="/dashboard" element={<DashboardPage />} />
                <Route path="/profissionais" element={<ProfessionalsPage />} />
                <Route path="/broadcast" element={<BroadcastPage />} />
                <Route path="/nexus" element={<NexusPage />} />
              </Route>
            </Route>
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Routes>
        </Suspense>
      </BrowserRouter>
    </AdminAuthProvider>
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
