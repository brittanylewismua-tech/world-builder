"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useWorld } from "@/lib/useWorld";
import type { World } from "@/lib/world";
import { Globe } from "./Globe";
import AmbientGlobe from "./AmbientGlobe";

/**
 * Sidebar shell. Same navigation structure as Listing Factory so the two
 * products read as one suite, in World Builder's own black/white/pink.
 * SPEC: "Keep navigation minimal. Do not add more top-level areas."
 */
const NAV = [
  { href: "/daily", label: "World Daily", hint: "Stay immersed" },
  { href: "/studio", label: "Drop Studio", hint: "Build the work" },
  { href: "/customer", label: "Talk to the Customer", hint: "Think like her" },
  { href: "/history", label: "Drop History", hint: "What you released" },
  { href: "/profile", label: "World Profile", hint: "Your foundation" },
];

export function Loading() {
  return (
    <main className="relative flex min-h-dvh items-center justify-center">
      <AmbientGlobe />
      <Globe size={56} spin className="relative z-10 opacity-70" />
    </main>
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

  function handleSignOut() {
    // An anonymous account lives only in this browser. Signing out of one is
    // not "log back in later" — it is goodbye.
    if (
      session?.user?.is_anonymous &&
      !window.confirm(
        "You signed in without an email, so this world is tied to this browser. Signing out will lose access to it permanently. Sign out anyway?",
      )
    )
      return;
    signOut();
  }

  const aside = (
    <div className="flex h-full flex-col px-4 py-5">
      <Link href="/daily" className="mb-7 block px-2">
        <div className="flex items-center gap-2">
          <Globe size={26} />
          <span className="display text-[1.45rem] leading-none text-plum">
            World
          </span>
        </div>
        <span className="eyebrow mt-1.5 block text-plum-3">Builder</span>
      </Link>

      <nav className="space-y-1">
        {NAV.map((n) => {
          const active = pathname === n.href;
          return (
            <Link
              key={n.href}
              href={n.href}
              className={`block rounded-2xl px-3.5 py-2.5 transition ${
                active
                  ? "bg-white border border-line shadow-[0_1px_2px_rgba(13,12,12,0.05)]"
                  : "hover:bg-sunk"
              }`}
            >
              <span
                className={`block text-sm font-semibold ${active ? "text-plum" : "text-plum-2"}`}
              >
                {n.label}
              </span>
              <span className="block text-[11.5px] text-plum-3">{n.hint}</span>
            </Link>
          );
        })}
      </nav>

      <div className="mt-auto pt-6">
        <div className="rounded-2xl border border-line bg-white px-3.5 py-3">
          <p className="eyebrow text-plum-3">Current world</p>
          <p className="display mt-1 truncate text-[1.05rem] text-plum">
            {world.name || "Untitled"}
          </p>
          <p className="t-small mt-0.5 text-plum-3">
            {world.subNiches.length} sub-niches · {world.areas.length} areas
          </p>
        </div>
        <button
          onClick={handleSignOut}
          className="mt-3 px-2 text-[12.5px] text-plum-3 transition hover:text-plum"
        >
          Sign out
        </button>
      </div>
    </div>
  );

  return (
    <div className="relative min-h-dvh lg:flex">
      <AmbientGlobe />

      {/* mobile bar */}
      <div className="sticky top-0 z-40 flex items-center gap-3 border-b border-line bg-white/85 px-4 py-3 backdrop-blur lg:hidden">
        <button
          onClick={() => setNavOpen((v) => !v)}
          className="rounded-lg border border-line-strong bg-white px-2.5 py-1.5 text-sm"
          aria-label="Menu"
        >
          ☰
        </button>
        <Globe size={20} />
        <span className="display text-[1.1rem] text-plum">
          {world.name || "World Builder"}
        </span>
      </div>

      {navOpen && (
        <div className="relative z-30 border-b border-line bg-white/92 backdrop-blur lg:hidden">
          {aside}
        </div>
      )}

      <aside className="sticky top-0 z-20 hidden h-dvh w-[264px] shrink-0 border-r border-line bg-white/72 backdrop-blur-xl lg:block">
        {aside}
      </aside>

      <div className="relative z-10 min-w-0 flex-1">{children(world)}</div>
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
    <div className="mx-auto max-w-2xl px-6 py-16">
      <span className="eyebrow text-pink-ink">{phase}</span>
      <h1 className="t-h1 mt-2 text-plum">{title}</h1>
      <p className="t-body mt-3 text-plum-2">
        Not built yet. Specced, prioritised, and next in line. When it lands it
        will do exactly this:
      </p>
      <ul className="mt-5 space-y-2.5">
        {what.map((w, i) => (
          <li key={i} className="t-body flex gap-3 text-plum-2">
            <span className="text-pink-ink">—</span>
            {w}
          </li>
        ))}
      </ul>
    </div>
  );
}
