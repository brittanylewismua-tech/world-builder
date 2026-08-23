import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * HANDING OUT THE WORK, NOT DOING IT
 *
 * This job used to research every seller itself, inside one function that the
 * platform kills after five minutes. Research takes about a minute each, so
 * the arithmetic set a customer limit of roughly sixty — the product could not
 * grow past it no matter what was sold. That is a ceiling designed in by
 * accident, and the wrong thing to carry into a launch.
 *
 * Now this route does almost nothing. It works out who still needs a paper and
 * fires off one request per seller to /api/cron/world, without waiting for the
 * answers. Each of those is its own function with its own five minutes, and
 * the platform runs many at once. Dispatching costs milliseconds per seller,
 * so ten sellers and ten thousand take the dispatcher about the same time.
 *
 * WHAT THE REAL LIMIT IS NOW. Not this function. It is the AI provider's rate
 * limit — how many research calls per minute the account is allowed. That is a
 * number that goes up as spend does, and until then the workers back off and
 * retry rather than failing. Requests leave in paced waves rather than all at
 * once, so a thousand sellers do not become a thousand simultaneous calls and
 * a wall of 429s.
 *
 * Nothing is ever researched twice: each worker claims its seller in the
 * database before starting, and a duplicate dispatch is simply turned away.
 * That makes running this more often harmless.
 */

const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  "https://ywncfltxrnrchicjwcse.supabase.co";

/**
 * How many workers to launch per second.
 *
 * Not a limit on how many run at once — it is a limit on how fast they start,
 * which is what turns a stampede into a queue. Workers that hit a rate limit
 * wait and retry, so this only needs to be gentle enough that the provider
 * sees a stream rather than a spike.
 */
const PER_WAVE = 12;
const WAVE_GAP_MS = 1000;

/** Stop dispatching in time to answer honestly about what was handed out. */
const BUDGET_MS = 240_000;

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function GET(req: Request) {
  const started = Date.now();

  const auth = req.headers.get("authorization") ?? "";
  const secret = process.env.CRON_SECRET;
  const fromVercel = req.headers.get("x-vercel-cron") !== null;
  if (!fromVercel && (!secret || auth !== `Bearer ${secret}`))
    return NextResponse.json({ error: "Not for you." }, { status: 401 });

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey)
    return NextResponse.json(
      {
        ok: false,
        skipped: "SUPABASE_SERVICE_ROLE_KEY is not set on this deployment.",
        note: "Add it in Vercel → Settings → Environment Variables and this starts writing the paper overnight. Until then World Daily researches on demand.",
      },
      { status: 200 },
    );

  const db = createClient(SUPABASE_URL, serviceKey, {
    auth: { persistSession: false },
  });

  const issueDate = new Date().toISOString().slice(0, 10);
  const origin = new URL(req.url).origin;

  /*
    Three queries regardless of how many sellers there are. Anything that runs
    once per seller here — a lookup, a check — is a thousand round trips at a
    thousand sellers, so the dispatcher does none of it. The workers look up
    their own details.
  */
  const [{ data: worlds, error }, { data: done }, { data: withAreas }] =
    await Promise.all([
      db.from("wb_worlds").select("id").eq("established", true),
      db.from("wb_daily_items").select("world_id").eq("issue_date", issueDate),
      db.from("wb_areas").select("world_id"),
    ]);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const written = new Set((done ?? []).map((r) => r.world_id as string));
  const watching = new Set((withAreas ?? []).map((r) => r.world_id as string));

  const queue = ((worlds ?? []) as { id: string }[])
    .map((w) => w.id)
    .filter((id) => !written.has(id) && watching.has(id));

  let dispatched = 0;
  for (let i = 0; i < queue.length; i += PER_WAVE) {
    if (Date.now() - started > BUDGET_MS) break;
    const wave = queue.slice(i, i + PER_WAVE);

    /*
      Deliberately not awaited. The worker does the minute of research on its
      own time; waiting for it here would rebuild the very bottleneck this
      change exists to remove. The catch is required — an unhandled rejection
      from a fire-and-forget request can take the whole function down.
    */
    for (const worldId of wave) {
      void fetch(`${origin}/api/cron/world`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-cron-secret": secret ?? "",
        },
        body: JSON.stringify({ worldId, issueDate }),
      }).catch(() => {});
      dispatched++;
    }

    if (i + PER_WAVE < queue.length) await wait(WAVE_GAP_MS);
  }

  /* How this morning is actually going, in one place rather than in logs. */
  const { data: runs } = await db
    .from("wb_daily_runs")
    .select("status")
    .eq("issue_date", issueDate);
  const tally = { running: 0, done: 0, failed: 0 };
  for (const r of runs ?? []) {
    const s = r.status as keyof typeof tally;
    if (s in tally) tally[s]++;
  }

  return NextResponse.json({
    ok: true,
    issueDate,
    seconds: Math.round((Date.now() - started) / 1000),
    established: (worlds ?? []).length,
    needed: queue.length,
    dispatched,
    notDispatched: Math.max(0, queue.length - dispatched),
    soFarToday: tally,
    note: "Workers research in the background. Re-running this is safe — anyone already claimed or written is skipped.",
  });
}
