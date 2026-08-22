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

  async function send() {
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

  return (
    <main className="min-h-dvh gridfield relative overflow-hidden">
      <div className="pointer-events-none absolute -right-48 -top-36 text-pink opacity-70">
        <Globe size={720} className="spin-slow" />
      </div>

      <div className="relative mx-auto flex min-h-dvh max-w-lg flex-col justify-center px-6 py-16">
        <div className="flex items-center gap-3 text-pink">
          <Sparkle size={13} />
          <span className="eyebrow">For print on demand sellers</span>
        </div>

        <h1 className="display mt-6 text-[clamp(2.6rem,10vw,4.6rem)] text-paper">
          World
          <br />
          Builder
        </h1>
        <p className="script -mt-2 text-[clamp(1.6rem,5vw,2.6rem)] text-pink">
          build one customer deeply
        </p>

        {sent ? (
          <div className="hairline mt-10 bg-pink/5 px-5 py-5">
            <p className="display text-xl text-pink">Check your email</p>
            <p className="mt-2 text-sm leading-relaxed text-paper/80">
              A sign-in link is on its way to{" "}
              <span className="text-pink">{email.trim()}</span>. Open it on this
              device and you will land straight in your world.
            </p>
            <button
              onClick={() => setSent(false)}
              className="eyebrow mt-4 text-smoke transition hover:text-pink"
            >
              Use a different email
            </button>
          </div>
        ) : (
          <div className="mt-10">
            <label className="eyebrow text-pink/80">Email</label>
            <div className="mt-3 flex flex-col gap-3 sm:flex-row">
              <input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && send()}
                type="email"
                autoComplete="email"
                placeholder="you@yourshop.com"
                className="hairline w-full bg-black/60 px-5 py-4 text-base text-paper outline-none placeholder:text-smoke/50 focus:border-pink"
              />
              <button
                onClick={send}
                disabled={busy || !email.trim()}
                className="display shrink-0 bg-pink px-7 py-4 text-xl text-black transition hover:bg-pink-hot disabled:cursor-not-allowed disabled:bg-paper/10 disabled:text-smoke"
              >
                {busy ? "Sending" : "Send link"}
              </button>
            </div>
            <p className="mt-3 text-sm text-smoke">
              No password. We email you a link.
            </p>
            {err && <p className="mt-3 text-sm text-pink">{err}</p>}
          </div>
        )}
      </div>
    </main>
  );
}
