import { noteFailure } from "@/lib/noteFailure";
import { serviceDb } from "@/lib/pinterest";
import { weekStart } from "@/lib/week";

type Db = ReturnType<typeof serviceDb>;

/**
 * RE-READ EVERY SHOP A WORLD FOLLOWS, ONCE PER WEEK.
 *
 * Etsy pushes nothing, so somebody has to go and ask for the numbers.
 *
 * WHY THIS IS A LIBRARY AND NOT JUST A ROUTE. It used to be called from
 * exactly one place: the "Write this week's issue" button. That button only
 * exists on a world with no issue yet — so the moment a world had its first
 * paper, the button was gone and nothing ever refreshed the shops again. And
 * once the schedule took over issue-writing, almost no issue came from that
 * button at all. The result would have been a shops section frozen at
 * whatever the numbers were on the day each shop was added, quietly, for
 * everybody, forever. Nothing would have looked broken. It would just never
 * have changed.
 *
 * So the sweep belongs to the issue, not to a button. Every paper — written
 * by the schedule at four in the morning or by a seller pressing a key —
 * re-reads the shops first, and "this week" means the same thing in both
 * halves of the page.
 *
 * It cannot fail an issue. No model runs here; these are Etsy requests, and a
 * shop that will not answer is worth strictly less than the paper.
 */
export async function sweepWorldShops(
  db: Db,
  worldId: string,
  secret: string,
  origin: string,
): Promise<{ pulled: number; shops: number; missed: string[] }> {
  const { data: shops } = await db
    .from("wb_shops")
    .select("id, shop_name")
    .eq("world_id", worldId);

  if (!shops?.length) return { pulled: 0, shops: 0, missed: [] };

  /*
    SKIP ON "WE ALREADY HAVE THIS WEEK", NOT ON "WE READ IT RECENTLY".

    The old rule skipped anything pulled in the last twenty hours, which
    sounds equivalent to once a week and is not. Every number the page shows
    is this week minus last week, and a clock in hours cannot express a week:
    a shop read on Sunday night was skipped on Monday and missed the new week
    entirely. Asking whether this week's row exists is the real question, and
    it self-corrects — a shop whose pull failed has no row, so the next run
    picks it up rather than writing it off as fresh.
  */
  const week = weekStart();

  /*
    ASKED OF POSTGRES, BECAUSE THE ANSWER DID NOT FIT DOWN THE WIRE.

    This used to pull wb_design_weekly for the world-week and wb_shop_designs
    for the whole world and intersect them here. Those are two thousand and
    fifteen hundred rows at today's data, against a response cap of one
    thousand — so both arrays arrived silently short, the intersection was
    missing shops, and the skip concluded "no snapshot yet" every single time.

    Which means the optimisation this function is built around has never
    worked for any seller with a full shop list: every issue re-pulled all
    three shops out of a rate-limited Etsy, slowly, for numbers it already had.
    Nothing looked broken. It was just always slow.

    The database answers it in three rows, exactly, at any size.
  */
  const { data: snapshotted, error: snapErr } = await db.rpc(
    "wb_shops_snapshotted",
    { w: worldId, wk: week },
  );

  /*
    If that question cannot be answered, re-read everything. Pulling a shop
    twice costs time; skipping one that was never read costs the seller a week
    of numbers, and that is the more expensive mistake.
  */
  if (snapErr)
    await noteFailure("shops", `snapshot check failed: ${snapErr.message}`, {
      worldId,
      week,
      job: "sweep",
    });

  const have = new Set(
    ((snapshotted ?? []) as { shop_id: string }[]).map((r) => String(r.shop_id)),
  );

  let pulled = 0;
  const missed: string[] = [];

  for (const shop of shops) {
    if (have.has(String(shop.id))) continue;

    try {
      const res = await fetch(`${origin}/api/shops`, {
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
      missed.push(String(shop.shop_name));
      const why = await res.text().catch(() => "");
      await noteFailure(
        "shops",
        `Etsy refused ${shop.shop_name}: ${res.status}`,
        {
          worldId,
          shop: shop.shop_name,
          status: res.status,
          body: why.slice(0, 200),
          job: "sweep",
        },
      );
    } catch (e) {
      missed.push(String(shop.shop_name));
      await noteFailure("shops", e, {
        worldId,
        shop: shop.shop_name,
        job: "sweep",
      });
    }
  }

  return { pulled, shops: shops.length, missed };
}
