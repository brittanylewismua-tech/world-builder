"use client";

import { useEffect, useState } from "react";
import { supabase } from "./supabase";

/**
 * THE TOKEN, ONCE IT ACTUALLY EXISTS.
 *
 * The back-of-house pages kept saying "Sign in first" to somebody who was
 * signed in. Nothing had signed them out: on a cold page load Supabase reads
 * the session back from storage asynchronously, and both panes were calling
 * getSession() in a mount effect and believing the first answer. Ask a
 * hundred milliseconds too early and you get null, which the page then
 * rendered as being logged out.
 *
 * The rest of the app never hit this because it goes through useWorld, which
 * has a loading state and waits. These two pages were written standalone and
 * skipped that.
 *
 * So: subscribe rather than ask. onAuthStateChange fires INITIAL_SESSION once
 * storage has been read, and again on every refresh — and the client refreshes
 * an hour-long token on its own, so the value here stays current for as long
 * as the browser is open, without the page doing anything.
 *
 *   token === undefined  still finding out. Show nothing, decide nothing.
 *   token === null       genuinely signed out.
 *   token === string     use it.
 */
export function useOwnerToken(): string | null | undefined {
  return useOwnerAccount().token;
}

/** The same, plus who it belongs to — for saying so when they are the wrong who. */
export function useOwnerAccount(): {
  token: string | null | undefined;
  email: string | null;
} {
  const [token, setToken] = useState<string | null | undefined>(undefined);
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;

    /*
      onAuthStateChange delivers INITIAL_SESSION by itself, but only once the
      client is ready. This asks as well, so a session already in memory is
      not waited on unnecessarily.
    */
    supabase.auth.getSession().then(({ data }) => {
      if (!alive || !data.session?.access_token) return;
      setToken(data.session.access_token);
      setEmail(data.session.user?.email ?? null);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!alive) return;
      setToken(session?.access_token ?? null);
      setEmail(session?.user?.email ?? null);
    });

    return () => {
      alive = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  return { token, email };
}
