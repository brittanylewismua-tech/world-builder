import { NextResponse } from "next/server";
import { ownerOf } from "@/lib/guard";
import { serviceDb } from "@/lib/pinterest";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * PUT AN eRANK EXPORT ON THE WALL.
 *
 * The export has everything except the one thing that matters. A hundred rows
 * of sales, age, views and price — and for the design itself, a link.
 *
 * So this opens each listing that actually sold and takes two things off the
 * page: the full-size photo, and Etsy's own written description of what is in
 * it ("a peach t-shirt with portraits of Frida Kahlo, Audre Lorde, Maya
 * Angelou..."). Etsy writes that itself for accessibility and it is a better
 * account of the artwork than any title, because titles are keyword stuffing
 * from the first word to the last.
 *
 * Listings already on the wall are not fetched again — their numbers are
 * refreshed and that is all. A world that has been running for months should
 * not re-read three hundred pages to add one export.
 */

/** How many new listings one upload may open. A bound on the wait, not on
 *  the library: the rest arrive on the next upload. */
const MOST_PER_UPLOAD = 60;

/** Etsy serves a plain 403 to anything that does not look like a browser. */
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

interface Row {
  listingId?: string;
  title?: string;
  url?: string;
  shop?: string;
  ageDays?: number;
  views?: number;
  dailyViews?: number;
  sales?: number;
  price?: number;
  revenue?: number;
  hearts?: number;
}

/**
 * What is actually printed on it.
 *
 * Two things are wanted and they come from different places in the markup.
 * og:image is the primary photo at full size. The description is in the alt
 * text of that same photo, which Etsy writes as "May include: ...". Every
 * later alt on the page is a size chart or a colour swatch, so only the first
 * one is any use.
 */
async function readListing(id: string) {
  const res = await fetch(`https://www.etsy.com/listing/${id}`, {
    headers: {
      "user-agent": UA,
      accept: "text/html,application/xhtml+xml",
      "accept-language": "en-US,en;q=0.9",
    },
    // Etsy pages are heavy and none of this is worth a long stall.
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) return null;
  const html = await res.text();

  const image =
    html.match(
      /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i,
    )?.[1] ??
    html.match(
      /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i,
    )?.[1] ??
    null;

  const design =
    html
      .match(/alt=["']May include:\s*([^"']{10,600})["']/i)?.[1]
      ?.replace(/&quot;/g, '"')
      .replace(/&amp;/g, "&")
      .replace(/&#39;/g, "'")
      .trim() ?? null;

  return { image, design };
}

/** Run the fetches a few at a time. One at a time is minutes; all at once
 *  gets the deployment rate limited. */
async function inWaves<T, R>(
  items: T[],
  width: number,
  job: (item: T) => Promise<R>,
) {
  const out: R[] = [];
  for (let i = 0; i < items.length; i += width)
    out.push(...(await Promise.all(items.slice(i, i + width).map(job))));
  return out;
}

export async function POST(req: Request) {
  let body: { worldId?: string; keyword?: string; rows?: Row[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Bad request." }, { status: 400 });
  }

  const { worldId, keyword } = body;
  const rows = Array.isArray(body.rows) ? body.rows : [];
  if (!worldId || !keyword)
    return NextResponse.json({ error: "No world given." }, { status: 400 });
  if (!rows.length)
    return NextResponse.json(
      { error: "Nothing in that file sold enough to be worth looking at." },
      { status: 400 },
    );

  const door = await ownerOf(req, worldId);
  if ("deny" in door) return door.deny;

  const db = serviceDb();

  const clean = rows.filter(
    (r) => typeof r.listingId === "string" && /^\d+$/.test(r.listingId),
  );

  // What is already on the wall keeps its picture and its place; only the
  // numbers move.
  const { data: have } = await db
    .from("wb_winners")
    .select("listing_id")
    .eq("world_id", worldId)
    .in(
      "listing_id",
      clean.map((r) => r.listingId as string),
    );
  const known = new Set((have ?? []).map((h) => h.listing_id as string));

  const fresh = clean
    .filter((r) => !known.has(r.listingId as string))
    .slice(0, MOST_PER_UPLOAD);

  const pictures = new Map<string, { image: string | null; design: string | null }>();
  await inWaves(fresh, 6, async (r) => {
    try {
      const got = await readListing(r.listingId as string);
      if (got) pictures.set(r.listingId as string, got);
    } catch {
      // A listing that has been taken down, or that Etsy would not serve.
      // It simply does not go on the wall.
    }
  });

  const now = new Date().toISOString();
  const payload = clean.map((r) => {
    const got = pictures.get(r.listingId as string);
    return {
      world_id: worldId,
      listing_id: r.listingId,
      keyword,
      title: r.title ?? "",
      url: r.url ?? `https://www.etsy.com/listing/${r.listingId}`,
      shop: r.shop ?? null,
      age_days: Math.round(r.ageDays ?? 0),
      views: Math.round(r.views ?? 0),
      daily_views: Math.round(r.dailyViews ?? 0),
      sales: Math.round(r.sales ?? 0),
      price: r.price ?? 0,
      revenue: r.revenue ?? 0,
      hearts: Math.round(r.hearts ?? 0),
      ...(got ? { image_url: got.image, design: got.design } : {}),
      refreshed_at: now,
    };
  });

  /*
    A listing that turns up under two of the seller's keywords is one design,
    not two, so it keeps the keyword it was first filed under and the second
    export only refreshes its numbers. Without ignoreDuplicates:false the
    upsert would leave stale sales figures on everything already known.
  */
  const { error } = await db
    .from("wb_winners")
    .upsert(payload, { onConflict: "world_id,listing_id", ignoreDuplicates: false });

  if (error)
    return NextResponse.json(
      { error: "That did not save. Try the upload again." },
      { status: 500 },
    );

  return NextResponse.json({
    added: fresh.length,
    already: clean.length - fresh.length,
    noPicture: fresh.filter((r) => !pictures.get(r.listingId as string)?.image)
      .length,
  });
}
