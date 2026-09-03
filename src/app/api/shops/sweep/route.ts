import { NextResponse } from "next/server";
import { ownerOf } from "@/lib/guard";
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
    .select("shop_name, refreshed_at")
    .eq("world_id", worldId);

  if (!shops?.length) return NextResponse.json({ pulled: 0, shops: 0 });

  const base = new URL(req.url).origin;
  const fresh = Date.now() - 20 * 60 * 60 * 1000;
  let pulled = 0;

  for (const shop of shops) {
    /*
      Already pulled today. Etsy's counts barely move inside a day, so this is
      skipped rather than refused — the seller pressed one button and does not
      need to hear about a shop they happened to refresh this morning.
    */
    const at = shop.refreshed_at
      ? new Date(shop.refreshed_at as string).getTime()
      : 0;
    if (at > fresh) continue;

    try {
      const res = await fetch(`${base}/api/shops`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-cron-secret": secret,
        },
        body: JSON.stringify({ worldId, input: shop.shop_name }),
      });
      if (res.ok) pulled++;
    } catch {
      /*
        One shop that will not answer must not cost the seller their issue.
        It keeps last week's numbers and is pulled again next time.
      */
    }
  }

  return NextResponse.json({ pulled, shops: shops.length });
}
