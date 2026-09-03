import { NextResponse } from "next/server";
import { serviceDb } from "@/lib/pinterest";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * THE SHOPS KEEP THEMSELVES UP TO DATE.
 *
 * Etsy pushes nothing. There is no webhook and no subscription, so the only
 * way to know what a competitor's designs are doing is to go and ask — and
 * that pull has to happen somewhere.
 *
 * It was happening on a Refresh button, which put it on the seller: five
 * shops each, pressed by hand, remembered every week, or the whole idea of
 * "what moved since last time" quietly stopped working. That is the same
 * mistake World News made — a slow networked job with a person standing in
 * front of it.
 *
 * So it runs here instead. Every followed shop is pulled about once a week,
 * on its own schedule, whether or not anybody logs in. The seller never
 * presses anything, and by the time they open World News the comparison is
 * already there.
 *
 * WHAT IT COSTS: nothing. No model runs. It is Etsy requests against a quota,
 * which is why it goes a few at a time rather than all at once.
 */

/** A shop is due when its numbers are this old. */
const STALE_DAYS = 6;

/** The most shops one run will attempt, before the clock stops it anyway. */
const PER_RUN = 25;

/*
  The same lesson as the World News job: a run that starts work it cannot
  finish pays for it and delivers nothing. A shop is a handful of Etsy calls
  and the paginating ones are the slow part, so eight seconds is a generous
  allowance for the worst of them.
*/
const CEILING_MS = maxDuration * 1000;
const SLOWEST_MS = 20_000;

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const url = new URL(req.url);
  const authorised =
    !!secret &&
    (req.headers.get("authorization") === `Bearer ${secret}` ||
      req.headers.get("x-cron-secret") === secret ||
      url.searchParams.get("secret") === secret);
  if (!authorised)
    return NextResponse.json({ error: "Not for you." }, { status: 401 });

  const db = serviceDb();
  const limit = Number(url.searchParams.get("limit") ?? PER_RUN) || PER_RUN;

  const cutoff = new Date(
    Date.now() - STALE_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString();

  /*
    Oldest numbers first, so no shop can be starved by a busier one, and a
    backlog drains in order rather than the same few being picked each run.
  */
  const { data: due, error } = await db
    .from("wb_shops")
    .select("id, world_id, shop_name, refreshed_at")
    .or(`refreshed_at.is.null,refreshed_at.lt.${cutoff}`)
    .order("refreshed_at", { ascending: true, nullsFirst: true })
    .limit(limit);

  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 });

  const base = new URL(req.url).origin;
  const startedAt = Date.now();
  const report: { shop: string; designs?: number; error?: string }[] = [];
  let leftForNextRun = 0;

  for (const shop of due ?? []) {
    if (Date.now() - startedAt > CEILING_MS - SLOWEST_MS) {
      leftForNextRun++;
      continue;
    }
    try {
      /*
        Through the ordinary route, so the sweep and the seller pulling a
        shop by hand are the same code — including writing the week's
        snapshot, which is the whole reason this job exists.
      */
      const res = await fetch(`${base}/api/shops`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-cron-secret": secret!,
        },
        body: JSON.stringify({
          worldId: shop.world_id,
          input: shop.shop_name,
        }),
      });
      const body = (await res.json()) as { designs?: number; error?: string };
      report.push(
        res.ok
          ? { shop: shop.shop_name as string, designs: body.designs }
          : { shop: shop.shop_name as string, error: body.error },
      );
    } catch (e) {
      /*
        A shop that will not pull is left with its old numbers and picked up
        again next run. Nothing is lost and nobody is told.
      */
      report.push({
        shop: shop.shop_name as string,
        error: e instanceof Error ? e.message : "unknown",
      });
    }
  }

  return NextResponse.json({
    due: (due ?? []).length,
    ran: report.length - leftForNextRun,
    leftForNextRun,
    report,
  });
}
