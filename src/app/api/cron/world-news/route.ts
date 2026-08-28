import { NextResponse } from "next/server";
import { serviceDb } from "@/lib/pinterest";
import { dailyContext, SIGNAL_DAYS, SIGNAL_MAX } from "@/lib/worldContext";
import type { World } from "@/lib/world";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * THE PAPER IS WRITTEN BEFORE ANYBODY ASKS FOR IT.
 *
 * Every issue a seller has ever read was researched live while they sat
 * watching a spinner: they pressed a button, and a sixty second web sweep
 * plus a judge ran in front of them. That is the only reason a timeout was
 * ever something a seller could see. Put a person in front of a slow
 * networked job and make them the trigger, and sooner or later they watch it
 * fail.
 *
 * So nobody triggers anything. This runs on a schedule, finds the worlds
 * with no issue for the current week, and writes them. A world whose run
 * fails is simply still missing an issue, so the next run picks it up again
 * — hourly, with the whole week ahead of it. Monday's reader sees a finished
 * paper or, in the worst case, a page that says this week's is still being
 * written. Never an error, and never a wait.
 *
 * WHAT IT COSTS. Runs against the cron identity, which has no seller
 * allowance, so a retry never eats into anyone's week. A failed attempt
 * usually spends nothing at all — it did not get as far as an answer.
 */

/**
 * Worlds written per run. Each issue is thirty to sixty seconds and the
 * function ceiling is five minutes, so four leaves room for a slow one.
 * Hourly runs make that ninety-six a day, which is far more headroom than
 * a weekly paper needs.
 */
const PER_RUN = 4;

/**
 * A world that fails this many times in one week stops being retried until
 * the next one. Almost always it is a world with nothing to watch yet, and
 * hammering it hourly for six days helps nobody.
 */
const GIVE_UP_AFTER = 6;

/** Monday of the current week, in UTC. Matches weekStartISO on the client. */
function weekStart(): string {
  const d = new Date();
  const day = (d.getUTCDay() + 6) % 7; // Monday = 0
  d.setUTCDate(d.getUTCDate() - day);
  return d.toISOString().slice(0, 10);
}

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const url = new URL(req.url);
  /*
    Vercel signs its own cron requests with this header. The query parameter
    is here so the job can be run by hand — which is how it gets tested
    before a schedule is ever pointed at it.
  */
  const authorised =
    !!secret &&
    (req.headers.get("authorization") === `Bearer ${secret}` ||
      req.headers.get("x-cron-secret") === secret ||
      url.searchParams.get("secret") === secret);
  if (!authorised)
    return NextResponse.json({ error: "Not for you." }, { status: 401 });

  const db = serviceDb();
  const week = weekStart();
  const only = url.searchParams.get("world");
  const limit = Number(url.searchParams.get("limit") ?? PER_RUN) || PER_RUN;

  /* Which worlds already have this week's paper? */
  const { data: written } = await db
    .from("wb_daily_items")
    .select("world_id")
    .eq("issue_date", week);
  const done = new Set((written ?? []).map((r) => r.world_id as string));

  const { data: attempts } = await db
    .from("wb_daily_attempts")
    .select("world_id, tries")
    .eq("issue_date", week);
  const tried = new Map(
    (attempts ?? []).map((r) => [r.world_id as string, Number(r.tries)]),
  );

  /* A paused world is not being worked on; it does not need a paper. */
  let q = db.from("wb_worlds").select("id, name, user_id").neq("paused", true);
  if (only) q = db.from("wb_worlds").select("id, name, user_id").eq("id", only);
  const { data: worlds, error } = await q;
  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 });

  const waiting = (worlds ?? []).filter(
    (w) =>
      !done.has(w.id as string) &&
      (only !== null || (tried.get(w.id as string) ?? 0) < GIVE_UP_AFTER),
  );

  const report: { world: string; wrote?: number; skipped?: string; error?: string }[] = [];

  for (const w of waiting.slice(0, limit)) {
    const worldId = w.id as string;
    try {
      const wrote = await writeIssue(db, worldId, week, secret!, req.url);
      report.push({ world: worldId, wrote });
    } catch (e) {
      const why = e instanceof Error ? e.message : "unknown";
      report.push({ world: worldId, error: why });
      await db.from("wb_daily_attempts").upsert(
        {
          world_id: worldId,
          issue_date: week,
          tries: (tried.get(worldId) ?? 0) + 1,
          last_error: why.slice(0, 300),
          last_tried: new Date().toISOString(),
        },
        { onConflict: "world_id,issue_date" },
      );
    }
  }

  return NextResponse.json({
    week,
    worlds: (worlds ?? []).length,
    alreadyWritten: done.size,
    stillWaiting: Math.max(0, waiting.length - limit),
    ran: report,
  });
}

