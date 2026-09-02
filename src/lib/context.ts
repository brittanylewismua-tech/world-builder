"use client";

import { supabase } from "./supabase";
import { type World } from "./world";
import { type Drop } from "./drops";
/*
  The pure assembly moved to worldContext.ts so the scheduled writer can
  build the same briefing without a browser session. One copy of the prose,
  two callers.
*/
import {
  alreadyReported,
  dropStory,
  SIGNAL_DAYS,
  SIGNAL_MAX,
  worldOpening,
} from "./worldContext";

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

const CROSS_TALK = 6;
const BOARD_ITEMS = 14;

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

/**
 * WHAT WAS RESEARCHED FOR THIS DROP
 *
 * The whole method is research one week, build the next — and until now the
 * Creative Room had never seen a single thing off the research board. The
 * seller collected it, the AI wrote notes on it, and then it sat in a drawer
 * while they were asked to design from memory.
 *
 * Only the stored notes travel, never the images and never anything close
 * enough to reconstruct a design from. This is what was noticed, not what
 * was looked at.
 */
async function boardNotes(dropId: string) {
  const { data: boards } = await supabase
    .from("wb_boards")
    .select("id, intention")
    .eq("drop_id", dropId)
    .limit(1);
  const board = boards?.[0] as { id: string; intention: string } | undefined;
  if (!board) return [];

  const [{ data: items }, { data: findings }] = await Promise.all([
    supabase
      .from("wb_board_items")
      .select("kind, note, sections, ai_section, ai, body, source_label")
      .eq("board_id", board.id)
      .eq("later", false)
      .order("created_at", { ascending: false })
      .limit(BOARD_ITEMS),
    supabase
      .from("wb_board_findings")
      .select("kind, title, detail")
      .eq("board_id", board.id)
      .eq("dismissed", false)
      .limit(6),
  ]);

  const rows = (items ?? []) as {
    kind: string;
    note: string;
    sections: string[] | null;
    ai_section: string | null;
    ai: Record<string, unknown>;
    body: string | null;
    source_label: string | null;
  }[];
  if (!rows.length && !(findings ?? []).length) return [];

  const lines = [
    "",
    "WHAT THE SELLER COLLECTED WHILE RESEARCHING THIS DROP — their raw material, not verified and not demand evidence. Help them see across it; never hand it back as instructions.",
  ];

  if (board.intention.trim())
    lines.push(`They said this drop is about: ${board.intention.trim()}`);

  /*
    Bestsellers are split out and labelled, because they are not the same kind
    of thing as everything else here. Design, Quotes and Structures are what
    the seller likes. Bestsellers are other people's listings — evidence about
    a market, not a statement of her taste. Folded into one undifferentiated
    list, a competitor's product description gets read back to her as her own
    creative direction, which is the single worst thing this feature could do.
  */
  const mine: string[] = [];
  const theirs: string[] = [];

  for (const r of rows) {
    const summary =
      typeof r.ai?.summary === "string" ? (r.ai.summary as string) : "";
    const said = [r.note?.trim(), summary, r.body?.trim()]
      .filter(Boolean)
      .join(" — ")
      .slice(0, 240);
    if (!said) continue;
    const lanes = r.sections ?? [];
    if (lanes.includes("market"))
      theirs.push(`- [competitor_listing] ${said}`);
    else
      mine.push(
        `- [research_board_item] (${lanes.join(", ") || r.kind}) ${said}`,
      );
  }

  lines.push(...mine);

  if (theirs.length) {
    lines.push(
      "",
      "WHAT IS ALREADY SELLING IN THIS WORLD — listings from other shops that the seller saved as market reference. This is NOT the seller's taste and NOT their direction. Use it to say what the market is saturated with or missing. Never suggest they copy any of it, and never describe it back to them as something they want to make.",
      ...theirs,
    );
  }

  for (const f of (findings ?? []) as {
    kind: string;
    title: string;
    detail: string;
  }[])
    lines.push(
      `- [research_board_item] ${f.kind === "collision" ? "Collision" : "Pattern"} already surfaced: ${f.title}. ${f.detail}`.slice(
        0,
        300,
      ),
    );

  return lines;
}




/* ------------------------------------------------------------------ */
/* the whole picture                                                   */
/* ------------------------------------------------------------------ */

export interface ContextOptions {
  /** Which room is asking — its own thread is excluded from cross-talk. */
  room: "daily" | "customer" | "room";
  drops?: Drop[];
  currentDrop?: Drop | null;
  /** Pull in the research board collected for this drop. */
  boardFor?: string | null;
}

export async function buildWorldContext(
  world: World,
  { room, drops = [], currentDrop = null, boardFor = null }: ContextOptions,
): Promise<string> {
  const [signals, other, board] = await Promise.all([
    recentSignals(world.id),
    room === "daily"
      ? Promise.resolve([])
      : otherThread(world.id, room === "customer" ? "room" : "customer"),
    boardFor ? boardNotes(boardFor) : Promise.resolve([]),
  ]);

  const lines: string[] = worldOpening(world);
  lines.push(...dropStory(world, drops, currentDrop));
  lines.push(...board);

  lines.push(...alreadyReported(signals, room === "daily" ? "daily" : "other"));

  if (other.length) {
    lines.push(
      "",
      room === "customer"
        /*
          This used to end "never mention their designs", which was right
          while the customer could see nothing — and became a flat
          contradiction the moment she was shown the drop. Asked which design
          she preferred, she obediently said she could not see any. She still
          must not know the person she is talking to MADE them; that is a
          different thing from being unable to see them.
        */
        ? `THE SELLER HAS BEEN WORKING ON SOMETHING AND SAID THINGS LIKE THIS — background only. You are a person with your own life, not their collaborator, and you do not know they make or sell anything.`
        : `THE SELLER HAS BEEN TALKING TO THEIR CUSTOMER SIMULATION AND IT WENT LIKE THIS — useful for what is on their mind. It is a simulation, not evidence.`,
      ...other.map((m) => {
        const who =
          m.role === "user"
            ? "Seller"
            : room === "customer"
              ? "Drop Director"
              : "[customer_simulation] Customer";
        return `- ${who}: ${m.content.slice(0, 220)}`;
      }),
    );
  }

  return lines.join("\n");
}
