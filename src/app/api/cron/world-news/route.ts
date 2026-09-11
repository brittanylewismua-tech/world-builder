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
    ?judge=<model> runs the issue on a different model without changing
    WB_MODEL, which every other AI surface reads. For comparing one paper
    against another; it reaches here only behind the cron secret checked above.
  */
  const judge = url.searchParams.get("judge") ?? undefined;

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
  /*
    ONE QUESTION, ASKED OF POSTGRES.

    This used to download three whole tables — every world, every area, every
    attempt — and do the filtering in JavaScript. Each of those is an uncapped
    read against a thousand-row response ceiling, and each grows with the
    number of students.

    wb_areas was the one that would have bitten hardest: about seven rows a
    world, so it crosses the cap around a hundred and forty worlds. Past that,
    the "was this world edited since it last failed?" map silently loses
    entries, and a world it has not heard of reads as given-up — so worlds
    would stop being retried permanently, at exactly the scale where nobody
    could notice one seller's paper had quietly stopped arriving.

    The filtering lives in SQL now and the route receives a short list of ids.

    Paused and half-built worlds are excluded in there too. Setup can be
    abandoned partway — somebody signs up, names a world, closes the tab — and
    an unestablished world has no areas, so writing it always fails. Left in,
    those failures eat the run's budget six times each, and on a launch
    morning the abandoned worlds crowd out the finished ones.
  */
  let waiting: { id: string }[];

  if (only) {
    waiting = [{ id: only }];
  } else {
    const { data: need, error: needErr } = await db.rpc(
      "wb_worlds_needing_issue",
      { wk: week, give_up: GIVE_UP_AFTER },
    );
    if (needErr)
      return NextResponse.json(
        { error: `could not pick worlds: ${needErr.message}` },
        { status: 500 },
      );
    waiting = ((need ?? []) as { world_id: string }[]).map((r) => ({
      id: r.world_id,
    }));
  }

  const { data: attempts } = await db
    .from("wb_daily_attempts")
    .select("world_id, tries")
    .eq("issue_date", week)
    .limit(1000);
  const tried = new Map(
    (attempts ?? []).map((r) => [r.world_id as string, Number(r.tries)]),
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
      const wrote = await writeIssue(db, worldId, week, secret!, req.url, judge);
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
    needingIssue: waiting.length,
    stillWaiting: Math.max(0, waiting.length - limit) + outOfTime,
    leftForNextRun: outOfTime,
    ran: report,
  });
}


