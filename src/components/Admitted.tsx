"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import Logo from "./Logo";

/**
 * THE DOOR.
 *
 * The app was open to anyone with the URL. A Create account tab and a Google
 * button, both of which made a working account instantly, and every account
 * that gets in starts spending — the first World News issue writes itself
 * without anybody pressing anything.
 *
 * WHY IT IS HERE AND NOT ON THE SIGN-UP FORM. Google sign-in creates the
 * account inside Supabase, outside this app's code, so a check on the
 * registration route only closes one of two doors. This sits between a
 * signed-in session and the app itself, which is the one place both routes
 * have to pass through.
 *
 * Everybody who already had an account was admitted when this was built. The
 * door closes behind them, not in front of them — nobody who was already
 * using the app is ever asked for a code.
 */
export default function Admitted({ children }: { children: React.ReactNode }) {
  /* null while we do not yet know; the app never flashes before the check. */
  const [inside, setInside] = useState<boolean | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    let alive = true;
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (!data.session) {
        /* Not signed in at all — the sign-in screen handles that, not this. */
        if (alive) setInside(true);
        return;
      }
      const { data: row } = await supabase
        .from("wb_admitted")
        .select("user_id")
        .maybeSingle();
      if (alive) setInside(!!row);
    })();
    return () => {
      alive = false;
    };
  }, []);

  async function tryCode() {
    const value = code.trim();
    if (!value || busy) return;
    setBusy(true);
    setErr("");
    try {
      const { data, error } = await supabase.rpc("wb_redeem", { try: value });
      if (error) throw new Error(error.message);
      if (data === true) setInside(true);
      else setErr("That code is not working. Check it and try again.");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "That did not go through.");
    } finally {
      setBusy(false);
    }
  }

  if (inside === null) return null;
  if (inside) return <>{children}</>;

  return (
    <main className="flex min-h-dvh items-center justify-center px-5">
      <div className="w-full max-w-sm">
        <Logo height={22} />
        <h1 className="t-h2 mt-6 text-ink">You need an access code</h1>
        <p className="t-body mt-2 text-ink-2">
          World Builder is not open yet. If you have a code, put it in here.
        </p>

        <input
          value={code}
          onChange={(e) => setCode(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && tryCode()}
          placeholder="your code"
          autoFocus
          className="mt-6 w-full rounded-lg border-2 border-black px-3.5 py-2.5 text-[15px] outline-none"
        />
        {err && <p className="t-small mt-2 text-[#8a2020]">{err}</p>}

        <button
          onClick={tryCode}
          disabled={busy || !code.trim()}
          className="btn btn-accent mt-3 w-full"
        >
          {busy ? "Checking…" : "Enter"}
        </button>

        <button
          onClick={async () => {
            await supabase.auth.signOut();
            window.location.href = "/login";
          }}
          className="t-small mt-6 text-ink-3 underline underline-offset-4 transition hover:text-ink"
        >
          Sign out
        </button>
      </div>
    </main>
  );
}
