"use client";

import { supabase } from "./supabase";
import { AFFINITY_QUESTIONS, type World } from "./world";
import { formatDropDate, type Drop } from "./drops";

/**
 * ONE MEMORY, SHARED BY EVERY ROOM
 *
 * Until now each surface built its own little briefing and knew only its own
 * corner: the customer simulation had never seen a drop, the Creative Room had
 * never read the paper, and the research went out every morning with no idea
 * what it had already reported. Three partial pictures of one world.
 *
 * This assembles the whole picture once, and every room draws from it. The
 * effect is the thing the product is actually selling — the longer someone
 * lives in their world, the more the software knows about it, and the less
 * they have to re-explain themselves.
 *
 * SPEC guard: "The AI can know 100 things behind the scenes and show the
 * seller the 5 that matter." All of this is context handed to the model. None
 * of it becomes a screen. There is no dossier to read, no intelligence map,
 * no research dashboard — just rooms that are no longer strangers.
 *
 * Everything here is bounded on purpose. A world that has been lived in for a
 * year must not send a year of history with every message, so each section is
 * the most recent and most relevant slice, not the archive.
 */

/** How far back the shared memory reaches. */
const SIGNAL_DAYS = 4;
const SIGNAL_MAX = 14;
const CROSS_TALK = 6;
const DROP_HISTORY = 4;

/* ------------------------------------------------------------------ */
/* the pieces                                                          */
/* ------------------------------------------------------------------ */

/** What the paper has reported lately, so nothing repeats itself. */
async function recentSignals(worldId: string) {
  const since = new Date();
  since.setDate(since.getDate() - SIGNAL_DAYS);
  const { data } = await supabase
    .from("wb_daily_items")
    .select("issue_date, kind, headline")
    .eq("world_id", worldId)
    .gte("issue_date", since.toISOString().slice(0, 10))
    .order("issue_date", { ascending: false })
    .order("position")
    .limit(SIGNAL_MAX);
  return (data ?? []) as { issue_date: string; kind: string; headline: string }[];
}

/**
 * The tail of the *other* conversation, so the rooms are aware of each other.
 * Only the gist — this is peripheral vision, not a transcript.
 */
async function otherThread(worldId: string, kind: "customer" | "room") {
  const { data: threads } = await supabase
    .from("wb_conversations")
    .select("id")
    .eq("world_id", worldId)
    .eq("kind", kind)
    .order("updated_at", { ascending: false })
    .limit(1);
  const id = threads?.[0]?.id as string | undefined;
  if (!id) return [];

  const { data } = await supabase
    .from("wb_messages")
    .select("role, content")
    .eq("conversation_id", id)
    .order("created_at", { ascending: false })
    .limit(CROSS_TALK);
  return ((data ?? []) as { role: string; content: string }[]).reverse();
}

/** What has actually been released, and how the current board is going. */
function dropStory(world: World, drops: Drop[], current?: Drop | null) {
  const lines: string[] = [];
  const frozen = drops.filter((d) => d.frozenAt).slice(0, DROP_HISTORY);

  if (current)
    lines.push(
      `Current board: DROP ${String(current.number).padStart(2, "0")}, publishing ${formatDropDate(current.publishDate)}, ${current.items.length} of ${world.slotsPerDrop} slots filled.`,
    );

  if (frozen.length)
    lines.push(
      `Released so far: ${frozen
        .map(
          (d) =>
            `DROP ${String(d.number).padStart(2, "0")} (${formatDropDate(d.publishDate)}, ${d.items.length} designs)`,
        )
        .join(" · ")}.`,
      "You have no sales figures for any of these and must never imply otherwise.",
    );

  return lines;
}

/** How the seller says they relate to this customer. Reflection, not a score. */
function connection(world: World) {
  const answered = AFFINITY_QUESTIONS.filter(
    (q) => world.affinity[q.key] !== null,
  );
  if (!answered.length) return [];
  return [
    `How the seller rates their own connection to this customer, out of 10: ${answered
      .map((q) => `${q.question} ${world.affinity[q.key]}`)
      .join(" · ")}. This is their private reflection — never quote it back at them or treat it as a verdict on the world.`,
  ];
}

/* ------------------------------------------------------------------ */
/* the whole picture                                                   */
/* ------------------------------------------------------------------ */

export interface ContextOptions {
  /** Which room is asking — its own thread is excluded from cross-talk. */
  room: "daily" | "customer" | "room";
  drops?: Drop[];
  currentDrop?: Drop | null;
}

export async function buildWorldContext(
  world: World,
  { room, drops = [], currentDrop = null }: ContextOptions,
): Promise<string> {
  const [signals, other] = await Promise.all([
    recentSignals(world.id),
    room === "daily"
      ? Promise.resolve([])
      : otherThread(world.id, room === "customer" ? "room" : "customer"),
  ]);

  const lines: string[] = [
    `THE WORLD: ${world.name}`,
    `Sub-niches the seller validated in eRank: ${world.subNiches.map((s) => s.keyword).join(" · ") || "none recorded"}.`,
    `Parts of this world being watched: ${world.areas.map((a) => a.name).join(" · ") || "none yet"}.`,
  ];

  if (world.visualReferences.length)
    lines.push(
      `The seller has ${world.visualReferences.length} design references on file showing the creative style they like. Style direction only — never designs to copy, never evidence of demand.`,
    );

  lines.push(...connection(world));
  lines.push(...dropStory(world, drops, currentDrop));

  if (signals.length) {
    lines.push(
      "",
      room === "daily"
        ? `ALREADY REPORTED IN THE LAST ${SIGNAL_DAYS} DAYS — do not report any of these again, and do not report a near-duplicate. Find something new, or return fewer items.`
        : `RECENTLY IN THIS WORLD'S DAILY PAPER — real things the seller has been reading about. You can refer to them naturally.`,
      ...signals.map((s) => `- [${s.issue_date}] ${s.headline}`),
    );
  }

  if (other.length) {
    lines.push(
      "",
      room === "customer"
        ? `THE SELLER HAS BEEN WORKING ON THEIR DROP AND SAID THINGS LIKE THIS — background only, and you are the customer, not their collaborator. Never mention their shop, their designs, or that they sell anything.`
        : `THE SELLER HAS BEEN TALKING TO THEIR CUSTOMER SIMULATION AND IT WENT LIKE THIS — useful for what is on their mind. It is a simulation, not evidence.`,
      ...other.map(
        (m) =>
          `- ${m.role === "user" ? "Seller" : room === "customer" ? "Creative Room" : "Customer"}: ${m.content.slice(0, 220)}`,
      ),
    );
  }

  return lines.join("\n");
}
