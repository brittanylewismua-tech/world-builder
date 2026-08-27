"use client";

import { supabase } from "./supabase";
import { askAI } from "./askAI";
import type { World } from "./world";

/**
 * WORLD WINNERS.
 *
 * eRank's Top Listings export is a hundred rows of Etsy search results with
 * sales, age and views attached. What it does not contain is the design —
 * only a link. And the design is the whole point: nobody buys a shirt because
 * of a keyword, they buy it because of what is printed on it.
 *
 * So the export is read here, the rows that actually sold are kept, and the
 * server goes and opens each listing to get the artwork. The wall is the
 * pictures. The keyword is only how the file was filed.
 *
 * The library accumulates. Every export adds to the same wall, and the read
 * runs across all of it at once, because it is all one world.
 */

/** Rows below this never made anybody any money worth copying. */
export const SOLD_AT_LEAST = 100;

export interface Winner {
  id: string;
  listingId: string;
  keyword: string;
  title: string;
  url: string;
  shop: string | null;
  ageDays: number;
  views: number;
  dailyViews: number;
  sales: number;
  price: number;
  revenue: number;
  hearts: number;
  imageUrl: string | null;
  design: string | null;
  firstSeen: string;
  /** When this row last came in on an export. The sales figures are a
   *  snapshot from that day and nothing can refresh them — eRank estimates
   *  them, so only another export moves the number. */
  refreshedAt: string;
}

/** Sales per day it has been listed. The old giants and the fast movers are
 *  different listings, and raw sales only ever shows you the first kind. */
export function perDay(w: Winner) {
  return w.sales / Math.max(1, w.ageDays);
}

function shape(r: Record<string, unknown>): Winner {
  return {
    id: r.id as string,
    listingId: r.listing_id as string,
    keyword: r.keyword as string,
    title: r.title as string,
    url: r.url as string,
    shop: (r.shop as string | null) ?? null,
    ageDays: Number(r.age_days ?? 0),
    views: Number(r.views ?? 0),
    dailyViews: Number(r.daily_views ?? 0),
    sales: Number(r.sales ?? 0),
    price: Number(r.price ?? 0),
    revenue: Number(r.revenue ?? 0),
    hearts: Number(r.hearts ?? 0),
    imageUrl: (r.image_url as string | null) ?? null,
    design: (r.design as string | null) ?? null,
    firstSeen: r.first_seen as string,
    refreshedAt: (r.refreshed_at as string) ?? (r.first_seen as string),
  };
}

