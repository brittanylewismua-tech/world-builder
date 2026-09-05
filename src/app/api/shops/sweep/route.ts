import { NextResponse } from "next/server";
import { ownerOf } from "@/lib/guard";
import { noteFailure } from "@/lib/noteFailure";
import { serviceDb } from "@/lib/pinterest";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * PULL EVERY SHOP THIS WORLD FOLLOWS, ONCE.
 *
 * Etsy pushes nothing, so somebody has to go and ask for the numbers. This is
 * that ask — for all of a world's shops at once, on the same press that writes
 * the week's issue.
 *
 * WHY IT HANGS OFF THAT BUTTON RATHER THAN ITS OWN SCHEDULE. It was briefly a
 * separate job on its own clock, which meant the product had two different
 * rhythms doing two halves of one thing, and the seller had to understand
 * both. One button, once a week: the shops are re-read and the paper is
 * written, and "this week" means the same thing in both halves of the page.
 *
 * No AI. This is Etsy requests, and they cost nothing but quota.
 */
export async function POST(req: Request) {
  let body: { worldId?: string };
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

  const secret = process.env.CRON_SECRET;
  if (!secret)
    return NextResponse.json({ error: "Not configured." }, { status: 503 });

  const db = serviceDb();
  const { data: shops } = await db
    .from("wb_shops")
    .select("id, shop_name, refreshed_at")
    .eq("world_id", worldId);

  if (!shops?.length) return NextResponse.json({ pulled: 0, shops: 0 });

  const base = new URL(req.url).origin;

  /*
    SKIP ON "WE ALREADY HAVE THIS WEEK", NOT ON "WE READ IT RECENTLY".

    This used to skip any shop pulled in the last twenty hours, which sounds
    equivalent and is not. The thing the page needs is one reading per shop
    per week, because every number it shows is this week minus last week. A
    clock measured in hours cannot express that, and it got it wrong in both
    directions: a shop read on Sunday night was skipped on Monday morning and
    missed the new week entirely, while a shop read twice inside a week was
    pulled again for nothing.

    So the question is the real one. Do we have this week's numbers for this
    shop? If yes, leave it. If no, go and get them — even if it was read an
    hour ago, because an hour ago may have been last week.

    It also self-corrects. A shop whose pull failed has no row for the week,
    so the next press picks it up instead of writing it off as fresh.
  */
  const monday = new Date();
  monday.setUTCDate(monday.getUTCDate() - ((monday.getUTCDay() + 6) % 7));
  const week = monday.toISOString().slice(0, 10);

  /*
    Two plain reads and an intersection, rather than one join: the weekly
    snapshot is keyed by listing, not by shop, and the two tables have no
    foreign key between them to join across.
  */
  const [{ data: snapped }, { data: owned }] = await Promise.all([
    db
      .from("wb_design_weekly")
      .select("listing_id")
      .eq("world_id", worldId)
      .eq("week", week),
    db
      .from("wb_shop_designs")
      .select("listing_id, shop_id")
      .eq("world_id", worldId),
  ]);

  const thisWeek = new Set(
    (snapped ?? []).map((r) => String(r.listing_id)),
  );
  const have = new Set<string>();
  for (const d of owned ?? [])
    if (thisWeek.has(String(d.listing_id))) have.add(String(d.shop_id));

  let pulled = 0;
  const missed: string[] = [];

  for (const shop of shops) {
    if (have.has(shop.id as string)) continue;

    try {
      const res = await fetch(`${base}/api/shops`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-cron-secret": secret,
        },
        body: JSON.stringify({ worldId, input: shop.shop_name }),
      });
      if (res.ok) {
        pulled++;
        continue;
      }
      /*
        One shop that will not answer must not cost the seller their issue —
        but it must not vanish either. It keeps last week's numbers, it is
        named in the reply, and it lands in the error log where somebody can
        see that this week's comparison is short a shop.
      */
      missed.push(shop.shop_name as string);
      const why = await res.text().catch(() => "");
      await noteFailure("shops", `Etsy refused ${shop.shop_name}: ${res.status}`, {
        worldId,
        shop: shop.shop_name,
        status: res.status,
        body: why.slice(0, 200),
        job: "sweep",
      });
    } catch (e) {
      missed.push(shop.shop_name as string);
      await noteFailure("shops", e, {
        worldId,
        shop: shop.shop_name,
        job: "sweep",
      });
    }
  }

  return NextResponse.json({
    pulled,
    shops: shops.length,
    alreadyThisWeek: have.size,
    missed,
  });
}
