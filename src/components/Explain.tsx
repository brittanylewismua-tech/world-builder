"use client";

import { useState } from "react";

/**
 * A QUESTION MARK THAT ANSWERS ITSELF.
 *
 * For the two or three controls in this product whose name cannot carry the
 * whole meaning — "pause the weekly rhythm" is close, but a seller is still
 * entitled to ask *pause what, exactly*.
 *
 * Rules it holds itself to, because help text is where products get flabby:
 *   - one or two sentences, no more
 *   - says what happens, not what the feature is called
 *   - faint until you go near it, so it never competes with the control
 *
 * Opens on hover for a mouse and on focus or tap for everyone else — a
 * hover-only tooltip is invisible on a phone, which is where half the
 * confusion will happen.
 */
export default function Explain({
  children,
  label = "What does this do?",
}: {
  children: React.ReactNode;
  label?: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <span
      className="relative inline-flex"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        type="button"
        aria-label={label}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        className="flex h-4 w-4 items-center justify-center rounded-full border border-black/20 text-[10px] font-bold leading-none text-ink-3 opacity-50 transition hover:border-black hover:text-ink hover:opacity-100 focus-visible:opacity-100"
      >
        ?
      </button>

      {open && (
        <span
          role="tooltip"
          className="rise absolute right-0 top-6 z-40 w-60 rounded-lg border border-black/15 bg-white p-2.5 text-left text-[12.5px] leading-snug text-ink-2 shadow-lg"
        >
          {children}
        </span>
      )}
    </span>
  );
}
