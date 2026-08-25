"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * A DIVIDER YOU CAN GRAB.
 *
 * Two panes, one draggable line between them, and the width remembered per
 * seller. Nobody agrees on how much room a conversation deserves — it depends
 * on whether you are talking or looking, and that changes hour to hour. So the
 * product stops guessing and hands over the handle.
 *
 * Notes on the implementation, because split panes are easy to do badly:
 *
 * - Dragging listens on `window`, not on the handle, so yanking the mouse
 *   faster than React re-renders does not drop the drag.
 * - `user-select: none` goes on the body during a drag. Without it the whole
 *   page highlights blue the moment you move sideways over text.
 * - Width is stored as a fraction, not pixels. A width saved on a 27" monitor
 *   would otherwise swallow the entire screen on a laptop.
 * - The handle is a real `separator` with arrow-key support. Anyone who cannot
 *   use a mouse can still set the size, and it costs about six lines.
 * - Collapse is a distinct state, not a width of zero, so reopening returns to
 *   the size you had rather than to a sliver you have to fish for.
 */

interface Props {
  /** Rendered on the left. In this product, the conversation. */
  left: React.ReactNode;
  /** Rendered on the right, taking whatever is left over. */
  right: React.ReactNode;
  /** Remembered under this key, per browser. */
  storageKey: string;
  /** Starting fraction of the total width given to the left pane. */
  initial?: number;
  min?: number;
  max?: number;
  /** Shown on the reopen tab when the collapsible pane is shut. */
  collapsedLabel?: string;
  /** Which side folds away. The other one is the work and always stays. */
  collapse?: "left" | "right";
}

export default function SplitPane({
  left,
  right,
  storageKey,
  initial = 0.32,
  min = 0.22,
  max = 0.55,
  collapsedLabel = "Chat",
  collapse = "left",
}: Props) {
  const frame = useRef<HTMLDivElement>(null);
  const [fraction, setFraction] = useState(initial);
  const [shut, setShut] = useState(false);
  const [dragging, setDragging] = useState(false);
  /*
    Split panes need real width to make sense of. Below that the two panes
    stack and the handle disappears entirely — a 6px drag target on a phone is
    a joke, and a 30% column of chat on a 390px screen is 117 pixels.
  */
  const [wide, setWide] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const sync = () => setWide(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      if (!saved) return;
      const { f, shut: wasShut } = JSON.parse(saved) as {
        f?: number;
        shut?: boolean;
      };
      if (typeof f === "number" && f >= min && f <= max) setFraction(f);
      if (typeof wasShut === "boolean") setShut(wasShut);
    } catch {
      // A corrupt preference is not worth a broken page.
    }
  }, [storageKey, min, max]);

  const save = useCallback(
    (f: number, isShut: boolean) => {
      try {
        localStorage.setItem(storageKey, JSON.stringify({ f, shut: isShut }));
      } catch {
        // Private browsing, quota, an extension. Fine — it just will not stick.
      }
    },
    [storageKey],
  );

  const setTo = useCallback(
    (f: number) => {
      const clamped = Math.min(max, Math.max(min, f));
      setFraction(clamped);
      save(clamped, false);
    },
    [min, max, save],
  );

  useEffect(() => {
    if (!dragging) return;

    function onMove(e: MouseEvent) {
      const box = frame.current?.getBoundingClientRect();
      if (!box || box.width === 0) return;
      setTo((e.clientX - box.left) / box.width);
    }
    function stop() {
      setDragging(false);
    }

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", stop);
    // Dragging past the window edge and releasing there must not leave the
    // handle stuck to the cursor.
    window.addEventListener("blur", stop);
    const priorSelect = document.body.style.userSelect;
    const priorCursor = document.body.style.cursor;
    document.body.style.userSelect = "none";
    document.body.style.cursor = "col-resize";

    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", stop);
      window.removeEventListener("blur", stop);
      document.body.style.userSelect = priorSelect;
      document.body.style.cursor = priorCursor;
    };
  }, [dragging, setTo]);

  function toggle() {
    const next = !shut;
    setShut(next);
    save(fraction, next);
  }

  /* Narrow screens: stack, board first. On a phone you are collecting, not
     deliberating, so the material outranks the conversation. */
  if (!wide)
    return (
      <div className="space-y-5">
        <div>{right}</div>
        <div className="min-h-[70vh]">{left}</div>
      </div>
    );

  if (shut) {
    const tab = (
      <button
        onClick={toggle}
        title="Open the conversation"
        className="card card-hover flex w-11 shrink-0 items-center justify-center self-start py-6"
      >
        <span
          className="eyebrow whitespace-nowrap text-ink-2"
          style={{ writingMode: "vertical-rl", rotate: "180deg" }}
        >
          {collapsedLabel} ›
        </span>
      </button>
    );
    return (
      <div className="flex gap-3">
        {collapse === "left" ? tab : <div className="min-w-0 flex-1">{left}</div>}
        {collapse === "left" ? (
          <div className="min-w-0 flex-1">{right}</div>
        ) : (
          tab
        )}
      </div>
    );
  }

  const pct = `${(fraction * 100).toFixed(2)}%`;

  return (
    <div ref={frame} className="flex items-start">
      <div style={{ width: pct }} className="min-w-0 shrink-0">
        {left}
      </div>

      <div className="flex shrink-0 flex-col items-center self-stretch">
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize the conversation"
          aria-valuenow={Math.round(fraction * 100)}
          aria-valuemin={Math.round(min * 100)}
          aria-valuemax={Math.round(max * 100)}
          tabIndex={0}
          onMouseDown={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDoubleClick={() => setTo(initial)}
          onKeyDown={(e) => {
            if (e.key === "ArrowLeft") setTo(fraction - 0.02);
            else if (e.key === "ArrowRight") setTo(fraction + 0.02);
            else if (e.key === "Home") setTo(min);
            else if (e.key === "End") setTo(max);
            else return;
            e.preventDefault();
          }}
          title="Drag to resize · double-click to reset"
          className={`group relative w-4 shrink-0 cursor-col-resize self-stretch outline-none ${
            dragging ? "" : "transition"
          }`}
        >
          {/*
            A grip, not a hairline. The first version was a 2px line at 12%
            black, which over a patterned wallpaper is invisible — the seller
            looked for a divider, did not find one, and reasonably concluded
            there was not one. If a control cannot be found it does not exist.
          */}
          <span
            className={`absolute inset-y-0 left-1/2 w-px -translate-x-1/2 ${
              dragging ? "bg-black/30" : "bg-black/12"
            }`}
          />
          <span
            className={`absolute left-1/2 top-1/2 flex h-9 w-[7px] -translate-x-1/2 -translate-y-1/2 flex-col items-center justify-center gap-[3px] rounded-full border transition ${
              dragging
                ? "border-black bg-black"
                : "border-black/25 bg-white group-hover:border-black group-focus-visible:border-black"
            }`}
          >
            {[0, 1, 2].map((i) => (
              <span
                key={i}
                className={`h-[3px] w-[3px] rounded-full ${
                  dragging ? "bg-white" : "bg-black/40"
                }`}
              />
            ))}
          </span>
        </div>
      </div>

      <div className="min-w-0 flex-1">{right}</div>
    </div>
  );
}
