import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
/**
 * Kept at the limit that is safe on every Vercel plan and compute mode. The
 * job is built to finish early and be run again rather than to rely on a
 * generous ceiling it might not have.
 */
export const maxDuration = 300;

/**
 * WRITING THE PAPER BEFORE ANYONE ASKS FOR IT
 *
 * World Daily's promise is that you open it in the morning and it is already
 * there. Researching on demand costs a minute of watching a spinner, which is
 * the opposite of that. This runs before anyone is awake.
 *
 * HOW IT SURVIVES GROWTH — the part that matters:
 *
 * Research takes 40–90 seconds per world. A single loop is fine for two
 * worlds and quietly fails for fifty: the function is killed partway and the
 * sellers at the end of the list get nothing, on the morning that matters
 * most. So this job does not try to be a loop that finishes.
 *
 *  1. It only looks at worlds that do not already have today's issue, so a
 *     second run is cheap and never writes or bills twice.
 *  2. It researches several worlds at once rather than one after another.
 *  3. It stops starting new work before the platform can kill it, and returns
 *     an honest count of what is left.
 *  4. It is scheduled several times each morning, so whatever one run cannot
 *     reach, the next one picks up. Nothing is ever dropped — it is deferred
 *     by an hour, and only ever under load.
 *
 * That makes the worst case "some sellers get their paper at 9 instead of 8"
 * rather than "some sellers get nothing".
 *
 * Needs SUPABASE_SERVICE_ROLE_KEY, because it writes for people who are not
 * here — row level security is doing its job by refusing that to the public
 * key. Without it the route says so plainly instead of failing quietly, and
 * the app still researches on demand meanwhile.
 */

const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  "https://ywncfltxrnrchicjwcse.supabase.co";

/**
 * How many worlds are researched at once.
 *
 * Six was measurably too many: a load test of eight worlds finished in 79
 * seconds but three of them came back as failures within moments of starting,
 * which is the signature of hitting the model's rate limit rather than of
 * anything being slow. Three at a time with retries completes fewer worlds per
 * run and far more worlds per morning, which is the number that matters.
 */
const AT_ONCE = 3;

/** Attempts per world, including the first. */
const TRIES = 3;

/** A single world's research should never hold the whole run hostage. */
const PER_WORLD_MS = 150_000;

/** Stop starting new work after this, leaving room to finish and respond. */
const BUDGET_MS = 240_000;

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface WorldRow {
  id: string;
  name: string;
}

export async function GET(req: Request) {
  const started = Date.now();

  // Vercel signs its own cron calls; a shared secret covers manual runs.
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

  /* ---------------------------------------------------------------- */
  /* work out who still needs a paper — in two queries, not two per world */
  /* ---------------------------------------------------------------- */

  const [{ data: worlds, error }, { data: done }, { data: allAreas }] =
    await Promise.all([
      db.from("wb_worlds").select("id, name").eq("established", true),
      db.from("wb_daily_items").select("world_id").eq("issue_date", issueDate),
      db.from("wb_areas").select("world_id, name"),
    ]);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const written = new Set((done ?? []).map((r) => r.world_id as string));
  const areasBy = new Map<string, string[]>();
  for (const a of allAreas ?? []) {
    const id = a.world_id as string;
    areasBy.set(id, [...(areasBy.get(id) ?? []), a.name as string]);
  }

  const queue = ((worlds ?? []) as WorldRow[]).filter(
    (w) => !written.has(w.id) && (areasBy.get(w.id)?.length ?? 0) > 0,
  );

  const report = {
    established: (worlds ?? []).length,
    needed: queue.length,
    written: 0,
    failed: 0,
    deferred: 0,
  };

  /* ---------------------------------------------------------------- */
  /* research several at a time, and stop before we are stopped        */
  /* ---------------------------------------------------------------- */

  const outOfTime = () => Date.now() - started > BUDGET_MS;

  async function research(world: WorldRow, keywords: string[]) {
    const control = new AbortController();
    const bell = setTimeout(() => control.abort(), PER_WORLD_MS);
    try {
      const res = await fetch(`${origin}/api/world-daily`, {
        method: "POST",
        signal: control.signal,
        headers: {
          "content-type": "application/json",
          "x-cron-secret": secret ?? "",
        },
        body: JSON.stringify({
          worldName: world.name,
          areas: areasBy.get(world.id) ?? [],
          subNiches: keywords,
        }),
      });
      if (!res.ok) {
        const detail = await res.text().catch(() => "");
        const err = new Error(`research ${res.status}: ${detail.slice(0, 200)}`);
        // 429 and 5xx are worth another go; a 400 never will be.
        (err as { retryable?: boolean }).retryable =
          res.status === 429 || res.status >= 500;
        throw err;
      }
      return res.json();
    } finally {
      clearTimeout(bell);
    }
  }

  async function writeFor(world: WorldRow) {
    const { data: niches } = await db
      .from("wb_sub_niches")
      .select("keyword")
      .eq("world_id", world.id);
    const keywords = (niches ?? []).map((n) => n.keyword as string);

    let payload: unknown;
    for (let attempt = 1; ; attempt++) {
      try {
        payload = await research(world, keywords);
        break;
      } catch (e) {
        const retryable =
          (e as { retryable?: boolean }).retryable ??
          (e as Error).name === "AbortError";
        if (!retryable || attempt >= TRIES || outOfTime()) throw e;
        // Back off, and stagger so the whole batch does not retry in lockstep.
        await wait(attempt * 4000 + Math.random() * 3000);
      }
    }

    const { items } = payload as {
      items: {
        area: string;
        kind: string;
        headline: string;
        body: string;
        sources: unknown;
      }[];
    };
    if (!items?.length) throw new Error("nothing verifiable came back");

    // Unique index on (world_id, issue_date, position) would be ideal; until
    // then a last-moment re-check keeps a concurrent run from doubling up.
    const { count } = await db
      .from("wb_daily_items")
      .select("id", { count: "exact", head: true })
      .eq("world_id", world.id)
      .eq("issue_date", issueDate);
    if (count && count > 0) return;

    const { error: insertError } = await db.from("wb_daily_items").insert(
      items.map((it, i) => ({
        world_id: world.id,
        issue_date: issueDate,
        area: it.area,
        kind: it.kind,
        headline: it.headline,
        body: it.body,
        sources: it.sources,
        position: i,
      })),
    );
    if (insertError) throw new Error(insertError.message);
  }

  let next = 0;
  async function worker() {
    for (;;) {
      if (outOfTime()) return;
      const world = queue[next++];
      if (!world) return;
      try {
        await writeFor(world);
        report.written++;
      } catch (e) {
        console.error("cron/daily failed for", world.id, e);
        report.failed++;
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(AT_ONCE, queue.length) }, worker),
  );

  report.deferred = Math.max(0, report.needed - report.written - report.failed);

  return NextResponse.json({
    ok: true,
    issueDate,
    seconds: Math.round((Date.now() - started) / 1000),
    ...report,
    note: report.deferred
      ? "Ran out of time before finishing. The next scheduled run picks these up — nothing is lost."
      : undefined,
  });
}
