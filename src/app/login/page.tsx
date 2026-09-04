"use client";

import Link from "next/link";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { useWorld } from "@/lib/useWorld";
import { Star } from "@/components/ui";
import Logo from "@/components/Logo";

/**
 * The sign-in door stays dark with the globe — this is the brand moment, and
 * it matches the challenge artwork. The workspace behind it is light.
 *
 * Passwords, not magic links. The first real test of the sending domain put
 * the sign-in link straight into Gmail spam, and a cohort of sellers hunting
 * through junk folders during launch week is not a sign-in flow. Accounts are
 * created server-side already confirmed, so nothing is ever emailed and
 * nothing can be filtered.
 */
type Mode = "in" | "new";

export default function Login() {
  const router = useRouter();
  const { session, loading } = useWorld();
  const [mode, setMode] = useState<Mode>("in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  /** Only when creating — signing in has nothing to mistype twice. */
  const mismatch = mode === "new" && confirm.length > 0 && confirm !== password;
  const ready =
    email.trim().length > 0 &&
    password.length > 0 &&
    (mode === "in" || (password.length >= 8 && confirm === password));

  useEffect(() => {
    if (!loading && session) router.replace("/");
  }, [loading, session, router]);

  async function submit() {
    const addr = email.trim().toLowerCase();
    if (!addr || !password || busy || !ready) return;
    setBusy(true);
    setErr("");

    if (mode === "new") {
      const r = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: addr, password }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        setBusy(false);
        setErr(j.error || "Could not create that account.");
        return;
      }
    }

    const { error } = await supabase.auth.signInWithPassword({
      email: addr,
      password,
    });
    setBusy(false);
    if (error) {
      setErr(
        /invalid login/i.test(error.message)
          ? "That email and password do not match. Check both, or create an account."
          : error.message,
      );
      return;
    }
    router.replace("/");
  }

  /**
   * CONTINUE WITH GOLDIE.
   *
   * Every real account on this project so far arrived through Google, because
   * the rest of the Suite signs in that way — and they all share this auth
   * project. So a seller who is already signed in to Listing Factory has a
   * valid session here and was still being asked to invent a second account
   * with a password, for the same product.
   *
   * Back to the site root rather than a bespoke callback: the client is
   * configured with detectSessionInUrl, so it completes the exchange wherever
   * it lands, and the root page already routes on session — setup if the
   * world is unbuilt, home if it is not. One less thing to keep in step when
   * the Suite shell replaces this gate.
   */
  async function enterWithGoogle() {
    setBusy(true);
    setErr("");
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/` },
    });
    if (error) {
      setBusy(false);
      setErr(
        /provider.*not enabled/i.test(error.message)
          ? "Google sign-in is switched off for this Supabase project."
          : error.message,
      );
    }
    // On success the browser leaves for Google; nothing to do here.
  }

  const field =
    "w-full rounded-lg border border-white/15 bg-white/[0.05] px-3.5 py-2.5 text-sm text-white outline-none transition placeholder:text-white/35 focus:border-accent";

  return (
    <main className="gridfield relative min-h-dvh overflow-hidden bg-[#0d0c0c]">
      <div className="pointer-events-none absolute -right-48 top-1/2 hidden -translate-y-1/2 lg:block">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/globe.png" alt="" className="globe-turn h-[620px] w-[620px] max-w-none" />
      </div>
      <Star size={16} className="pointer-events-none absolute left-[38%] top-[14%] text-white/70" />
      <Star size={10} className="pointer-events-none absolute left-[30%] top-[26%] text-[#ee6fc0]" />
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-[#0d0c0c] via-[#0d0c0c] to-transparent" />

      <div className="relative mx-auto flex min-h-dvh max-w-lg flex-col justify-center px-6 py-16">
        <div className="flex items-center gap-2 text-accent">
          <Star size={10} />
          <span className="eyebrow">for print on demand sellers</span>
        </div>

        {/* The mark itself is the heading here. The h1 stays for structure
            and screen readers; the artwork carries it visually. */}
        <h1 className="mt-6 text-white">
          <span className="sr-only">World Builder</span>
          <Logo height="clamp(2.1rem,7.5vw,3rem)" />
        </h1>
        <p className="mt-4 text-[15px] font-medium leading-relaxed text-white/70">
          build one customer world deeply — instead of jumping between unrelated niches.
        </p>
        <span className="mt-5 block h-0.5 w-16 bg-accent" />

        {/* ------------------------------------------------ email + password */}
        <div className="mt-9 flex gap-1 rounded-lg border border-white/12 p-1">
          {(["in", "new"] as Mode[]).map((m) => (
            <button
              key={m}
              onClick={() => {
                setMode(m);
                setErr("");
                setConfirm("");
              }}
              className={`flex-1 rounded-md py-2 text-[13px] font-bold transition ${
                mode === m
                  ? "bg-[#ee6fc0] text-black"
                  : "text-white/55 hover:text-white"
              }`}
            >
              {m === "in" ? "Sign in" : "Create account"}
            </button>
          ))}
        </div>

        <div className="mt-4 space-y-2">
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submit()}
            type="email"
            autoComplete="email"
            placeholder="email"
            className={field}
          />
          <input
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submit()}
            type="password"
            autoComplete={mode === "new" ? "new-password" : "current-password"}
            placeholder={mode === "new" ? "at least 8 characters" : "password"}
            className={field}
          />
          {mode === "new" && (
            <input
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submit()}
              type="password"
              autoComplete="new-password"
              placeholder="type it again"
              className={field}
            />
          )}
          {mismatch && (
            <p className="text-[13px] text-accent">
              Those two do not match.
            </p>
          )}
          {/*
            A way back has to be visible at the moment someone is failing to
            get in, not buried. Only shown when signing in, because it makes
            no sense next to a form that is creating the account.
          */}
          {mode === "in" && (
            <Link
              href="/reset"
              className="self-start text-[13px] text-ink-3 underline underline-offset-2 transition hover:text-ink"
            >
              Forgotten your password?
            </Link>
          )}
          <button
            onClick={submit}
            disabled={busy || !ready}
            className="w-full rounded-xl border-2 border-white bg-[#ee6fc0] py-3 text-base font-extrabold text-black shadow-[4px_4px_0_#fff] transition hover:translate-x-[-2px] hover:translate-y-[-2px] hover:shadow-[6px_6px_0_#fff] disabled:opacity-50"
          >
            {busy
              ? "one moment…"
              : mode === "new"
                ? "create my account"
                : "sign in"}
          </button>
        </div>

        <div className="mt-6 flex items-center gap-3">
          <span className="h-px flex-1 bg-white/12" />
          <span className="eyebrow text-white/35">or</span>
          <span className="h-px flex-1 bg-white/12" />
        </div>

        <button
          onClick={enterWithGoogle}
          disabled={busy}
          className="mt-4 flex w-full items-center justify-center gap-2.5 rounded-lg border border-white/20 bg-white/[0.04] px-4 py-3 text-sm font-semibold text-white transition hover:border-accent hover:bg-white/[0.07] disabled:opacity-40"
        >
          <svg viewBox="0 0 18 18" className="h-4 w-4" aria-hidden="true">
            <path
              fill="#4285F4"
              d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62Z"
            />
            <path
              fill="#34A853"
              d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.94v2.33A9 9 0 0 0 9 18Z"
            />
            <path
              fill="#FBBC05"
              d="M3.97 10.72a5.4 5.4 0 0 1 0-3.44V4.95H.94a9 9 0 0 0 0 8.1l3.03-2.33Z"
            />
            <path
              fill="#EA4335"
              d="M9 3.58c1.32 0 2.5.46 3.44 1.35l2.58-2.58C13.46.9 11.43 0 9 0A9 9 0 0 0 .94 4.95l3.03 2.33C4.68 5.16 6.66 3.58 9 3.58Z"
            />
          </svg>
          {busy ? "opening…" : "Continue with Google"}
        </button>

        <p className="mt-2.5 text-[12.5px] leading-relaxed text-white/40">
          The same account you use for the rest of the Goldie Suite.
        </p>

        {/*
          Said before the account exists, not buried in a footer afterwards.
          Somebody agreeing to terms should be able to read them at the moment
          they agree, without signing in first.
        */}
        <p className="mt-4 text-[12.5px] leading-relaxed text-white/40">
          By continuing you agree to the{" "}
          <a href="/terms" className="underline underline-offset-4 hover:text-white/70">
            Terms
          </a>{" "}
          and the{" "}
          <a href="/privacy" className="underline underline-offset-4 hover:text-white/70">
            Privacy Policy
          </a>
          .
        </p>

        {err && (
          <p className="mt-4 rounded-lg border border-accent/40 bg-accent/10 px-4 py-3 text-[13px] leading-relaxed text-white">
            {err}
          </p>
        )}

        {/*
          There is no way in without an email, on purpose.

          The old "look around without an account" door created a real account
          with no address attached, and that world then belonged to a browser
          rather than to a person. Sign in properly afterwards and it does not
          follow you — it is simply gone, with nothing on screen to say it ever
          existed. That is indistinguishable from the app having eaten your
          work, and it is not worth whatever the frictionless front door buys.
        */}
      </div>
    </main>
  );
}
