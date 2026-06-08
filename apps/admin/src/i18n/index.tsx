import { createContext, useContext, useMemo, useState, type ReactNode } from "react";

type Locale = "pt-BR" | "en-US" | "es-419";

const ptBR = {
  "common.loading": "Carregando",
  "common.error": "Nao foi possivel carregar os dados.",
  "common.retry": "Tentar novamente",
  "common.signOut": "Sair",
  "common.search": "Buscar",
  "auth.title": "Admin iaprafaturar",
  "auth.subtitle": "Acesse o painel da plataforma",
  "auth.email": "E-mail",
  "auth.password": "Senha",
  "auth.submit": "Entrar",
  "auth.error": "Nao foi possivel entrar.",
  "auth.notAdmin": "Este usuario nao tem acesso admin.",
  "nav.dashboard": "Dashboard",
  "nav.professionals": "Profissionais",
  "nav.nexus": "Nexus",
  "dashboard.eyebrow": "Plataforma",
  "dashboard.title": "Admin Analytics",
  "dashboard.subtitle": "MRR, churn, uso e risco operacional da plataforma.",
  "dashboard.mrr": "MRR",
  "dashboard.active": "Profissionais ativos",
  "dashboard.churn": "Risco critico",
  "dashboard.messages": "Mensagens enviadas",
  "dashboard.health": "Health da plataforma",
  "professionals.title": "Profissionais",
  "professionals.subtitle": "Uso, plano, WhatsApp e risco de churn.",
  "professionals.searchPlaceholder": "Nome, clinica ou e-mail",
  "professionals.empty": "Nenhum profissional encontrado.",
  "professionals.whatsapp.connected": "WhatsApp conectado",
  "professionals.whatsapp.disconnected": "WhatsApp desconectado",
  "professionals.clients": "clientes",
  "professionals.sessions": "sessoes",
  "nexus.title": "Nexus",
  "nexus.subtitle": "Converse com a Nerissa sobre a plataforma.",
  "nexus.placeholder": "Pergunte sobre MRR, trials, churn ou profissionais em risco",
  "nexus.send": "Enviar",
  "nexus.pending": "Nexus sera conectado ao admin-ai-gateway nesta fase."
} as const;

const enUS: Record<keyof typeof ptBR, string> = {
  "common.loading": "Loading",
  "common.error": "Could not load data.",
  "common.retry": "Try again",
  "common.signOut": "Sign out",
  "common.search": "Search",
  "auth.title": "iaprafaturar Admin",
  "auth.subtitle": "Access the platform console",
  "auth.email": "Email",
  "auth.password": "Password",
  "auth.submit": "Sign in",
  "auth.error": "Could not sign in.",
  "auth.notAdmin": "This user does not have admin access.",
  "nav.dashboard": "Dashboard",
  "nav.professionals": "Professionals",
  "nav.nexus": "Nexus",
  "dashboard.eyebrow": "Platform",
  "dashboard.title": "Admin Analytics",
  "dashboard.subtitle": "MRR, churn, usage, and operational platform risk.",
  "dashboard.mrr": "MRR",
  "dashboard.active": "Active professionals",
  "dashboard.churn": "Critical risk",
  "dashboard.messages": "Sent messages",
  "dashboard.health": "Platform health",
  "professionals.title": "Professionals",
  "professionals.subtitle": "Usage, plan, WhatsApp, and churn risk.",
  "professionals.searchPlaceholder": "Name, clinic, or email",
  "professionals.empty": "No professionals found.",
  "professionals.whatsapp.connected": "WhatsApp connected",
  "professionals.whatsapp.disconnected": "WhatsApp disconnected",
  "professionals.clients": "clients",
  "professionals.sessions": "sessions",
  "nexus.title": "Nexus",
  "nexus.subtitle": "Talk to Nerissa about the platform.",
  "nexus.placeholder": "Ask about MRR, trials, churn, or at-risk professionals",
  "nexus.send": "Send",
  "nexus.pending": "Nexus will be connected to admin-ai-gateway in this phase."
};

const es419: Record<keyof typeof ptBR, string> = {
  "common.loading": "Cargando",
  "common.error": "No fue posible cargar los datos.",
  "common.retry": "Intentar de nuevo",
  "common.signOut": "Salir",
  "common.search": "Buscar",
  "auth.title": "Admin iaprafaturar",
  "auth.subtitle": "Accede al panel de la plataforma",
  "auth.email": "Correo",
  "auth.password": "Contrasena",
  "auth.submit": "Entrar",
  "auth.error": "No fue posible entrar.",
  "auth.notAdmin": "Este usuario no tiene acceso admin.",
  "nav.dashboard": "Dashboard",
  "nav.professionals": "Profesionales",
  "nav.nexus": "Nexus",
  "dashboard.eyebrow": "Plataforma",
  "dashboard.title": "Admin Analytics",
  "dashboard.subtitle": "MRR, churn, uso y riesgo operacional de la plataforma.",
  "dashboard.mrr": "MRR",
  "dashboard.active": "Profesionales activos",
  "dashboard.churn": "Riesgo critico",
  "dashboard.messages": "Mensajes enviados",
  "dashboard.health": "Salud de la plataforma",
  "professionals.title": "Profesionales",
  "professionals.subtitle": "Uso, plan, WhatsApp y riesgo de churn.",
  "professionals.searchPlaceholder": "Nombre, clinica o correo",
  "professionals.empty": "No se encontraron profesionales.",
  "professionals.whatsapp.connected": "WhatsApp conectado",
  "professionals.whatsapp.disconnected": "WhatsApp desconectado",
  "professionals.clients": "clientes",
  "professionals.sessions": "sesiones",
  "nexus.title": "Nexus",
  "nexus.subtitle": "Conversa con Nerissa sobre la plataforma.",
  "nexus.placeholder": "Pregunta sobre MRR, trials, churn o profesionales en riesgo",
  "nexus.send": "Enviar",
  "nexus.pending": "Nexus sera conectado al admin-ai-gateway en esta fase."
};

const dictionaries = { "pt-BR": ptBR, "en-US": enUS, "es-419": es419 };

type TranslationKey = keyof typeof ptBR;

interface I18nValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: TranslationKey) => string;
}

const I18nContext = createContext<I18nValue | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocale] = useState<Locale>("pt-BR");
  const value = useMemo<I18nValue>(() => ({
    locale,
    setLocale,
    t: (key) => dictionaries[locale][key] ?? ptBR[key]
  }), [locale]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nValue {
  const context = useContext(I18nContext);
  if (!context) throw new Error("useI18n deve ser usado dentro de I18nProvider");
  return context;
}
