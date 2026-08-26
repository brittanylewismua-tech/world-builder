import { NextResponse } from "next/server";
import { ownerOf } from "@/lib/guard";
import { serviceDb } from "@/lib/pinterest";
import { readCurves, readRising, trendsConfigured } from "@/lib/dataforseo";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * ONE UPDATE, WHEN THE SELLER ASKS FOR ONE.
 *
 * Not a live feed and not a cron. The seller presses a button, at most once a
 * day, and gets back what has moved — which is both cheaper than a schedule
 * (nothing is paid for on a day nobody looks) and truer, because a daily
 * update nobody opens is not a feature, it is a bill.
 *
 * Each press does two jobs:
 *
 *   MOVEMENT   re-read the interest curve for a rotating slice of the pool,
 *              oldest-checked first, so everything comes round eventually.
 *              Five terms share one request, so this part is cheap.
 *
 *   DISCOVERY  ask what is rising next to a few terms, and add whatever comes
 *              back to the pool. One term per request, so this part costs
 *              five times as much and is rationed to three.
 *
 * A world's pool therefore grows by up to thirty terms a press while costing
 * about five cents.
 */

/** Curves re-read per press. Cheap: five to a request. */
const CHECK = 15;
/** Terms asked "what is rising near you". Expensive: one to a request. */
const EXPAND = 3;
/** A term has to move by this much to be worth putting in front of anybody. */
const MOVED = 8;

export async function POST(req: Request) {
  let body: { worldId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Bad request." }, { status: 400 });
  }
  const worldId = body.worldId;
  if (!worldId)
    return NextResponse.json({ error: "No world given." }, { status: 400 });

  const door = await ownerOf(req, worldId);
  if ("deny" in door) return door.deny;

  if (!trendsConfigured())
    return NextResponse.json(
      {
        error:
          "Trends is not switched on for this deployment yet. Add DATAFORSEO_LOGIN and DATAFORSEO_PASSWORD in Vercel.",
      },
      { status: 503 },
    );

  const db = serviceDb();

  /*
    Once a day, counted here rather than in the shared allowance, because the
    ceiling is about a third party's bill rather than ours and the message
    wants to name the actual wait.
  */
  const { data: last } = await db
    .from("wb_trend_runs")
    .select("ran_at")
    .eq("world_id", worldId)
    .order("ran_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (last) {
    const hours =
      (Date.now() - new Date(last.ran_at as string).getTime()) / 3_600_000;
    if (hours < 20)
      return NextResponse.json(
        { error: "Today's update is already here. There will be a new one tomorrow." },
        { status: 429 },
      );
  }

  try {
    // Seed from the seller's own sub-niches the first time.
    const { data: pool } = await db
      .from("wb_trend_terms")
      .select("id, term, value, last_checked")
      .eq("world_id", worldId)
      .eq("hidden", false)
      .order("last_checked", { ascending: true, nullsFirst: true });

    let terms = pool ?? [];

    if (!terms.length) {
      const { data: niches } = await db
        .from("wb_sub_niches")
        .select("keyword")
        .eq("world_id", worldId);
      const seeds = (niches ?? [])
        .map((n) => (n.keyword as string).trim().toLowerCase())
        .filter(Boolean);
      if (!seeds.length)
        return NextResponse.json(
          { error: "Add a few validated keywords first and this has somewhere to start." },
          { status: 400 },
        );
      await db.from("wb_trend_terms").insert(
        seeds.map((term) => ({ world_id: worldId, term })),
      );
      const { data: seeded } = await db
        .from("wb_trend_terms")
        .select("id, term, value, last_checked")
        .eq("world_id", worldId);
      terms = seeded ?? [];
    }

    /* ---------------------------------------------------- movement */
    const slice = terms.slice(0, CHECK);
    const readings = await readCurves(slice.map((t) => t.term as string));

    for (const r of readings) {
      const row = slice.find((t) => t.term === r.term);
      if (!row) continue;
      await db
        .from("wb_trend_terms")
        .update({
          previous: row.value ?? null,
          value: r.value,
          curve: r.curve,
          last_checked: new Date().toISOString(),
        })
        .eq("id", row.id as string);
    }

    /* --------------------------------------------------- discovery */
    // Expand from whatever is highest right now — the busiest corners of the
    // world are where new language turns up.
    const hottest = [...readings]
      .filter((r) => r.value !== null)
      .sort((a, b) => (b.value ?? 0) - (a.value ?? 0))
      .slice(0, EXPAND);

    const known = new Set(terms.map((t) => (t.term as string).toLowerCase()));
    let discovered = 0;

    for (const seed of hottest) {
      let rising: string[] = [];
      try {
        rising = await readRising(seed.term);
      } catch {
        // One term failing to expand should not cost the whole update.
        continue;
      }
      const fresh = rising.filter((t) => t && !known.has(t));
      if (!fresh.length) continue;
      for (const t of fresh) known.add(t);
      const { error } = await db.from("wb_trend_terms").insert(
        fresh.map((term) => ({
          world_id: worldId,
          term,
          found_near: seed.term,
        })),
      );
      if (!error) discovered += fresh.length;
    }

    await db.from("wb_trend_runs").insert({
      world_id: worldId,
      checked: readings.length,
      discovered,
    });

    return NextResponse.json({
      ok: true,
      checked: readings.length,
      discovered,
      moved: readings.filter((r) => {
        const row = slice.find((t) => t.term === r.term);
        const before = (row?.value as number | null) ?? null;
        return (
          before !== null && r.value !== null && Math.abs(r.value - before) >= MOVED
        );
      }).length,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "That update did not finish." },
      { status: 502 },
    );
  }
}
