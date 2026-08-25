"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { useWorld } from "@/lib/useWorld";

/**
 * WHO THIS WORLD BELONGS TO, AND HOW TO GET BACK IN
 *
 * Every account signing in with an email needs to be able to set a password,
 * for a blunt reason: the alternative is a link in an email, and the first
 * real one this product sent landed in spam. Somebody who has to go fishing
 * through a junk folder to open their own work will stop opening it.
 *
 * Setting a password while already signed in needs no email at all, so this
 * is the one moment where securing an account costs nothing. It lives in
 * World Profile rather than nagging from the top of every screen, because by
 * definition these people are already reachable.
 */
export default function AccountCard() {
  const { session } = useWorld();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState("");

  const email = session?.user?.email;
  if (!email) return null;

  async function save() {
    if (password.length < 8 || password !== confirm || busy) return;
    setBusy(true);
    setErr("");
    const { error } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (error) {
      setErr(error.message);
      return;
    }
    setPassword("");
    setConfirm("");
    setDone(true);
  }

  return (
    <section className="card mb-6 p-5 md:p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="t-h3">Your account</h3>
        <span className="t-small text-ink-2">{email}</span>
      </div>

      {done ? (
        <p className="t-small mt-3 text-ink-2">
          <span className="font-bold text-ink">Password saved.</span> You can
          sign in with {email} and that password from any device — no email
          required, nothing to go missing in a spam folder.
        </p>
      ) : (
        <>
          <p className="t-small mt-1 max-w-lg text-ink-2">
            Set a password and you can sign in from any device without waiting
            on an email. If you already have one, this replaces it.
          </p>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <input
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && save()}
              type="password"
              autoComplete="new-password"
              placeholder="new password, 8+ characters"
              className="field max-w-sm"
            />
            <input
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && save()}
              type="password"
              autoComplete="new-password"
              placeholder="type it again"
              className="field max-w-sm"
            />
            <button
              onClick={save}
              disabled={busy || password.length < 8 || password !== confirm}
              className="btn btn-accent shrink-0"
            >
              {busy ? "Saving…" : "Set password"}
            </button>
          </div>
          {confirm.length > 0 && confirm !== password && (
            <p className="t-small mt-2 font-semibold text-ink">
              Those two do not match.
            </p>
          )}
          {err && <p className="t-small mt-2 text-ink-2">{err}</p>}
        </>
      )}
    </section>
  );
}
