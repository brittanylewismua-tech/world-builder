/* eslint-disable @next/next/no-img-element */

/**
 * THE WORDMARK — Brittany's artwork, in two layers.
 *
 * The lockup sets "world" in white, which is right for the black rail it
 * usually sits on and wrong everywhere else. The rail is a theme setting: it
 * can be black, white, or the accent colour, and a white word on a white rail
 * is an invisible word. A single flat PNG cannot know what it was dropped on.
 *
 * So it ships as two files cut from the same render, pixel-aligned, same
 * dimensions, stacked:
 *
 *   wordmark-pink.png   the globe and "builder" — pink, and pink reads on
 *                       every rail, so it is plain artwork.
 *   wordmark-world.png  just the word "world", used as a CSS MASK rather than
 *                       an image. The mask is painted with `currentColor`, so
 *                       the word takes the rail's own text colour and stays
 *                       legible on black, white and accent alike.
 *
 * Because both layers are the same crop of the same artwork, the spacing and
 * kerning are the original's exactly — nothing here is re-typeset or eyeballed.
 *
 * (The first export supplied was a flattened screenshot of a transparency
 * checkerboard, with "world" painted white on a near-white ground and no alpha
 * channel. Nothing usable could be recovered from it; this is cut from the
 * black-background render instead.)
 */

/** Natural size of the artwork: 1765 × 232. */
const RATIO = 1765 / 232;

export default function Logo({
  height = 24,
  className = "",
}: {
  /**
   * Height of the whole lockup — a number of pixels, or any CSS length.
   * Width follows from the artwork's own ratio, so a `clamp()` here scales
   * the whole lockup responsively without a second measurement to keep in
   * step.
   */
  height?: number | string;
  className?: string;
}) {
  const mask = {
    WebkitMaskImage: "url(/wordmark-world.png)",
    maskImage: "url(/wordmark-world.png)",
    WebkitMaskSize: "100% 100%",
    maskSize: "100% 100%",
    WebkitMaskRepeat: "no-repeat",
    maskRepeat: "no-repeat",
  } as React.CSSProperties;

  return (
    <span
      /*
        One name for the whole lockup. Left to themselves the layers would
        announce as two anonymous images, or as "world" twice over.
      */
      role="img"
      aria-label="World Builder"
      className={`relative inline-block shrink-0 align-middle ${className}`}
      style={{
        height: typeof height === "number" ? `${height}px` : height,
        aspectRatio: `${RATIO}`,
      }}
    >
      <img
        src="/wordmark-pink.png"
        alt=""
        className="absolute inset-0 h-full w-full max-w-none"
      />
      <span
        aria-hidden
        className="absolute inset-0"
        style={{ background: "currentColor", ...mask }}
      />
    </span>
  );
}
