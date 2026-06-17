import { useEffect, useState } from "react";
import { Outlet, NavLink, useLocation } from "react-router-dom";
import { WifiOff } from "lucide-react";
import { cn } from "@iaprafaturar/ui";
import { useI18n } from "@/i18n";
import { professionalRoutes, mobileNavRoutes, NAV_GROUPS, NAV_BOTTOM_PATHS, type ProfessionalRouteDefinition } from "@/routes";
import { LanguageSwitcher } from "./LanguageSwitcher";

function useOnlineStatus() {
  const [isOnline, setIsOnline] = useState(() => navigator.onLine);
  useEffect(() => {
    const online = () => setIsOnline(true);
    const offline = () => setIsOnline(false);
    window.addEventListener("online", online);
    window.addEventListener("offline", offline);
    return () => { window.removeEventListener("online", online); window.removeEventListener("offline", offline); };
  }, []);
  return isOnline;
}

const routeMap = new Map<string, ProfessionalRouteDefinition>(
  professionalRoutes.filter((r) => r.labelKey && r.icon).map((r) => [r.path, r])
);

function NavItem({ route, compact = false }: { route: ProfessionalRouteDefinition; compact?: boolean }) {
  const { t } = useI18n();
  if (!route.labelKey || !route.icon) return null;
  const Icon = route.icon;

  return (
    <NavLink
      to={route.path}
      end={route.path === "/dashboard"}
      className={({ isActive }) =>
        cn(
          "group flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-all duration-150",
          isActive
            ? "bg-emerald-50 text-emerald-800 shadow-[inset_3px_0_0_0] shadow-emerald-600"
            : "text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900",
        )
      }
    >
      {({ isActive }) => (
        <>
          <Icon
            className={cn(
              "h-4 w-4 shrink-0 transition-colors",
              isActive ? "text-emerald-700" : (route.iconColor ?? "text-zinc-400"),
            )}
          />
          {!compact && (
            <span className="truncate">{t(route.labelKey!)}</span>
          )}
        </>
      )}
    </NavLink>
  );
}

function SectionLabel({ label }: { label: string }) {
  return (
    <p className="mb-1 mt-3 px-3 text-[10px] font-semibold uppercase tracking-widest text-zinc-400 first:mt-0">
      {label}
    </p>
  );
}

export default function AppShell() {
  const { t } = useI18n();
  const isOnline = useOnlineStatus();
  const location = useLocation();

  const bottomRoutes = NAV_BOTTOM_PATHS
    .map((p) => routeMap.get(p))
    .filter((r): r is ProfessionalRouteDefinition => Boolean(r));

  return (
    <div className="flex h-screen bg-zinc-50">
      {/* Sidebar desktop */}
      <aside className="hidden w-56 shrink-0 flex-col border-r border-zinc-200 bg-white md:flex">

        {/* Header */}
        <div className="flex items-center justify-between gap-2 border-b border-zinc-100 px-4 py-4">
          <span className="text-base font-bold tracking-tight text-emerald-800">iaprafaturar</span>
          <LanguageSwitcher compact />
        </div>

        {/* Nav scrollável */}
        <nav className="flex-1 overflow-y-auto px-2 py-3 scrollbar-thin">
          {NAV_GROUPS.map((group) => {
            const items = group.paths
              .map((p) => routeMap.get(p))
              .filter((r): r is ProfessionalRouteDefinition => Boolean(r));

            if (items.length === 0) return null;

            return (
              <div key={group.labelKey}>
                <SectionLabel label={group.labelKey} />
                {items.map((route) => (
                  <NavItem key={route.path} route={route} />
                ))}
              </div>
            );
          })}
        </nav>

        {/* Rodapé — utilitários */}
        <div className="border-t border-zinc-100 px-2 py-3">
          {bottomRoutes.map((route) => (
            <NavItem key={route.path} route={route} />
          ))}
        </div>
      </aside>

      {/* Conteúdo principal */}
      <main className="flex flex-1 flex-col overflow-hidden">
        {/* Banner offline */}
        {!isOnline && (
          <div className="flex items-center gap-2 border-b border-amber-200 bg-amber-50 px-4 py-2 text-xs font-medium text-amber-800">
            <WifiOff className="h-3.5 w-3.5 shrink-0" />
            {t("pwa.offline.banner")}
          </div>
        )}

        <div className="flex-1 overflow-y-auto pb-20 md:pb-4">
          <Outlet />
        </div>
      </main>

      {/* Bottom nav mobile */}
      <nav className="fixed inset-x-0 bottom-0 z-40 grid border-t border-zinc-200 bg-white safe-bottom md:hidden"
        style={{ gridTemplateColumns: `repeat(${mobileNavRoutes.length}, 1fr)` }}
      >
        {mobileNavRoutes.map(({ path, icon: Icon, labelKey }) => {
          if (!Icon || !labelKey) return null;
          const isActive = location.pathname === path || (path !== "/mais" && location.pathname.startsWith(path));
          return (
            <NavLink
              key={path}
              to={path}
              className={cn(
                "flex min-w-0 flex-col items-center justify-center gap-1 px-1 py-2 text-[11px] font-medium transition-colors",
                isActive ? "text-emerald-700" : "text-zinc-400",
              )}
            >
              <Icon className={cn("h-5 w-5", isActive ? "text-emerald-600" : "text-zinc-400")} />
              {t(labelKey)}
            </NavLink>
          );
        })}
      </nav>
    </div>
  );
}
