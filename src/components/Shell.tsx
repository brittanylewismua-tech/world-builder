/* eslint-disable @next/next/no-img-element */
"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useWorld } from "@/lib/useWorld";
import type { World } from "@/lib/world";
import { DEFAULT_THEME, onAccent } from "@/lib/theme";
import { ThemeStyle, Wallpaper } from "./Wallpaper";
import Logo from "./Logo";

/**
 * The room. Rail on the left in whichever style the seller chose, wallpaper
 * behind everything, content floating on top.
 *
 * SPEC: "Keep navigation minimal. Do not add more top-level areas."
 */
/**
 * Two groups, not one list.
 *
 * Five equally-weighted links with five equally-weighted taglines under them
 * made the rail into a wall of text where nothing looked more important than
 * anything else — and three of those taglines were saying nothing a person
 * could not work out from the word above them ("home — where you are today").
 *
 * The top three are the week: read the news, make the drops, and home. The
 * bottom two are reference you visit occasionally, so they sit at the bottom,
 * quieter, and are not competing for the eye every time the page loads.
 */
const NAV = [
  { href: "/home", label: "home" },
  { href: "/daily", label: "world news", hint: "what's happening today" },
  { href: "/web", label: "world web", hint: "trending in your world" },
  { href: "/winners", label: "world winners", hint: "what's already selling" },
  { href: "/studio", label: "world drops", hint: "drop studio" },
];

const NAV_FOOT = [
  { href: "/history", label: "drop history" },
  { href: "/profile", label: "world profile" },
];

/**
 * The app arriving, rather than the app being absent.
 *
 * A centred spinner on white told the seller nothing except that something
 * had stopped. This puts the rail and the shape of a page up immediately, so
 * the moment before the world loads looks like the same room waiting instead
 * of a different screen.
 */
export function Loading() {
  return (
    <div className="relative min-h-dvh bg-white lg:flex" role="status">
      <span className="sr-only">Loading your world</span>

      <aside className="sticky top-0 hidden h-dvh w-[248px] shrink-0 border-r-2 border-black bg-black p-4 lg:block">
        <div className="flex items-center text-white">
          <Logo height={22} />
        </div>
        <div className="mt-6 space-y-2">
          {NAV.map((n) => (
            <div
              key={n.href}
              className="h-11 rounded-lg bg-white/10"
              aria-hidden
            />
          ))}
        </div>
      </aside>

      <div className="min-w-0 flex-1 px-5 py-8 md:px-8">
        <div className="mx-auto max-w-5xl">
          <div className="skeleton h-3 w-32" aria-hidden />
          <div className="skeleton mt-3 h-9 w-64" aria-hidden />
          <div className="mt-8 grid gap-4 lg:grid-cols-2">
            <div className="skeleton h-64" aria-hidden />
            <div className="skeleton h-64" aria-hidden />
          </div>
          <div className="skeleton mt-4 h-24" aria-hidden />
        </div>
      </div>
    </div>
  );
}

