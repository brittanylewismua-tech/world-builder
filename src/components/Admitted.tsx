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
  const [email, setEmail] = useState("");
  const [reason, setReason] = useState("");

  useEffect(() => {
    let alive = true;
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (!data.session) {
        /* Not signed in at all — the sign-in screen handles that, not this. */
        if (alive) setInside(true);
        return;
      }
      /* 10 Oct 2026: World Builder comes with The Goldie Suite. Ask the suite first, every visit (lib/suiteAccess.ts). */
      try {
        const r = await fetch("/api/access/suite", {
          method: "POST",
          headers: { Authorization: `Bearer ${data.session.access_token}` },
          cache: "no-store",
        });
        const b = (await r.json().catch(() => ({}))) as { reason?: string | null };
        if (alive) setReason(b.reason ?? "");
      } catch {
        /* the suite could not be reached: the stored date stands */
      }
      setEmail(data.session.user.email ?? "");
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



  if (ALWAYS_OPEN.some((p) => path?.startsWith(p))) return <>{children}</>;
  if (inside === null) return null;

  const stale = !!endsAt && new Date(endsAt) <= new Date();

  /*
    Still inside their term: just the app. The last-week notice lives on Home
    rather than here — a strip across every screen is a countdown following
    somebody around their own work, and Home is where a session starts.
  */
  if (inside && !stale) return <>{children}</>;

  /*
    10 Oct 2026: no access codes and no read-only view any more. World Builder
    comes with The Goldie Suite; everything a person built is kept, and joining
    the suite with the same email opens it exactly as it was.
  */
  return <SuiteDoor email={email} reason={reason} />;
}

function SuiteDoor({ email, reason: first }: { email: string; reason: string }) {
  const [checking, setChecking] = useState(false);
  const [note, setNote] = useState("");
  const [reason, setReason] = useState(first);
  async function checkAgain() {
    setChecking(true);
    setNote("");
    try {
      const { data } = await supabase.auth.getSession();
      const r = await fetch("/api/access/suite", {
        method: "POST",
        headers: { Authorization: `Bearer ${data.session?.access_token ?? ""}` },
        cache: "no-store",
      });
      const b = (await r.json().catch(() => ({}))) as { live?: boolean | null; reason?: string | null };
      if (b.live) window.location.reload();
      else if (b.reason === "not_on_list" || b.reason === "trial") setReason(b.reason);
      else setNote(`We couldn't find a Goldie Suite membership for ${email || "this email"} yet. Join with this exact email, then check again.`);
    } catch {
      setNote("That didn't go through. Try again in a moment.");
    } finally {
      setChecking(false);
    }
  }
  const signOut = (
    <button
      onClick={async () => {
        await supabase.auth.signOut();
        window.location.href = "/login";
      }}
      className="t-small mt-6 text-ink-3 underline underline-offset-4 transition hover:text-ink"
    >
      Sign out
    </button>
  );
  if (reason === "not_on_list")
    return (
      <main className="flex min-h-dvh items-center justify-center px-5">
        <div className="w-full max-w-md">
          <Logo height={22} />
          <h1 className="t-h2 mt-6 text-ink">World Builder is for World Building Challenge members</h1>
          <p className="t-body mt-3 text-ink-2">
            <b className="text-ink">{email || "This email"}</b> isn&apos;t on the World Building Challenge list, so World Builder can&apos;t open for it.
          </p>
          <p className="t-body mt-3 text-ink-2">
            If you joined the challenge with a different email, sign out and sign in with that one. Questions? Email support@beawolfbiz.com.
          </p>
          {signOut}
        </div>
      </main>
    );
  if (reason === "trial")
    return (
      <main className="flex min-h-dvh items-center justify-center px-5">
        <div className="w-full max-w-md">
          <Logo height={22} />
          <h1 className="t-h2 mt-6 text-ink">World Builder isn&apos;t part of the free trial</h1>
          <p className="t-body mt-3 text-ink-2">
            World Builder opens once your Goldie Suite membership is paid. Upgrade from your Goldie Suite account, then come back and tap &quot;I&apos;ve upgraded&quot;. Everything you built is saved.
          </p>
          <a href="https://thegoldiesuite.com/account/settings" className="btn btn-accent mt-6 w-full text-center">
            Upgrade my Goldie Suite membership
          </a>
          <button onClick={checkAgain} disabled={checking} className="btn mt-3 w-full">
            {checking ? "Checking…" : "I've upgraded"}
          </button>
          {note && <p className="t-small mt-3 text-[#8a2020]">{note}</p>}
          {signOut}
        </div>
      </main>
    );
  return (
    <main className="flex min-h-dvh items-center justify-center px-5">
      <div className="w-full max-w-md">
        <Logo height={22} />
        <h1 className="t-h2 mt-6 text-ink">World Builder is part of The Goldie Suite</h1>
        <p className="t-body mt-3 text-ink-2">
          World Builder now comes with a Goldie Suite membership ($47 a month). Everything you built is saved and will be right where you left it.
        </p>
        <p className="t-body mt-3 text-ink-2">
          Join The Goldie Suite using <b className="text-ink">{email || "the email you sign in here with"}</b>, then come back and tap "I've joined".
        </p>
        <a href="https://thegoldiesuite.com" className="btn btn-accent mt-6 w-full text-center">
          Join The Goldie Suite
        </a>
        <button onClick={checkAgain} disabled={checking} className="btn mt-3 w-full">
          {checking ? "Checking…" : "I've joined"}
        </button>
        {note && <p className="t-small mt-3 text-[#8a2020]">{note}</p>}
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
          <a href="/terms" className="t-small text-ink-3 underline underline-offset-4 transition hover:text-ink">Terms</a>
          <a href="/privacy" className="t-small text-ink-3 underline underline-offset-4 transition hover:text-ink">Privacy</a>
        </div>
      </div>
    </main>
  );
}

/* ------------------------------------------------------------------ */