/* ------------------------------------------------------------------ */

type Db = ReturnType<typeof serviceDb>;

/** Assemble one world, research it, and store the issue. */
async function writeIssue(
  db: Db,
  worldId: string,
  week: string,
  secret: string,
  from: string,
): Promise<number> {
  const world = await loadWorld(db, worldId);
  if (!world.areas.length)
    throw new Error("no active areas to watch");

  const since = new Date();
  since.setDate(since.getDate() - SIGNAL_DAYS);
  const { data: signals } = await db
    .from("wb_daily_items")
    .select("issue_date, kind, headline")
    .eq("world_id", worldId)
    .gte("issue_date", since.toISOString().slice(0, 10))
    .order("issue_date", { ascending: false })
    .order("position")
    .limit(SIGNAL_MAX);

  /*
    The research pipeline is the same one the app has always used, called
    over the wire rather than copied. One implementation, so the paper the
    schedule writes is the paper the product was built around.
  */
  const base = new URL(from);
  const res = await fetch(`${base.origin}/api/world-daily`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-cron-secret": secret },
    body: JSON.stringify({
      worldName: world.name,
      areas: world.areas.map((a) => a.name),
      subNiches: world.subNiches.map((s) => s.keyword),
      memory: dailyContext(world, [], (signals ?? []) as never[]),
    }),
  });

  const body = (await res.json()) as {
    items?: { area: string; kind: string; headline: string; body: string; printable: string; sources: unknown }[];
    also?: { label: string; note: string | null; quote: string; url: string }[];
    error?: string;
  };
  if (!res.ok) throw new Error(body.error ?? `research returned ${res.status}`);
  if (!body.items?.length) throw new Error("came back empty");

  /*
    Written only once the research has actually answered, so a failed run
    never clears an issue that was already there.
  */
  await db.from("wb_daily_items").delete().eq("world_id", worldId).eq("issue_date", week);
  await db.from("wb_daily_rest").delete().eq("world_id", worldId).eq("issue_date", week);

  const { error } = await db.from("wb_daily_items").insert(
    body.items.map((it, i) => ({
      world_id: worldId,
      issue_date: week,
      area: it.area,
      kind: it.kind,
      headline: it.headline,
      body: it.body,
      printable: it.printable,
      sources: it.sources,
      position: i,
    })),
  );
  if (error) throw new Error(error.message);

  if (body.also?.length)
    await db.from("wb_daily_rest").insert(
      body.also.map((r, i) => ({
        world_id: worldId,
        issue_date: week,
        label: r.label,
        note: r.note,
        quote: r.quote,
        url: r.url,
        position: i,
      })),
    );

  /* It landed, so the week's failures stop mattering. */
  await db.from("wb_daily_attempts").delete().eq("world_id", worldId).eq("issue_date", week);

  return body.items.length;
}

/** Enough of a world to brief the paper. */
async function loadWorld(db: Db, worldId: string): Promise<World> {
  const [{ data: w }, { data: areas }, { data: niches }, { data: refs }] =
    await Promise.all([
      db.from("wb_worlds").select("*").eq("id", worldId).single(),
      db.from("wb_areas").select("name").eq("world_id", worldId),
      db.from("wb_sub_niches").select("keyword").eq("world_id", worldId),
      db.from("wb_visual_refs").select("id").eq("world_id", worldId),
    ]);

  if (!w) throw new Error("world not found");

  return {
    ...(w as object),
    id: worldId,
    name: (w.name as string) ?? "",
    areas: (areas ?? []).map((a) => ({ name: a.name as string })),
    subNiches: (niches ?? []).map((n) => ({ keyword: n.keyword as string })),
    visualReferences: refs ?? [],
    affinity: (w.affinity as Record<string, number | null>) ?? {},
    slotsPerDrop: (w.slots_per_drop as number) ?? 0,
  } as unknown as World;
}
