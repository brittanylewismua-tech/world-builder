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
    `${BASE}/shops/${shopId}/listings/active?limit=2&includes=Images`,
    k,
  );
  const one = (listings.json as { results?: Record<string, unknown>[] })
    ?.results?.[0];
  out.activeListings = {
    status: listings.status,
    total: (listings.json as { count?: number })?.count,
    fields: fields(one),
    imageFields: fields(
      (one?.images as Record<string, unknown>[] | undefined)?.[0],
    ),
    body: listings.status === 200 ? undefined : listings.text.slice(0, 300),
  };

  const reviews = await ask(`${BASE}/shops/${shopId}/reviews?limit=3`, k);
  const review = (reviews.json as { results?: Record<string, unknown>[] })
    ?.results?.[0];
  out.reviews = {
    status: reviews.status,
    total: (reviews.json as { count?: number })?.count,
    fields: fields(review),
    // One real review, to see whether the text is worth anything.
    sample: review
      ? {
          rating: review.rating,
          review: String(review.review ?? "").slice(0, 200),
          listing_id: review.listing_id,
          created_timestamp: review.created_timestamp,
        }
      : undefined,
    body: reviews.status === 200 ? undefined : reviews.text.slice(0, 300),
  };

  return NextResponse.json(out);
}
