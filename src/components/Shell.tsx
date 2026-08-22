"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { useWorld } from "@/lib/useWorld";
import type { World } from "@/lib/world";
import { Globe } from "./Globe";

// SPEC: "Keep navigation minimal. Do not add more top-level areas unless
//        absolutely required to support these features."
const NAV = [
  { href: "/daily", label: "World Daily" },
  { href: "/studio", label: "Drop Studio" },
  { href: "/customer", label: "Talk to the Customer" },
  { href: "/history", label: "Drop History" },
  { href: "/profile", label: "World Profile" },
];

export function Loading() {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-black">
      <Globe size={150} spin />
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

  useEffect(() => {
    if (loading) return;
    if (!session) router.replace("/login");
    else if (!world || !world.established) router.replace("/setup");
  }, [loading, session, world, router]);

  if (loading || !session || !world?.established) return <Loading />;

  return (
    <div className="min-h-dvh gridfield">
      <header className="sticky top-0 z-30 border-b border-pink/20 bg-black/85 backdrop-blur">
        <div className="mx-auto flex max-w-[1600px] flex-wrap items-center gap-x-6 gap-y-2 px-5 py-3">
          <Link href="/daily" className="display shrink-0 text-lg text-pink">
            {world.name || "Your World"}
          </Link>
          <nav className="flex flex-1 flex-wrap items-center gap-x-5 gap-y-1">
            {NAV.map((n) => {
              const active = pathname === n.href;
              return (
                <Link
                  key={n.href}
                  href={n.href}
                  className={`eyebrow py-1 transition ${
                    active ? "text-pink" : "text-smoke hover:text-paper"
                  }`}
                >
                  {n.label}
                  {active && <span className="mt-1 block h-px bg-pink" />}
                </Link>
              );
            })}
          </nav>
          <button
            onClick={signOut}
            className="eyebrow shrink-0 text-smoke/60 transition hover:text-pink"
          >
            Sign out
          </button>
        </div>
      </header>
      {children(world)}
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
    <div className="mx-auto max-w-2xl px-6 py-20">
      <span className="eyebrow text-pink/70">{phase}</span>
      <h1 className="display mt-3 text-[clamp(2rem,5vw,3.2rem)] text-paper">
        {title}
      </h1>
      <p className="mt-4 text-sm leading-relaxed text-smoke">
        Not built yet. Specced, prioritised, and next in line. When it lands it
        will do exactly this:
      </p>
      <ul className="mt-6 space-y-2.5">
        {what.map((w, i) => (
          <li
            key={i}
            className="flex gap-3 text-[15px] leading-snug text-paper/85"
          >
            <span className="text-pink">—</span>
            {w}
          </li>
        ))}
      </ul>
    </div>
  );
}
