import type { Session } from "@supabase/supabase-js";
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { getSupabase, isSupabaseConfigured } from "@/data/supabase";

interface AuthState {
  session: Session | null;
  loading: boolean;
  /** true cuando se llegó desde el enlace de recuperación de contraseña. */
  recovering: boolean;
}

const AuthContext = createContext<AuthState>({ session: null, loading: true, recovering: false });

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    session: null,
    loading: isSupabaseConfigured,
    recovering: false,
  });

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    const supabase = getSupabase();
    let alive = true;
    supabase.auth.getSession().then(({ data }) => {
      if (alive) setState((s) => ({ ...s, session: data.session, loading: false }));
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      setState((s) => ({
        session,
        loading: false,
        recovering: event === "PASSWORD_RECOVERY" ? true : session ? s.recovering : false,
      }));
    });
    return () => {
      alive = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const value = useMemo(() => state, [state]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
