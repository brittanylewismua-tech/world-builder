"use client";

import { supabase, ASSET_BUCKET } from "./supabase";
import { askAI } from "./askAI";
import { downscale, uploadAsset } from "./api";
import type { World } from "./world";
import type { Drop } from "./drops";

/**
 * THE UPCOMING DROP RESEARCH BOARD
 *
 * While the seller builds this week's drop, next week's is quietly filling
 * up. Fragments they noticed — a layout, a phrase, a colour pairing, a joke
 * their customer made — land here in seconds, and the AI looks across the
 * whole pile for things they are repeatedly drawn to without realising.
 *
 * The division of labour is the whole point. The seller collects and decides.
 * The AI notices relationships and shows the evidence. It never designs, and
 * it never rules anything in or out of the world.
 */

export type Section = "visual" | "market";
export type ItemKind = "image" | "text" | "link";

/**
 * TWO BOARDS.
 *
 * There were four — Design, Quotes, Structures, Colour — and then Bestsellers
 * made five. That was four different ways of slicing one pile plus one pile
 * that is genuinely different, and it asked the seller to keep four Pinterest
 * boards she was never going to keep.
 *
 * These two answer different questions, which is the only test that matters:
 *
 *   Design inspo      — what I like. Everything I saved because it is good.
 *   Etsy bestsellers  — what is already selling. Other people's shops.
 *
 * The second is not a subdivision of the first, it is a different kind of
 * evidence, and it is handled differently downstream: it never gets read back
 * to the seller as her own creative direction.
 */
export const SECTIONS: { id: Section; name: string; blurb: string }[] = [
  {
    id: "visual",
    name: "Design inspo",
    blurb: "Everything you saved because you liked it.",
  },
  {
    id: "market",
    name: "Etsy bestsellers",
    blurb: "What is already selling. Other people's shops, not yours.",
  },
];

export const SECTION_NAME: Record<Section, string> = {
  visual: "Design inspo",
  market: "Etsy bestsellers",
};

/** The two Pinterest boards a seller is asked to keep. */
export const PINTEREST_BOARDS: { lane: Section; suggested: string }[] = [
  { lane: "visual", suggested: "Design inspo" },
  { lane: "market", suggested: "Etsy bestsellers" },
];

/**
 * Match a Pinterest board to a lane by its name, so somebody who followed the
 * workflow never answers the question at all. Bestsellers is checked first:
 * "Etsy bestseller design inspo" is a bestsellers board, and the other way
 * round would file a competitor pile as the seller's own taste.
 */
export function laneFromBoardName(name: string): Section | null {
  const n = name.toLowerCase();
  if (/best.?sell|etsy|competit|top.?seller|what.?s.?selling/.test(n))
    return "market";
  if (/design|inspo|inspiration|look|style|aesthetic|mood|quote|word|colou?r|layout/.test(n))
    return "visual";
  return null;
}

export interface BoardItem {
  id: string;
  kind: ItemKind;
  storagePath: string | null;
  src: string | null;
  originalName: string | null;
  body: string | null;
  sourceUrl: string | null;
  sourceLabel: string | null;
  note: string;
  /**
   * Every lane this piece sits in. A tee saved for its quote and its layout
   * belongs in both, and asking the seller which one "really" counts is a
   * question with no honest answer.
   */
  sections: Section[];
  /**
   * What the AI would have guessed. A suggestion shown during sorting and
   * nothing more — it never files anything, because it can see what a pin is
   * but not why this seller saved it.
   */
  aiSection: Section | null;
  later: boolean;
  ai: Record<string, unknown>;
  analyzedAt: string | null;
  createdAt: string;
}

export interface Finding {
  id: string;
  kind: "pattern" | "collision";
  title: string;
  detail: string;
  itemIds: string[];
  dismissed: boolean;
}

export interface Board {
  id: string;
  dropId: string;
  intention: string;
  items: BoardItem[];
  findings: Finding[];
  /**
   * How many pieces the board held the last time it was read, or null if it
   * has never been read. Reading it again is worth paying for once a real
   * batch of new work has landed on top of that — see NEW_BEFORE_REREAD.
   */
  covered: number | null;
}