export default function Shell({
  children,
}: {
  children: (world: World) => React.ReactNode;
}) {
  const { session, world, loading, signOut } = useWorld();
  const pathname = usePathname();
  const router = useRouter();
  const [navOpen, setNavOpen] = useState(false);

  useEffect(() => {
    if (loading) return;
    if (!session) router.replace("/login");
    else if (!world || !world.established) router.replace("/setup");
  }, [loading, session, world, router]);

  useEffect(() => setNavOpen(false), [pathname]);

  if (loading || !session || !world?.established) return <Loading />;

  const theme = world.theme ?? DEFAULT_THEME;
  const rail = theme.rail;
  const railDark = rail === "black" || (rail === "accent" && onAccent(theme.accent) === "#FFFFFF");

  const railStyle =
    rail === "black"
      ? { background: "#000" }
      : rail === "accent"
        ? { background: theme.accent }
        : { background: "#fff" };

  const railText = rail === "white" ? "#000" : railDark ? "#fff" : "#000";

  function handleSignOut() {
    // Every account has an email now, so signing out is always recoverable.
    signOut();
  }

  const aside = (
    <div
      className="relative flex h-full flex-col overflow-hidden p-4"
      style={{ ...railStyle, color: railText }}
    >
      <img
        src="/globe.png"
        alt=""
        className="pointer-events-none absolute -bottom-16 -left-16 h-[250px] w-[250px] max-w-none opacity-[0.16]"
      />
      <div className="relative">
        {/* The lockup inherits the rail's text colour, so "world" stays
            legible whichever rail the seller has chosen. */}
        <Link href="/home" className="flex items-center">
          <Logo height={22} />
        </Link>

        <nav className="mt-6 space-y-1">
          {NAV.map((n) => {
            const active = pathname === n.href;
            return (
              <Link
                key={n.href}
                href={n.href}
                aria-current={active ? "page" : undefined}
                className="block rounded-lg px-3.5 py-2.5 transition"
                style={
                  active
                    ? {
                        background: rail === "accent" ? "#000" : theme.accent,
                        color:
                          rail === "accent" ? "#fff" : onAccent(theme.accent),
                      }
                    : {
                        color: railDark
                          ? "rgba(255,255,255,0.62)"
                          : "rgba(0,0,0,0.68)",
                      }
                }
              >
                <span className="block text-[14px] font-bold">{n.label}</span>
                {n.hint && (
                  <span className="block text-[11px] opacity-70">{n.hint}</span>
                )}
              </Link>
            );
          })}
        </nav>
      </div>

      <div className="relative mt-auto pt-6">
        {/* Reference, not the week's work. Quieter and out of the way. */}
        <nav
          className="space-y-0.5 border-t pt-3"
          style={{
            borderColor: railDark ? "rgba(255,255,255,0.14)" : "rgba(0,0,0,0.1)",
          }}
        >
          {NAV_FOOT.map((n) => {
            const active = pathname === n.href;
            return (
              <Link
                key={n.href}
                href={n.href}
                aria-current={active ? "page" : undefined}
                className="block rounded-lg px-3.5 py-1.5 text-[13px] font-semibold transition"
                style={
                  active
                    ? {
                        background: rail === "accent" ? "#000" : theme.accent,
                        color:
                          rail === "accent" ? "#fff" : onAccent(theme.accent),
                      }
                    : {
                        color: railDark
                          ? "rgba(255,255,255,0.45)"
                          : "rgba(0,0,0,0.5)",
                      }
                }
              >
                {n.label}
              </Link>
            );
          })}
        </nav>

        <div
          className="mt-3 border-t pt-3"
          style={{
            borderColor: railDark ? "rgba(255,255,255,0.14)" : "rgba(0,0,0,0.1)",
          }}
        >
          <button
            onClick={handleSignOut}
            className="text-[12px] opacity-50 transition hover:opacity-100"
          >
            sign out
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="relative min-h-dvh lg:flex">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-black focus:px-4 focus:py-2 focus:text-sm focus:font-bold focus:text-white"
      >
        Skip to content
      </a>
      <ThemeStyle theme={theme} />
      <Wallpaper theme={theme} />

      <div
        className="sticky top-0 z-40 flex items-center gap-3 border-b-2 border-black px-4 py-3 lg:hidden"
        style={{ ...railStyle, color: railText }}
      >
        <button
          onClick={() => setNavOpen((v) => !v)}
          className="rounded-lg border-2 px-2.5 py-1 text-sm font-bold"
          style={{ borderColor: railText }}
          aria-label={navOpen ? "Close menu" : "Open menu"}
          aria-expanded={navOpen}
        >
          ☰
        </button>
        <Logo height={18} />
      </div>

      {navOpen && (
        <div className="relative z-30 border-b-2 border-black lg:hidden">
          {aside}
        </div>
      )}

      <aside className="sticky top-0 z-20 hidden h-dvh w-[248px] shrink-0 border-r-2 border-black lg:block">
        {aside}
      </aside>

      {/* Each page brings its own <main>; this is only the frame. */}
      <div
        id="main"
        tabIndex={-1}
        className="relative z-10 min-w-0 flex-1 outline-none"
      >
        {children(world)}
      </div>
    </div>
  );
}

/** Honest placeholder for surfaces that are specced but not built yet. */
export function NotBuiltYet({
  phase,
  title,
  what,
}: {
  phase: string;
  title: string;
  what: string[];
}) {
  return (
    <div className="relative z-10 mx-auto max-w-2xl px-6 py-14">
      <span className="chip chip-solid">{phase}</span>
      <h1 className="t-h1 mt-3">{title}</h1>
      <span className="rule-accent mt-3" />
      <p className="t-body mt-4 text-ink-2">
        Not built yet. Specced, prioritised, and next in line. When it lands it
        will do exactly this:
      </p>
      <ul className="mt-5 space-y-2.5">
        {what.map((w, i) => (
          <li key={i} className="t-body flex gap-3 text-ink-2">
            <span className="numeral text-[1.1rem]">
              {String(i + 1).padStart(2, "0")}
            </span>
            {w}
          </li>
        ))}
      </ul>
    </div>
  );
}
