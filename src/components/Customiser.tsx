/* eslint-disable @next/next/no-img-element */
"use client";

import { useRef, useState } from "react";
import { setWallpaper, saveWorld } from "@/lib/api";
import {
  PRESETS,
  RAIL_LABEL,
  WALLPAPER_LABEL,
  WALLPAPER_SWATCHES,
  contrastRatio,
  globeFilter,
  onAccent,
  wallColor,
  type RailStyle,
  type Theme,
  type WallpaperKind,
} from "@/lib/theme";
import type { World } from "@/lib/world";
import { Dots, Note, Star } from "./ui";

const RAILS: RailStyle[] = ["black", "white", "accent"];
const KINDS: WallpaperKind[] = ["globe", "grid", "shine", "none"];

/**
 * Make this room yours.
 *
 * Constrained on purpose: the accent is a free pick, but text on it is
 * computed rather than chosen, so nobody can colour their way into an
 * unreadable interface. Wallpapers are always dimmed and scrimmed.
 */
export default function Customiser({
  world,
  patch,
  onError,
}: {
  world: World;
  patch: (p: Partial<World>) => void;
  onError: (m: string) => void;
}) {
  const theme = world.theme;
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  async function apply(next: Partial<Theme>) {
    const merged = { ...theme, ...next };
    patch({ theme: merged });
    try {
      await saveWorld(world.id, { theme: merged });
    } catch (e) {
      onError(e instanceof Error ? e.message : "Could not save your theme.");
    }
  }

  async function uploadWallpaper(files: FileList | null) {
    const f = files?.[0];
    if (!f) return;
    setBusy(true);
    try {
      const { path, src } = await setWallpaper(f);
      await apply({
        wallpaperKind: "custom",
        wallpaperPath: path,
        wallpaperSrc: src,
        wallpaperOpacity: Math.max(12, Math.min(40, theme.wallpaperOpacity)),
      });
    } catch (e) {
      onError(e instanceof Error ? e.message : "That upload failed.");
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }

  const textOnAccent = onAccent(theme.accent);
  const ratio = contrastRatio(theme.accent, textOnAccent);

  return (
    <div className="space-y-6">
      <Note>
        Every world gets its own look — a rave shop and a faith shop should not
        feel the same. Pick any accent you like; the text on it is worked out
        for you, so nothing you choose can end up unreadable.
      </Note>

      {/* ---------------------------------------------------- presets */}
      <section>
        <h3 className="t-h3 mb-3">Start from a look</h3>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {PRESETS.map((p) => {
            const active = theme.preset === p.id;
            return (
              <button
                key={p.id}
                onClick={() =>
                  apply({
                    preset: p.id,
                    accent: p.accent,
                    rail: p.rail,
                    wallpaperKind: p.wallpaperKind,
                    wallpaperOpacity: p.wallpaperOpacity,
                    wallpaperAccent: null,
                  })
                }
                className={`card card-hover overflow-hidden p-0 text-left ${
                  active ? "" : "opacity-95"
                }`}
                style={active ? { boxShadow: `6px 6px 0 ${p.accent}` } : undefined}
              >
                {/* mini portrait of the theme */}
                <div className="flex h-[86px]">
                  <div
                    className="w-[34%] border-r-2 border-black"
                    style={{
                      background:
                        p.rail === "black"
                          ? "#000"
                          : p.rail === "accent"
                            ? p.accent
                            : "#fff",
                    }}
                  >
                    <div className="space-y-1 p-2">
                      <div
                        className="h-1.5 w-9 rounded-full"
                        style={{
                          background:
                            p.rail === "white" ? p.accent : "rgba(255,255,255,.7)",
                        }}
                      />
                      <div className="h-1.5 w-7 rounded-full bg-black/20" />
                      <div className="h-1.5 w-8 rounded-full bg-black/20" />
                    </div>
                  </div>
                  <div className="relative flex-1 overflow-hidden bg-white">
                    {p.wallpaperKind === "globe" && (
                      <img
                        src="/globe.png"
                        alt=""
                        className="absolute -right-5 -top-5 h-20 w-20 max-w-none"
                        style={{ opacity: p.wallpaperOpacity / 100 }}
                      />
                    )}
                    {p.wallpaperKind === "grid" && (
                      <div
                        className="absolute inset-0"
                        style={{
                          opacity: p.wallpaperOpacity / 100,
                          backgroundImage: `linear-gradient(${p.accent} 1px, transparent 1px), linear-gradient(90deg, ${p.accent} 1px, transparent 1px)`,
                          backgroundSize: "14px 14px",
                        }}
                      />
                    )}
                    {p.wallpaperKind === "shine" && (
                      <div
                        className="absolute inset-0"
                        style={{
                          opacity: p.wallpaperOpacity / 100,
                          background: `radial-gradient(60px 50px at 20% 0%, ${p.accent}, transparent 62%), radial-gradient(70px 60px at 95% 40%, ${p.accent}, transparent 60%)`,
                        }}
                      />
                    )}
                    <div className="absolute inset-2 rounded-md border-2 border-black bg-white shadow-[2px_2px_0_#000]" />
                  </div>
                </div>
                <div className="border-t-2 border-black p-3">
                  <div className="flex items-center gap-2">
                    <span
                      className="h-3 w-3 rounded-full border border-black"
                      style={{ background: p.accent }}
                    />
                    <span className="t-h3">{p.name}</span>
                    {active && (
                      <span className="chip chip-accent ml-auto text-[11px]">
                        On
                      </span>
                    )}
                  </div>
                  <p className="t-small mt-1 text-ink-2">{p.blurb}</p>
                </div>
              </button>
            );
          })}
        </div>
      </section>

      {/* ---------------------------------------------------- accent */}
      <section className="card p-5 md:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h3 className="t-h3">Your accent</h3>
            <p className="t-small mt-1 max-w-sm text-ink-2">
              Buttons, numerals, the active tab, the shadow under every card.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <input
              type="color"
              value={theme.accent}
              onChange={(e) =>
                apply({ accent: e.target.value.toUpperCase(), preset: "custom" })
              }
              className="h-11 w-16 cursor-pointer rounded-lg border-2 border-black bg-white p-1"
              aria-label="Accent colour"
            />
            <code className="rounded-md border-2 border-black px-2 py-1 text-[13px] font-bold">
              {theme.accent}
            </code>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <span
            className="rounded-lg border-2 border-black px-4 py-2 text-sm font-bold"
            style={{ background: theme.accent, color: textOnAccent }}
          >
            Text on your accent
          </span>
          <span className="t-small text-ink-2">
            Auto-set to {textOnAccent === "#000000" ? "black" : "white"} ·
            contrast {ratio.toFixed(1)}:1
            {ratio >= 4.5 ? " — comfortable" : " — the best available here"}
          </span>
        </div>
      </section>

      {/* ---------------------------------------------------- rail */}
      <section className="card p-5 md:p-6">
        <h3 className="t-h3">Sidebar</h3>
        <div className="mt-3 flex flex-wrap gap-2">
          {RAILS.map((r) => (
            <button
              key={r}
              onClick={() => apply({ rail: r, preset: "custom" })}
              className={`btn ${theme.rail === r ? "btn-accent" : "btn-ghost"}`}
            >
              <span
                className="h-3.5 w-3.5 rounded-sm border border-black"
                style={{
                  background:
                    r === "black" ? "#000" : r === "accent" ? theme.accent : "#fff",
                }}
              />
              {RAIL_LABEL[r]}
            </button>
          ))}
        </div>
      </section>

      {/* ---------------------------------------------------- wallpaper */}
      <section className="card p-5 md:p-6">
        <div className="flex items-center gap-2">
          <h3 className="t-h3">Wallpaper</h3>
          <Star size={11} className="text-accent" />
        </div>
        <p className="t-small mt-1 max-w-lg text-ink-2">
          Whatever you pick sits behind a scrim so your reading column stays
          clean. Upload a mood image, a texture, anything from your world.
        </p>

        <div className="mt-4 flex flex-wrap gap-2">
          {KINDS.map((k) => (
            <button
              key={k}
              onClick={() => apply({ wallpaperKind: k, preset: "custom" })}
              className={`btn ${theme.wallpaperKind === k ? "btn-accent" : "btn-ghost"}`}
            >
              {WALLPAPER_LABEL[k]}
            </button>
          ))}
          <button
            onClick={() => input.current?.click()}
            disabled={busy}
            className={`btn ${theme.wallpaperKind === "custom" ? "btn-accent" : "btn-ghost"}`}
          >
            {busy
              ? "Uploading…"
              : theme.wallpaperPath
                ? "Replace your image"
                : "Upload an image"}
          </button>
          <input
            ref={input}
            type="file"
            accept="image/*"
            onChange={(e) => uploadWallpaper(e.target.files)}
            className="hidden"
          />
        </div>

        {/* Wallpaper colour — only meaningful for the drawn wallpapers. An
            uploaded image is already whatever colour it is. */}
        {theme.wallpaperKind !== "none" && theme.wallpaperKind !== "custom" && (
          <div className="mt-5 border-t border-black/10 pt-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <label className="t-small font-semibold">Wallpaper colour</label>
                <p className="t-small text-ink-3">
                  {theme.wallpaperAccent
                    ? "Set on its own, separate from your accent."
                    : "Following your accent."}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={wallColor(theme)}
                  onChange={(e) =>
                    apply({
                      wallpaperAccent: e.target.value.toUpperCase(),
                      preset: "custom",
                    })
                  }
                  className="h-10 w-14 cursor-pointer rounded-lg border-2 border-black bg-white p-1"
                  aria-label="Wallpaper colour"
                />
                {theme.wallpaperAccent && (
                  <button
                    onClick={() => apply({ wallpaperAccent: null })}
                    className="t-small text-ink-3 underline underline-offset-2 hover:text-ink"
                  >
                    Match my accent
                  </button>
                )}
              </div>
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
              {WALLPAPER_SWATCHES.map((hex) => (
                <button
                  key={hex}
                  onClick={() =>
                    apply({ wallpaperAccent: hex, preset: "custom" })
                  }
                  title={hex}
                  aria-label={`Wallpaper ${hex}`}
                  className={`h-7 w-7 rounded-full border-2 transition ${
                    wallColor(theme).toUpperCase() === hex
                      ? "border-black ring-2 ring-black ring-offset-2"
                      : "border-black/25 hover:border-black"
                  }`}
                  style={{ background: hex }}
                />
              ))}
            </div>

            {theme.wallpaperKind === "globe" && (
              <div className="mt-4 flex items-center gap-3">
                <img
                  src="/globe.png"
                  alt=""
                  className="h-12 w-12"
                  style={{ filter: globeFilter(wallColor(theme)) }}
                />
                <p className="t-small text-ink-3">
                  The globe keeps all its artwork — its colour is shifted rather
                  than flattened, so it never turns into a silhouette.
                </p>
              </div>
            )}
          </div>
        )}

        {theme.wallpaperSrc && (
          <div className="mt-4 flex items-center gap-3">
            <img
              src={theme.wallpaperSrc}
              alt=""
              className="h-16 w-28 rounded-lg border-2 border-black object-cover"
            />
            <button
              onClick={() =>
                apply({
                  wallpaperKind: "globe",
                  wallpaperPath: null,
                  wallpaperSrc: null,
                })
              }
              className="t-small text-ink-3 underline underline-offset-2 hover:text-ink"
            >
              Remove your image
            </button>
          </div>
        )}

        {theme.wallpaperKind !== "none" && (
          <div className="mt-5">
            <div className="flex items-baseline justify-between">
              <label className="t-small font-semibold">How loud</label>
              <span className="t-small tabular-nums text-ink-3">
                {theme.wallpaperOpacity}%
              </span>
            </div>
            <input
              type="range"
              min={0}
              max={60}
              value={theme.wallpaperOpacity}
              onChange={(e) =>
                apply({
                  wallpaperOpacity: Number(e.target.value),
                  preset: "custom",
                })
              }
              className="mt-2 w-full accent-black"
              style={{ accentColor: theme.accent }}
            />
            <p className="t-small mt-1 text-ink-3">
              Capped at 60% — past that, text starts fighting the image.
            </p>
          </div>
        )}
      </section>

      {/* ---------------------------------------------------- preview */}
      <section>
        <h3 className="t-h3 mb-3">How it looks</h3>
        <div className="card p-5">
          <div className="flex items-center justify-between">
            <Dots />
            <span className="chip chip-solid">world daily</span>
          </div>
          <div className="mt-4 flex gap-4">
            <span className="numeral text-[2.4rem]">01</span>
            <div>
              <h4 className="t-h2">
                a headline in your world, with{" "}
                <span className="italic" style={{ color: "var(--accent)" }}>
                  your accent
                </span>{" "}
                inside it
              </h4>
              <p className="t-body mt-2 text-ink-2">
                Body copy stays black on white no matter what you pick, so the
                room can be as loud as you like and the work still reads.
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <button className="btn btn-accent">Primary action</button>
                <button className="btn btn-ghost">Secondary</button>
                <span className="chip chip-accent">a tag</span>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
