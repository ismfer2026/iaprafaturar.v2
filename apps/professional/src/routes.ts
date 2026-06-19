import { lazy, type ComponentType, type LazyExoticComponent } from "react";
import {
  Activity,
  BarChart3,
  Bot,
  Cake,
  CalendarDays,
  Columns3,
  CreditCard,
  DollarSign,
  FileText,
  Gift,
  Handshake,
  LayoutDashboard,
  Megaphone,
  MessageSquare,
  MoreHorizontal,
  Package,
  Settings,
  TrendingUp,
  Users,
  Wrench,
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
  iconColor?: string;
  desktopNav?: boolean;
  mobileNav?: boolean;
  moreNav?: { descriptionKey: TranslationKey; tone: string };
}

const OnboardingPage         = lazy(() => import("@/pages/OnboardingPage"));
const DashboardPage          = lazy(() => import("@/pages/DashboardPage"));
const AgendaPage             = lazy(() => import("@/pages/AgendaPage"));
const ClientsPage            = lazy(() => import("@/pages/ClientsPage"));
const ClientProfilePage      = lazy(() => import("@/pages/ClientProfilePage"));
const ServicesPage           = lazy(() => import("@/pages/ServicesPage"));
const FinanceiroPage         = lazy(() => import("@/pages/FinanceiroPage"));
const FinanceReconciliationPage = lazy(() => import("@/pages/FinanceReconciliationPage"));
const FinanceSettingsPage    = lazy(() => import("@/pages/FinanceSettingsPage"));
const InventoryPage          = lazy(() => import("@/pages/InventoryPage"));
const ConversasPage          = lazy(() => import("@/pages/ConversasPage"));
const FunilPage              = lazy(() => import("@/pages/FunilPage"));
const GrowthPage             = lazy(() => import("@/pages/GrowthPage"));
const CampaignsPage          = lazy(() => import("@/pages/CampaignsPage"));
const RfmPage                = lazy(() => import("@/pages/RfmPage"));
const RewardsPage            = lazy(() => import("@/pages/RewardsPage"));
const BirthdaysPage          = lazy(() => import("@/pages/BirthdaysPage"));
const PartnersPage           = lazy(() => import("@/pages/PartnersPage"));
const ReportsPage            = lazy(() => import("@/pages/ReportsPage"));
const PlanosPage             = lazy(() => import("@/pages/PlanosPage"));
const DocumentsPackagesPage  = lazy(() => import("@/pages/DocumentsPackagesPage"));
const AgentesPage            = lazy(() => import("@/pages/AgentesPage"));
const ConfiguracoesIndexPage = lazy(() => import("@/pages/ConfiguracoesIndexPage"));
const ConfiguracoesEquipePage      = lazy(() => import("@/pages/ConfiguracoesEquipePage"));
const ConfiguracoesNotificacoesPage = lazy(() => import("@/pages/ConfiguracoesNotificacoesPage"));
const ConfiguracoesAgendaPage      = lazy(() => import("@/pages/ConfiguracoesAgendaPage"));
const ConfiguracoesClinicaPage     = lazy(() => import("@/pages/ConfiguracoesClinicaPage"));
const MorePage               = lazy(() => import("@/pages/MorePage"));
const NotFoundPage           = lazy(() => import("@/pages/NotFoundPage"));

