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
  /* Names a different judge for this one issue. Testing only; see the route. */
  judge?: string,
): Promise<number> {
  const world = await loadWorld(db, worldId);
  await retranslate(db, world, secret, from);
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
      ...(judge ? { judge } : {}),
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
    DID SOMEBODY ELSE FINISH FIRST?

    Two things write issues: setup, the moment a world is established, and the
    hourly schedule. A world that finishes setup at 11:16 is not yet written
    when the 11:17 run picks its list, so both start — and the research takes
    two minutes, which is a wide enough window to be ordinary rather than
    unlucky on a morning when two hundred people are setting up at once.

    Checked here, after the research and immediately before the write, because
    that is the only point where the answer is still current. The loser throws
    its work away rather than overwriting a good issue with an identical one.
  */
  const { count: raced } = await db
    .from("wb_daily_items")
    .select("id", { count: "exact", head: true })
    .eq("world_id", worldId)
    .eq("issue_date", week);
  if ((raced ?? 0) > 0) return 0;

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
/**
 * TURN THE KEYWORDS INTO SEARCH TOPICS, EVERY TIME.
 *
 * The paper is not researched from a seller's keywords. It cannot be:
 * searching "feminist sweatshirt" returns Etsy listings and Amazon, which is
 * shopping, not people talking. So the keywords are translated into reading
 * topics — "sapphic culture", "protest slogans" — and those are what actually
 * get searched.
 *
 * That translation used to run exactly once, when a world had no topics at
 * all. Which meant a seller could rewrite every keyword they had and keep
 * getting a paper researched from the list they typed on their first day.
 * It happened: a world whose keywords had nothing to do with immigration kept
 * leading with ICE, because "abolish ice movement" had been derived months
 * earlier and nothing ever revisited it. Nobody could have diagnosed that from
 * the outside — the stale topic is not shown anywhere near the paper it wrote.
 *
 * So it runs on every issue. Keywords in, topics out, paper written from the
 * fresh set. Half a cent against a thirty-five cent issue, and it removes a
 * whole class of "why is this in my newspaper" that no seller could answer.
 *
 * IT FAILS SOFTLY AND ON PURPOSE. If the translation errors, returns nothing,
 * or comes back suspiciously thin, the world keeps the topics it already had
 * and the paper is written from those. A bad minute at Anthropic should cost
 * an issue its freshness, never its existence — and never a seller's topics.
 */
const FEWEST_AREAS = 4;

async function retranslate(db: Db, world: World, secret: string, from: string) {
  const keywords = world.subNiches.map((s) => s.keyword).filter(Boolean);
  /* Two is the floor the translator itself enforces. Below it, nothing to do. */
  if (keywords.length < 2) return;

  try {
    const res = await fetch(`${new URL(from).origin}/api/suggest-areas`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-cron-secret": secret },
      /*
        No "existing" list. That parameter asks for topics DIFFERENT from the
        ones already held, which is right when a seller wants more ground and
        exactly wrong here: this is a re-translation of what they sell today,
        so it has to be free to arrive at the same answer as last week.
      */
      body: JSON.stringify({ worldName: world.name, subNiches: keywords }),
    });
    if (!res.ok) return;

    const { areas } = (await res.json()) as { areas?: string[] };
    const fresh = (areas ?? []).map((a) => a.trim()).filter(Boolean);
    if (fresh.length < FEWEST_AREAS) return;

    /*
      Replaced together, so a world is never left mid-swap with no topics —
      if the insert fails the delete is not committed and the old set stands.
    */
    const { error } = await db.rpc("wb_set_areas", { w: world.id, names: fresh });
    if (error) return;

    /* Read back rather than trusting the input: the function lowercases,
       trims and de-duplicates, so what landed is not exactly what was sent. */
    const { data: saved } = await db
      .from("wb_areas")
      .select("id, name")
      .eq("world_id", world.id);
    if (saved?.length) world.areas = saved as World["areas"];
  } catch {
    /* Keep what the world has. */
  }
}

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
