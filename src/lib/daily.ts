"use client";

import { supabase } from "./supabase";
import { askAI } from "./askAI";
import { buildWorldContext, coveredForWorld } from "./context";
import type { World } from "./world";

export interface DailySource {
  title: string;
  url: string;
}

export interface DailyItem {
  id: string;
  area: string;
  /** What sort of signal this is — phrase, visual, object, event, humour… */
  kind: string;
  headline: string;
  body: string;
  /**
   * The exact words or image that would go on a product. Every item has to be
   * able to state one — it is the test for whether a signal is printable at
   * all, and an item that cannot fill it in never reaches the seller.
   */
  printable: string;
  sources: DailySource[];
}

/**
 * Something the scout found and the paper did not print.
 *
 * Same reading, same evidence rule — an exact quote and a link a search
 * actually returned. What it is not held to is being printable, which is the
 * only reason it is here rather than in the issue.
 */
export interface DailyRest {
  id: string;
  label: string;
  note: string | null;
  quote: string;
  url: string;
}

/**
 * START THIS WORLD'S FIRST ISSUE, AND DO NOT WAIT FOR IT.
 *
 * The schedule runs hourly, which leaves a brand new world with nothing to
 * read for up to an hour — and the first issue is the one that decides
 * whether somebody believes the research is really already done.
 *
 * Deliberately not awaited by any caller. The request keeps running on the
 * server after the page moves on, so the seller finishes setup, wanders into
 * the app, and the paper is there when they arrive. It writes only when the
 * week's issue is actually missing, so calling it twice costs nothing.
 */
export function startFirstIssue(worldId: string) {
  void (async () => {
    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) return;
      await fetch("/api/world-daily/first", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ worldId }),
      });
    } catch {
      /* The hourly schedule is behind this; a failure here is not visible. */
    }
  })();
}

export async function loadRest(
  worldId: string,
  date: string,
): Promise<DailyRest[]> {
  const { data, error } = await supabase
    .from("wb_daily_rest")
    .select("id, label, note, quote, url")
    .eq("world_id", worldId)
    .eq("issue_date", date)
    .eq("hidden", false)
    .order("position");
  if (error) throw new Error(error.message);
  return (data ?? []) as DailyRest[];
}

export async function hideRest(id: string) {
  await supabase.from("wb_daily_rest").update({ hidden: true }).eq("id", id);
}

export { todayISO } from "./week";

/**
 * THE PAPER COMES OUT ONCE A WEEK.
 *
 * It used to be daily, which was wrong on both counts. A customer world does
 * not turn over in twenty-four hours — a phrase takes a fortnight to spread —
 * so asking for five new findings every morning meant the good model either
 * padded the issue or found nothing and apologised. And it cost seven times
 * what it needed to, for a page nobody opens every day.
 *
 * Weekly also matches what the seller is actually doing: one drop a week. The
 * paper is there when they sit down to decide it.
 *
 * An issue is filed under the MONDAY of its week, so every read during the
 * week lands on the same issue and it simply stays up.
 *
 * WHICH MONDAY IS NOT DECIDED HERE ANY MORE. This computed the seller's LOCAL
 * Monday while the server that writes the issue computed the UTC one, so for
 * anybody east of UTC the page spent part of every week looking for a paper
 * filed under a date that was never used — finding nothing, calling the week
 * unwritten, and offering to buy it again. One definition now, in lib/week.
 */
export { weekStart as weekStartISO } from "./week";

export async function loadIssue(
  worldId: string,
  date: string,
): Promise<DailyItem[]> {
  const { data, error } = await supabase
    .from("wb_daily_items")
    .select("id, area, kind, headline, body, printable, sources")
    .eq("world_id", worldId)
    .eq("issue_date", date)
    .order("position");
  if (error) throw new Error(error.message);
  return (data ?? []) as DailyItem[];
}

/** The dates that already have an issue, newest first. */
export async function loadIssueDates(worldId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from("wb_daily_items")
    .select("issue_date")
    .eq("world_id", worldId)
    .order("issue_date", { ascending: false });
  if (error) throw new Error(error.message);
  return Array.from(new Set((data ?? []).map((r) => r.issue_date as string)));
}

/**
 * Research today's issue and store it.
 * Only ever called when today has no issue yet, or the seller asks for a rerun.
 */
