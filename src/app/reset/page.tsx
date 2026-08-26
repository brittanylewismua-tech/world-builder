"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import Logo from "@/components/Logo";
import { report } from "@/lib/report";

/**
 * FORGETTING A PASSWORD MUST NOT COST SOMEONE THEIR WORLD.
 *
 * A year of research behind a password with no way back is not security, it
 * is a trapdoor. This page does both halves of the job: asking for a reset
 * link, and setting the new password once one is followed.
 *
 * ON THE EMAIL ITSELF — this only works when the Supabase project has a real
 * sender configured. The built-in mailer is what put a magic link in spam and
 * stranded a live world, which is why this product uses passwords at all. So
 * the failure case is treated as a first-class outcome rather than a silent
 * nothing: if the send does not go through, the page says so plainly and
 * points at a human, instead of showing a cheerful "check your inbox" for an
 * email that will never arrive.
 */
export default function Reset() {
  const router = useRouter();
  const [mode, setMode] = useState<"ask" | "set">("ask");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [err, setErr] = useState("");

  /*
    Arriving from the link in the email puts a recovery session in place.
    Supabase signals that with a PASSWORD_RECOVERY event, and the URL carries
    a type=recovery fragment — check both, because the event can fire before
    this component mounts.
  */
  useEffect(() => {
    if (typeof window !== "undefined" && window.location.hash.includes("recovery"))
      setMode("set");
    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") setMode("set");
    });
    return () => data.subscription.unsubscribe();
  }, []);

  async function sendLink() {
    const addr = email.trim().toLowerCase();
    if (!addr || busy) return;
    setBusy(true);
    setErr("");
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(addr, {
        redirectTo: `${window.location.origin}/reset`,
      });
      if (error) throw new Error(error.message);
      setSent(true);
    } catch (e) {
      report("auth", e, { step: "reset-request" });
      setErr(
        e instanceof Error
          ? e.message
          : "The reset email could not be sent from here.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function setNewPassword() {
    if (password.length < 8 || password !== confirm || busy) return;
    setBusy(true);
    setErr("");
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw new Error(error.message);
      router.replace("/home");
    } catch (e) {
      report("auth", e, { step: "reset-complete" });
      setErr(
        e instanceof Error
          ? e.message
          : "That did not save. The link may have expired — ask for a new one.",
      );
      setBusy(false);
    }
  }

  const mismatch = confirm.length > 0 && confirm !== password;

  return (
    <main className="flex min-h-dvh items-center justify-center bg-white px-5 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-7 flex items-center">
          <Logo height={24} />
        </div>

        {mode === "set" ? (
          <>
            <h1 className="t-h2 text-ink">Choose a new password</h1>
            <p className="t-small mt-1.5 text-ink-2">
              Your world is exactly where you left it.
            </p>

            <input
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              type="password"
              autoComplete="new-password"
              placeholder="at least 8 characters"
              className="field mt-5 w-full"
            />
            <input
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && setNewPassword()}
              type="password"
              autoComplete="new-password"
              placeholder="type it again"
              className="field mt-2 w-full"
            />
            {mismatch && (
              <p className="t-small mt-1.5 text-ink-2">
                Those two do not match yet.
              </p>
            )}

            <button
              onClick={setNewPassword}
              disabled={busy || password.length < 8 || password !== confirm}
              className="btn btn-accent mt-4 w-full py-3"
            >
              {busy ? "Saving…" : "Save it and go in"}
            </button>
          </>
        ) : sent ? (
          <>
            <h1 className="t-h2 text-ink">Check your email</h1>
            <p className="t-body mt-2 text-ink-2">
              If there is an account for{" "}
              <span className="font-semibold text-ink">{email.trim()}</span>, a
              link to set a new password is on its way. It expires in an hour.
            </p>
            <p className="t-small mt-3 text-ink-3">
              Nothing after a few minutes? Check spam first — and if it is not
              there either, email brittanylewismua@gmail.com and your world
              will be opened up by hand. You will not lose it.
            </p>
            <Link href="/login" className="btn btn-ghost mt-5 w-full">
              Back to sign in
            </Link>
          </>
        ) : (
          <>
            <h1 className="t-h2 text-ink">Forgotten your password?</h1>
            <p className="t-small mt-1.5 text-ink-2">
              Your world is not going anywhere. Put in the email you signed up
              with and you can set a new one.
            </p>

            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && sendLink()}
              type="email"
              autoComplete="email"
              placeholder="you@example.com"
              className="field mt-5 w-full"
            />
            <button
              onClick={sendLink}
              disabled={busy || !email.trim()}
              className="btn btn-accent mt-3 w-full py-3"
            >
              {busy ? "Sending…" : "Send me a reset link"}
            </button>
            <Link
              href="/login"
              className="t-small mt-4 block text-center text-ink-3 transition hover:text-ink"
            >
              Back to sign in
            </Link>
          </>
        )}

        {err && (
          <div className="mt-4 rounded-lg border border-[#f3c9c9] bg-[#fdf0f0] px-4 py-3">
            <p className="text-sm text-[#8a2020]">{err}</p>
            <p className="mt-1.5 text-sm text-[#8a2020]">
              Email brittanylewismua@gmail.com and your world will be reopened
              by hand. Nothing has been lost.
            </p>
          </div>
        )}
      </div>
    </main>
  );
}
