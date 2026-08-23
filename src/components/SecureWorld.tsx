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
 * Attaching an email keeps everything exactly as it is — same world, same
 * drops, same conversations — and makes it reachable from anywhere. Supabase
 * links the address to the existing anonymous user, so nothing is migrated
 * and nothing can be dropped in the middle.
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
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [err, setErr] = useState("");

  // Only anonymous accounts are at risk.
  if (!session?.user?.is_anonymous || hidden) return null;

  async function attach() {
    const addr = email.trim();
    if (!addr) return;
    setBusy(true);
    setErr("");
    const { error } = await supabase.auth.updateUser(
      { email: addr },
      { emailRedirectTo: `${window.location.origin}/` },
    );
    setBusy(false);
    if (error) {
      setErr(
        /already been registered|already exists/i.test(error.message)
          ? "That address already has a world. Sign out and sign in with it instead — but note this browser's world is separate and would be left behind."
          : error.message,
      );
      return;
    }
    setSent(true);
    void refresh();
  }

  if (sent)
    return (
      <div className="note t-small mb-6 px-4 py-3.5 text-ink-2">
        <span className="font-bold text-ink">Check {email.trim()}.</span> Click
        the link in that email and this world is tied to your address — you will
        be able to open it from any device. Nothing changes here until you do.
      </div>
    );

  return (
    <div className="card mb-6 p-4 md:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="t-h3 text-ink">This world only exists in this browser</p>
          <p className="t-small mt-1 max-w-xl text-ink-2">
            You came in without an email, which was the fast way to start. But
            if you clear your history or move to another device, there is no way
            to get this back. Adding an address fixes that and changes nothing
            else.
          </p>
        </div>
        {!open && (
          <div className="flex shrink-0 gap-2">
            <button onClick={() => setOpen(true)} className="btn btn-accent">
              Add my email
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
            <button
              onClick={attach}
              disabled={busy || !email.trim()}
              className="btn btn-accent shrink-0"
            >
              {busy ? "Sending…" : "Send the link"}
            </button>
          </div>
          {err && <p className="t-small mt-2 text-ink-2">{err}</p>}
          <p className="t-small mt-2 text-ink-3">
            Your world stays exactly as it is. This only adds a way back in.
          </p>
        </div>
      )}
    </div>
  );
}