/**
 * Writing an issue.
 *
 * `append` is what "Look again" does. Replacing the issue meant that asking
 * for more quietly threw away what the seller had already read that morning,
 * including anything they had half-decided to use. The shared memory already
 * forbids repeating a recent headline, so a second pass genuinely adds rather
 * than reshuffles.
 */
export async function generateIssue(
  world: World,
  date: string,
  { append = false }: { append?: boolean } = {},
): Promise<DailyItem[]> {
  /*
    THE BAN LIST TRAVELS WITH THE REQUEST, AND THIS IS THE PATH THAT MATTERED.

    The schedule writes a world's FIRST issue and nothing after it; every
    weekly issue from the second on comes through here, on the seller's own
    button. So this is the only path on which a repeat is even possible — and
    it was the one sending no ban list. `memory` asks the model not to repeat
    itself, which a model will cheerfully do anyway under a reworded headline;
    `covered` is the list the route enforces, and without it the enforcement
    had nothing to enforce against.
  */
  const [memory, covered] = await Promise.all([
    buildWorldContext(world, { room: "daily" }),
    coveredForWorld(world.id),
  ]);

  /*
    WAIT LONGER THAN THE SERVER IS ALLOWED TO TAKE.

    The default was 150 seconds. The route is allowed 300 and a real read over
    seven areas routinely uses more than 150 — so the browser hung up on work
    that was still running, every time, and reported "that took too long" for
    a request that went on to succeed without it. Three attempts, three
    finished issues, three charges, nothing saved.

    The ceiling now sits above the route's own, so whatever ends the request
    is the server answering rather than the browser walking away.
  */
  const j = await askAI<{
    items: Omit<DailyItem, "id">[];
    also?: Omit<DailyRest, "id">[];
    saved?: boolean;
  }>("/api/world-daily", {
    worldName: world.name,
    areas: world.areas.map((a) => a.name),
    subNiches: world.subNiches.map((s) => s.keyword),
    memory,
    covered,
    /* So the route can write the issue itself and hanging up cannot lose it. */
    worldId: world.id,
    issueDate: date,
    append,
  }, { timeoutMs: 780_000 });

  /*
    Already on disk, written by the side that made it. Saving again here would
    delete the issue that just landed and put an identical one back, which is
    two more chances to fail for no gain.
  */
  if (j.saved) return loadIssue(world.id, date);

  let offset = 0;
  if (append) {
    const { count } = await supabase
      .from("wb_daily_items")
      .select("id", { count: "exact", head: true })
      .eq("world_id", world.id)
      .eq("issue_date", date);
    offset = count ?? 0;
  } else {
    /*
      A plain rerun replaces, so it cannot double the issue. The delete only
      happens after the model has already answered, so a failed run never
      costs the seller the issue they had.

      AND THE DELETE IS CHECKED, because the consequence of it failing quietly
      is the thing it exists to prevent. The insert below runs regardless, so
      a rejected delete does not leave the old issue standing — it leaves the
      old issue standing AND the new one underneath it, ten items long, half
      of them last week's. The seller sees a doubled paper and no error.
    */
    const [{ error: delItems }, { error: delRest }] = await Promise.all([
      supabase
        .from("wb_daily_items")
        .delete()
        .eq("world_id", world.id)
        .eq("issue_date", date),
      supabase
        .from("wb_daily_rest")
        .delete()
        .eq("world_id", world.id)
        .eq("issue_date", date),
    ]);
    if (delItems || delRest)
      throw new Error(
        "This week's issue could not be cleared, so the new one was not saved. Nothing was lost — try again.",
      );
  }

  const rows = j.items.map((it, i) => ({
    world_id: world.id,
    issue_date: date,
    area: it.area,
    kind: it.kind,
    headline: it.headline,
    body: it.body,
    printable: it.printable,
    sources: it.sources,
    position: offset + i,
  }));

  const { error } = await supabase.from("wb_daily_items").insert(rows);
  if (error) throw new Error(error.message);

  /*
    The rest is written alongside, and never at the cost of the issue: if it
    fails to save, the paper the seller is waiting for still lands.
  */
  if (j.also?.length) {
    let at = 0;
    if (append) {
      const { count } = await supabase
        .from("wb_daily_rest")
        .select("id", { count: "exact", head: true })
        .eq("world_id", world.id)
        .eq("issue_date", date);
      at = count ?? 0;
    }
    await supabase.from("wb_daily_rest").insert(
      j.also.map((r, i) => ({
        world_id: world.id,
        issue_date: date,
        label: r.label,
        note: r.note,
        quote: r.quote,
        url: r.url,
        position: at + i,
      })),
    );
  }

  return loadIssue(world.id, date);
}