export const professionalRoutes: ProfessionalRouteDefinition[] = [
  { path: "/onboarding", component: OnboardingPage, ownerPhase: 11 },

  // ── OPERAÇÃO ─────────────────────────────────────────────
  {
    path: "/dashboard",
    component: DashboardPage,
    ownerPhase: 3,
    labelKey: "nav.dashboard",
    icon: LayoutDashboard,
    iconColor: "text-violet-500",
    desktopNav: true,
    mobileNav: true,
  },
  {
    path: "/agenda",
    component: AgendaPage,
    ownerPhase: 3,
    labelKey: "nav.agenda",
    icon: CalendarDays,
    iconColor: "text-violet-500",
    desktopNav: true,
    mobileNav: true,
  },
  {
    path: "/clientes",
    component: ClientsPage,
    ownerPhase: 3,
    labelKey: "nav.clients",
    icon: Users,
    iconColor: "text-blue-500",
    desktopNav: true,
    mobileNav: true,
  },
  { path: "/clientes/:id", component: ClientProfilePage, ownerPhase: 3 },
  { path: "/clientes/:id/anamnese", component: ClientProfilePage, ownerPhase: 19 },
  {
    path: "/conversas",
    component: ConversasPage,
    ownerPhase: 5,
    labelKey: "nav.conversations",
    icon: MessageSquare,
    iconColor: "text-sky-500",
    desktopNav: true,
    mobileNav: true,
  },

  // ── NEGÓCIO ──────────────────────────────────────────────
  {
    path: "/financeiro",
    component: FinanceiroPage,
    ownerPhase: 4,
    labelKey: "nav.finance",
    icon: DollarSign,
    iconColor: "text-emerald-500",
    desktopNav: true,
    moreNav: { descriptionKey: "more.finance.description", tone: "bg-emerald-50 text-emerald-700" },
  },
  { path: "/financeiro/conciliacao", component: FinanceReconciliationPage, ownerPhase: 20 },
  { path: "/financeiro/configuracoes", component: FinanceSettingsPage, ownerPhase: 20 },
  {
    path: "/estoque",
    component: InventoryPage,
    ownerPhase: 20,
    labelKey: "nav.inventory",
    icon: Package,
    iconColor: "text-emerald-500",
    desktopNav: true,
    moreNav: { descriptionKey: "more.inventory.description", tone: "bg-amber-50 text-amber-700" },
  },
  {
    path: "/servicos",
    component: ServicesPage,
    ownerPhase: 3,
    labelKey: "nav.services",
    icon: Wrench,
    iconColor: "text-emerald-500",
    desktopNav: true,
    moreNav: { descriptionKey: "more.services.description", tone: "bg-zinc-100 text-zinc-700" },
  },
  { path: "/servicos/novo", component: ServicesPage, ownerPhase: 19 },

  // ── CRESCIMENTO ───────────────────────────────────────────
  {
    path: "/funil",
    component: FunilPage,
    ownerPhase: 19,
    labelKey: "nav.funnel",
    icon: Columns3,
    iconColor: "text-orange-500",
    desktopNav: true,
    moreNav: { descriptionKey: "more.funnel.description", tone: "bg-teal-50 text-teal-700" },
  },
  {
    path: "/growth",
    component: GrowthPage,
    ownerPhase: 21,
    labelKey: "nav.growth",
    icon: TrendingUp,
    iconColor: "text-orange-500",
    desktopNav: true,
    moreNav: { descriptionKey: "more.growth.description", tone: "bg-violet-50 text-violet-700" },
  },
  {
    path: "/campanhas",
    component: CampaignsPage,
    ownerPhase: 21,
    labelKey: "nav.campaigns",
    icon: Megaphone,
    iconColor: "text-orange-500",
    desktopNav: true,
  },
  {
    path: "/recompensas",
    component: RewardsPage,
    ownerPhase: 21,
    labelKey: "nav.rewards",
    icon: Gift,
    iconColor: "text-orange-500",
    desktopNav: true,
  },
  {
    path: "/rfm",
    component: RfmPage,
    ownerPhase: 21,
    labelKey: "nav.rfm",
    icon: Activity,
    iconColor: "text-orange-500",
    desktopNav: true,
  },
  {
    path: "/aniversariantes",
    component: BirthdaysPage,
    ownerPhase: 21,
    labelKey: "nav.birthdays",
    icon: Cake,
    iconColor: "text-orange-500",
    desktopNav: true,
  },
  {
    path: "/parceiros",
    component: PartnersPage,
    ownerPhase: 21,
    labelKey: "nav.partners",
    icon: Handshake,
    iconColor: "text-orange-500",
    desktopNav: true,
  },

  // ── ANÁLISE ───────────────────────────────────────────────
  {
    path: "/relatorios",
    component: ReportsPage,
    ownerPhase: 10,
    labelKey: "nav.reports",
    icon: BarChart3,
    iconColor: "text-blue-500",
    desktopNav: true,
    moreNav: { descriptionKey: "more.reports.description", tone: "bg-blue-50 text-blue-700" },
  },
  {
    path: "/documentos/pacotes",
    component: DocumentsPackagesPage,
    ownerPhase: 19,
    labelKey: "nav.documents",
    icon: FileText,
    iconColor: "text-blue-500",
    desktopNav: true,
    moreNav: { descriptionKey: "more.documents.description", tone: "bg-amber-50 text-amber-700" },
  },
  { path: "/documentos/orcamentos", component: DocumentsPackagesPage, ownerPhase: 19 },
  { path: "/documentos/contratos", component: DocumentsPackagesPage, ownerPhase: 19 },
  { path: "/documentos/anamnese", component: DocumentsPackagesPage, ownerPhase: 19 },

  // ── UTILITÁRIOS (rodapé) ──────────────────────────────────
  {
    path: "/planos",
    component: PlanosPage,
    ownerPhase: 17,
    labelKey: "nav.plans",
    icon: CreditCard,
    iconColor: "text-zinc-400",
    desktopNav: true,
    moreNav: { descriptionKey: "more.plans.description", tone: "bg-indigo-50 text-indigo-700" },
  },
  {
    path: "/agentes",
    component: AgentesPage,
    ownerPhase: 22,
    labelKey: "nav.agents",
    icon: Bot,
    iconColor: "text-zinc-400",
    desktopNav: true,
  },
  {
    path: "/configuracoes",
    component: ConfiguracoesIndexPage,
    ownerPhase: 19,
    labelKey: "nav.settings",
    icon: Settings,
    iconColor: "text-zinc-400",
    desktopNav: true,
    moreNav: { descriptionKey: "more.settings.description", tone: "bg-slate-100 text-slate-700" },
  },
  { path: "/configuracoes/equipe", component: ConfiguracoesEquipePage, ownerPhase: 19 },
  { path: "/configuracoes/notificacoes", component: ConfiguracoesNotificacoesPage, ownerPhase: 19 },
  { path: "/configuracoes/agenda", component: ConfiguracoesAgendaPage, ownerPhase: 19 },
  { path: "/configuracoes/clinica", component: ConfiguracoesClinicaPage, ownerPhase: 19 },

  // ── MOBILE ONLY ───────────────────────────────────────────
  {
    path: "/mais",
    component: MorePage,
    ownerPhase: 10,
    labelKey: "nav.more",
    icon: MoreHorizontal,
    mobileNav: true,
  },

  { path: "*", component: NotFoundPage, ownerPhase: 0 },
];

