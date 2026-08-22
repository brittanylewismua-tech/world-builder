"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "./supabase";
import { loadWorld } from "./api";
import type { World } from "./world";

interface Ctx {
  session: Session | null;
  world: World | null;
  loading: boolean;
  error: string;
  /** Merge a patch into local state without a refetch. */
  patch: (p: Partial<World>) => void;
  /** Pull the whole world back from Supabase. */
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
}

const WorldContext = createContext<Ctx | null>(null);

export function WorldProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [world, setWorld] = useState<World | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    try {
      setWorld(await loadWorld());
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load your world.");
    }
  }, []);

  useEffect(() => {
    let alive = true;

    supabase.auth.getSession().then(async ({ data }) => {
      if (!alive) return;
      setSession(data.session);
      if (data.session) await refresh();
      if (alive) setLoading(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange(async (_e, s) => {
      if (!alive) return;
      setSession(s);
      if (s) {
        await refresh();
      } else {
        setWorld(null);
      }
      setLoading(false);
    });

    return () => {
      alive = false;
      sub.subscription.unsubscribe();
    };
  }, [refresh]);

  const patch = useCallback((p: Partial<World>) => {
    setWorld((cur) => (cur ? { ...cur, ...p } : cur));
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setWorld(null);
  }, []);

  const value = useMemo(
    () => ({ session, world, loading, error, patch, refresh, signOut }),
    [session, world, loading, error, patch, refresh, signOut],
  );

  return (
    <WorldContext.Provider value={value}>{children}</WorldContext.Provider>
  );
}

export function useWorld() {
  const ctx = useContext(WorldContext);
  if (!ctx) throw new Error("useWorld must be used inside WorldProvider");
  return ctx;
}
