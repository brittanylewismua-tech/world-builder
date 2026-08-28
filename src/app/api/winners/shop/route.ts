import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * WHAT CAN WE ACTUALLY LEARN ABOUT A SHOP?
 *
 * Everything said about a shop-reading feature so far has been guesswork
 * about what Etsy will hand over. This asks it. Four endpoints — find the
 * shop by name, the shop record, its active listings, its reviews — and it
 * reports the status of each and the field names that came back, so the
 * question stops being "what do I think is in there" and becomes a list.
 *
 * Reviews and shop-scoped listings may well be OAuth-gated, which would
 * settle the feature before a line of it gets written. Better to find out in
 * one deploy than to design around an assumption twice in one night.
 *
 * Guarded by CRON_SECRET. Deleted once it has answered.
 */
const BASE = "https://openapi.etsy.com/v3/application";

function key() {
  const k = process.env.ETSY_API_KEY?.trim();
  const s = process.env.ETSY_SHARED_SECRET?.trim();
  if (!k) return null;
  return s ? `${k}:${s}` : k;
}

async function ask(url: string, k: string) {
  try {
    const res = await fetch(url, {
      headers: { "x-api-key": k, accept: "application/json" },
      signal: AbortSignal.timeout(20_000),
    });
    const text = await res.text();
    let json: unknown = null;
    try {
      json = JSON.parse(text);
    } catch {
      /* not JSON; the body says why */
    }
    return { status: res.status, json, text };
  } catch (e) {
    return {
      status: 0,
      json: null,
      text: e instanceof Error ? e.message : "failed",
    };
  }
}

/** The field names, so the answer is a list of what exists rather than a
 *  wall of somebody's listing text. */
function fields(o: unknown): string[] {
  return o && typeof o === "object" ? Object.keys(o as object) : [];
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  if (
    !process.env.CRON_SECRET ||
    url.searchParams.get("secret") !== process.env.CRON_SECRET
  )
    return NextResponse.json({ error: "Not found." }, { status: 404 });

  const k = key();
  if (!k) return NextResponse.json({ error: "No ETSY_API_KEY." }, { status: 503 });

  const name = url.searchParams.get("shop") ?? "WanderingSirens";

  const found = await ask(
    `${BASE}/shops?shop_name=${encodeURIComponent(name)}&limit=3`,
    k,
  );

  const results =
    (found.json as { results?: Record<string, unknown>[] })?.results ?? [];
  const shop = results[0];
  const shopId = shop?.shop_id as number | undefined;

  const out: Record<string, unknown> = {
    findShops: {
      status: found.status,
      count: results.length,
      fields: fields(shop),
      // The handful that decide whether a shop is a world or a factory.
      sample: shop
        ? {
            shop_id: shop.shop_id,
            shop_name: shop.shop_name,
            listing_active_count: shop.listing_active_count,
            num_favorers: shop.num_favorers,
            review_count: shop.review_count,
            review_average: shop.review_average,
            digital_listing_count: shop.digital_listing_count,
            create_date: shop.create_date ?? shop.created_timestamp,
          }
        : undefined,
      body: found.status === 200 ? undefined : found.text.slice(0, 300),
    },
  };

  if (!shopId) return NextResponse.json(out);

  const listings = await ask(
    `${BASE}/shops/${shopId}/listings/active?limit=6`,
    k,
  );
  const rows =
    (listings.json as { results?: Record<string, unknown>[] })?.results ?? [];
  out.activeListings = {
    status: listings.status,
    total: (listings.json as { count?: number })?.count,
    /* Field names told us `views` exists. This says whether it is populated
       for a shop you do not own, or present and null — the difference
       between real demand data and nothing. */
    sample: rows.slice(0, 6).map((r) => ({
      title: String(r.title ?? "").slice(0, 70),
      views: r.views,
      num_favorers: r.num_favorers,
      price: (r.price as { amount?: number; divisor?: number })?.amount,
      created: r.original_creation_timestamp,
      tags: (r.tags as string[] | undefined)?.slice(0, 4),
    })),
    body: listings.status === 200 ? undefined : listings.text.slice(0, 300),
  };

  /* Images came back empty on the shop endpoint, so try the dedicated one. */
  const firstId = rows[0]?.listing_id;
  if (firstId) {
    const imgs = await ask(`${BASE}/listings/${firstId}/images`, k);
    out.listingImages = {
      status: imgs.status,
      count: (imgs.json as { count?: number })?.count,
      first: (
        (imgs.json as { results?: Record<string, unknown>[] })?.results ?? []
      )[0]?.url_570xN,
    };
  }

  /*
    THE YIELD QUESTION.

    Most reviews are "great quality, fast shipping". The feature only exists
    if enough of them say something about the buyer, the occasion or why the
    design landed. So: pull a hundred, and count.
  */
  const reviews = await ask(`${BASE}/shops/${shopId}/reviews?limit=100`, k);
  const all =
    (reviews.json as { results?: Record<string, unknown>[] })?.results ?? [];
  const texts = all
    .map((r) => String(r.review ?? "").trim())
    .filter(Boolean);

  const tells =
    /\b(gift|gifted|bought (?:it|this|them)? ?for|for my|my (?:mom|mother|sister|daughter|friend|wife|husband|partner|son|niece|coworker|boss|teacher)|birthday|christmas|graduation|wedding|anniversary|she loved|he loved|they loved|obsessed|perfect for|got so many compliments|everyone asked)\b/i;

  out.reviews = {
    status: reviews.status,
    total: (reviews.json as { count?: number })?.count,
    pulled: texts.length,
    /* Anything under sixty characters is almost always "love it, thanks". */
    withSomethingToSay: texts.filter((t) => t.length >= 60).length,
    aboutAPersonOrOccasion: texts.filter((t) => tells.test(t)).length,
    longest: texts
      .filter((t) => tells.test(t))
      .sort((a, b) => b.length - a.length)
      .slice(0, 8)
      .map((t) => t.slice(0, 220)),
    body: reviews.status === 200 ? undefined : reviews.text.slice(0, 300),
  };

  return NextResponse.json(out);
}