export async function loadWinners(worldId: string): Promise<Winner[]> {
  const { data, error } = await supabase
    .from("wb_winners")
    .select(
      "id, listing_id, keyword, title, url, shop, age_days, views, daily_views, sales, price, revenue, hearts, image_url, design, first_seen, refreshed_at",
    )
    .eq("world_id", worldId)
    .eq("hidden", false)
    .order("sales", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map(shape);
}

/**
 * Removing means removing.
 *
 * This used to set hidden = true, which quietly made the mistake permanent:
 * the row still existed, so re-uploading the export skipped it as already
 * known and the design never came back. Deleting means the export is always
 * the undo.
 */
export async function removeWinner(id: string) {
  const { error } = await supabase.from("wb_winners").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

/**
 * Remove a keyword, and everything written about it.
 *
 * The brief has to go with the designs. Leaving it behind meant that removing
 * a keyword and later adding it again resurrected an old read — patterns and
 * opportunities describing ten designs that are no longer on the wall,
 * presented as though they were current, with no way for the seller to tell.
 */
export async function removeKeyword(worldId: string, keyword: string) {
  const { error } = await supabase
    .from("wb_winners")
    .delete()
    .eq("world_id", worldId)
    .eq("keyword", keyword);
  if (error) throw new Error(error.message);

  await supabase
    .from("wb_winner_reads")
    .delete()
    .eq("world_id", worldId)
    .eq("keyword", keyword);
}

/* ------------------------------------------------------------------ */
/* the brief                                                           */
/* ------------------------------------------------------------------ */

export interface BriefPoint {
  heading: string;
  body: string;
}

/**
 * What is working under one keyword. Patterns only.
 *
 * There was an "opportunities" half that proposed designs to make. That is a
 * different tool's job — this one reports what the market has already done,
 * and the seller takes it wherever they take it. A research surface that
 * starts inventing is two tools in a coat.
 */
export interface Brief {
  patterns: BriefPoint[];
}

export interface StoredBrief {
  brief: Brief;
  counted: number;
  ranAt: string;
}

/**
 * The current brief for each keyword.
 *
 * One read per keyword rather than one across everything, because a seller
 * stands in front of one group and asks what is going on in it. Rows come
 * back newest first, so the first one seen for a keyword is its current brief
 * and the rest are its history.
 */
export async function loadBriefs(worldId: string): Promise<{
  /** The read across every corner. Null keyword in the table. */
  world: StoredBrief | null;
  byKeyword: Record<string, StoredBrief>;
}> {
  const { data } = await supabase
    .from("wb_winner_reads")
    .select("brief, counted, ran_at, keyword")
    .eq("world_id", worldId)
    .order("ran_at", { ascending: false });

  let world: StoredBrief | null = null;
  const byKeyword: Record<string, StoredBrief> = {};

  for (const row of data ?? []) {
    const one: StoredBrief = {
      brief: row.brief as Brief,
      counted: Number(row.counted ?? 0),
      ranAt: row.ran_at as string,
    };
    const k = row.keyword as string | null;
    // Newest first, so the first of each kind seen is the current one.
    if (!k) world ??= one;
    else byKeyword[k] ??= one;
  }

  return { world, byKeyword };
}

export async function readPatterns(world: World, keyword: string) {
  return askAI<{ brief: Brief; counted: number; keyword: string }>(
    "/api/winners/read",
    { worldId: world.id, keyword },
    { timeoutMs: 240_000 },
  );
}

/**
 * The read across every corner at once.
 *
 * Once a week, because the wall only moves when an export is uploaded — a
 * second press on the same Tuesday is reading the same world again.
 */
export async function readTheWorld(world: World) {
  return askAI<{ brief: Brief; counted: number }>(
    "/api/winners/read",
    { worldId: world.id, scope: "world" },
    { timeoutMs: 240_000 },
  );
}

/* ------------------------------------------------------------------ */
/* reading the export                                                  */
/* ------------------------------------------------------------------ */

export interface ExportRow {
  listingId: string;
  title: string;
  url: string;
  shop: string;
  ageDays: number;
  views: number;
  dailyViews: number;
  sales: number;
  price: number;
  revenue: number;
  hearts: number;
}

export interface ParsedExport {
  keyword: string;
  kept: ExportRow[];
  /** How many rows were in the file, so the screen can say what was left out. */
  total: number;
}

/**
 * The keyword is in the filename.
 *
 * eRank names its downloads "eRank - Keyword Tool - feminist shirt - Top
 * Listings.csv", so the seller never has to tell the app which keyword a file
 * belongs to. If the name has been changed, fall back to whatever is left
 * after the extension rather than refusing the file.
 */
export function keywordFromName(name: string) {
  const m = name.match(/Keyword Tool\s*-\s*(.+?)\s*-\s*Top Listings/i);
  if (m) return m[1].trim();
  return name.replace(/\.csv$/i, "").trim() || "unfiled";
}

/**
 * A CSV reader that survives real files.
 *
 * Listing titles are wall-to-wall commas — "Feminist Shirt, Girls Will Be
 * Girls Shirt, Witches Halloween Shirts" — so splitting on commas destroys
 * every row. Quotes have to be honoured, including the doubled quote that
 * means a literal one.
 */
function rows(text: string): string[][] {
  const out: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else quoted = false;
      } else cell += c;
      continue;
    }
    if (c === '"') quoted = true;
    else if (c === ",") {
      row.push(cell);
      cell = "";
    } else if (c === "\n") {
      row.push(cell);
      out.push(row);
      row = [];
      cell = "";
    } else if (c !== "\r") cell += c;
  }
  if (cell || row.length) {
    row.push(cell);
    out.push(row);
  }
  return out.filter((r) => r.some((v) => v.trim() !== ""));
}

const num = (v: string | undefined) => {
  const n = Number(String(v ?? "").replace(/[^0-9.\-]/g, ""));
  return Number.isFinite(n) ? n : 0;
};

export async function readExport(file: File): Promise<ParsedExport> {
  // The file eRank hands over is UTF-8 with a byte order mark, which turns the
  // first header into "﻿Listing" and loses the column.
  const text = (await file.text()).replace(/^﻿/, "");
  const table = rows(text);
  if (table.length < 2) throw new Error("That file has no listings in it.");

  const head = table[0].map((h) => h.trim().toLowerCase());
  const at = (name: string) => head.indexOf(name);
  const iTitle = at("listing");
  const iUrl = at("listing url");

  if (iTitle < 0 || iUrl < 0)
    throw new Error(
      "That does not look like an eRank Top Listings export. Export again from the Top Listings tab.",
    );

  const iShop = at("shop");
  const iAge = at("age (days)");
  const iViews = at("views");
  const iDaily = at("daily views");
  const iSales = at("est. sales");
  const iPrice = at("price");
  const iRev = at("est. revenue");
  const iHearts = at("hearts");

  const kept: ExportRow[] = [];
  for (const r of table.slice(1)) {
    const url = (r[iUrl] ?? "").trim();
    const listingId = url.match(/\/listing\/(\d+)/)?.[1];
    if (!listingId) continue;

    const sales = num(r[iSales]);
    if (sales < SOLD_AT_LEAST) continue;

    kept.push({
      listingId,
      title: (r[iTitle] ?? "").trim(),
      url,
      shop: (r[iShop] ?? "").trim(),
      ageDays: num(r[iAge]),
      views: num(r[iViews]),
      dailyViews: num(r[iDaily]),
      sales,
      price: num(r[iPrice]),
      revenue: num(r[iRev]),
      hearts: num(r[iHearts]),
    });
  }

  return { keyword: keywordFromName(file.name), kept, total: table.length - 1 };
}

export async function addExport(world: World, parsed: ParsedExport) {
  return askAI<{
    added: number;
    already: number;
    noPicture: number;
    keyed: boolean;
  }>(
    "/api/winners",
    { worldId: world.id, keyword: parsed.keyword, rows: parsed.kept },
    { timeoutMs: 240_000 },
  );
}
