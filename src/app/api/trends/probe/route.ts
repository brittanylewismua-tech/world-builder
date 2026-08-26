import { NextResponse } from "next/server";
import { readCurves, readRising, trendsConfigured } from "@/lib/dataforseo";

export const runtime = "nodejs";
export const maxDuration = 120;

/**
 * DOES IT ACTUALLY WORK.
 *
 * Somebody else's JSON, five levels deep, written against documentation
 * rather than against a real response. The parsing is the part most likely to
 * be wrong, and finding that out through a seller pressing a button is the
 * worst way to find it out.
 *
 * Runs both calls on one term and reports what came back, including the raw
 * shape when nothing parsed — so a failure says which layer was wrong instead
 * of just "no data". Guarded by CRON_SECRET, and deleted once it has answered.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const secret = process.env.CRON_SECRET;
  if (!secret || url.searchParams.get("secret") !== secret)
    return NextResponse.json({ error: "Not found." }, { status: 404 });

  if (!trendsConfigured())
    return NextResponse.json({
      configured: false,
      note: "DATAFORSEO_LOGIN / DATAFORSEO_PASSWORD are not visible to this deployment. Env vars only apply to builds made after they were added — redeploy.",
    });

  const term = url.searchParams.get("q") || "abolish ice";
  const out: Record<string, unknown> = { configured: true, term };

  const only = url.searchParams.get("only");

  if (only !== "rising")
  try {
    const curves = await readCurves([term]);
    out.curves = {
      got: curves.length,
      value: curves[0]?.value ?? null,
      points: curves[0]?.curve.length ?? 0,
      firstPoint: curves[0]?.curve[0] ?? null,
      lastPoint: curves[0]?.curve.at(-1) ?? null,
    };
  } catch (e) {
    out.curvesError = e instanceof Error ? e.message : "failed";
  }

  if (only !== "curves")
  try {
    const rising = await readRising(term);
    out.rising = rising;
  } catch (e) {
    out.risingError = e instanceof Error ? e.message : "failed";
  }

  return NextResponse.json(out);
}
