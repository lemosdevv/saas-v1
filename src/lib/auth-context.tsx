import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type Profile = {
  id: string;
  tenant_id: string | null;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  onboarded: boolean;
};

type AuthContextValue = {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  /** true enquanto sessão OU profile ainda estão sendo carregados */
  loading: boolean;
  signOut: () => Promise<void>;
  /** Recarrega o profile do banco manualmente (útil após onboarding) */
  refreshProfile: () => Promise<void>;
};

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);

  // Dois estados separados para evitar flash/race entre sessão e profile
  const [sessionLoading, setSessionLoading] = useState(true);
  const [profileLoading, setProfileLoading] = useState(false);

  // -------------------------------------------------------------------------
  // Busca o profile no banco a partir do userId da sessão
  // -------------------------------------------------------------------------
  const fetchProfile = useCallback(async (userId: string, authUser?: User) => {
    console.log("[auth-context] TRACE: fetchProfile started for userId:", userId);
    setProfileLoading(true);
    try {
      console.log("[auth-context] TRACE: calling supabase.from(profiles)...");
      const { data, error } = await supabase
        .from("profiles")
        .select("id,tenant_id,full_name,email,phone,onboarded")
        .eq("id", userId)
        .maybeSingle();
      
      console.log("[auth-context] TRACE: supabase.from returned. error:", error, "data:", data);

      if (error) {
        console.error("[auth-context] erro ao buscar profile:", error);
        setProfile(null);
        return;
      }

      if (!data) {
        console.warn("[auth-context] profile não encontrado, criando...", userId);

        const fullName =
          authUser?.user_metadata?.full_name ??
          authUser?.user_metadata?.name ??
          null;

        console.log("[auth-context] TRACE: calling supabase.upsert...");
        const { data: created, error: upsertError } = await supabase
          .from("profiles")
          .upsert(
            {
              id: userId,
              email: authUser?.email ?? null,
              full_name: fullName,
              onboarded: false,
            },
            { onConflict: "id", ignoreDuplicates: false },
          )
          .select("id,tenant_id,full_name,email,phone,onboarded")
          .single();
        console.log("[auth-context] TRACE: supabase.upsert returned. error:", upsertError);

        if (upsertError) {
          console.error("[auth-context] erro ao criar profile:", upsertError);
          setProfile(null);
        } else {
          console.log("[auth-context] profile criado automaticamente:", created);
          setProfile(created as Profile);
        }
        return;
      }

      console.log("[auth-context] profile carregado:", data);
      setProfile(data as Profile);
    } catch (err) {
      console.error("[auth-context] erro inesperado ao buscar profile:", err);
      setProfile(null);
    } finally {
      console.log("[auth-context] TRACE: fetchProfile finally block reached");
      setProfileLoading(false);
    }
  }, []);

  // -------------------------------------------------------------------------
  // Inicializa sessão e inscreve no auth state
  // -------------------------------------------------------------------------
  useEffect(() => {
    let mounted = true;

    async function loadSession() {
      try {
        console.log("[auth-context] TRACE: loadSession started");
        console.log("[auth-context] carregando sessão inicial...");

        console.log("[auth-context] TRACE: calling supabase.auth.getSession...");
        const {
          data: { session },
          error,
        } = await supabase.auth.getSession();
        console.log("[auth-context] TRACE: supabase.auth.getSession returned. error:", error);

        if (!mounted) {
          console.log("[auth-context] TRACE: unmounted during loadSession");
          return;
        }

        if (error) {
          console.error("[auth-context] erro ao buscar sessão:", error);
          setSession(null);
          setUser(null);
          return;
        }

        console.log("[auth-context] sessão inicial:", session);

        setSession(session);
        setUser(session?.user ?? null);

        if (session?.user) {
          console.log("[auth-context] TRACE: calling fetchProfile from loadSession");
          await fetchProfile(session.user.id, session.user);
          console.log("[auth-context] TRACE: fetchProfile completed in loadSession");
        }
      } catch (err) {
        console.error("[auth-context] erro inesperado:", err);
        if (mounted) {
          setSession(null);
          setUser(null);
        }
      } finally {
        if (mounted) {
          console.log("[auth-context] TRACE: setting sessionLoading to false in loadSession finally");
          setSessionLoading(false);
        }
      }
    }

    loadSession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (_event, session) => {
      console.log("[auth-context] TRACE: onAuthStateChange event:", _event);
      console.log("[auth-context] auth state mudou:", _event, session);

      if (!mounted) {
        console.log("[auth-context] TRACE: unmounted during onAuthStateChange");
        return;
      }

      setSession(session);
      setUser(session?.user ?? null);
      setSessionLoading(false);

      if (session?.user) {
        console.log("[auth-context] TRACE: calling fetchProfile from onAuthStateChange");
        await fetchProfile(session.user.id, session.user);
        console.log("[auth-context] TRACE: fetchProfile completed in onAuthStateChange");
      } else {
        // Logout: limpa profile
        setProfile(null);
        setProfileLoading(false);
      }
    });

    return () => {
      console.log("[auth-context] TRACE: cleanup function running");
      mounted = false;
      subscription.unsubscribe();
    };
  }, [fetchProfile]);

  // refreshProfile público
  const refreshProfile = useCallback(async () => {
    if (user?.id) await fetchProfile(user.id, user);
  }, [user, fetchProfile]);

  // -------------------------------------------------------------------------
  // signOut
  // -------------------------------------------------------------------------
  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setSession(null);
    setUser(null);
    setProfile(null);
    // Redireciona para login limpando o estado do router
    window.location.replace("/entrar");
  }, []);

  // -------------------------------------------------------------------------
  // Valor exposto
  // -------------------------------------------------------------------------
  const loading = sessionLoading || profileLoading;

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      user,
      profile,
      loading,
      signOut,
      refreshProfile,
    }),
    [session, user, profile, loading, signOut, refreshProfile],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error("useAuth precisa ser usado dentro de AuthProvider");
  }

  return context;
}