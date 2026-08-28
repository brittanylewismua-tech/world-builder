import { NextResponse } from "next/server";
import { admit, ownerOf } from "@/lib/guard";
import { serviceDb } from "@/lib/pinterest";
import {
  allListings,
  etsyKey,
  findShop,
  imagesFor,
  shopNameFrom,
  unescapeHtml,
} from "@/lib/etsy";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * ADD A SHOP.
 *
 * The seller has found a shop that already serves the customer they are
 * building for, and pastes its address. This pulls the whole thing: every
 * active listing with Etsy's own view and favourite counts, and a picture for
 * each.
 *
 * Six requests for a three hundred listing shop — three pages of listings and
 * three batches of images — because the batch endpoint takes a hundred ids at
 * a time. Asking each listing for its own picture would be three hundred.
 *
 * No AI here at all. This is fetching, and it costs nothing.
 */

/** Five. Reading five catalogues properly is an afternoon; twenty is a list
 *  nobody opens. */
const MOST_SHOPS = 5;

export async function POST(req: Request) {
  let body: { worldId?: string; input?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Bad request." }, { status: 400 });
  }

  const { worldId } = body;
  if (!worldId)
    return NextResponse.json({ error: "No world given." }, { status: 400 });

  const door = await ownerOf(req, worldId);
  if ("deny" in door) return door.deny;

  const name = shopNameFrom(body.input ?? "");
  if (!name)
    return NextResponse.json(
      {
        error:
          "That does not look like an Etsy shop. Paste the shop's address, or just its name.",
      },
      { status: 400 },
    );

  const key = etsyKey();
  if (!key)
    return NextResponse.json(
      { error: "This deployment has no Etsy key." },
      { status: 503 },
    );

  const db = serviceDb();

  /*
    Is this a shop already followed, or a new one?

    A refresh must be free — the numbers move and somebody should be able to
    pull the latest whenever they like. Only a genuinely new shop spends from
    the week's five, which is what stops delete-and-re-add being a way round
    the limit.
  */
  const wanted = name.toLowerCase();
  const { data: held } = await db
    .from("wb_shops")
    .select("id, shop_name, refreshed_at")
    .eq("world_id", worldId);
  const mine = (held ?? []).find(
    (s) => (s.shop_name as string).toLowerCase() === wanted,
  );
  const already = !!mine;
  const count = (held ?? []).length;

  /*
    Refreshing costs no money, but it is six calls against an Etsy key shared
    by everyone using this app, and their daily quota is finite. Somebody
    leaning on Refresh does not get better numbers — Etsy's counts barely
    move inside a day — they just spend the quota that keeps the feature
    working for everybody else.
  */
  if (already && mine?.refreshed_at) {
    const pulled = new Date(mine.refreshed_at as string).getTime();
    if (Date.now() - pulled < 20 * 60 * 60 * 1000)
      return NextResponse.json(
        {
          error:
            "This shop was pulled from Etsy today. Their views and favorites barely move inside a day, so it can be refreshed again tomorrow.",
        },
        { status: 429 },
      );
  }

  if (!already) {
    const gate = await admit(req, "shopAdds");
    if ("deny" in gate) return gate.deny;
  }

  if (!already && count >= MOST_SHOPS)
    return NextResponse.json(
      {
        error: `You are following ${MOST_SHOPS} shops, which is the limit. Remove one to make room.`,
      },
      { status: 400 },
    );

  let shop;
  try {
    shop = await findShop(name, key);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Etsy did not answer." },
      { status: 502 },
    );
  }

  if (!shop)
    return NextResponse.json(
      { error: `Etsy has no shop called “${name}”.` },
      { status: 404 },
    );

  const { data: saved, error: shopError } = await db
    .from("wb_shops")
    .upsert(
      {
        world_id: worldId,
        etsy_shop_id: shop.shop_id,
        shop_name: shop.shop_name,
        url: shop.url ?? `https://www.etsy.com/shop/${shop.shop_name}`,
        listing_count: shop.listing_active_count ?? null,
        favorers: shop.num_favorers ?? null,
        review_count: shop.review_count ?? null,
        review_avg: shop.review_average ?? null,
        sold_count: shop.transaction_sold_count ?? null,
        opened_at: shop.create_date
          ? new Date(shop.create_date * 1000).toISOString()
          : null,
        refreshed_at: new Date().toISOString(),
      },
      { onConflict: "world_id,etsy_shop_id" },
    )
    .select("id")
    .single();

  if (shopError || !saved)
    return NextResponse.json(
      { error: "That shop did not save." },
      { status: 500 },
    );

  let listings;
  try {
    listings = await allListings(shop.shop_id, key);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Etsy did not answer." },
      { status: 502 },
    );
  }

  const pictures = await imagesFor(
    listings.map((l) => l.listing_id),
    key,
  );

  const rows = listings.map((l) => {
    const pic = pictures.get(l.listing_id);
    const p = l.price;
    return {
      world_id: worldId,
      shop_id: saved.id,
      listing_id: l.listing_id,
      title: unescapeHtml(l.title ?? ""),
      url: l.url ?? `https://www.etsy.com/listing/${l.listing_id}`,
      image_url: pic?.url ?? null,
      views: l.views ?? 0,
      favorers: l.num_favorers ?? 0,
      price:
        p?.amount != null && p?.divisor ? p.amount / p.divisor : null,
      tags: l.tags ?? [],
      listed_at: l.original_creation_timestamp
        ? new Date(l.original_creation_timestamp * 1000).toISOString()
        : null,
    };
  });

  /*
    A shop that has been added before is being refreshed, so the catalogue is
    replaced rather than merged: a design they have taken down should leave.
  */
  await db.from("wb_shop_designs").delete().eq("shop_id", saved.id);
  if (rows.length)
    await db
      .from("wb_shop_designs")
      .upsert(rows, { onConflict: "shop_id,listing_id" });

  return NextResponse.json({
    shopName: shop.shop_name,
    designs: rows.length,
    withArtwork: rows.filter((r) => r.image_url).length,
  });
}
