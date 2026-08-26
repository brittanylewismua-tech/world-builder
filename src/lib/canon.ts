"use client";

import { supabase } from "./supabase";
import { askAI } from "./askAI";
import type { World } from "./world";

/**
 * THE CANON.
 *
 * Every other surface in this product reads a slice. World News reads this
 * week. The research board reads this drop. The Director reads one board. The
 * customer sees ten mockups. Nothing has ever read the whole world at once —
 * even though after a few months the whole world is sitting in the database:
 * every verified signal, every pin, every phrase, every design.
 *
 * That corpus IS the world. This is the pass that finally reads it.
 *
 * Two rules make it a canon rather than a summary:
 *
 *   1. Every claim carries its evidence. Not "your customer values
 *      authenticity" but "eleven pins and three signals say this, here they
 *      are". A line the seller can check is a line they can disagree with,
 *      and a canon nobody can argue with is just an opinion in a nice font.
 *
 *   2. It is versioned, never overwritten. The point is that it gets sharper.
 *      You cannot see that happen if last month's is gone.
 *
 * Deliberately NOT in here: anything that polices repetition. Iterating on
 * what works is the whole strategy on Etsy, so a record of what has been made
 * is material to build on, never a warning that you are repeating yourself.
 */

export const SECTIONS = [
  { id: "person", title: "Who this is" },
  { id: "lexicon", title: "How they talk" },
  { id: "look", title: "What it looks like" },
  { id: "made", title: "What this world has made" },
  { id: "untouched", title: "Sitting unused" },
  { id: "open", title: "Still unsettled" },
] as const;

export type SectionId = (typeof SECTIONS)[number]["id"];

export interface Canon {
  id: string;
  sections: Partial<Record<SectionId, string>>;
  evidence: {
    signals?: number;
    pieces?: number;
    designs?: number;
    drops?: number;
    findings?: number;
  };
  builtAt: string;
}

export async function loadCanon(worldId: string): Promise<Canon | null> {
  const { data, error } = await supabase
    .from("wb_canon")
    .select("id, sections, evidence, built_at")
    .eq("world_id", worldId)
    .order("built_at", { ascending: false })
    .limit(1);
  if (error) throw new Error(error.message);
  const row = data?.[0];
  if (!row) return null;
  return {
    id: row.id as string,
    sections: (row.sections ?? {}) as Canon["sections"],
    evidence: (row.evidence ?? {}) as Canon["evidence"],
    builtAt: row.built_at as string,
  };
}

/** Every version, newest first — the world getting sharper, on the record. */
export async function loadCanonHistory(worldId: string) {
  const { data, error } = await supabase
    .from("wb_canon")
    .select("id, built_at, evidence")
    .eq("world_id", worldId)
    .order("built_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => ({
    id: r.id as string,
    builtAt: r.built_at as string,
    evidence: (r.evidence ?? {}) as Canon["evidence"],
  }));
}

export async function loadCanonVersion(id: string): Promise<Canon | null> {
  const { data, error } = await supabase
    .from("wb_canon")
    .select("id, sections, evidence, built_at")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  return {
    id: data.id as string,
    sections: (data.sections ?? {}) as Canon["sections"],
    evidence: (data.evidence ?? {}) as Canon["evidence"],
    builtAt: data.built_at as string,
  };
}

/**
 * How much material exists right now.
 *
 * Shown before anyone presses the button, because this feature is honestly
 * thin in week one and pretending otherwise wastes a run. A seller who can
 * see they have nine pieces will understand why the canon is short.
 */
export async function canonEvidence(worldId: string) {
  const count = async (table: string, col = "world_id") => {
    const { count: n } = await supabase
      .from(table)
      .select("id", { count: "exact", head: true })
      .eq(col, worldId);
    return n ?? 0;
  };
  const [signals, pieces, drops, findings] = await Promise.all([
    count("wb_daily_items"),
    count("wb_board_items"),
    count("wb_drops"),
    count("wb_board_findings"),
  ]);
  return { signals, pieces, drops, findings };
}

export async function buildCanon(world: World): Promise<Canon> {
  await askAI<{ ok: true }>(
    "/api/canon",
    { worldId: world.id },
    { timeoutMs: 240_000 },
  );
  const fresh = await loadCanon(world.id);
  if (!fresh) throw new Error("The canon did not save. Try again.");
  return fresh;
}

export function formatBuilt(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}
