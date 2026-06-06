import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";

interface AuthContextValue {
  session: Session | null;
  authUserId: string | null;
  professionalId: string | null;
  onboardingCompleted: boolean;
  onboardingEssentialsCompleted: boolean;
  whatsappConnected: boolean;
  isLoading: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [professionalId, setProfessionalId] = useState<string | null>(null);
  const [onboardingCompleted, setOnboardingCompleted] = useState(false);
  const [onboardingEssentialsCompleted, setOnboardingEssentialsCompleted] = useState(false);
  const [whatsappConnected, setWhatsappConnected] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  async function loadProfessionalId(user: User) {
    const { data } = await supabase
      .from("professionals")
      .select("id, onboarding_completed, onboarding_essentials_completed, whatsapp_connected")
      .eq("user_id", user.id)
      .single();

    setProfessionalId(data?.id ?? null);
    setOnboardingCompleted(Boolean(data?.onboarding_completed));
    setOnboardingEssentialsCompleted(Boolean(data?.onboarding_essentials_completed));
    setWhatsappConnected(Boolean(data?.whatsapp_connected));
  }

  function clearProfessionalState() {
    setProfessionalId(null);
    setOnboardingCompleted(false);
    setOnboardingEssentialsCompleted(false);
    setWhatsappConnected(false);
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      setSession(s);
      if (s?.user) {
        loadProfessionalId(s.user).finally(() => setIsLoading(false));
      } else {
        setIsLoading(false);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      if (s?.user) {
        loadProfessionalId(s.user);
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
