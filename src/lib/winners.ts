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
  };
}

export async function loadWinners(worldId: string): Promise<Winner[]> {
  const { data, error } = await supabase
    .from("wb_winners")
    .select(
      "id, listing_id, keyword, title, url, shop, age_days, views, daily_views, sales, price, revenue, hearts, image_url, design, first_seen",
    )
    .eq("world_id", worldId)
    .eq("hidden", false)
    .order("sales", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map(shape);
}

export async function hideWinner(id: string) {
  await supabase.from("wb_winners").update({ hidden: true }).eq("id", id);
}

/* ------------------------------------------------------------------ */
/* the brief                                                           */
/* ------------------------------------------------------------------ */

export interface BriefPoint {
  heading: string;
  body: string;
}

export interface Brief {
  moves: BriefPoint[];
  worn: BriefPoint[];
  alive: BriefPoint[];
  gaps: BriefPoint[];
}

export interface StoredBrief {
  brief: Brief;
  counted: number;
  ranAt: string;
}

export async function loadBrief(worldId: string): Promise<StoredBrief | null> {
  const { data } = await supabase
    .from("wb_winner_reads")
    .select("brief, counted, ran_at")
    .eq("world_id", worldId)
    .order("ran_at", { ascending: false })
    .limit(1);
  const row = data?.[0];
  if (!row) return null;
  return {
    brief: row.brief as Brief,
    counted: Number(row.counted ?? 0),
    ranAt: row.ran_at as string,
  };
}

export async function readTheWall(world: World) {
  return askAI<{ brief: Brief; counted: number }>(
    "/api/winners/read",
    { worldId: world.id },
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
  return askAI<{ added: number; already: number; noPicture: number }>(
    "/api/winners",
    { worldId: world.id, keyword: parsed.keyword, rows: parsed.kept },
    { timeoutMs: 240_000 },
  );
}
