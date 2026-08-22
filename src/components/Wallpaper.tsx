/* eslint-disable @next/next/no-img-element */
"use client";

import { useEffect } from "react";
import { globeFilter, themeVars, wallColor, type Theme } from "@/lib/theme";

/**
 * Applies the world's theme to the document. One place sets every accent
 * variable, so a single save re-skins all five surfaces at once.
 */
export function ThemeStyle({ theme }: { theme: Theme }) {
  useEffect(() => {
    const root = document.documentElement;
    const vars = themeVars(theme);
    for (const [k, v] of Object.entries(vars)) root.style.setProperty(k, v);
    return () => {
      for (const k of Object.keys(vars)) root.style.removeProperty(k);
    };
  }, [theme]);
  return null;
}

/**
 * The room's wallpaper. Whatever the seller picks — the globe, a texture, or
 * their own upload — it is always pushed behind a scrim and capped in opacity,
 * so cards stay crisp on top and body copy never sits on a photograph.
 */
export function Wallpaper({ theme }: { theme: Theme }) {
  const o = Math.max(0, Math.min(100, theme.wallpaperOpacity)) / 100;

  if (theme.wallpaperKind === "none") return null;

  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0 z-0 overflow-hidden"
    >
      {theme.wallpaperKind === "globe" && (
        <>
          <div
            className="absolute -right-[10vw] top-1/2 h-[120vh] w-[120vh] -translate-y-1/2 rounded-full blur-3xl"
            style={{
              background: `radial-gradient(circle, color-mix(in srgb, var(--wall) 30%, transparent), transparent 68%)`,
              opacity: o,
            }}
          />
          <img
            src="/globe.png"
            alt=""
            className="globe-turn absolute -right-[16vw] top-1/2 h-[112vh] w-[112vh] max-w-none -translate-y-1/2"
            style={{
              opacity: Math.min(0.55, o * 1.9),
              filter: globeFilter(wallColor(theme)),
            }}
          />
        </>
      )}

      {theme.wallpaperKind === "grid" && (
        <div
          className="absolute inset-0"
          style={{
            opacity: o,
            backgroundImage:
              "linear-gradient(var(--wall) 1px, transparent 1px), linear-gradient(90deg, var(--wall) 1px, transparent 1px)",
            backgroundSize: "44px 44px",
          }}
        />
      )}

      {theme.wallpaperKind === "shine" && (
        <div
          className="absolute inset-0"
          style={{
            opacity: o,
            background:
              "radial-gradient(760px 560px at 6% -8%, color-mix(in srgb, var(--wall) 70%, white), transparent 60%), radial-gradient(820px 620px at 98% 6%, color-mix(in srgb, var(--wall) 45%, white), transparent 58%), radial-gradient(900px 700px at 52% 112%, color-mix(in srgb, var(--wall) 55%, white), transparent 60%)",
          }}
        />
      )}

      {theme.wallpaperKind === "custom" && theme.wallpaperSrc && (
        <img
          src={theme.wallpaperSrc}
          alt=""
          className="absolute inset-0 h-full w-full object-cover"
          style={{ opacity: o }}
        />
      )}

      {/* Scrim. Keeps the reading column clean whatever is behind it. */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#ffffff_0%,#ffffff_46%,rgba(255,255,255,0.86)_60%,rgba(255,255,255,0.42)_78%,rgba(255,255,255,0.22)_100%)]" />
    </div>
  );
}
