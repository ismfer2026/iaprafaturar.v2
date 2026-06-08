import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";

interface AdminAuthContextValue {
  session: Session | null;
  authUserId: string | null;
  isMasterAdmin: boolean;
  isLoading: boolean;
  signOut: () => Promise<void>;
  reload: () => Promise<void>;
}

const AdminAuthContext = createContext<AdminAuthContextValue | null>(null);

export function AdminAuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [isMasterAdmin, setIsMasterAdmin] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const checkAdmin = useCallback(async (currentSession: Session | null) => {
    if (!currentSession?.user) {
      setIsMasterAdmin(false);
      return;
    }

    const { data, error } = await supabase.rpc("is_master_admin");
    setIsMasterAdmin(!error && data === true);
  }, []);

  const reload = useCallback(async () => {
    setIsLoading(true);
    const { data: { session: currentSession } } = await supabase.auth.getSession();
    setSession(currentSession);
    await checkAdmin(currentSession);
    setIsLoading(false);
  }, [checkAdmin]);

  useEffect(() => {
    reload();
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, currentSession) => {
      setSession(currentSession);
      checkAdmin(currentSession).finally(() => setIsLoading(false));
    });

    return () => subscription.unsubscribe();
  }, [checkAdmin, reload]);

  async function signOut() {
    await supabase.auth.signOut();
    setSession(null);
    setIsMasterAdmin(false);
  }

  return (
    <AdminAuthContext.Provider
      value={{
        session,
        authUserId: session?.user.id ?? null,
        isMasterAdmin,
        isLoading,
        signOut,
        reload
      }}
    >
      {children}
    </AdminAuthContext.Provider>
  );
}

export function useAdminAuth(): AdminAuthContextValue {
  const context = useContext(AdminAuthContext);
  if (!context) throw new Error("useAdminAuth deve ser usado dentro de AdminAuthProvider");
  return context;
}
