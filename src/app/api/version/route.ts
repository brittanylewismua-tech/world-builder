import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * WHICH BUILD IS LIVE. NOTHING ELSE.
 *
 * Every open tab asks this every so often so it can notice when it has become
 * the old version. That is a lot of requests from a lot of people, so it says
 * one thing and says it in a few bytes.
 *
 * /api/health could have answered the same question and already existed — but
 * it also reports which secrets are configured, which surfaces are built and
 * what region it runs in. That is fine for one person checking a deploy from
 * a terminal and wrong for two hundred browsers polling on a timer.
 *
 * no-store matters more than it looks: cached, this would keep insisting the
 * old build is current and the bar would never appear.
 */
export async function GET() {
  return NextResponse.json(
    { commit: process.env.VERCEL_GIT_COMMIT_SHA ?? "dev" },
    { headers: { "cache-control": "no-store, max-age=0" } },
  );
}
