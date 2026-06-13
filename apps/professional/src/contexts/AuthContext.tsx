import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";

export type ProfessionalRole = "gestor" | "operacional" | null;

interface AuthContextValue {
  session: Session | null;
  authUserId: string | null;
  professionalId: string | null;
  role: ProfessionalRole;
  teamMemberId: string | null;
  onboardingCompleted: boolean;
  onboardingEssentialsCompleted: boolean;
  whatsappConnected: boolean;
  isLoading: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

interface ProfessionalAuthContext {
  professionalId: string;
  role: Exclude<ProfessionalRole, null>;
  teamMemberId: string | null;
  onboardingCompleted: boolean;
  onboardingEssentialsCompleted: boolean;
  whatsappConnected: boolean;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [professionalId, setProfessionalId] = useState<string | null>(null);
  const [role, setRole] = useState<ProfessionalRole>(null);
  const [teamMemberId, setTeamMemberId] = useState<string | null>(null);
  const [onboardingCompleted, setOnboardingCompleted] = useState(false);
  const [onboardingEssentialsCompleted, setOnboardingEssentialsCompleted] = useState(false);
  const [whatsappConnected, setWhatsappConnected] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  async function loadProfessionalId() {
    const { data, error } = await supabase.rpc("get_professional_auth_context");
    if (error) throw error;

    const context = data as ProfessionalAuthContext | null;
    setProfessionalId(context?.professionalId ?? null);
    setRole(context?.role ?? null);
    setTeamMemberId(context?.teamMemberId ?? null);
    setOnboardingCompleted(Boolean(context?.onboardingCompleted));
    setOnboardingEssentialsCompleted(Boolean(context?.onboardingEssentialsCompleted));
    setWhatsappConnected(Boolean(context?.whatsappConnected));
  }

  function clearProfessionalState() {
    setProfessionalId(null);
    setRole(null);
    setTeamMemberId(null);
    setOnboardingCompleted(false);
    setOnboardingEssentialsCompleted(false);
    setWhatsappConnected(false);
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      setSession(s);
      if (s?.user) {
        loadProfessionalId().finally(() => setIsLoading(false));
      } else {
        setIsLoading(false);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      if (s?.user) {
        loadProfessionalId();
      } else {
        clearProfessionalState();
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  async function signOut() {
    await supabase.auth.signOut();
    clearProfessionalState();
  }

  return (
    <AuthContext.Provider
      value={{
        session,
        authUserId: session?.user?.id ?? null,
        professionalId,
        role,
        teamMemberId,
        onboardingCompleted,
        onboardingEssentialsCompleted,
        whatsappConnected,
        isLoading,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth deve ser usado dentro de AuthProvider");
  return ctx;
}
