"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { useWorld } from "@/lib/useWorld";
import { Globe, Sparkle } from "@/components/Globe";

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

  /**
   * Supabase's built-in mailer is rate-limited and unreliable, which makes the
   * magic link a bad front door while this is still being built. Anonymous
   * sign-in creates a real auth user, so auth.uid() and every RLS policy work
   * exactly as they do for an email account — there is just no inbox in the way.
   */
  async function enterAnonymously() {
    setBusy(true);
    setErr("");
    const { error } = await supabase.auth.signInAnonymously();
    setBusy(false);
    if (error) {
      setErr(
        error.message.toLowerCase().includes("disabled") ||
          error.message.toLowerCase().includes("not enabled")
          ? "Anonymous sign-in is switched off for this Supabase project. Turn it on under Authentication → Sign In / Providers → Anonymous Sign-Ins."
          : error.message,
      );
      return;
    }
    router.replace("/");
  }

  return (
    <main className="min-h-dvh gridfield relative overflow-hidden">
      <div className="pointer-events-none absolute -right-52 -top-44 text-pink opacity-40">
        <Globe size={640} />
      </div>
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_82%_12%,rgba(238,111,192,0.16),transparent_55%)]" />

      <div className="relative mx-auto flex min-h-dvh max-w-lg flex-col justify-center px-6 py-16">
        <div className="flex items-center gap-3 text-pink">
          <Sparkle size={13} />
          <span className="eyebrow">For print on demand sellers</span>
        </div>

        <h1 className="display mt-6 text-[clamp(2.8rem,11vw,5rem)] text-paper">
          World
          <br />
          Builder
        </h1>
        <p className="display mt-4 text-[clamp(1rem,3vw,1.5rem)] text-pink">
          Build one customer deeply
        </p>
        <span className="mt-4 block h-0.5 w-24 bg-pink" />

        <div className="mt-10">
          <button
            onClick={enterAnonymously}
            disabled={busy}
            className="display w-full bg-pink py-4 text-2xl text-black transition hover:bg-pink-hot disabled:bg-paper/10 disabled:text-smoke"
          >
            {busy ? "Opening" : "Enter"}
          </button>
          <p className="mt-3 text-sm leading-relaxed text-smoke">
            No email, no password. Your world saves to this browser&apos;s
            account and stays yours.
          </p>
        </div>

        {err && (
          <p className="mt-5 border-l-2 border-pink bg-pink/10 px-4 py-3 text-sm leading-relaxed text-paper">
            {err}
          </p>
        )}

        <details className="mt-10 border-t border-pink/20 pt-5">
          <summary className="eyebrow cursor-pointer text-smoke transition hover:text-pink">
            Or sign in with email
          </summary>
          {sent ? (
            <div className="hairline mt-4 bg-pink/5 px-5 py-5">
              <p className="display text-lg text-pink">Check your email</p>
              <p className="mt-2 text-sm leading-relaxed text-paper/80">
                A link is on its way to {email.trim()}. Supabase&apos;s built-in
                mailer is rate limited, so if nothing arrives in a couple of
                minutes, use Enter above instead.
              </p>
              <button
                onClick={() => setSent(false)}
                className="eyebrow mt-4 text-smoke transition hover:text-pink"
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
                className="hairline w-full bg-black/60 px-4 py-3 text-sm text-paper outline-none placeholder:text-smoke/50 focus:border-pink"
              />
              <button
                onClick={sendLink}
                disabled={busy || !email.trim()}
                className="display shrink-0 border border-paper/25 px-5 py-3 text-base text-paper transition hover:border-pink hover:text-pink disabled:opacity-40"
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
