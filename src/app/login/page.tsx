"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { useWorld } from "@/lib/useWorld";
import { Star } from "@/components/ui";

/**
 * The sign-in door stays dark with the globe — this is the brand moment, and
 * it matches the challenge artwork. The workspace behind it is light.
 */
export default function Login() {
  const router = useRouter();
  const { session, loading } = useWorld();
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    if (!loading && session) router.replace("/");
  }, [loading, session, router]);

  async function sendLink() {
    const addr = email.trim();
    if (!addr) return;
    setBusy(true);
    setErr("");
    const { error } = await supabase.auth.signInWithOtp({
      email: addr,
      options: { emailRedirectTo: `${window.location.origin}/` },
    });
    setBusy(false);
    if (error) setErr(error.message);
    else setSent(true);
  }

  async function enterAnonymously() {
    setBusy(true);
    setErr("");
    const { error } = await supabase.auth.signInAnonymously();
    setBusy(false);
    if (error) {
      setErr(
        /disabled|not enabled/i.test(error.message)
          ? "Anonymous sign-in is switched off for this Supabase project. Turn it on under Authentication → Sign In / Providers."
          : error.message,
      );
      return;
    }
    router.replace("/");
  }

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

        <div className="mt-9">
          <button
            onClick={enterAnonymously}
            disabled={busy}
            className="w-full rounded-xl border-2 border-white bg-[#ee6fc0] py-3.5 text-base font-extrabold text-black shadow-[4px_4px_0_#fff] transition hover:translate-x-[-2px] hover:translate-y-[-2px] hover:shadow-[6px_6px_0_#fff] disabled:opacity-50"
          >
            {busy ? "opening…" : "enter"}
          </button>
          <p className="mt-3 text-[13px] leading-relaxed text-white/50">
            No email, no password. Your world saves to this browser&apos;s
            account and stays yours.
          </p>
        </div>

        {err && (
          <p className="mt-5 rounded-lg border border-accent/40 bg-accent/10 px-4 py-3 text-[13px] leading-relaxed text-white">
            {err}
          </p>
        )}

        <details className="mt-10 border-t border-white/12 pt-5">
          <summary className="eyebrow cursor-pointer text-white/45 transition hover:text-accent">
            Or sign in with email
          </summary>
          {sent ? (
            <div className="mt-4 rounded-lg border border-white/12 bg-white/[0.05] px-4 py-4">
              <p className="text-sm font-semibold text-accent">Check your email</p>
              <p className="mt-1.5 text-[13px] leading-relaxed text-white/65">
                A link is on its way to {email.trim()}. Supabase&apos;s built-in
                mailer is rate limited, so if nothing arrives in a couple of
                minutes, use Enter above instead.
              </p>
              <button
                onClick={() => setSent(false)}
                className="mt-3 text-[12px] text-white/45 transition hover:text-accent"
              >
                Different email
              </button>
            </div>
          ) : (
            <div className="mt-4 flex flex-col gap-2 sm:flex-row">
              <input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && sendLink()}
                type="email"
                autoComplete="email"
                placeholder="you@yourshop.com"
                className="w-full rounded-lg border border-white/15 bg-white/[0.05] px-3.5 py-2.5 text-sm text-white outline-none transition placeholder:text-white/35 focus:border-accent"
              />
              <button
                onClick={sendLink}
                disabled={busy || !email.trim()}
                className="shrink-0 rounded-lg border border-white/20 px-4 py-2.5 text-sm font-medium text-white transition hover:border-accent hover:text-accent disabled:opacity-40"
              >
                Send link
              </button>
            </div>
          )}
        </details>
      </div>
    </main>
  );
}
