"use client";

import { useEffect, useState } from "react";
import { listWorlds, pickWorld, pickedWorld } from "@/lib/api";

/**
 * WHICH WORLD AM I IN.
 *
 * The app loaded whichever world was made first and offered no way to reach
 * any other. Build a second world and it is simply gone — no error, no hint,
 * just the first one forever, which reads as the app having lost your work.
 *
 * So: a switcher, but only when there is something to switch between. One
 * world is the normal case and does not need a control asking about it.
 *
 * Switching reloads rather than swapping state in place. Every open panel on
 * every page holds a world id — the drops, the boards, the two conversations,
 * the theme — and quietly re-pointing all of that is a much larger surface to
 * get wrong than simply starting the page again.
 */
export default function WorldSwitch({ current }: { current: string }) {
  const [worlds, setWorlds] = useState<
    { id: string; name: string; createdAt: string }[]
  >([]);

  useEffect(() => {
    listWorlds()
      .then(setWorlds)
      .catch(() => setWorlds([]));
  }, []);

  if (worlds.length < 2) return null;

  function go(id: string) {
    if (id === current) return;
    pickWorld(id);
    window.location.href = "/home";
  }

  return (
    <section className="card mb-6 p-4">
      <p className="eyebrow mb-2 text-ink-3">You have more than one world</p>
      <div className="flex flex-wrap gap-2">
        {worlds.map((w, i) => {
          const on = w.id === (pickedWorld() ?? current) || w.id === current;
          return (
            <button
              key={w.id}
              onClick={() => go(w.id)}
              aria-current={on ? "true" : undefined}
              className={`rounded-lg border px-3 py-2 text-left text-[13px] font-semibold transition ${
                on
                  ? "border-black bg-black text-white"
                  : "border-black/15 bg-white text-ink-2 hover:border-black hover:text-ink"
              }`}
            >
              {w.name.trim() || `Untitled world ${i + 1}`}
              <span
                className={`ml-2 text-[11px] font-normal ${on ? "opacity-60" : "text-ink-3"}`}
              >
                {new Date(w.createdAt).toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                })}
              </span>
            </button>
          );
        })}
      </div>
      <p className="t-small mt-2 text-ink-3">
        Worlds are separate — their drops, research and conversations do not
        mix. Switching reloads the app into the one you pick.
      </p>
    </section>
  );
}