/**
 * How many new pieces have to arrive before the board is worth reading again.
 *
 * One or two more images do not change what the board is about, and this read
 * is the most expensive one in the product — the whole board goes into it, so
 * it gets dearer as the board grows. Ten is roughly a session's saving, which
 * is the point at which the answer genuinely moves.
 */
export const NEW_BEFORE_REREAD = 10;

const SIGNED_TTL = 60 * 60 * 8;

/* ------------------------------------------------------------------ */
/* loading                                                             */
/* ------------------------------------------------------------------ */

interface ItemRow {
  id: string;
  kind: ItemKind;
  storage_path: string | null;
  original_name: string | null;
  body: string | null;
  source_url: string | null;
  source_label: string | null;
  note: string;
  sections: Section[] | null;
  ai_section: Section | null;
  later: boolean;
  ai: Record<string, unknown>;
  analyzed_at: string | null;
  created_at: string;
}

async function signAll(rows: ItemRow[]): Promise<BoardItem[]> {
  const paths = rows.map((r) => r.storage_path).filter(Boolean) as string[];
  const signed: Record<string, string> = {};
  if (paths.length) {
    const { data } = await supabase.storage
      .from(ASSET_BUCKET)
      .createSignedUrls(paths, SIGNED_TTL);
    for (const row of data ?? [])
      if (row.path && row.signedUrl) signed[row.path] = row.signedUrl;
  }
  return rows.map((r) => ({
    id: r.id,
    kind: r.kind,
    storagePath: r.storage_path,
    src: r.storage_path ? (signed[r.storage_path] ?? null) : null,
    originalName: r.original_name,
    body: r.body,
    sourceUrl: r.source_url,
    sourceLabel: r.source_label,
    note: r.note,
    sections: r.sections ?? [],
    aiSection: r.ai_section,
    later: r.later,
    ai: r.ai ?? {},
    analyzedAt: r.analyzed_at,
    createdAt: r.created_at,
  }));
}

const COLUMNS =
  "id, kind, storage_path, original_name, body, source_url, source_label, note, sections, ai_section, later, ai, analyzed_at, created_at";

