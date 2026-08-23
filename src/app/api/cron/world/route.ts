import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * ONE SELLER'S PAPER.
 *
 * The overnight job used to be a single function looping over everybody,
 * which meant the platform's five-minute limit doubled as a limit on how many
 * customers the product could have — about sixty. That is a fine number for a
 * first cohort and a terrible thing to design into a business.
 *
 * So the work is inverted. The dispatcher does almost nothing; this route
 * does one seller and one seller only, and however many of these run at once
 * is a question for the platform rather than for a clock. Ten sellers and ten
 * thousand are the same shape of problem: the ceiling is now the AI provider's
 * rate limit, which is a number that can be raised, rather than a hard stop
 * that cannot.
 *
 * It claims before it works. A duplicate dispatch, an overlapping cron, a
 * retry after a crash — all of them arrive here, and all but one are turned
 * away by the claim, so nobody is ever researched twice or billed twice.
 */

const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  "https://ywncfltxrnrchicjwcse.supabase.co";

/** Attempts, including the first. Rate limits are worth waiting out. */
const TRIES = 3;
const PER_TRY_MS = 150_000;

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function POST(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("x-cron-secret") !== secret)
    return NextResponse.json({ error: "Not for you." }, { status: 401 });

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey)
    return NextResponse.json(
      { ok: false, skipped: "SUPABASE_SERVICE_ROLE_KEY is not set." },
      { status: 200 },
    );

  let body: { worldId?: string; issueDate?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Bad request." }, { status: 400 });
  }

  const worldId = body.worldId;
  const issueDate = body.issueDate ?? new Date().toISOString().slice(0, 10);
  if (!worldId)
    return NextResponse.json({ error: "No world given." }, { status: 400 });

  const db = createClient(SUPABASE_URL, serviceKey, {
    auth: { persistSession: false },
  });

  // Whoever wins the claim owns this seller for today. Everyone else leaves.
  const { data: won, error: claimError } = await db.rpc("wb_claim_daily", {
    w: worldId,
    d: issueDate,
  });
  if (claimError)
    return NextResponse.json({ error: claimError.message }, { status: 500 });
  if (won !== true)
    return NextResponse.json({ ok: true, skipped: "already claimed" });

  const finish = async (status: string, detail?: string) => {
    await db
      .from("wb_daily_runs")
      .update({ status, finished_at: new Date().toISOString(), detail: detail ?? null })
      .eq("world_id", worldId)
      .eq("issue_date", issueDate);
  };

  try {
    // Already written by an earlier run or by the seller themselves.
    const { count: already } = await db
      .from("wb_daily_items")
      .select("id", { count: "exact", head: true })
      .eq("world_id", worldId)
      .eq("issue_date", issueDate);
    if (already && already > 0) {
      await finish("done", "already written");
      return NextResponse.json({ ok: true, skipped: "already written" });
    }

    const [{ data: world }, { data: areaRows }, { data: nicheRows }] =
      await Promise.all([
        db.from("wb_worlds").select("id, name").eq("id", worldId).single(),
        db.from("wb_areas").select("name").eq("world_id", worldId),
        db.from("wb_sub_niches").select("keyword").eq("world_id", worldId),
      ]);

    if (!world) throw new Error("world not found");
    const areas = (areaRows ?? []).map((a) => a.name as string);
    if (!areas.length) {
      await finish("done", "nothing being watched");
      return NextResponse.json({ ok: true, skipped: "no areas" });
    }
    const keywords = (nicheRows ?? []).map((n) => n.keyword as string);

    // Four days back, so the paper does not reprint what it printed yesterday.
    const since = new Date(`${issueDate}T00:00:00Z`);
    since.setDate(since.getDate() - 4);
    const { data: recent } = await db
      .from("wb_daily_items")
      .select("issue_date, headline")
      .eq("world_id", worldId)
      .gte("issue_date", since.toISOString().slice(0, 10))
      .order("issue_date", { ascending: false })
      .limit(14);

    const memory = [
      `THE WORLD: ${world.name}`,
      `Sub-niches the seller validated in eRank: ${keywords.join(" · ") || "none recorded"}.`,
      `Parts of this world being watched: ${areas.join(" · ")}.`,
      ...((recent ?? []).length
        ? [
            "",
            "ALREADY REPORTED IN THE LAST 4 DAYS — do not report any of these again, and do not report a near-duplicate. Find something new, or return fewer items.",
            ...(recent ?? []).map(
              (r) => `- [${r.issue_date}] ${r.headline}`,
            ),
          ]
        : []),
    ].join("\n");

    const origin = new URL(req.url).origin;

    let payload: unknown;
    for (let attempt = 1; ; attempt++) {
      const control = new AbortController();
      const bell = setTimeout(() => control.abort(), PER_TRY_MS);
      try {
        const res = await fetch(`${origin}/api/world-daily`, {
          method: "POST",
          signal: control.signal,
          headers: {
            "content-type": "application/json",
            "x-cron-secret": secret,
          },
          body: JSON.stringify({
            worldName: world.name,
            areas,
            subNiches: keywords,
            memory,
          }),
        });
        if (!res.ok) {
          const detail = await res.text().catch(() => "");
          const err = new Error(
            `research ${res.status}: ${detail.slice(0, 200)}`,
          );
          (err as { retryable?: boolean }).retryable =
            res.status === 429 || res.status >= 500;
          throw err;
        }
        payload = await res.json();
        break;
      } catch (e) {
        const retryable =
          (e as { retryable?: boolean }).retryable ??
          (e as Error).name === "AbortError";
        if (!retryable || attempt >= TRIES) throw e;
        // Backing off with jitter so a whole wave does not retry in lockstep.
        await wait(attempt * 5000 + Math.random() * 4000);
      } finally {
        clearTimeout(bell);
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

    const { error: insertError } = await db.from("wb_daily_items").insert(
      items.map((it, i) => ({
        world_id: worldId,
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

    await finish("done");
    return NextResponse.json({ ok: true, written: items.length });
  } catch (e) {
    const message = e instanceof Error ? e.message : "failed";
    /*
      Left as 'failed' rather than deleted, so the next dispatch can see it and
      pick it up — and so a morning of failures is visible in one query
      instead of buried in function logs.
    */
    await finish("failed", message.slice(0, 300));
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
