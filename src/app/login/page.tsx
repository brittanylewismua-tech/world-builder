"use client";

import Link from "next/link";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { useWorld } from "@/lib/useWorld";
import { Star } from "@/components/ui";

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

        <h1 className="mt-5 text-[clamp(2.6rem,9vw,4.2rem)] font-extrabold leading-[0.98] tracking-[-0.035em] text-white">
          world
          <br />
          builder
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
            placeholder="you@yourshop.com"
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
