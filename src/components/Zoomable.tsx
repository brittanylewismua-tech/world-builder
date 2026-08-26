/* eslint-disable @next/next/no-img-element */
"use client";

import { useEffect, useState } from "react";

/**
 * ANY PICTURE, FULL SIZE, ON CLICK.
 *
 * Every image in this product is shown small — a pin in a five-column wall, a
 * mockup in a grid of ten, a calibration reference as a thumbnail. All of it
 * is work the seller needs to actually LOOK at, and there was no way to see
 * any of it bigger than a couple of hundred pixels without opening the file
 * somewhere else.
 *
 * A wrapper rather than a page-level lightbox on purpose: swapping an <img>
 * for a <Zoomable> is the whole integration, so no surface gets left out
 * because wiring it up was a chore.
 *
 * Notes:
 * - Escape closes, and so does clicking anywhere. There is nothing to do in
 *   here but look, so every exit should work.
 * - The backdrop is a button, not a div with onClick, so it is reachable
 *   without a mouse.
 * - Body scroll is locked while open, otherwise the page behind slides around
 *   under the overlay and you lose your place on a long board.
 * - The image itself swallows clicks, so grabbing to look closely does not
 *   dismiss the thing you are looking at.
 */
export default function Zoomable({
  src,
  alt = "",
  className,
  caption,
  draggable,
}: {
  src: string;
  alt?: string;
  className?: string;
  /** Shown under the enlarged image — usually the note or filename. */
  caption?: string | null;
  draggable?: boolean;
}) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    function esc(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", esc);
    const prior = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", esc);
      document.body.style.overflow = prior;
    };
  }, [open]);

  return (
    <>
      <img
        src={src}
        alt={alt}
        loading="lazy"
        draggable={draggable}
        onClick={() => setOpen(true)}
        title="Click to see it bigger"
        className={`${className ?? ""} cursor-zoom-in`}
      />

      {open && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-6"
          onClick={() => setOpen(false)}
        >
          <button
            aria-label="Close"
            onClick={() => setOpen(false)}
            className="absolute right-4 top-4 rounded-lg border-2 border-white/70 px-3 py-1.5 text-[13px] font-bold text-white transition hover:border-white hover:bg-white/10"
          >
            Close
          </button>

          <figure
            onClick={(e) => e.stopPropagation()}
            className="flex max-h-full max-w-full flex-col items-center gap-3"
          >
            <img
              src={src}
              alt={alt}
              className="max-h-[82vh] max-w-full rounded-lg object-contain"
            />
            {caption && (
              <figcaption className="max-w-xl text-center text-[13px] leading-snug text-white/70">
                {caption}
              </figcaption>
            )}
          </figure>
        </div>
      )}
    </>
  );
}
