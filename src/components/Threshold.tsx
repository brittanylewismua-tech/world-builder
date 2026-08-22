/* eslint-disable @next/next/no-img-element */
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { World } from "@/lib/world";
import { DEFAULT_THEME, wallColor, globeFilter } from "@/lib/theme";
import { ThemeStyle } from "./Wallpaper";
import { Star } from "./ui";

/**
 * THE THRESHOLD
 *
 * You do not open a dashboard, you walk into a place. A door on white, a
 * galaxy behind it, one click to go through.
 *
 * It is a moment, not a toll booth. Anyone who gets tired of it can switch it
 * off from the door itself, in small type that never competes with the door,
 * and switch it back on in Make It Yours. Anyone who has asked their system
 * for less motion gets the door without the swing.
 */

/** Deterministic star field — same on the server and the client, no flicker. */
function stars(count: number, seed: number) {
  let s = seed;
  const rand = () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
  return Array.from({ length: count }, () => ({
    x: rand() * 100,
    y: rand() * 100,
    r: 0.6 + rand() * 1.9,
    o: 0.25 + rand() * 0.75,
    d: rand() * 4,
  }));
}

const DUST = stars(70, 20260822);
const BIG = stars(7, 77);

function Galaxy({ wall }: { wall: string }) {
  return (
    <div className="galaxy absolute inset-0 overflow-hidden">
      {/* deep space */}
      <div className="absolute inset-0 bg-[#07040e]" />

      {/* nebula, in the seller's wallpaper colour */}
      <div
        className="absolute inset-0"
        style={{
          background: `radial-gradient(60% 42% at 26% 22%, ${wall}cc, transparent 70%),
                       radial-gradient(52% 38% at 78% 64%, ${wall}99, transparent 72%),
                       radial-gradient(80% 60% at 50% 108%, #3b1d5e, transparent 70%)`,
          filter: "blur(6px)",
        }}
      />

      {/* a slow arm of light turning behind everything */}
      <div
        className="spin-slow absolute left-1/2 top-1/2 h-[150%] w-[150%] -translate-x-1/2 -translate-y-1/2"
        style={{
          background: `conic-gradient(from 0deg, transparent 0deg, ${wall}55 40deg, transparent 120deg, transparent 200deg, ${wall}33 250deg, transparent 320deg)`,
          borderRadius: "50%",
          opacity: 0.55,
        }}
      />

      {/* dust */}
      {DUST.map((s, i) => (
        <span
          key={i}
          className="twinkle absolute rounded-full bg-white"
          style={{
            left: `${s.x}%`,
            top: `${s.y}%`,
            width: s.r,
            height: s.r,
            opacity: s.o,
            animationDelay: `${s.d}s`,
          }}
        />
      ))}

      {/* a few proper four-point stars */}
      {BIG.map((s, i) => (
        <Star
          key={i}
          size={7 + s.r * 3}
          className="twinkle absolute text-white"
          style={{
            left: `${s.x}%`,
            top: `${s.y}%`,
            opacity: 0.55 + s.o * 0.4,
            animationDelay: `${s.d}s`,
          }}
        />
      ))}

      {/* your world, out there in it */}
      <img
        src="/globe.png"
        alt=""
        className="globe-turn absolute left-1/2 top-[54%] h-[46%] w-auto max-w-none -translate-x-1/2 -translate-y-1/2"
        style={{ filter: globeFilter(wall), opacity: 0.92 }}
      />

      {/* light spilling out of the doorway */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background: `radial-gradient(50% 40% at 50% 54%, ${wall}40, transparent 70%)`,
        }}
      />
    </div>
  );
}

export default function Threshold({
  world,
  onTurnOff,
}: {
  world: World;
  /** Stop showing the door on the way in. */
  onTurnOff: () => void;
}) {
  const router = useRouter();
  const [state, setState] = useState<"shut" | "open" | "through">("shut");
  const theme = world.theme ?? DEFAULT_THEME;
  const wall = wallColor(theme);

  function open() {
    if (state !== "shut") return;

    const still =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (still) {
      router.replace("/home");
      return;
    }

    setState("open");
    setTimeout(() => setState("through"), 780);
    setTimeout(() => router.replace("/home"), 1320);
  }

  function skipForever() {
    onTurnOff();
    router.replace("/home");
  }

  return (
    <main className="relative flex min-h-dvh flex-col items-center justify-center overflow-hidden bg-white px-5 py-10">
      <ThemeStyle theme={theme} />

      {/* the room you are standing in */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background: `radial-gradient(58% 44% at 50% 58%, ${wall}1f, transparent 70%)`,
        }}
      />

      <div
        className={`relative flex flex-col items-center transition-all duration-500 ${
          state === "through" ? "scale-[4.2] opacity-0" : ""
        }`}
        style={{ transformOrigin: "50% 58%" }}
      >
        <p className="eyebrow text-ink-3">welcome to your world</p>
        <h1 className="t-h1 mt-2 max-w-lg text-center text-ink">
          {world.name.toLowerCase()}
        </h1>

        {/* ---------------------------------------------------- the door */}
        <button
          onClick={open}
          aria-label={`Enter ${world.name}`}
          className="door-scene group mt-8 block"
        >
          <div className="door-frame relative h-[340px] w-[214px] overflow-hidden border-[5px] border-black bg-black sm:h-[400px] sm:w-[252px]">
            <Galaxy wall={wall} />

            {/* The door itself, closed over the galaxy — but inset, so a rim
                of what is behind it glows around the edge and you can tell
                there is somewhere to go. */}
            <div
              className={`door-panel absolute inset-[7px] bg-black ${
                state === "shut" ? "" : "is-open"
              }`}
              style={{ boxShadow: `0 0 18px ${wall}77` }}
            >
              {/* panelling */}
              <span className="absolute inset-x-5 top-6 bottom-[46%] rounded-[76px_76px_6px_6px] border-2 border-white/25" />
              <span className="absolute inset-x-5 bottom-6 top-[58%] rounded-md border-2 border-white/25" />
              {/* knob */}
              <span
                className="absolute right-5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 rounded-full"
                style={{ background: wall, boxShadow: `0 0 12px ${wall}` }}
              />
              {/* a little light escaping under the door */}
              <span
                className="absolute inset-x-0 bottom-0 h-[3px]"
                style={{ background: wall, opacity: 0.85 }}
              />
              <Star
                size={11}
                className="absolute left-6 top-8 text-white/70"
                style={undefined}
              />
            </div>
          </div>

          {/* threshold shadow on the floor */}
          <span
            className="mx-auto mt-3 block h-2 w-[70%] rounded-full blur-md"
            style={{ background: `${wall}66` }}
          />
        </button>

        <p className="t-small mt-5">
          <button
            onClick={open}
            className="font-bold underline decoration-2 underline-offset-4 transition hover:opacity-70"
            style={{ color: "var(--accent)" }}
          >
            enter here
          </button>
        </p>
      </div>

      {/* Deliberately quiet, and deliberately not next to the door. */}
      <button
        onClick={skipForever}
        className={`absolute bottom-6 text-[11.5px] text-ink-3 underline underline-offset-4 transition hover:text-ink ${
          state === "shut" ? "opacity-55 hover:opacity-100" : "opacity-0"
        }`}
      >
        skip the door from now on
      </button>
    </main>
  );
}
