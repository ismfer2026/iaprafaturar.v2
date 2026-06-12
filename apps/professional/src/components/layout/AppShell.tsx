import { Outlet, NavLink } from "react-router-dom";
import { Settings } from "lucide-react";
import { cn } from "@iaprafaturar/ui";
import { useI18n } from "@/i18n";
import { desktopNavRoutes, mobileNavRoutes } from "@/routes";
import { LanguageSwitcher } from "./LanguageSwitcher";

export default function AppShell() {
  const { t } = useI18n();

  return (
    <div className="flex h-screen">
      <aside className="hidden w-56 flex-shrink-0 flex-col border-r border-zinc-200 bg-white md:flex">
        <div className="flex min-h-24 flex-col justify-center gap-3 border-b border-zinc-200 px-4 py-3">
          <span className="text-sm font-semibold text-violet-700">iaprafaturar</span>
          <LanguageSwitcher compact />
        </div>

        <nav className="flex-1 space-y-0.5 overflow-y-auto p-2">
          {desktopNavRoutes.map(({ path, icon: Icon, labelKey }) => Icon && labelKey ? (
            <NavLink
              key={path}
              to={path}
              className={({ isActive }) =>
                cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                  isActive
                    ? "bg-violet-50 text-violet-700"
                    : "text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900",
                )
              }
            >
              <Icon className="h-4 w-4 flex-shrink-0" />
              {t(labelKey)}
            </NavLink>
          ) : null)}
        </nav>

        <div className="border-t border-zinc-200 p-2">
          <NavLink
            to="/configuracoes"
            className={({ isActive }) =>
              cn(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                isActive
                  ? "bg-violet-50 text-violet-700"
                  : "text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900",
              )
            }
          >
            <Settings className="h-4 w-4" />
            {t("nav.settings")}
          </NavLink>
        </div>
      </aside>

      <main className="flex flex-1 flex-col overflow-hidden">
        <div className="flex-1 overflow-y-auto pb-20 md:pb-4">
          <Outlet />
        </div>
      </main>

      <nav className="fixed bottom-0 inset-x-0 z-40 grid grid-cols-5 border-t border-zinc-200 bg-white safe-bottom md:hidden">
        {mobileNavRoutes.map(({ path, icon: Icon, labelKey }) => Icon && labelKey ? (
          <NavLink
            key={path}
            to={path}
            className={({ isActive }) =>
              cn(
                "flex min-w-0 flex-col items-center justify-center gap-1 px-1 py-2 text-[11px] font-medium transition-colors",
                isActive ? "text-violet-700" : "text-zinc-400",
              )
            }
          >
            <Icon className="h-5 w-5" />
              {t(labelKey)}
            </NavLink>
        ) : null)}
      </nav>
    </div>
  );
}
