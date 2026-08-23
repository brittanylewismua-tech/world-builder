"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { useWorld } from "@/lib/useWorld";

/**
 * PUTTING A WORLD SOMEWHERE IT CANNOT BE LOST
 *
 * "Enter" creates an anonymous account, which is the right front door — no
 * form between someone and the thing they came to try. But that account lives
 * in one browser. Clear cookies, switch to the laptop, get a new phone, and
 * months of work is gone with no way to recover it. That is the single worst
 * thing this product can do to somebody.
 *
 * Attaching an email and password keeps everything exactly as it is — same
 * world, same drops, same conversations — and makes it reachable from
 * anywhere. The address is applied to the existing account, so nothing is
 * migrated and nothing can be dropped in the middle.
 *
 * No confirmation email is involved, deliberately. The one time we relied on
 * one it went to spam and a real world sat stranded. They set a password and
 * are secured before they finish reading the sentence.
 *
 * Tone matters here. This is a real risk and people should act on it, but a
 * creative tool that nags is a creative tool people avoid. Said once, plainly,
 * dismissible, and it comes back next session if still unsecured.
 */
export default function SecureWorld() {
  const { session, refresh } = useWorld();
  const [open, setOpen] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState("");

  // Only anonymous accounts are at risk.
  if (!session?.user?.is_anonymous || hidden) return null;

  async function attach() {
    const addr = email.trim();
    if (!addr || password.length < 8 || password !== confirm) return;
    setBusy(true);
    setErr("");

    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) {
      setBusy(false);
      setErr("Your session expired. Reload the page and try again.");
      return;
    }

    const r = await fetch("/api/auth/claim", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ email: addr, password }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) {
      setBusy(false);
      setErr(j.error || "That did not work.");
      return;
    }

    // Re-authenticate with the new credentials so the session reflects them.
    await supabase.auth.signInWithPassword({ email: addr, password });
    setBusy(false);
    setDone(true);
    setPassword("");
    setConfirm("");
    void refresh();
  }

  if (done)
    return (
      <div className="note t-small mb-6 px-4 py-3.5 text-ink-2">
        <span className="font-bold text-ink">Saved.</span> This world now
        belongs to {email.trim()}. Sign in with that email and your password
        from any device and everything will be here.
      </div>
    );

  return (
    <div className="card mb-6 p-4 md:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="t-h3 text-ink">This world only exists in this browser</p>
          <p className="t-small mt-1 max-w-xl text-ink-2">
            You came in without an account, which was the fast way to start.
            But if you clear your history or move to another device, there is
            no way to get this back. Setting an email and password fixes that
            and changes nothing else. No confirmation email — you are secured
            the moment you save.
          </p>
        </div>
        {!open && (
          <div className="flex shrink-0 gap-2">
            <button onClick={() => setOpen(true)} className="btn btn-accent">
              Keep this world
            </button>
            <button
              onClick={() => setHidden(true)}
              className="btn btn-ghost"
              aria-label="Dismiss for now"
            >
              Not now
            </button>
          </div>
        )}
      </div>

      {open && (
        <div className="rise mt-4">
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && attach()}
              type="email"
              autoComplete="email"
              placeholder="you@yourshop.com"
              className="field"
              autoFocus
            />
            <input
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && attach()}
              type="password"
              autoComplete="new-password"
              placeholder="password, 8+ characters"
              className="field"
            />
            <input
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && attach()}
              type="password"
              autoComplete="new-password"
              placeholder="type it again"
              className="field"
            />
            <button
              onClick={attach}
              disabled={
                busy ||
                !email.trim() ||
                password.length < 8 ||
                password !== confirm
              }
              className="btn btn-accent shrink-0"
            >
              {busy ? "Saving…" : "Save"}
            </button>
          </div>
          {confirm.length > 0 && confirm !== password && (
            <p className="t-small mt-2 font-semibold text-ink">
              Those two do not match.
            </p>
          )}
          {err && <p className="t-small mt-2 text-ink-2">{err}</p>}
          <p className="t-small mt-2 text-ink-3">
            Typed twice on purpose — there is no email on this account yet, so
            a typo here would lock you out of your own world.
          </p>
        </div>
      )}
    </div>
  );
}
