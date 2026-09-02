import { serviceDb } from "@/lib/pinterest";
import { dailyContext, SIGNAL_DAYS, SIGNAL_MAX } from "@/lib/worldContext";
import type { World } from "@/lib/world";

/**
 * WRITING ONE WORLD'S ISSUE.
 *
 * Shared by the hourly schedule and by the moment a world is first built,
 * because those must produce the same paper. A new world used to wait up to
 * an hour for the next scheduled run, which meant the very first issue — the
 * one that decides whether somebody believes in the thing at all — was the
 * one most likely to be missing.
 */

/** Monday of the current week, in UTC. Matches weekStartISO on the client. */
export function weekStart(): string {
  const d = new Date();
  const day = (d.getUTCDay() + 6) % 7; // Monday = 0
  d.setUTCDate(d.getUTCDate() - day);
  return d.toISOString().slice(0, 10);
}

type Db = ReturnType<typeof serviceDb>;

/** Assemble one world, research it, and store the issue. */
export async function writeIssue(
  db: Db,
  worldId: string,
  week: string,
  secret: string,
  from: string,
): Promise<number> {
  const world = await loadWorld(db, worldId);
  if (!world.areas.length)
    throw new Error("no active areas to watch");

  const since = new Date();
  since.setDate(since.getDate() - SIGNAL_DAYS);
  const { data: signals } = await db
    .from("wb_daily_items")
    .select("issue_date, kind, headline")
    .eq("world_id", worldId)
    .gte("issue_date", since.toISOString().slice(0, 10))
    .order("issue_date", { ascending: false })
    .order("position")
    .limit(SIGNAL_MAX);

  /*
    The research pipeline is the same one the app has always used, called
    over the wire rather than copied. One implementation, so the paper the
    schedule writes is the paper the product was built around.
  */
  const base = new URL(from);
  const res = await fetch(`${base.origin}/api/world-daily`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-cron-secret": secret },
    body: JSON.stringify({
      worldName: world.name,
      areas: world.areas.map((a) => a.name),
      subNiches: world.subNiches.map((s) => s.keyword),
      memory: dailyContext(world, [], (signals ?? []) as never[]),
    }),
  });

  const body = (await res.json()) as {
    items?: { area: string; kind: string; headline: string; body: string; printable: string; sources: unknown }[];
    also?: { label: string; note: string | null; quote: string; url: string }[];
    error?: string;
  };
  if (!res.ok) throw new Error(body.error ?? `research returned ${res.status}`);
  if (!body.items?.length) throw new Error("came back empty");

  /*
    Written only once the research has actually answered, so a failed run
    never clears an issue that was already there.
  */
  await db.from("wb_daily_items").delete().eq("world_id", worldId).eq("issue_date", week);
  await db.from("wb_daily_rest").delete().eq("world_id", worldId).eq("issue_date", week);

  const { error } = await db.from("wb_daily_items").insert(
    body.items.map((it, i) => ({
      world_id: worldId,
      issue_date: week,
      area: it.area,
      kind: it.kind,
      headline: it.headline,
      body: it.body,
      printable: it.printable,
      sources: it.sources,
      position: i,
    })),
  );
  if (error) throw new Error(error.message);

  if (body.also?.length)
    await db.from("wb_daily_rest").insert(
      body.also.map((r, i) => ({
        world_id: worldId,
        issue_date: week,
        label: r.label,
        note: r.note,
        quote: r.quote,
        url: r.url,
        position: i,
      })),
    );

  /* It landed, so the week's failures stop mattering. */
  await db.from("wb_daily_attempts").delete().eq("world_id", worldId).eq("issue_date", week);

  return body.items.length;
}

/** Enough of a world to brief the paper. */
async function loadWorld(db: Db, worldId: string): Promise<World> {
  const [{ data: w }, { data: areas }, { data: niches }, { data: refs }] =
    await Promise.all([
      db.from("wb_worlds").select("*").eq("id", worldId).single(),
      db.from("wb_areas").select("name").eq("world_id", worldId),
      db.from("wb_sub_niches").select("keyword").eq("world_id", worldId),
      db.from("wb_visual_refs").select("id").eq("world_id", worldId),
    ]);

  if (!w) throw new Error("world not found");

  return {
    ...(w as object),
    id: worldId,
    name: (w.name as string) ?? "",
    areas: (areas ?? []).map((a) => ({ name: a.name as string })),
    subNiches: (niches ?? []).map((n) => ({ keyword: n.keyword as string })),
    visualReferences: refs ?? [],
    affinity: (w.affinity as Record<string, number | null>) ?? {},
    slotsPerDrop: (w.slots_per_drop as number) ?? 0,
  } as unknown as World;
}
