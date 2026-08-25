"use client";

import { useEffect, useRef, useState } from "react";

/**
 * HOW BIG IS A DROP.
 *
 * Ten was a number this product picked for somebody else's business. A seller
 * who wants eight should get eight.
 *
 * Not a slider. A slider is for a range you are feeling your way along — here
 * there are exactly ten legal answers and the seller knows which one she
 * wants before she touches anything, so dragging to land on "8" is a worse
 * version of pressing 8. Every option visible, one press, no aiming.
 *
 * The count itself is the control. A seller looking for "how many designs is
 * this drop" looks at "2 / 10", so that is where the answer to "can I change
 * it" belongs — rather than in a settings page she would have to guess at.
 */

const CHOICES = [2, 4, 6, 8, 10, 12, 14, 16, 18, 20];

export default function SlotCount({
  done,
  slots,
  onChange,
}: {
  /** How many designs are already in the current drop. */
  done: number;
  slots: number;
  onChange: (n: number) => Promise<void> | void;
}) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function away(e: MouseEvent) {
      if (!box.current?.contains(e.target as Node)) setOpen(false);
    }
    function esc(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", away);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);

  async function pick(n: number) {
    if (n === slots) return setOpen(false);
    setSaving(true);
    try {
      await onChange(n);
      setOpen(false);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div ref={box} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        title="How many designs in a drop"
        className="rounded-lg px-1.5 py-0.5 text-[15px] font-bold tabular-nums text-ink transition hover:bg-black/[0.05]"
      >
        {done} / {slots}
      </button>

      {open && (
        <div className="rise absolute right-0 top-8 z-30 w-[236px] rounded-xl border-2 border-black bg-white p-3 shadow-lg">
          <p className="eyebrow mb-2 text-ink-3">Designs in a drop</p>
          <div className="grid grid-cols-5 gap-1.5">
            {CHOICES.map((n) => {
              /*
                You cannot shrink a drop smaller than what is already in it —
                the designs would have nowhere to sit, and silently dropping
                somebody's work to honour a settings change is unthinkable.
              */
              const tooSmall = n < done;
              return (
                <button
                  key={n}
                  onClick={() => pick(n)}
                  disabled={tooSmall || saving}
                  title={
                    tooSmall
                      ? `You already have ${done} designs in this drop`
                      : undefined
                  }
                  className={`rounded-lg border py-1.5 text-[13px] font-semibold tabular-nums transition ${
                    n === slots
                      ? "border-black bg-black text-white"
                      : tooSmall
                        ? "border-black/10 text-ink-3 opacity-40"
                        : "border-black/15 text-ink-2 hover:border-black hover:text-ink"
                  }`}
                >
                  {n}
                </button>
              );
            })}
          </div>
          <p className="t-small mt-2 leading-snug text-ink-3">
            Even numbers, up to 20. Applies to this drop and every one after
            it — drops already in your history keep the size they had.
          </p>
        </div>
      )}
    </div>
  );
}
