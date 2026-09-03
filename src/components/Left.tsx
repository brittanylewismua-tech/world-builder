"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { DAILY_CAP, WEEKLY, warnAt, type Route } from "@/lib/limits";

/**
 * HOW MANY TIMES YOU CAN STILL PRESS THIS.
 *
 * Every AI feature has a ceiling, and until now the first a seller heard of
 * one was being refused by it. A limit that arrives without warning does not
 * read as a limit; it reads as the product breaking, in the middle of the one
 * session where somebody was finally getting somewhere.
 *
 * NOTHING UNTIL IT MATTERS. A counter visible from the first click turns a
 * generous ceiling into a meter running down, and these ceilings are set so
 * that a heavy genuine week never reaches them — so for almost everybody the
 * right number of times to mention it is zero. It appears in the last quarter
 * of the allowance and not before.
 *
 * AND IT SAYS WHEN IT LIFTS. "3 of 12 left" alone is a wall. "Resets Monday"
 * is a wait, which is a completely different feeling about the same fact.
 */

/*
  One read for the whole page.

  Six of these can sit on one screen, and six identical round trips for one
  small object is silly. The promise is shared and only re-fetched when
  something says the numbers moved.
*/
let pending: Promise<Record<string, number>> | null = null;
const listeners = new Set<() => void>();

function read(): Promise<Record<string, number>> {
  /*
    The query builder is a thenable, not a Promise, so it has no .catch.
    Wrapped so a failed read shows nothing rather than breaking the page —
    a missing count is invisible; a crash beside a button is not.
  */
  pending ??= Promise.resolve(supabase.rpc("wb_left")).then(
    ({ data }) => (data as Record<string, number> | null) ?? {},
    () => ({}),
  );
  return pending;
}

/**
 * Call after doing the thing. The count on screen is now stale by exactly one,
 * and the seller who is watching it is the one person guaranteed to notice.
 */
export function spent() {
  pending = null;
  for (const l of listeners) l();
}

export default function Left({
  route,
  className = "",
}: {
  route: Route;
  className?: string;
}) {
  const [used, setUsed] = useState<number | null>(null);

  useEffect(() => {
    let alive = true;
    const load = () => {
      read().then((counts) => {
        if (alive) setUsed(counts[route] ?? 0);
      });
    };
    load();
    listeners.add(load);
    return () => {
      alive = false;
      listeners.delete(load);
    };
  }, [route]);

  if (used === null) return null;

  const cap = DAILY_CAP[route];
  const left = Math.max(0, cap - used);
  if (left > warnAt(cap)) return null;

  const weekly = WEEKLY.has(route);
  const when = weekly ? "this week" : "today";
  /*
    The weekly counters key on the ISO week, so they turn over on Monday. The
    daily ones turn over at midnight UTC, which is not the seller's midnight —
    "tomorrow" is honest about that in a way naming an hour would not be.
  */
  const resets = weekly ? "Resets Monday." : "Resets tomorrow.";

  return (
    <p className={`t-small text-ink-3 ${className}`}>
      {left === 0
        ? `None left ${when}. ${resets}`
        : `${left} of ${cap} left ${when}. ${resets}`}
    </p>
  );
}
