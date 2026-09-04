import { NextResponse } from "next/server";
import { ownerOf } from "@/lib/guard";
import { serviceDb } from "@/lib/pinterest";
import { weekStart, writeIssue } from "@/lib/writeIssue";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * THE FIRST ISSUE, WRITTEN THE MOMENT THERE IS A WORLD TO WRITE ABOUT.
 *
 * The schedule runs hourly, which is fine for a world that already has a
 * paper and wrong for one that does not: somebody finishing setup could open
 * World News and be told this week's issue is still being written. That is
 * the first thing they ever see of the feature, and "come back later" is a
 * terrible first impression of a product whose whole promise is that the
 * research is already done.
 *
 * So setup starts it directly. There is always an issue.
 *
 * NOBODY WAITS ON THIS. The caller fires it and walks away — it is not
 * awaited, nothing on screen depends on it, and the seller carries on into
 * the app while it runs. By the time they reach World News it is there. If
 * they somehow beat it, the hourly schedule is still behind it as a backstop.
 *
 * IT CANNOT BE USED TO SPEND MONEY REPEATEDLY. It writes only when the week's
 * issue is genuinely missing, so calling it twice does nothing the second
 * time, and it costs no seller allowance — writing the paper is the
 * software's job, not something rationed out of anybody's week.
 */
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

  const secret = process.env.CRON_SECRET;
  if (!secret)
    return NextResponse.json({ error: "Not configured." }, { status: 503 });

  const db = serviceDb();
  const week = weekStart();

  /*
    HAS THIS WORLD EVER HAD AN ISSUE?

    Not "has it had one this week", which is what this asked before. The
    difference is the whole safety of the route.

    Sellers can delete their own daily items — the policy on that table is
    ALL, because the button that writes an issue does its own clearing from
    the browser. So "none this week" was a state anybody could return to at
    will, and this route writes for free: delete the issue, reload the page,
    and a fresh nineteen-cent research run arrives, as often as you like.

    Asking whether the world has ever had one closes that. It also says what
    this route is actually for. It is the FIRST issue — the one that has to
    exist before anybody has pressed anything. Every issue after it comes
    from the button, which is capped at one a week like everything else.
  */
  const { count } = await db
    .from("wb_daily_items")
    .select("id", { count: "exact", head: true })
    .eq("world_id", worldId);
  if ((count ?? 0) > 0)
    return NextResponse.json({ already: true, week });

  /*
    HOW MANY TIMES THIS IS ALLOWED TO FAIL.

    This route deliberately costs no allowance — the first issue is the
    software's job, not something rationed out of a seller's week — and until
    now the only thing that stopped it running was the issue already existing.

    That was survivable while the page called it once as a rare backstop. It
    stopped being survivable when the page began starting the first issue on
    every visit to a world that has none: a world that cannot be written
    bought a fresh nineteen-cent research run on every reload, for ever, and
    the seller pressing F5 would never know they were doing it.

    Attempts were already being recorded here and never read. Now they are.
    Three is enough for a transient failure to clear; past that the hourly
    schedule takes over, which retries on its own clock rather than on how
    often somebody refreshes.
  */
  const FIRST_TRIES = 3;
  const { data: sofar } = await db
    .from("wb_daily_attempts")
    .select("tries")
    .eq("world_id", worldId)
    .eq("issue_date", week)
    .maybeSingle();

  if (Number(sofar?.tries ?? 0) >= FIRST_TRIES)
    return NextResponse.json({ week, wrote: 0, retrying: true });

  try {
    const wrote = await writeIssue(db, worldId, week, secret, req.url);
    return NextResponse.json({ week, wrote });
  } catch (e) {
    /*
      A failure here is not the seller's problem and must not become their
      error message. It is recorded the same way a failed scheduled run is,
      so the hourly job picks the world up and tries again.
    */
    const why = e instanceof Error ? e.message : "unknown";
    await db.from("wb_daily_attempts").upsert(
      {
        world_id: worldId,
        issue_date: week,
        tries: Number(sofar?.tries ?? 0) + 1,
        last_error: why.slice(0, 300),
        last_tried: new Date().toISOString(),
      },
      { onConflict: "world_id,issue_date" },
    );
    return NextResponse.json({ week, wrote: 0, retrying: true });
  }
}