/** The board for a given drop, creating it the first time it is opened. */
export async function openBoard(world: World, drop: Drop): Promise<Board> {
  let { data: rows } = await supabase
    .from("wb_boards")
    .select("id, drop_id, intention")
    .eq("drop_id", drop.id)
    .limit(1);

  if (!rows?.length) {
    const { data, error } = await supabase
      .from("wb_boards")
      .insert({ world_id: world.id, drop_id: drop.id })
      .select("id, drop_id, intention")
      .single();
    // A racing tab may have created it a moment ago; take theirs.
    if (error) {
      const again = await supabase
        .from("wb_boards")
        .select("id, drop_id, intention")
        .eq("drop_id", drop.id)
        .limit(1);
      rows = again.data ?? [];
      if (!rows.length) throw new Error(error.message);
    } else {
      rows = [data];
    }
  }

  const board = rows[0] as { id: string; drop_id: string; intention: string };

  const [{ data: itemRows }, { data: findingRows }, { data: lastRead }] =
    await Promise.all([
      supabase
        .from("wb_board_items")
        .select(COLUMNS)
        .eq("board_id", board.id)
        .order("created_at", { ascending: false }),
      supabase
        .from("wb_board_findings")
        .select("id, kind, title, detail, item_ids, dismissed")
        .eq("board_id", board.id)
        .eq("dismissed", false)
        .order("created_at", { ascending: false }),
      /*
        Dismissed findings count here. Throwing away what a read said does
        not mean the read never happened, and it must not become a way to
        buy another one.
      */
      supabase
        .from("wb_board_findings")
        .select("covered")
        .eq("board_id", board.id)
        .not("covered", "is", null)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

  return {
    id: board.id,
    dropId: board.drop_id,
    intention: board.intention,
    items: await signAll((itemRows ?? []) as ItemRow[]),
    findings: ((findingRows ?? []) as {
      id: string;
      kind: "pattern" | "collision";
      title: string;
      detail: string;
      item_ids: string[];
      dismissed: boolean;
    }[]).map((f) => ({
      id: f.id,
      kind: f.kind,
      title: f.title,
      detail: f.detail,
      itemIds: f.item_ids ?? [],
      dismissed: f.dismissed,
    })),
    covered: lastRead?.covered == null ? null : Number(lastRead.covered),
  };
}

/**
 * SAVING A SIGNAL FROM THE PAPER STRAIGHT ONTO NEXT WEEK'S BOARD
 *
 * Reading something useful and then having to remember it until you next
 * open the studio is how good observations get lost. Research runs a week
 * ahead of building, so a signal saved today belongs on next week's board —
 * where the Creative Room will find it when that drop comes round.
 *
 * It is saved as the seller's own note, not as evidence: the headline, what
 * the paper said, and the source to go back to.
 */
export async function saveSignalToBoard(
  world: World,
  drop: Drop,
  signal: { headline: string; body: string; url?: string | null },
) {
  const board = await openBoard(world, drop);
  const note = `${signal.headline} — ${signal.body}`.slice(0, 2000);
  if (signal.url) {
    let label: string | null = null;
    try {
      label = new URL(signal.url).hostname.replace(/^www\./, "");
    } catch {
      label = null;
    }
    if (label)
      return insert({
        world_id: world.id,
        board_id: board.id,
        kind: "link",
        source_url: signal.url,
        source_label: label,
        note,
      });
  }
  return insert({
    world_id: world.id,
    board_id: board.id,
    kind: "text",
    body: note,
  });
}

/**
 * A WRITTEN FINDING, ONTO THE BOARD.
 *
 * Not the same job as saveSignalToBoard, which files a link. A finding about
 * a shop went in as a link and the board rendered exactly what a link is: a
 * grey box saying "etsy.com" with the whole finding crushed into a four-word
 * caption underneath. Useless, and rightly complained about.
 *
 * A finding is words, so it goes in as words — a text item, which the board
 * already renders as a readable quote card. The shop it came from goes in the
 * note, where a short line belongs, and it lands in the bestsellers lane
 * because that is what it is: evidence about somebody else's shop, never to
 * be read back to the seller as her own taste.
 */
export async function saveFindingToBoard(
  world: World,
  drop: Drop,
  finding: { headline: string; body: string; source: string },
) {
  const board = await openBoard(world, drop);
  return insert({
    world_id: world.id,
    board_id: board.id,
    kind: "text",
    body: `${finding.headline} — ${finding.body}`.slice(0, 600),
    note: finding.source.slice(0, 120),
    sections: ["market"] as Section[],
  });
}

/**
 * A cheap glance at a board for Home — how much is on it and how many
 * findings are waiting. Deliberately does not create the board or sign any
 * image URLs; Home should never pay for a board nobody has opened.
 */
export async function boardGlance(dropId: string) {
  const { data } = await supabase
    .from("wb_boards")
    .select("id")
    .eq("drop_id", dropId)
    .limit(1);
  const id = data?.[0]?.id;
  if (!id) return { items: 0, findings: 0 };

  const [items, findings] = await Promise.all([
    supabase
      .from("wb_board_items")
      .select("id", { count: "exact", head: true })
      .eq("board_id", id)
      .eq("later", false),
    supabase
      .from("wb_board_findings")
      .select("id", { count: "exact", head: true })
      .eq("board_id", id)
      .eq("dismissed", false),
  ]);
  return { items: items.count ?? 0, findings: findings.count ?? 0 };
}

/** Everything parked for the future, across every week of this world. */
export async function loadLater(worldId: string): Promise<BoardItem[]> {
  const { data } = await supabase
    .from("wb_board_items")
    .select(COLUMNS)
    .eq("world_id", worldId)
    .eq("later", true)
    .order("created_at", { ascending: false });
  return signAll((data ?? []) as ItemRow[]);
}

/* ------------------------------------------------------------------ */
/* adding                                                              */
/* ------------------------------------------------------------------ */

async function insert(row: Record<string, unknown>): Promise<BoardItem> {
  const { data, error } = await supabase
    .from("wb_board_items")
    .insert(row)
    .select(COLUMNS)
    .single();
  if (error) throw new Error(error.message);
  return (await signAll([data as ItemRow]))[0];
}

export async function addImage(
  world: World,
  boardId: string,
  file: File,
  note = "",
) {
  // Reference material, not print files. A web-sized copy is all this needs,
  // and boards stay fast months later because of it.
  const path = await uploadAsset(file, "board");
  return insert({
    world_id: world.id,
    board_id: boardId,
    kind: "image",
    storage_path: path,
    original_name: file.name.slice(0, 200),
    note,
  });
}

export async function addText(world: World, boardId: string, body: string) {
  return insert({
    world_id: world.id,
    board_id: boardId,
    kind: "text",
    body: body.trim().slice(0, 2000),
  });
}

export async function addLink(
  world: World,
  boardId: string,
  url: string,
  note = "",
) {
  let label: string | null = null;
  try {
    label = new URL(url).hostname.replace(/^www\./, "");
  } catch {
    throw new Error("That does not look like a web address.");
  }
  return insert({
    world_id: world.id,
    board_id: boardId,
    kind: "link",
    source_url: url,
    source_label: label,
    note,
  });
}

/* ------------------------------------------------------------------ */
/* editing                                                             */
/* ------------------------------------------------------------------ */

export async function updateItem(id: string, patch: Partial<{
  sections: Section[];
  later: boolean;
  note: string;
  body: string;
  boardId: string | null;
  sourceLabel: string;
}>) {
  const row: Record<string, unknown> = {};
  if (patch.sections !== undefined) row.sections = patch.sections;
  if (patch.later !== undefined) row.later = patch.later;
  if (patch.note !== undefined) row.note = patch.note;
  if (patch.body !== undefined) row.body = patch.body;
  if (patch.boardId !== undefined) row.board_id = patch.boardId;
  if (patch.sourceLabel !== undefined) row.source_label = patch.sourceLabel;
  const { error } = await supabase
    .from("wb_board_items")
    .update(row)
    .eq("id", id);
  if (error) throw new Error(error.message);
}

/** Add or remove one lane, leaving the others alone. */
export async function setLane(
  item: BoardItem,
  lane: Section,
  member: boolean,
): Promise<Section[]> {
  const next = member
    ? Array.from(new Set([...item.sections, lane]))
    : item.sections.filter((s) => s !== lane);
  await updateItem(item.id, { sections: next });
  return next;
}

/**
 * Dragging a piece from one lane to another. This moves rather than copies:
 * the drag started inside a lane, so the seller is saying "not here, there".
 * Dropping onto a lane from the unsorted tray only adds, since there is
 * nothing to take it out of.
 */
export async function dragLane(
  item: BoardItem,
  from: Section | null,
  to: Section,
): Promise<Section[]> {
  const kept = from ? item.sections.filter((s) => s !== from) : item.sections;
  const next = Array.from(new Set([...kept, to]));
  await updateItem(item.id, { sections: next });
  return next;
}

/**
 * Top up this drop's research from the Pinterest boards already feeding it.
 * Twenty per board — see the route for why it is not automatic.
 */
export async function pullNewPins(worldId: string, dropId: string) {
  return askAI<{ imported: number; boards: number; note?: string }>(
    "/api/pinterest/refresh",
    { worldId, dropId },
    { timeoutMs: 180_000 },
  );
}

export async function removeItem(item: BoardItem) {
  const { error } = await supabase
    .from("wb_board_items")
    .delete()
    .eq("id", item.id);
  if (error) throw new Error(error.message);
  if (item.storagePath)
    await supabase.storage.from(ASSET_BUCKET).remove([item.storagePath]);
}

export async function setIntention(boardId: string, intention: string) {
  await supabase
    .from("wb_boards")
    .update({ intention: intention.slice(0, 500) })
    .eq("id", boardId);
}

export async function dismissFinding(id: string) {
  await supabase
    .from("wb_board_findings")
    .update({ dismissed: true })
    .eq("id", id);
}

/* ------------------------------------------------------------------ */
/* the AI side                                                         */
/* ------------------------------------------------------------------ */

/** Shrink an image to something a vision call can read cheaply. */
async function forVision(src: string): Promise<string | null> {
  try {
    const blob = await (await fetch(src)).blob();
    const small = await downscale(new File([blob], "x.jpg", { type: blob.type }), 720);
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error("unreadable"));
      reader.onload = () => resolve(String(reader.result).split(",")[1]);
      reader.readAsDataURL(small);
    });
  } catch {
    return null;
  }
}

