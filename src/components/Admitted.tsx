"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
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
/*
  Pages the door never stands in front of.

  The code screen links to the terms and the privacy policy, so a person
  deciding whether to hand over an email has to be able to read them without
  being past the door first — otherwise the links go in a circle. Sign-in and
  account recovery are open for the same reason.
*/
const ALWAYS_OPEN = ["/terms", "/privacy", "/login", "/reset"];

/** Where somebody goes to keep their access. Empty hides the button. */
const UPGRADE_URL = process.env.NEXT_PUBLIC_UPGRADE_URL || "";

export default function Admitted({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  /*
    Three states, not two.

      in     — full use
      stale  — the challenge is over. Everything they built is still here and
               still readable; nothing that costs money will run.
      out    — never had a code

    Stale is the important one. A world you can still see but not use is the
    reason to subscribe, and somebody who pays picks up exactly where they
    stopped — nothing is moved, rebuilt or lost.
  */
  const [inside, setInside] = useState<boolean | null>(null);
  const [endsAt, setEndsAt] = useState<string | null>(null);
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
        .select("user_id, expires_at")
        .maybeSingle();
      if (!alive) return;
      setInside(!!row);
      setEndsAt((row?.expires_at as string | null) ?? null);
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

  if (ALWAYS_OPEN.some((p) => path?.startsWith(p))) return <>{children}</>;
  if (inside === null) return null;

  const stale = !!endsAt && new Date(endsAt) <= new Date();

  /*
    Still inside their term: just the app. The last-week notice lives on Home
    rather than here — a strip across every screen is a countdown following
    somebody around their own work, and Home is where a session starts.
  */
  if (inside && !stale) return <>{children}</>;

  /* Out of term. The app stays, read-only, behind an honest banner. */
  if (inside && stale)
    return (
      <>
        <Ended onEntered={() => window.location.reload()} />
        {children}
      </>
    );

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

        <div className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-2">
          <button
            onClick={async () => {
              await supabase.auth.signOut();
              window.location.href = "/login";
            }}
            className="t-small text-ink-3 underline underline-offset-4 transition hover:text-ink"
          >
            Sign out
          </button>
          <a
            href="/terms"
            className="t-small text-ink-3 underline underline-offset-4 transition hover:text-ink"
          >
            Terms
          </a>
          <a
            href="/privacy"
            className="t-small text-ink-3 underline underline-offset-4 transition hover:text-ink"
          >
            Privacy
          </a>
        </div>
      </div>
    </main>
  );
}

/* ------------------------------------------------------------------ */

/**
 * After the term. The app is still there behind this, read-only, because a
 * world you can still see is the whole reason to continue.
 */
function Ended({ onEntered }: { onEntered: () => void }) {
  const [code, setCode] = useState("");
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function tryCode() {
    const value = code.trim();
    if (!value || busy) return;
    setBusy(true);
    setErr("");
    try {
      const { data, error } = await supabase.rpc("wb_redeem", { try: value });
      if (error) throw new Error(error.message);
      if (data === true) onEntered();
      else setErr("That code is not working.");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "That did not go through.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="border-b-2 border-black px-5 py-3"
      style={{ background: "var(--accent)" }}
    >
      <div className="mx-auto flex max-w-4xl flex-wrap items-center gap-x-4 gap-y-2">
        <p className="t-small font-semibold text-[color:var(--accent-on)]">
          Your challenge access has ended. Everything you built is still here.
        </p>
        {open ? (
          <span className="ml-auto flex items-center gap-2">
            <input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && tryCode()}
              placeholder="code"
              autoFocus
              className="w-32 rounded-lg border-2 border-black px-2.5 py-1 text-[13px] outline-none"
            />
            <button
              onClick={tryCode}
              disabled={busy}
              className="btn btn-primary shrink-0"
            >
              {busy ? "…" : "Enter"}
            </button>
          </span>
        ) : (
          <span className="ml-auto flex shrink-0 items-center gap-4">
            {UPGRADE_URL && (
              <a
                href={UPGRADE_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn-primary shrink-0"
              >
                Keep my access
              </a>
            )}
            <button
              onClick={() => setOpen(true)}
              className="t-small shrink-0 font-semibold text-[color:var(--accent-on)] underline underline-offset-4"
            >
              I have a code
            </button>
          </span>
        )}
      </div>
      {err && (
        <p className="t-small mx-auto mt-1 max-w-4xl text-[color:var(--accent-on)] opacity-80">
          {err}
        </p>
      )}
    </div>
  );
}
