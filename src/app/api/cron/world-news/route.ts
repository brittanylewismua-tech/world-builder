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
 * The most worlds one run will attempt. A ceiling, not a target — the clock
 * below usually stops it first.
 */
const PER_RUN = 4;

/**
 * STOP STARTING WORK THERE IS NOT TIME TO FINISH.
 *
 * The count alone was wrong. Measured against real issues the average run is
 * eighty-one seconds and the worst is a hundred and twenty-five, so four in a
 * row is three hundred and twenty-four seconds against a three hundred second
 * ceiling: the last world was being started with no chance of finishing, and
 * Vercel killed it mid-sentence. A killed run spends the research money and
 * writes nothing, and because the kill happens outside the catch it is not
 * even recorded as an attempt.
 *
 * So the loop watches the clock instead of counting. It only begins another
 * world while there is room for the slowest one ever measured, plus margin.
 * Two or three a run, seventy-two a day, all of them finished — against a
 * paper each world needs once a week.
 */
const CEILING_MS = maxDuration * 1000;
const SLOWEST_SEEN_MS = 130_000;

/**
 * A world that fails this many times running stops being retried, so a
 * permanently unwritable world is not hammered hourly for six days.
 *
 * BUT GIVING UP MUST NOT BE PERMANENT. The usual reason a world cannot be
 * written is that it has nothing to watch yet — and that is exactly the kind
 * of thing a seller fixes ten minutes later. A world that failed six times
 * with no areas, then had areas added, would otherwise sit empty until the
 * following Monday having already been fixed.
 *
 * So the counter is only respected while the world has not changed since the
 * last attempt. Touch the world and it gets its retries back.
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

  /*
    THE FIRST ISSUE ONLY. NEVER THE WEEKLY ONE.

    This used to write a paper every week for every world, which meant buying
    a newspaper for two hundred sellers whether or not they ever opened it —
    most of a challenge's worth of research, most of it unread, at nineteen
    cents a copy.

    The first issue is different. It is the one that has to already be there
    when somebody logs in for the first time, because a product whose promise
    is "the research is done" cannot open on "come back later". After that,
    the seller asks for the week's issue with a button, and a world nobody
    comes back to costs nothing.

    So: any world that has ever had an issue is no longer this job's business.
  */
  const { data: written } = await db.from("wb_daily_items").select("world_id");
  const done = new Set((written ?? []).map((r) => r.world_id as string));

  const { data: attempts } = await db
    .from("wb_daily_attempts")
    .select("world_id, tries, last_tried")
    .eq("issue_date", week);
  const tried = new Map(
    (attempts ?? []).map((r) => [
      r.world_id as string,
      { n: Number(r.tries), at: r.last_tried as string },
    ]),
  );

  /*
    A world edited since it last failed gets a clean slate. Adding the areas
    that were missing is the fix, and the software should notice rather than
    make somebody wait out a week for a problem they already solved.
  */
  const { data: touched } = await db
    .from("wb_areas")
    .select("world_id, created_at");
  const newestArea = new Map<string, string>();
  for (const a of touched ?? []) {
    const id = a.world_id as string;
    const at = a.created_at as string;
    if (!newestArea.has(id) || at > (newestArea.get(id) as string))
      newestArea.set(id, at);
  }

  const givenUp = (id: string) => {
    const t = tried.get(id);
    if (!t || t.n < GIVE_UP_AFTER) return false;
    const changed = newestArea.get(id);
    /* Changed since the last failure? Then those failures are stale. */
    return !(changed && changed > t.at);
  };

  /*
    A paused world is not being worked on; it does not need a paper.

    Nor does a half-built one. Setup can be abandoned partway — somebody signs
    up, names a world, and closes the tab — and an unestablished world has no
    areas, so writing it always fails. Left in, those failures would eat the
    run's budget six times each before giving up, and on a launch morning
    where a couple of hundred people start setup and some do not finish, the
    abandoned worlds would crowd out the finished ones. Throughput here is two
    or three an hour; it belongs to people who actually built something.
  */
  let q = db
    .from("wb_worlds")
    .select("id, name, user_id")
    .neq("paused", true)
    .eq("established", true);
  if (only) q = db.from("wb_worlds").select("id, name, user_id").eq("id", only);
  const { data: worlds, error } = await q;
  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 });

  const waiting = (worlds ?? []).filter(
    (w) => !done.has(w.id as string) && (only !== null || !givenUp(w.id as string)),
  );

  const report: { world: string; wrote?: number; skipped?: string; error?: string }[] = [];

  const startedAt = Date.now();
  let outOfTime = 0;

  for (const w of waiting.slice(0, limit)) {
    const worldId = w.id as string;
    /*
      Leaving a world for the next run costs an hour. Starting one that gets
      killed costs the research and delivers nothing, so waiting wins.
    */
    if (Date.now() - startedAt > CEILING_MS - SLOWEST_SEEN_MS) {
      outOfTime++;
      continue;
    }
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
          tries: (tried.get(worldId)?.n ?? 0) + 1,
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
    stillWaiting: Math.max(0, waiting.length - limit) + outOfTime,
    leftForNextRun: outOfTime,
    ran: report,
  });
}


