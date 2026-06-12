import { lazy, type ComponentType, type LazyExoticComponent } from "react";

type RouteComponent = LazyExoticComponent<ComponentType>;

export interface ClientRouteDefinition {
  path: string;
  component: RouteComponent;
  access: "public-slug" | "public-token" | "portal-token";
  ownerPhase: number;
}

const PublicBookingPage = lazy(() => import("@/pages/PublicBookingPage"));
const PublicClientOnboardingPage = lazy(() => import("@/pages/PublicClientOnboardingPage"));
const PublicAnamnesePage = lazy(() => import("@/pages/PublicAnamnesePage"));
const PublicAppointmentActionsPage = lazy(() => import("@/pages/PublicAppointmentActionsPage"));
const PublicPackagePage = lazy(() => import("@/pages/PublicPackagePage"));
const PublicQuotePage = lazy(() => import("@/pages/PublicQuotePage"));
const ClientPortalPage = lazy(() => import("@/pages/ClientPortalPage"));
const PublicChatPage = lazy(() => import("@/pages/PublicChatPage"));

export const clientRoutes: ClientRouteDefinition[] = [
  { path: "/cliente/:slug", component: PublicClientOnboardingPage, access: "public-slug", ownerPhase: 25 },
  { path: "/agendar/:slug", component: PublicBookingPage, access: "public-slug", ownerPhase: 6 },
  { path: "/agendamento/:token", component: PublicAppointmentActionsPage, access: "public-token", ownerPhase: 14 },
  { path: "/anamnese/:token", component: PublicAnamnesePage, access: "public-token", ownerPhase: 6 },
  { path: "/pacote/:slug", component: PublicPackagePage, access: "public-slug", ownerPhase: 14 },
  { path: "/orcamento/:token", component: PublicQuotePage, access: "public-token", ownerPhase: 13 },
  { path: "/chat/:slug", component: PublicChatPage, access: "public-slug", ownerPhase: 16 },
  { path: "/portal/home", component: ClientPortalPage, access: "portal-token", ownerPhase: 25 },
  { path: "/portal/historico", component: ClientPortalPage, access: "portal-token", ownerPhase: 25 },
  { path: "/portal/pacotes", component: ClientPortalPage, access: "portal-token", ownerPhase: 25 },
  { path: "/portal/agendar", component: ClientPortalPage, access: "portal-token", ownerPhase: 25 },
  { path: "/portal/onboarding", component: ClientPortalPage, access: "portal-token", ownerPhase: 25 },
  { path: "/portal/:token", component: ClientPortalPage, access: "portal-token", ownerPhase: 25 },
];