/**
 * Look at one item, once, and keep what was noticed.
 *
 * Cost control is structural rather than incidental: analysis is stored on
 * the row and pattern detection reads it back, so a board with sixty images
 * costs sixty vision calls over a whole week and nothing thereafter.
 */
export async function analyzeItem(
  item: BoardItem,
  worldId?: string,
): Promise<BoardItem> {
  if (item.analyzedAt) return item;

  const image = item.kind === "image" && item.src ? await forVision(item.src) : null;

  const { ai, section } = await askAI<{
    ai: Record<string, unknown>;
    section: Section | null;
  }>("/api/board/analyze", {
    worldId,
    kind: item.kind,
    body: item.body,
    note: item.note,
    sourceUrl: item.sourceUrl,
    image,
  });

  /*
    Note what is written here and what is not: `ai` and `ai_section` yes,
    `sections` never. The reading is genuinely useful — it is what the pattern
    pass thinks with — but the filing is the seller's call. The model can tell
    you that an image contains hand-lettered type on a pink tee; it cannot
    tell you whether she pinned it for the words, the layout or the colour,
    and guessing wrong quietly is worse than not guessing at all.
  */
  await supabase
    .from("wb_board_items")
    .update({
      ai,
      ai_section: section,
      analyzed_at: new Date().toISOString(),
    })
    .eq("id", item.id);

  return { ...item, ai, aiSection: section, analyzedAt: new Date().toISOString() };
}

