import { lazy, type ComponentType, type LazyExoticComponent } from "react";
import {
  BarChart3,
  Box,
  CalendarDays,
  Columns3,
  CreditCard,
  DollarSign,
  FileText,
  LayoutDashboard,
  MessageSquare,
  MoreHorizontal,
  Settings,
  Sparkles,
  TrendingUp,
  Users,
  type LucideIcon,
} from "lucide-react";
import type { TranslationKey } from "@/i18n";

type RouteComponent = LazyExoticComponent<ComponentType>;

export interface ProfessionalRouteDefinition {
  path: string;
  component: RouteComponent;
  ownerPhase: number;
  labelKey?: TranslationKey;
  icon?: LucideIcon;
  desktopNav?: boolean;
  mobileNav?: boolean;
  moreNav?: {
    descriptionKey: TranslationKey;
    tone: string;
  };
}

export interface RouteAlias {
  from: string;
  to: string;
}

const OnboardingPage = lazy(() => import("@/pages/OnboardingPage"));
const DashboardPage = lazy(() => import("@/pages/DashboardPage"));
const AgendaPage = lazy(() => import("@/pages/AgendaPage"));
const ConfiguracoesPage = lazy(() => import("@/pages/ConfiguracoesPage"));
const ConfiguracoesIndexPage = lazy(() => import("@/pages/ConfiguracoesIndexPage"));
const ConfiguracoesEquipePage = lazy(() => import("@/pages/ConfiguracoesEquipePage"));
const ConfiguracoesNotificacoesPage = lazy(() => import("@/pages/ConfiguracoesNotificacoesPage"));
const ConfiguracoesAgendaPage = lazy(() => import("@/pages/ConfiguracoesAgendaPage"));
const ConfiguracoesClinicaPage = lazy(() => import("@/pages/ConfiguracoesClinicaPage"));
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

