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
 * THE FIRST ATTEMPT AT THIS WAS TO OPEN THE LISTING PAGE AND READ THE PHOTO
 * OFF IT. Etsy will not have it. A probe from this deployment came back 403
 * with a DataDome challenge page: a data-centre address gets a captcha no
 * matter what user agent it claims, and pretending harder is both futile and
 * not something to do to somebody who has not agreed to it.
 *
 * So the pictures come through Etsy's own front door instead. The Open API v3
 * batch endpoint returns public listing data — including every image, at
 * every size — for up to a hundred listing ids in a single request, and for
 * public data it needs nothing but the application key. One call per upload,
 * no scraping, and Etsy can see exactly who is asking.
 *
 * Listings already on the wall are not asked for again; their numbers are
 * refreshed and that is all.
 */

/** Etsy's cap on one batch request. */
const MOST_PER_UPLOAD = 100;

const ETSY_BATCH = "https://openapi.etsy.com/v3/application/listings/batch";

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

interface EtsyImage {
  url_570xN?: string;
  url_fullxfull?: string;
  alt_text?: string | null;
}

interface EtsyListing {
  listing_id?: number;
  images?: EtsyImage[];
}

/**
 * Ask Etsy for the pictures.
 *
 * One request, up to a hundred listings. The first image is the one Etsy
 * shows as the thumbnail, which is the one with the design on it — the rest
 * of a print-on-demand listing's photos are size charts and colour swatches.
 *
 * alt_text is Etsy's own written account of the artwork where a seller has
 * filled it in ("a peach t-shirt with portraits of Frida Kahlo, Audre Lorde,
 * Maya Angelou..."). Often blank, which is fine: the read looks at the
 * picture, and this only ever helps it along.
 */
async function askEtsy(ids: string[], key: string) {
  const found = new Map<string, { image: string | null; design: string | null }>();
  if (!ids.length) return found;

  const url = `${ETSY_BATCH}?listing_ids=${ids.join(",")}&includes=Images`;
  const res = await fetch(url, {
    headers: { "x-api-key": key, accept: "application/json" },
    signal: AbortSignal.timeout(25_000),
  });

  if (!res.ok) {
    // 401/403 is a key problem and the caller has to be told plainly; a 404
    // on a batch is not possible, so anything else is Etsy being unwell.
    throw new Error(
      res.status === 401 || res.status === 403
        ? "Etsy would not accept the API key."
        : `Etsy returned ${res.status}.`,
    );
  }

  const body = (await res.json()) as { results?: EtsyListing[] };
  for (const l of body.results ?? []) {
    const first = l.images?.[0];
    if (!l.listing_id) continue;
    found.set(String(l.listing_id), {
      image: first?.url_570xN ?? first?.url_fullxfull ?? null,
      design: first?.alt_text?.trim() || null,
    });
  }
  return found;
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

  const key = process.env.ETSY_API_KEY;
  let pictures = new Map<string, { image: string | null; design: string | null }>();

  if (key && fresh.length) {
    try {
      pictures = await askEtsy(
        fresh.map((r) => r.listingId as string),
        key,
      );
    } catch (e) {
      // Without pictures this is a spreadsheet, so say so rather than
      // quietly filling the wall with grey boxes.
      return NextResponse.json(
        {
          error:
            e instanceof Error
              ? `${e.message} Nothing was added.`
              : "Etsy did not answer. Nothing was added.",
        },
        { status: 502 },
      );
    }
  }

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
    /* So the screen can explain a wall of grey boxes instead of looking
       broken while the Etsy key is still being applied for. */
    keyed: !!key,
  });
}
