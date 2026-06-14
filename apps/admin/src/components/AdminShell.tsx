import { LogOut } from "lucide-react";
import { NavLink, Outlet } from "react-router-dom";
import { Button, cn } from "@iaprafaturar/ui";
import { useAdminAuth } from "@/contexts/AdminAuthContext";
import { useI18n } from "@/i18n";
import { adminRoutes } from "@/routes";

export default function AdminShell() {
  const { signOut } = useAdminAuth();
  const { t } = useI18n();

  return (
    <div className="min-h-screen bg-zinc-50">
      <aside className="fixed inset-y-0 left-0 z-20 hidden w-64 border-r bg-white px-4 py-5 lg:block">
        <div className="text-lg font-semibold text-zinc-950">iaprafaturar</div>
        <div className="mt-1 text-xs font-semibold uppercase text-violet-700">Admin</div>
        <nav className="mt-8 space-y-1">
          {adminRoutes.filter((item) => !item.path.includes(":")).map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              className={({ isActive }) => cn(
                "flex h-10 items-center gap-3 rounded-lg px-3 text-sm font-semibold",
                isActive ? "bg-violet-50 text-violet-700" : "text-zinc-600 hover:bg-zinc-50"
              )}
            >
              <item.icon className="h-4 w-4" />
              {t(item.labelKey)}
            </NavLink>
          ))}
        </nav>
        <Button className="absolute bottom-5 left-4 right-4" variant="outline" onClick={signOut}>
          <LogOut className="mr-2 h-4 w-4" />
          {t("common.signOut")}
        </Button>
      </aside>

      <main className="pb-20 lg:pl-64">
        <Outlet />
      </main>

      <nav className="fixed inset-x-0 bottom-0 z-20 flex gap-1 overflow-x-auto border-t bg-white px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2 lg:hidden">
        {adminRoutes.filter((item) => !item.path.includes(":")).map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            className={({ isActive }) => cn(
              "flex min-w-20 flex-col items-center gap-1 rounded-lg px-2 py-2 text-xs font-semibold",
              isActive ? "text-violet-700" : "text-zinc-500"
            )}
          >
            <item.icon className="h-5 w-5" />
            {t(item.labelKey)}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
