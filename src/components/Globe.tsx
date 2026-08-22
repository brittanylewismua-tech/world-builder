/* eslint-disable @next/next/no-img-element */

/**
 * The brand globe. This is Brittany's artwork (public/globe.png) — pink
 * continents on a white sphere with a pink graticule — not a drawn
 * approximation. Do not replace it with an SVG.
 */
export function Globe({
  size = 520,
  className = "",
  spin = false,
}: {
  size?: number;
  className?: string;
  spin?: boolean;
}) {
  return (
    <img
      src="/globe.png"
      alt=""
      width={size}
      height={size}
      aria-hidden
      className={`${spin ? "spin-slow" : ""} ${className}`}
      style={{ width: size, height: size, maxWidth: "none" }}
    />
  );
}

export function Sparkle({
  size = 18,
  className = "",
}: {
  size?: number;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      className={className}
      aria-hidden
    >
      <path
        d="M12 0c.7 6.4 4.9 10.6 12 12-7.1 1.4-11.3 5.6-12 12-.7-6.4-4.9-10.6-12-12C7.1 10.6 11.3 6.4 12 0z"
        fill="currentColor"
      />
    </svg>
  );
}
