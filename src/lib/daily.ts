"use client";

import { supabase } from "./supabase";
import { askAI } from "./askAI";
import { buildWorldContext } from "./context";
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

export function todayISO() {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 10);
}

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
 */
export function weekStartISO(from = new Date()) {
  const d = new Date(from);
  d.setHours(0, 0, 0, 0);
  // getDay(): 0 = Sunday. Shift so Monday starts the week.
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 10);
}

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
  const j = await askAI<{
    items: Omit<DailyItem, "id">[];
    also?: Omit<DailyRest, "id">[];
  }>("/api/world-daily", {
    worldName: world.name,
    areas: world.areas.map((a) => a.name),
    subNiches: world.subNiches.map((s) => s.keyword),
    // Everything the world already knows, so today's paper does not repeat
    // what it printed yesterday.
    memory: await buildWorldContext(world, { room: "daily" }),
  });

  let offset = 0;
  if (append) {
    const { count } = await supabase
      .from("wb_daily_items")
      .select("id", { count: "exact", head: true })
      .eq("world_id", world.id)
      .eq("issue_date", date);
    offset = count ?? 0;
  } else {
    // A plain rerun replaces, so it cannot double the issue. The delete only
    // happens after the model has already answered, so a failed run never
    // costs the seller the issue they had.
    await supabase
      .from("wb_daily_items")
      .delete()
      .eq("world_id", world.id)
      .eq("issue_date", date);
    await supabase
      .from("wb_daily_rest")
      .delete()
      .eq("world_id", world.id)
      .eq("issue_date", date);
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
 * seven days on. Worth saying out loud on the page: there is no refresh
 * button any more, and without a date "once a week" leaves somebody
 * wondering whether the paper is stuck.
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
