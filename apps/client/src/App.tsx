import { Suspense, lazy } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Skeleton } from "@iaprafaturar/ui";
import { I18nProvider } from "@/i18n";

const PublicBookingPage = lazy(() => import("@/pages/PublicBookingPage"));
const PublicAnamnesePage = lazy(() => import("@/pages/PublicAnamnesePage"));
const PublicNotFoundPage = lazy(() => import("@/pages/PublicNotFoundPage"));

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
    <div className="flex min-h-dvh items-center justify-center bg-[#f7fbf9] px-6">
      <div className="w-full max-w-sm space-y-4">
        <Skeleton className="h-12 w-12 rounded-full" />
        <Skeleton className="h-6 w-2/3" />
        <Skeleton className="h-24 w-full rounded-lg" />
      </div>
    </div>
  );
}

function AppRoutes() {
  return (
    <BrowserRouter>
      <Suspense fallback={<PageLoader />}>
        <Routes>
          <Route path="/agendar/:slug" element={<PublicBookingPage />} />
          <Route path="/anamnese/:token" element={<PublicAnamnesePage />} />
          <Route path="/" element={<Navigate to="/agendar/demo" replace />} />
          <Route path="*" element={<PublicNotFoundPage />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
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
