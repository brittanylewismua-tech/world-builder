"use client";

import { useEffect, useState } from "react";

/**
 * A TAB THAT HAS QUIETLY BECOME THE OLD VERSION.
 *
 * The app is deployed several times a day during the challenge, and a browser
 * that was already open keeps running whatever it downloaded when it loaded.
 * Nothing tells it otherwise. So a seller reports a bug that was fixed hours
 * ago, or presses a button whose route has changed underneath it — and the
 * fix that exists is one refresh away that nobody thought to make.
 *
 * HOW IT KNOWS. It records the live commit when the tab loads and asks again
 * on a timer. Different answer, older tab. No build-time constant and nothing
 * to keep in step: the comparison is always "what is live now" against "what
 * was live when this page started".
 *
 * WHEN IT ASKS. Every two minutes, and immediately whenever the tab is
 * brought back to the front — which is the actual moment somebody returns to
 * a window that has been sitting open since this morning. Never while hidden,
 * because a background tab polling all night is somebody's battery.
 *
 * IT DOES NOT RELOAD ANYTHING BY ITSELF. Reloading someone mid-sentence in
 * the Creative Room, or halfway through naming a drop, would be a worse bug
 * than the one being fixed. It offers; they choose.
 */
export default function NewVersion() {
  const [stale, setStale] = useState(false);
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    let alive = true;
    let loadedWith: string | null = null;

    async function check() {
      if (document.visibilityState !== "visible") return;
      try {
        const r = await fetch("/api/version", { cache: "no-store" });
        if (!r.ok) return;
        const { commit } = (await r.json()) as { commit?: string };
        if (!alive || !commit) return;

        /* First answer is the baseline, not a change. */
        if (loadedWith === null) {
          loadedWith = commit;
          return;
        }
        if (commit !== loadedWith) setStale(true);
      } catch {
        /* Offline, or a deploy swapping over. Ask again next time. */
      }
    }

    check();
    const timer = setInterval(check, 120_000);
    document.addEventListener("visibilitychange", check);

    return () => {
      alive = false;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", check);
    };
  }, []);

  if (!stale || hidden) return null;

  return (
    <div
      role="status"
      className="fixed inset-x-0 bottom-0 z-50 border-t-2 border-black bg-[#0d0c0c] px-5 py-3"
    >
      <div className="mx-auto flex max-w-4xl flex-wrap items-center gap-x-4 gap-y-2">
        <span
          aria-hidden
          className="notice-dot inline-block h-2 w-2 shrink-0 rounded-full"
          style={{ background: "var(--accent)" }}
        />
        <p className="t-small font-semibold text-white">
          A new version of World Builder is available.
        </p>
        <span className="ml-auto flex shrink-0 items-center gap-4">
          <button
            onClick={() => window.location.reload()}
            className="btn btn-accent shrink-0"
          >
            Reload now
          </button>
          {/*
            A way to put it down. Somebody two thousand words into the
            Creative Room should not be nagged by a bar they cannot move,
            and they will get the new version on their next navigation
            regardless.
          */}
          <button
            onClick={() => setHidden(true)}
            aria-label="Dismiss"
            className="t-small shrink-0 text-white/50 transition hover:text-white"
          >
            Not now
          </button>
        </span>
      </div>
    </div>
  );
}
