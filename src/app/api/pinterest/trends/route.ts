import { NextResponse } from "next/server";
import { tokenFor } from "@/lib/pinterest";

export const runtime = "nodejs";

/**
 * A PROBE, NOT A FEATURE — YET.
 *
 * Pinterest's Trends API returns a keyword with its week/month/year growth and
 * a year of weekly search volume, normalised 0–100. That is seasonality as
 * measured data rather than as a guess, which is the thing this product has no
 * source for anywhere.
 *
 * Whether it is usable here turns on one question the documentation does not
 * answer: can it be asked about a keyword the seller actually cares about, or
 * only about whatever is trending nationally? "abolish ice" will never appear
 * in a US top fifty, so if the answer is the latter, the idea is dead for
 * niche sellers and should be dropped rather than half-built.
 *
 * So this hits the endpoint several ways and reports exactly what came back,
 * status codes included. It runs server-side because the seller's access token
 * belongs in the database, not in a terminal.
 *
 * Guarded by CRON_SECRET, same as the other operator routes. Delete this once
 * the question is answered.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const secret = process.env.CRON_SECRET;
  if (!secret || url.searchParams.get("secret") !== secret)
    return NextResponse.json({ error: "Not found." }, { status: 404 });

  const worldId = url.searchParams.get("world");
  if (!worldId)
    return NextResponse.json({ error: "Pass ?world=<uuid>" }, { status: 400 });

  let token: string;
  try {
    token = await tokenFor(worldId);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "No token." },
      { status: 400 },
    );
  }

  // Each attempt is a different question. Reported separately so a 403 on one
  // shape is not mistaken for the whole API being unavailable.
  const attempts: Record<string, string> = {
    top_growing: "/trends/keywords/US/top/growing?limit=3",
    top_monthly: "/trends/keywords/US/top/monthly?limit=3",
    // The one that decides it: can a specific term be looked up?
    search_keyword: "/trends/keywords/US/top/growing?limit=5&search_query=ice",
    related: "/trends/keywords/US/related/ice",
    interest_filtered:
      "/trends/keywords/US/top/growing?limit=5&interests=politics",
  };

  const out: Record<string, unknown> = {};
  for (const [name, path] of Object.entries(attempts)) {
    try {
      const res = await fetch(`https://api.pinterest.com/v5${path}`, {
        headers: { authorization: `Bearer ${token}` },
      });
      const text = await res.text();
      out[name] = {
        path,
        status: res.status,
        body: text.slice(0, 1200),
      };
    } catch (e) {
      out[name] = { path, error: e instanceof Error ? e.message : "failed" };
    }
  }

  return NextResponse.json(out);
}