export function formatIssueDate(iso: string) {
  /*
    Issues are weekly now, so the weekday was noise — "Monday, August 24" for
    a paper that covers the whole week reads like it is about that Monday.
  */
  return `Week of ${new Date(`${iso}T00:00:00`).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
  })}`;
}

/**
 * When the next issue lands.
 *
 * An issue is filed under the Monday of its week, so the next one is simply
 * seven days on.
 *
 * The page must not call this a delivery. Only a world's FIRST paper arrives
 * on its own; every week after it is written when the seller asks. Saying
 * "drops" sent people to an empty page expecting a newspaper.
 */
export function nextIssueDate(iso: string) {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + 7);
  return d.toLocaleDateString("en-US", { month: "long", day: "numeric" });
}

export function greeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

export function hostOf(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

/**
 * RE-READ THE SHOPS THIS WORLD FOLLOWS.
 *
 * Runs on the same press as the week's issue, so "this week" means the same
 * thing in the research and in the shop numbers underneath it. Etsy calls
 * only — no model, no allowance.
 *
 * Never allowed to stop the issue: a seller who follows no shops, or whose
 * shops will not answer, still gets their paper.
 */
export async function sweepShops(worldId: string): Promise<void> {
  try {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) return;
    await fetch("/api/shops/sweep", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ worldId }),
    });
  } catch {
    /* The paper matters more than the shop numbers under it. */
  }
}


/*
  THE PAPER IS WRITTEN ON THE SERVER, SO THE BROWSER MUST NOT BE WHAT WAITS.

  Every failure this feature has had came from one shape: research that takes
  minutes, a browser holding the connection open for it, and something -- a
  timeout, a closed laptop, a dropped wifi -- letting go of the rope before the
  end. Then the work finished, was thrown away, and the seller was told it had
  taken too long. Raising the timeout moved the number; it never removed the
  shape.

  The route writes the issue itself now, which means the response is not the
  delivery. It is just an acknowledgement, and nobody has to be listening for
  it. So this starts the write, stops caring what happens to the request, and
  watches the database for the issue to appear -- which is the only thing that
  was ever the actual answer.

  Closing the tab now costs nothing. Reloading picks the watch back up.
*/
export const WRITING_KEY = "wb:writing";

export function markWriting(worldId: string, date: string) {
  try {
    localStorage.setItem(WRITING_KEY, JSON.stringify({ worldId, date, at: Date.now() }));
  } catch { /* private mode: the poll still runs, it just will not survive a reload */ }
}

export function clearWriting() {
  try { localStorage.removeItem(WRITING_KEY); } catch {}
}

/** A write started in this browser that has not produced an issue yet. */
export function pendingWrite(worldId: string, date: string): boolean {
  try {
    const raw = localStorage.getItem(WRITING_KEY);
    if (!raw) return false;
    const w = JSON.parse(raw) as { worldId: string; date: string; at: number };
    /* Long enough for the slowest honest run, short enough that a genuinely
       dead write does not leave the page waiting forever. */
    if (Date.now() - w.at > 15 * 60_000) { clearWriting(); return false; }
    return w.worldId === worldId && w.date === date;
  } catch { return false; }
}

/**
 * Start the write and hand back a watcher. Resolves with the issue when it
 * lands, or null when the window closes without one appearing.
 */
export function startWrite(
  world: World,
  date: string,
  onLanded: (items: DailyItem[]) => void,
): () => void {
  markWriting(world.id, date);

  /* Fire and forget, deliberately: the route saves what it makes. */
  void generateIssue(world, date).catch(() => {});

  let alive = true;
  const began = Date.now();
  const timer = setInterval(async () => {
    if (!alive) return;
    if (Date.now() - began > 15 * 60_000) { alive = false; clearInterval(timer); clearWriting(); return; }
    const got = await loadIssue(world.id, date).catch(() => [] as DailyItem[]);
    if (!alive || !got.length) return;
    alive = false;
    clearInterval(timer);
    clearWriting();
    onLanded(got);
  }, 10_000);

  return () => { alive = false; clearInterval(timer); };
}
