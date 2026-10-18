"use client";

import { useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { api, refreshSession, setAccessToken, setOnAuthLost } from "./api";
import { useI18n } from "./i18n";
import type { MeResponse } from "./types";

type AuthState = {
  user: MeResponse | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<MeResponse>;
  signUp: (email: string, password: string, country: string) => Promise<MeResponse>;
  signOut: () => Promise<void>;
  reload: () => Promise<MeResponse | null>;
};

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { setLanguage } = useI18n();
  const [user, setUser] = useState<MeResponse | null>(null);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    try {
      const me = await api.me();
      setUser(me);
      setLanguage(me.preferred_language);
      return me;
    } catch {
      setUser(null);
      return null;
    }
  }, [setLanguage]);

  useEffect(() => {
    setOnAuthLost(() => {
      setAccessToken(null);
      setUser(null);
      router.replace("/login");
    });
    // Restore the session from the httpOnly refresh cookie.
    refreshSession()
      .then((tokens) => (tokens ? reload() : null))
      .finally(() => setLoading(false));
    return () => setOnAuthLost(null);
  }, [reload, router]);

  const signIn = useCallback(
    async (email: string, password: string) => {
      const tokens = await api.login({ email, password });
      setAccessToken(tokens.access_token);
      return (await reload()) as MeResponse;
    },
    [reload],
  );

  const signUp = useCallback(
    async (email: string, password: string, country: string) => {
      const tokens = await api.register({ email, password, country, language: "en", accept_terms: true });
      setAccessToken(tokens.access_token);
      return (await reload()) as MeResponse;
    },
    [reload],
  );

  const signOut = useCallback(async () => {
    await api.logout().catch(() => undefined);
    setAccessToken(null);
    setUser(null);
    router.replace("/");
  }, [router]);

  const value = useMemo(
    () => ({ user, loading, signIn, signUp, signOut, reload }),
    [user, loading, signIn, signUp, signOut, reload],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