export const professionalRoutes: ProfessionalRouteDefinition[] = [
  { path: "/onboarding", component: OnboardingPage, ownerPhase: 11 },
  {
    path: "/dashboard",
    component: DashboardPage,
    ownerPhase: 3,
    labelKey: "nav.dashboard",
    icon: LayoutDashboard,
    desktopNav: true,
    mobileNav: true,
  },
  {
    path: "/agenda",
    component: AgendaPage,
    ownerPhase: 3,
    labelKey: "nav.agenda",
    icon: CalendarDays,
    desktopNav: true,
    mobileNav: true,
  },
  {
    path: "/clientes",
    component: ClientsPage,
    ownerPhase: 3,
    labelKey: "nav.clients",
    icon: Users,
    desktopNav: true,
    mobileNav: true,
  },
  { path: "/clientes/:id", component: ClientProfilePage, ownerPhase: 3 },
  { path: "/clientes/:id/anamnese", component: ClientProfilePage, ownerPhase: 19 },
  {
    path: "/servicos",
    component: ServicesPage,
    ownerPhase: 3,
    labelKey: "services.title",
    icon: Box,
    moreNav: { descriptionKey: "more.services.description", tone: "bg-zinc-100 text-zinc-700" },
  },
  { path: "/servicos/novo", component: ServicesPage, ownerPhase: 19 },
  {
    path: "/financeiro",
    component: FinanceiroPage,
    ownerPhase: 4,
    labelKey: "nav.finance",
    icon: DollarSign,
    desktopNav: true,
    moreNav: { descriptionKey: "more.finance.description", tone: "bg-emerald-50 text-emerald-700" },
  },
  { path: "/financeiro/conciliacao", component: FinanceiroPage, ownerPhase: 20 },
  { path: "/financeiro/configuracoes", component: FinanceiroPage, ownerPhase: 20 },
  {
    path: "/conversas",
    component: ConversasPage,
    ownerPhase: 5,
    labelKey: "nav.conversations",
    icon: MessageSquare,
    desktopNav: true,
    mobileNav: true,
  },
  {
    path: "/funil",
    component: FunilPage,
    ownerPhase: 19,
    labelKey: "nav.funnel",
    icon: Columns3,
    desktopNav: true,
    moreNav: { descriptionKey: "more.funnel.description", tone: "bg-teal-50 text-teal-700" },
  },
  {
    path: "/growth",
    component: GrowthPage,
    ownerPhase: 21,
    labelKey: "nav.growth",
    icon: TrendingUp,
    desktopNav: true,
    moreNav: { descriptionKey: "more.growth.description", tone: "bg-violet-50 text-violet-700" },
  },
  { path: "/campanhas", component: GrowthPage, ownerPhase: 21 },
  { path: "/rfm", component: GrowthPage, ownerPhase: 21 },
  { path: "/recompensas", component: GrowthPage, ownerPhase: 21 },
  {
    path: "/relatorios",
    component: ReportsPage,
    ownerPhase: 10,
    labelKey: "nav.reports",
    icon: BarChart3,
    desktopNav: true,
    moreNav: { descriptionKey: "more.reports.description", tone: "bg-blue-50 text-blue-700" },
  },
  {
    path: "/planos",
    component: PlanosPage,
    ownerPhase: 17,
    labelKey: "plans.title",
    icon: CreditCard,
    moreNav: { descriptionKey: "more.plans.description", tone: "bg-indigo-50 text-indigo-700" },
  },
  {
    path: "/documentos/pacotes",
    component: DocumentsPackagesPage,
    ownerPhase: 19,
    labelKey: "docs.title",
    icon: FileText,
    moreNav: { descriptionKey: "more.documents.description", tone: "bg-amber-50 text-amber-700" },
  },
  { path: "/documentos/orcamentos", component: DocumentsPackagesPage, ownerPhase: 19 },
  { path: "/documentos/contratos", component: DocumentsPackagesPage, ownerPhase: 19 },
  { path: "/documentos/anamnese", component: DocumentsPackagesPage, ownerPhase: 19 },
  {
    path: "/agentes",
    component: ConfiguracoesPage,
    ownerPhase: 22,
    labelKey: "nav.settings",
    icon: Sparkles,
  },
  {
    path: "/configuracoes",
    component: ConfiguracoesIndexPage,
    ownerPhase: 19,
    labelKey: "nav.settings",
    icon: Settings,
    moreNav: { descriptionKey: "more.settings.description", tone: "bg-slate-100 text-slate-700" },
  },
  { path: "/configuracoes/equipe", component: ConfiguracoesEquipePage, ownerPhase: 19 },
  { path: "/configuracoes/notificacoes", component: ConfiguracoesNotificacoesPage, ownerPhase: 19 },
  { path: "/configuracoes/agenda", component: ConfiguracoesAgendaPage, ownerPhase: 19 },
  { path: "/configuracoes/clinica", component: ConfiguracoesClinicaPage, ownerPhase: 19 },
  {
    path: "/mais",
    component: MorePage,
    ownerPhase: 10,
    labelKey: "nav.more",
    icon: MoreHorizontal,
    mobileNav: true,
  },
];

export const professionalAliases: RouteAlias[] = [
  { from: "/upgrade", to: "/planos" },
  { from: "/documentos-pacotes", to: "/documentos/pacotes" },
  { from: "/pacotes", to: "/documentos/pacotes" },
  { from: "/orcamentos", to: "/documentos/orcamentos" },
  { from: "/contratos", to: "/documentos/contratos" },
  { from: "/configuracoes/assistente", to: "/agentes" },
  { from: "/configuracoes/pagamento", to: "/financeiro/configuracoes" },
  { from: "/configuracoes/servicos", to: "/servicos" },
  { from: "/configuracoes/anamnese", to: "/documentos/anamnese" },
  { from: "/configuracoes/plano", to: "/planos" },
];

export const desktopNavRoutes = professionalRoutes.filter((route) => route.desktopNav);
export const mobileNavRoutes = professionalRoutes.filter((route) => route.mobileNav);
export const moreNavRoutes = professionalRoutes.filter((route) => route.moreNav);