export type RouteAlias = { from: string; to: string };

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
  { from: "/indicacoes", to: "/recompensas" },
  { from: "/fidelidade", to: "/recompensas" },
  { from: "/produtos", to: "/estoque" },
];

// ── Grupos de navegação desktop ───────────────────────────────
export type NavGroup = {
  labelKey: string;
  paths: string[];
};

export const NAV_GROUPS: NavGroup[] = [
  { labelKey: "OPERAÇÃO",    paths: ["/dashboard", "/agenda", "/clientes", "/conversas"] },
  { labelKey: "NEGÓCIO",     paths: ["/financeiro", "/estoque", "/servicos"] },
  { labelKey: "CRESCIMENTO", paths: ["/funil", "/growth", "/campanhas", "/recompensas", "/rfm", "/aniversariantes", "/parceiros"] },
  { labelKey: "ANÁLISE",     paths: ["/relatorios", "/documentos/pacotes"] },
];

export const NAV_BOTTOM_PATHS = ["/planos", "/agentes", "/configuracoes", "/mais"];

export const desktopNavRoutes = professionalRoutes.filter((r) => r.desktopNav);
export const mobileNavRoutes  = professionalRoutes.filter((r) => r.mobileNav);
export const moreNavRoutes    = professionalRoutes.filter((r) => r.moreNav);
