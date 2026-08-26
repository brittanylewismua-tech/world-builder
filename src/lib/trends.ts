"use client";

import { supabase } from "./supabase";
import { askAI } from "./askAI";
import type { World } from "./world";

/**
 * THE POOL, ON THE CLIENT SIDE.
 *
 * A world starts with the sub-niches its seller typed and grows by whatever
 * Google reports as rising alongside them. What lands on screen is the part
 * that moved, plus whatever turned up for the first time.
 */

export interface Term {
  id: string;
  term: string;
  foundNear: string | null;
  value: number | null;
  previous: number | null;
  curve: { at: string; v: number }[] | null;
  firstSeen: string;
  lastChecked: string | null;
}

export interface Run {
  ranAt: string;
  checked: number;
  discovered: number;
}

function shape(r: Record<string, unknown>): Term {
  return {
    id: r.id as string,
    term: r.term as string,
    foundNear: (r.found_near as string | null) ?? null,
    value: (r.value as number | null) ?? null,
    previous: (r.previous as number | null) ?? null,
    curve: (r.curve as Term["curve"]) ?? null,
    firstSeen: r.first_seen as string,
    lastChecked: (r.last_checked as string | null) ?? null,
  };
}

export async function loadTerms(worldId: string): Promise<Term[]> {
  const { data, error } = await supabase
    .from("wb_trend_terms")
    .select("id, term, found_near, value, previous, curve, first_seen, last_checked")
    .eq("world_id", worldId)
    .eq("hidden", false)
    .order("first_seen", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map(shape);
}

export async function loadRuns(worldId: string): Promise<Run[]> {
  const { data, error } = await supabase
    .from("wb_trend_runs")
    .select("ran_at, checked, discovered")
    .eq("world_id", worldId)
    .order("ran_at", { ascending: false })
    .limit(10);
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => ({
    ranAt: r.ran_at as string,
    checked: (r.checked as number) ?? 0,
    discovered: (r.discovered as number) ?? 0,
  }));
}

export async function hideTerm(id: string) {
  await supabase.from("wb_trend_terms").update({ hidden: true }).eq("id", id);
}

export async function runUpdate(world: World) {
  return askAI<{ checked: number; discovered: number; moved: number }>(
    "/api/trends",
    { worldId: world.id },
    { timeoutMs: 180_000 },
  );
}

/** How far it has moved since the reading before. */
export function movement(t: Term) {
  if (t.value === null || t.previous === null) return null;
  return t.value - t.previous;
}

/**
 * Today's update: what moved, and what is new.
 *
 * Everything else in the pool is still there and still being tracked — it
 * just has nothing to say this morning, and a feed that repeats yesterday is
 * not one anybody reads twice.
 */
export function todaysUpdate(terms: Term[], lastRun: string | null) {
  const since = lastRun ? new Date(lastRun).getTime() : 0;

  const fresh = terms
    .filter((t) => new Date(t.firstSeen).getTime() >= since - 60_000)
    .filter((t) => !!t.foundNear);

  const moved = terms
    .filter((t) => {
      const m = movement(t);
      return m !== null && Math.abs(m) >= 8;
    })
    .sort((a, b) => Math.abs(movement(b)!) - Math.abs(movement(a)!));

  return { fresh, moved };
}
