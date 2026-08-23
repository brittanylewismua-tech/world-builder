import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 800;

/**
 * WRITING THE PAPER BEFORE ANYONE ASKS FOR IT
 *
 * World Daily's whole promise is that you open it in the morning and it is
 * already there. Researching on demand takes about a minute of watching a
 * spinner, which is the opposite of that.
 *
 * This runs overnight and writes every established world's issue in advance.
 *
 * It needs SUPABASE_SERVICE_ROLE_KEY, because it writes on behalf of people
 * who are not here — row level security is doing its job by refusing that to
 * the public key. Until that variable exists this route does nothing and says
 * so plainly rather than failing quietly; the app still researches on demand
 * in the meantime, so nothing is broken while it is missing.
 */

const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  "https://ywncfltxrnrchicjwcse.supabase.co";

interface WorldRow {
  id: string;
  name: string;
}

function today() {
  const d = new Date();
  return d.toISOString().slice(0, 10);
}

export async function GET(req: Request) {
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

  const issueDate = today();
  const origin = new URL(req.url).origin;

  const { data: worlds, error } = await db
    .from("wb_worlds")
    .select("id, name")
    .eq("established", true);

  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 });

  const report = { written: 0, skipped: 0, failed: 0, worlds: 0 };

  for (const world of (worlds ?? []) as WorldRow[]) {
    report.worlds++;
    try {
      // Already has today's issue? Leave it alone.
      const { count } = await db
        .from("wb_daily_items")
        .select("id", { count: "exact", head: true })
        .eq("world_id", world.id)
        .eq("issue_date", issueDate);
      if (count && count > 0) {
        report.skipped++;
        continue;
      }

      const [{ data: areas }, { data: niches }] = await Promise.all([
        db.from("wb_areas").select("name").eq("world_id", world.id),
        db.from("wb_sub_niches").select("keyword").eq("world_id", world.id),
      ]);

      const areaNames = (areas ?? []).map((a) => a.name as string);
      if (!areaNames.length) {
        report.skipped++;
        continue;
      }

      const res = await fetch(`${origin}/api/world-daily`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          // The research route trusts this the same way it trusts a session.
          "x-cron-secret": secret ?? "",
        },
        body: JSON.stringify({
          worldName: world.name,
          areas: areaNames,
          subNiches: (niches ?? []).map((n) => n.keyword as string),
        }),
      });

      if (!res.ok) {
        report.failed++;
        continue;
      }

      const { items } = (await res.json()) as {
        items: {
          area: string;
          kind: string;
          headline: string;
          body: string;
          sources: unknown;
        }[];
      };
      if (!items?.length) {
        report.failed++;
        continue;
      }

      await db.from("wb_daily_items").insert(
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
      report.written++;
    } catch (e) {
      console.error("cron/daily failed for world", world.id, e);
      report.failed++;
    }
  }

  return NextResponse.json({ ok: true, issueDate, ...report });
}
