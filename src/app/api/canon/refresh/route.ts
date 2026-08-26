import { NextResponse } from "next/server";
import { serviceDb } from "@/lib/pinterest";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * THE CANON KEEPS ITSELF UP TO DATE — BUT NOT FOR FREE.
 *
 * Reading the database costs nothing. The model reading the database is the
 * most expensive single call in this product: at a year of use the corpus is
 * around a hundred thousand tokens, so a rebuild is roughly thirty-five
 * cents. Rebuilding on every change would mean a busy research afternoon of
 * forty saves costing fourteen dollars, for a document nobody read forty
 * times.
 *
 * So it rebuilds on GROWTH, not on change. A world only qualifies when
 * enough genuinely new material has arrived since the last version to make a
 * different document — and never more than once a week, because a canon that
 * moves daily is not a standing account of anything.
 *
 * Runs once a week. Worlds that have not moved are skipped and cost nothing.
 */

/** New signals, pieces and findings needed before it is worth re-reading. */
const ENOUGH_NEW = 25;
/** Never twice inside this many days, however much has arrived. */
const MIN_DAYS = 6;

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("x-cron-secret") !== secret)
    return NextResponse.json({ error: "Not found." }, { status: 404 });

  const db = serviceDb();
  const { data: worlds } = await db
    .from("wb_worlds")
    .select("id")
    .eq("established", true);

  const built: string[] = [];
  const skipped: Record<string, string> = {};

  for (const w of worlds ?? []) {
    const worldId = w.id as string;
    try {
      const { data: last } = await db
        .from("wb_canon")
        .select("evidence, built_at")
        .eq("world_id", worldId)
        .order("built_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      // Never written by hand yet: leave it. The first one is the seller's to
      // ask for, so nobody's first sight of this feature is a document that
      // appeared without them.
      if (!last) {
        skipped[worldId] = "never built";
        continue;
      }

      const days =
        (Date.now() - new Date(last.built_at as string).getTime()) / 86_400_000;
      if (days < MIN_DAYS) {
        skipped[worldId] = "too soon";
        continue;
      }

      const count = async (table: string) => {
        const { count: n } = await db
          .from(table)
          .select("id", { count: "exact", head: true })
          .eq("world_id", worldId);
        return n ?? 0;
      };
      const [signals, pieces] = await Promise.all([
        count("wb_daily_items"),
        count("wb_board_items"),
      ]);

      const ev = (last.evidence ?? {}) as { signals?: number; pieces?: number };
      const grown =
        signals + pieces - ((ev.signals ?? 0) + (ev.pieces ?? 0));

      if (grown < ENOUGH_NEW) {
        skipped[worldId] = `only ${grown} new`;
        continue;
      }

      const res = await fetch(new URL("/api/canon", req.url), {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-cron-secret": secret,
        },
        body: JSON.stringify({ worldId }),
      });
      if (res.ok) built.push(worldId);
      else skipped[worldId] = `failed ${res.status}`;
    } catch (e) {
      skipped[worldId] = e instanceof Error ? e.message : "failed";
    }
  }

  return NextResponse.json({ built: built.length, skipped });
}
