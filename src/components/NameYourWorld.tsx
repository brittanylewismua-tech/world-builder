"use client";

import { useState } from "react";
import { useWorld } from "@/lib/useWorld";
import { saveWorld } from "@/lib/api";
import type { World } from "@/lib/world";

/**
 * A WORLD WITHOUT A NAME IS A BROKEN WORLD
 *
 * The name is not decoration — the product speaks it out loud. Without one
 * the customer simulation is headed "talking to" and nothing else, and the
 * seller has no sense of which world they are inside. That is a data
 * integrity problem wearing a copy problem's clothes.
 *
 * It is asked for, never inferred. Naming the broader customer universe is
 * the seller's judgement and the last real step of the foundation; an AI
 * guessing it would be the tool quietly taking over the one decision the
 * whole method is built on.
 *
 * Not a blocker. They can look around a nameless world all they like — this
 * simply keeps asking, and marks the places the gap shows.
 */
export default function NameYourWorld({ world }: { world: World }) {
  const { patch } = useWorld();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  if (world.name.trim()) return null;

  async function save() {
    const clean = name.trim();
    if (!clean || busy) return;
    setBusy(true);
    setErr("");
    try {
      await saveWorld(world.id, { name: clean });
      patch({ name: clean });
    } catch (e) {
      setErr(e instanceof Error ? e.message : "That did not save.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card mb-6 p-5 md:p-6">
      <h3 className="t-h3">This world does not have a name yet</h3>
      <p className="t-small mt-1 max-w-xl text-ink-2">
        Your research is saved. Give this customer world a name to finish the
        foundation — the software uses it throughout, and a few screens read
        oddly without it.
      </p>

      {world.subNiches.length > 0 && (
        <div className="mt-3">
          <p className="eyebrow mb-1.5 text-ink-3">What you validated</p>
          <div className="flex flex-wrap gap-1.5">
            {world.subNiches.map((s) => (
              <span key={s.id} className="chip">
                {s.keyword}
              </span>
            ))}
          </div>
          <p className="t-small mt-2 text-ink-3">
            What is the broader customer universe underneath those? You name it.
          </p>
        </div>
      )}

      <div className="mt-4 flex flex-col gap-2 sm:flex-row">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && save()}
          placeholder="Festival + Rave"
          className="field max-w-sm"
        />
        <button
          onClick={save}
          disabled={busy || !name.trim()}
          className="btn btn-accent shrink-0"
        >
          {busy ? "Saving…" : "Name this world"}
        </button>
      </div>
      {err && <p className="t-small mt-2 text-ink-2">{err}</p>}
    </section>
  );
}
