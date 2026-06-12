import { lazy, type ComponentType, type LazyExoticComponent } from "react";
import { BarChart3, Bot, Cpu, CreditCard, Handshake, Lightbulb, Megaphone, Users, type LucideIcon } from "lucide-react";
import type { TranslationKey } from "@/i18n";

type RouteComponent = LazyExoticComponent<ComponentType>;

export interface AdminRouteDefinition {
  path: string;
  component: RouteComponent;
  labelKey: TranslationKey;
  icon: LucideIcon;
  ownerPhase: number;
}

const DashboardPage = lazy(() => import("@/pages/DashboardPage"));
const ProfessionalsPage = lazy(() => import("@/pages/ProfessionalsPage"));
const NexusPage = lazy(() => import("@/pages/NexusPage"));
const BroadcastPage = lazy(() => import("@/pages/BroadcastPage"));
const PlansPage = lazy(() => import("@/pages/PlansPage"));
const AmbassadorsPage = lazy(() => import("@/pages/AmbassadorsPage"));
const AgentsPage = lazy(() => import("@/pages/AgentsPage"));
const ImprovementsPage = lazy(() => import("@/pages/ImprovementsPage"));

export const adminRoutes: AdminRouteDefinition[] = [
  { path: "/dashboard", component: DashboardPage, labelKey: "nav.dashboard", icon: BarChart3, ownerPhase: 9 },
  { path: "/profissionais", component: ProfessionalsPage, labelKey: "nav.professionals", icon: Users, ownerPhase: 23 },
  { path: "/planos", component: PlansPage, labelKey: "nav.plans", icon: CreditCard, ownerPhase: 23 },
  { path: "/embaixadores", component: AmbassadorsPage, labelKey: "nav.ambassadors", icon: Handshake, ownerPhase: 24 },
  { path: "/agentes", component: AgentsPage, labelKey: "nav.agents", icon: Cpu, ownerPhase: 23 },
  { path: "/melhorias", component: ImprovementsPage, labelKey: "nav.improvements", icon: Lightbulb, ownerPhase: 23 },
  { path: "/broadcast", component: BroadcastPage, labelKey: "nav.broadcast", icon: Megaphone, ownerPhase: 24 },
  { path: "/nexus", component: NexusPage, labelKey: "nav.nexus", icon: Bot, ownerPhase: 17 },
];

export const adminAliases = [
  { from: "/afiliados", to: "/embaixadores" },
  { from: "/campanhas", to: "/broadcast" },
  { from: "/notificacoes", to: "/broadcast" },
] as const;
