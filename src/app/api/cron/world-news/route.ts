import { NextResponse } from "next/server";
import { serviceDb } from "@/lib/pinterest";
import { weekStart, writeIssue } from "@/lib/writeIssue";

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
  /*
    The schedule always means this week. A hand-run may name another —
    which is how the job gets proved against a real world before a schedule
    is ever pointed at it, and how a missed week gets backfilled.
  */
  const asked = url.searchParams.get("week");
  const week = /^\d{4}-\d{2}-\d{2}$/.test(asked ?? "") ? asked! : weekStart();
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


