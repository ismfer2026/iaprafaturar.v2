import { Link } from "react-router-dom";
import { LogOut, Moon, Sun, User } from "lucide-react";
import {
  Badge,
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@iaprafaturar/ui";
import { useAuth } from "@/contexts/AuthContext";
import { useTheme } from "@/contexts/ThemeContext";
import { useI18n, type TranslationKey } from "@/i18n";
import { LanguageSwitcher } from "./LanguageSwitcher";

const ROLE_LABELS: Record<string, TranslationKey> = {
  gestor: "team.role.gestor",
  operacional: "team.role.operacional",
};

function initialsFor(name: string | null, email: string | null): string {
  if (name?.trim()) {
    const parts = name.trim().split(/\s+/);
    return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || name[0]!.toUpperCase();
  }
  return email?.trim()?.[0]?.toUpperCase() ?? "?";
}

export default function AppHeader() {
  const { t } = useI18n();
  const { session, role, signOut } = useAuth();
  const { theme, toggleTheme } = useTheme();

  const name = (session?.user?.user_metadata?.["name"] as string | undefined) ?? null;
  const email = session?.user?.email ?? null;
  const initials = initialsFor(name, email);

  return (
    <header className="hidden h-14 shrink-0 items-center justify-end gap-2 border-b border-border bg-card px-4 md:flex">
      <LanguageSwitcher compact />

      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-9 w-9 rounded-full"
        aria-label={t("header.theme.toggle")}
        onClick={toggleTheme}
      >
        {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
      </Button>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="flex h-9 w-9 items-center justify-center rounded-full bg-primary-100 text-sm font-bold text-primary-800 transition-opacity hover:opacity-90"
          >
            {initials}
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuLabel className="space-y-1">
            <p className="truncate text-sm font-semibold text-foreground">{name ?? email}</p>
            {name ? <p className="truncate text-xs text-muted-foreground">{email}</p> : null}
            {role ? (
              <Badge variant="secondary" className="mt-1">
                {ROLE_LABELS[role] ? t(ROLE_LABELS[role]) : role}
              </Badge>
            ) : null}
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem asChild>
            <Link to="/perfil">
              <User className="h-4 w-4" />
              {t("header.profile")}
            </Link>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem destructive onClick={() => void signOut()}>
            <LogOut className="h-4 w-4" />
            {t("more.signOut")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  );
}