/** Look across the whole board and record what keeps coming back. */
export async function findPatterns(
  board: Board,
  world: World,
): Promise<Finding[]> {
  const analysed = board.items.filter((i) => i.analyzedAt && !i.later);
  if (analysed.length < 4)
    throw new Error(
      "Give it a few more pieces first — patterns need something to sit between.",
    );

  const { findings } = await askAI<{
    findings: { kind: "pattern" | "collision"; title: string; detail: string; itemIds: string[] }[];
  }>("/api/board/patterns", {
    boardId: board.id,
    worldId: world.id,
    intention: board.intention,
    worldName: world.name,
    subNiches: world.subNiches.map((s) => s.keyword),
    items: analysed.map((i) => ({
      id: i.id,
      kind: i.kind,
      body: i.body,
      note: i.note,
      ai: i.ai,
    })),
  });

  // Replace rather than accumulate: this is the current read of the board.
  await supabase.from("wb_board_findings").delete().eq("board_id", board.id);

  if (!findings.length) return [];

  const { data } = await supabase
    .from("wb_board_findings")
    .insert(
      findings.map((f) => ({
        board_id: board.id,
        kind: f.kind,
        title: f.title,
        detail: f.detail,
        item_ids: f.itemIds,
        /* The size of the board this was read from, so a repeat press on an
           unchanged board can be turned away before it costs anything. */
        covered: analysed.length,
      })),
    )
    .select("id, kind, title, detail, item_ids, dismissed");

  return ((data ?? []) as {
    id: string;
    kind: "pattern" | "collision";
    title: string;
    detail: string;
    item_ids: string[];
    dismissed: boolean;
  }[]).map((f) => ({
    id: f.id,
    kind: f.kind,
    title: f.title,
    detail: f.detail,
    itemIds: f.item_ids ?? [],
    dismissed: f.dismissed,
  }));
}
