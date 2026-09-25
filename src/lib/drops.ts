"use client";

import { supabase, ASSET_BUCKET } from "./supabase";
import { downscale } from "./api";
import { report } from "./report";
import { carryBoardForward } from "./board";
import type { World } from "./world";

/**
 * D — DROP. DATA. DEEPEN.
 *
 * The schedule is calendar-driven, not performance-driven. Nothing in this file
 * looks at Etsy results, and nothing here decides what the next drop should
 * contain. SPEC: "The tool must not assume that the previous week's Etsy
 * performance should guide the next week's drop."
 */

export type DropStatus = "building" | "live" | "gathering" | "review";

export interface DropItem {
  id: string;
  slot: number;
  path: string;
  src: string;
  title: string;
}

export interface Drop {
  id: string;
  number: number;
  publishDate: string; // YYYY-MM-DD
  status: DropStatus;
  frozenAt: string | null;
  items: DropItem[];
}

/** Days after publishing before listings are worth looking at. */
export const GATHERING_DAYS = 30;
export const REVIEW_DAYS = 60;

const DAY = 86_400_000;

/**
 * THE CALENDAR DAY THIS DATE IS, WHERE THE SELLER IS STANDING.
 *
 * This used to be `d.toISOString().slice(0, 10)`, which is the UTC day — and
 * every other date function in this file works in LOCAL time. nextWeekday sets
 * local midnight; daysSince parses "YYYY-MM-DDT00:00:00" as local. Mixing the
 * two frames is invisible in a timezone at or behind UTC and catastrophic in
 * one ahead of it.
 *
 * East of UTC, local midnight on Friday the 11th is 14:00 THURSDAY in UTC, so
 * toISOString returned "the 10th". Every publish date this software calculated
 * for a seller in Europe, Asia or Australia landed one day early — on the day
 * BEFORE their drop weekday.
 *
 * That is not a cosmetic off-by-one. syncSchedule freezes any drop whose date
 * has passed and then opens the next one, and the next one's date is computed
 * from this function — so it came back as the SAME day that had just been
 * judged overdue. Freeze, create, freeze, create: a loop that only stopped
 * when it hit the 260-iteration guard, resumed on every page load, and left
 * one world holding fourteen hundred drops. Mid-churn there is no "next" drop
 * yet, which is why the research tab kept vanishing for exactly those sellers.
 *
 * Local in, local out. No UTC anywhere near a date somebody reads.
 */
export function toISODate(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Next occurrence of an ISO weekday (1=Mon … 7=Sun), today counting as a hit. */
export function nextWeekday(from: Date, isoWeekday: number) {
  const d = new Date(from);
  d.setHours(0, 0, 0, 0);
  const cur = d.getDay() === 0 ? 7 : d.getDay();
  const delta = (isoWeekday - cur + 7) % 7;
  d.setDate(d.getDate() + delta);
  return d;
}

export function daysSince(iso: string) {
  const then = new Date(`${iso}T00:00:00`).getTime();
  return Math.floor((Date.now() - then) / DAY);
}

/**
 * Lifecycle only. This is age, never a judgment about how a drop performed.
 */
export function lifecycleFor(publishDate: string): DropStatus {
  const age = daysSince(publishDate);
  if (age < 0) return "building";
  if (age < GATHERING_DAYS) return "live";
  if (age < REVIEW_DAYS) return "gathering";
  return "review";
}

export const STATUS_LABEL: Record<DropStatus, string> = {
  building: "Building",
  live: "Live",
  gathering: "Gathering Data",
  review: "Ready to Review",
};

export function formatDropDate(iso: string) {
  return new Date(`${iso}T00:00:00`)
    .toLocaleDateString("en-US", {
      weekday: "long",
      month: "long",
      day: "numeric",
    });
}

/* ------------------------------------------------------------------ */
/* loading                                                             */
/* ------------------------------------------------------------------ */

async function signItems(
  rows: { id: string; slot: number; storage_path: string; title: string }[],
): Promise<DropItem[]> {
  if (!rows.length) return [];
  const { data } = await supabase.storage
    .from(ASSET_BUCKET)
    .createSignedUrls(
      rows.map((r) => r.storage_path),
      3600,
    );
  const map: Record<string, string> = {};
  for (const row of data ?? []) {
    if (row.path && row.signedUrl) map[row.path] = row.signedUrl;
  }
  return rows.map((r) => ({
    id: r.id,
    slot: r.slot,
    path: r.storage_path,
    title: r.title,
    src: map[r.storage_path] ?? "",
  }));
}

export async function loadDrops(worldId: string): Promise<Drop[]> {
  const { data, error } = await supabase
    .from("wb_drops")
    .select("id, number, publish_date, status, frozen_at")
    .eq("world_id", worldId)
    .order("number", { ascending: false });
  if (error) throw new Error(error.message);
  const rows = data ?? [];
  if (!rows.length) return [];

  const { data: itemRows } = await supabase
    .from("wb_drop_items")
    .select("id, drop_id, slot, storage_path, title")
    .in(
      "drop_id",
      rows.map((r) => r.id),
    );

  const byDrop: Record<string, typeof itemRows> = {};
  for (const it of itemRows ?? []) {
    (byDrop[it.drop_id] ||= []).push(it);
  }

  const out: Drop[] = [];
  for (const r of rows) {
    out.push({
      id: r.id,
      number: r.number,
      publishDate: r.publish_date,
      status: r.status as DropStatus,
      frozenAt: r.frozen_at,
      items: await signItems(byDrop[r.id] ?? []),
    });
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* schedule                                                            */
/* ------------------------------------------------------------------ */

async function createDrop(
  worldId: string,
  number: number,
  publishDate: string,
): Promise<Drop> {
  const { error } = await supabase
    .from("wb_drops")
    .insert({ world_id: worldId, number, publish_date: publishDate });
  if (error && !/duplicate key/i.test(error.message))
    throw new Error(error.message);
  /* Read it back rather than trusting the insert: a duplicate key means a
     racing tab made it first, and that row is the one that matters. */
  const made = (await loadDrops(worldId)).find((d) => d.number === number);
  if (!made) throw new Error("The drop could not be opened.");
  return made;
}

/**
 * The three things a seller has at any moment.
 *
 * There are always two live drops now, not one: the board being built, and
 * the one after it that exists only so next week's research has somewhere to
 * land. "Current" is therefore the *earliest* unfrozen drop — the newest one
 * is next week's, and putting a seller in front of that by accident would be
 * a confusing way to lose an afternoon.
 */
export function splitDrops(drops: Drop[]) {
  const open = drops.filter((d) => !d.frozenAt).sort((a, b) => a.number - b.number);
  const current = open[0] ?? drops[0] ?? null;
  const next = current ? (open.find((d) => d.number === current.number + 1) ?? null) : null;
  const released = drops.filter((d) => d.frozenAt);
  return { current, next, released };
}

/**
 * Bring the schedule up to date, then return every drop.
 *
 * Freezes any unfrozen drop whose publish date has passed, opens the next
 * board, and always keeps one drop ahead of the current one in existence so
 * the research board for next week has something to attach to. Paused worlds
 * freeze nothing — the current board just stays put until the seller resumes.
 */
export async function syncSchedule(world: World): Promise<Drop[]> {
  let drops = await loadDrops(world.id);

  /*
    A brand-new world used to get Drop 01 and stop there, because this
    returned early. That left the seller with nothing for next week on their
    very first day — no board for research to attach to, and Home telling
    them research had not started yet, which is the opposite of the habit
    this software exists to build. Create the first drop, then carry on
    through the normal path so next week opens with it.
  */
  if (!drops.length) {
    await createDrop(
      world.id,
      1,
      toISODate(nextWeekday(new Date(), world.dropWeekday)),
    );
    drops = await loadDrops(world.id);
  }

  let changed = false;

  /**
   * Next week's drop exists from the moment this week's does, because the
   * research board attaches to it. It carries no mockups and the seller is
   * never sent to it by mistake — see splitDrops.
   */
  async function ensureNextExists(cur: Drop) {
    if (drops.some((d) => d.number === cur.number + 1)) return;
    const after = new Date(`${cur.publishDate}T00:00:00`);
    after.setDate(after.getDate() + 1);
    const when = nextWeekday(after, world.dropWeekday);

    /*
      NEXT WEEK MUST BE AFTER THIS WEEK. ENFORCED, NOT ASSUMED.

      The timezone bug in toISODate made this return the same day as the drop
      it follows, and a drop dated no later than its predecessor is one the
      freeze loop immediately judges overdue — so it froze it, created another
      on the same date, and went round again until the guard stopped it.
      Fourteen hundred drops for one seller, and their research tab flickering
      in and out while it ran.

      The date arithmetic is fixed above. This makes the runaway structurally
      impossible rather than merely unlikely: a date that is not strictly
      later than the current drop's is wrong however it was arrived at, and
      pushing it a week on is always the right answer.
    */
    let date = toISODate(when);
    if (date <= cur.publishDate) {
      when.setDate(when.getDate() + 7);
      date = toISODate(when);
    }

    await createDrop(world.id, cur.number + 1, date);
    changed = true;
  }

  /*
    NOTHING FREEZES ON A DATE. EVER.

    This used to walk the calendar: any drop whose publish day had passed was
    frozen where it stood, read-only, and the next board opened in its place.
    A seller who worked at her own pace came back to a board she could no
    longer touch and a message about a day she had missed — which is what the
    date had quietly become, a deadline enforced by software.

    It is a plan now, and plans are allowed to slip. A drop ends when the
    seller says it ends, and not before: `finishDrop` is the only thing in
    this file that freezes anything, and it runs from a button. Pausing is
    gone with it, because there is no longer a clock to stop.

    What remains here is bookkeeping: make sure the first board exists, make
    sure there is always a board for next week for research to attach to, and
    keep the status of finished drops in step with their age.
  */
  if (!drops.length) return [];

  // Age frozen drops through the lifecycle. Status is age, not performance.
  for (const d of drops) {
    if (!d.frozenAt) continue;
    const should = lifecycleFor(d.publishDate);
    if (should !== d.status) {
      await supabase.from("wb_drops").update({ status: should }).eq("id", d.id);
      changed = true;
    }
  }

  if (changed) drops = await loadDrops(world.id);

  // Research needs a board for next week whatever else has happened.
  const { current: nowCurrent, next } = splitDrops(drops);
  if (nowCurrent && !next) {
    await ensureNextExists(nowCurrent);
    drops = await loadDrops(world.id);
  }

  return drops;
}

/* ------------------------------------------------------------------ */
/* items                                                               */
/* ------------------------------------------------------------------ */

export async function uploadMockup(
  dropId: string,
  slot: number,
  file: File,
): Promise<DropItem> {
  const { data: auth } = await supabase.auth.getUser();
  const uid = auth.user?.id;
  if (!uid) throw new Error("Not signed in.");
  const blob = await downscale(file, 1400);
  const path = `${uid}/drops/${dropId}/${slot}-${crypto.randomUUID()}.jpg`;
  const up = await supabase.storage
    .from(ASSET_BUCKET)
    .upload(path, blob, { contentType: "image/jpeg" });
  if (up.error) throw new Error(up.error.message);

  const { data, error } = await supabase
    .from("wb_drop_items")
    .upsert(
      { drop_id: dropId, slot, storage_path: path },
      { onConflict: "drop_id,slot" },
    )
    .select("id, slot, storage_path, title")
    .single();
  if (error) throw new Error(error.message);

  const { data: signed } = await supabase.storage
    .from(ASSET_BUCKET)
    .createSignedUrl(path, 3600);

  return {
    id: data.id as string,
    slot,
    path,
    title: (data.title as string) ?? "",
    src: signed?.signedUrl ?? "",
  };
}

/**
 * PUBLISHED BY MISTAKE.
 *
 * Publish and freeze is deliberately final — that is what makes the archive
 * worth anything. But "final" and "unrecoverable" are not the same thing, and
 * a seller who hits the button a day early should not lose a week of work to
 * a misclick.
 *
 * Re-opening brings the drop back to building on the next drop day. The empty
 * board that was opened behind it is removed so the numbering stays
 * contiguous and there is only ever one board being built — and only if it is
 * genuinely empty. A successor with a design in it is somebody's work, and
 * this will refuse rather than touch it.
 */
export async function reopenDrop(world: World, drop: Drop) {
  const all = await loadDrops(world.id);
  const successors = all.filter((d) => d.number > drop.number && !d.frozenAt);

  if (successors.some((d) => d.items.length > 0))
    throw new Error(
      "There is already a board with designs on it after this one. Clear it first, or keep this drop as it is.",
    );

  for (const empty of successors) {
    await supabase.from("wb_drops").delete().eq("id", empty.id);
  }

  const { error } = await supabase
    .from("wb_drops")
    .update({
      frozen_at: null,
      status: "building",
      publish_date: toISODate(nextWeekday(new Date(), world.dropWeekday)),
    })
    .eq("id", drop.id);
  if (error) throw new Error(error.message);
}

/**
 * ARRANGING THE DROP IS PART OF MAKING IT.
 *
 * A drop is a collection, and the order designs sit in is a decision — the
 * strongest piece first, the two that argue with each other kept apart.
 * Until now the only way to reorder was to delete a design and upload it
 * again into a different square, which meant destroying work to rearrange it.
 *
 * Dropping onto an empty square moves. Dropping onto a filled one swaps. The
 * swap parks one row on a slot number no square can have, because the
 * database will not allow two designs in the same slot even for a moment.
 */
export async function moveItemToSlot(drop: Drop, from: number, to: number) {
  if (from === to) return;
  const moving = drop.items.find((i) => i.slot === from);
  if (!moving) return;
  const sitting = drop.items.find((i) => i.slot === to);

  const set = async (id: string, slot: number) => {
    const { error } = await supabase
      .from("wb_drop_items")
      .update({ slot })
      .eq("id", id);
    if (error) throw new Error(error.message);
  };

  if (!sitting) {
    await set(moving.id, to);
    return;
  }

  await set(moving.id, -1);
  await set(sitting.id, from);
  await set(moving.id, to);
}

/**
 * Naming a design.
 *
 * The column has existed since the first migration and nothing has ever been
 * able to write to it. A seller who can say "this one is the psalm 23 script"
 * can talk about their own board, and so can the Creative Room.
 */
export async function renameItem(item: DropItem, title: string) {
  const clean = title.trim().slice(0, 120);
  const { error } = await supabase
    .from("wb_drop_items")
    .update({ title: clean })
    .eq("id", item.id);
  if (error) throw new Error(error.message);
  return clean;
}

export async function removeMockup(item: DropItem) {
  const { error } = await supabase
    .from("wb_drop_items")
    .delete()
    .eq("id", item.id);
  if (error) throw new Error(error.message);
  await supabase.storage.from(ASSET_BUCKET).remove([item.path]);
}

/** Publish early — freeze this board now rather than waiting for the date. */
/**
 * END A DROP, BECAUSE THE SELLER SAID SO.
 *
 * The only thing in this file that freezes anything. Nothing here runs on a
 * schedule, on a date, or on a page load — it runs when somebody presses the
 * button, and it is reversible: `reopenDrop` puts it straight back.
 */
export async function finishDrop(world: World, drop: Drop) {
  const after = new Date();
  after.setDate(after.getDate() + 1);

  /*
    The next board is made FIRST, so the research has somewhere to land. If
    this failed and the drop had already been frozen, a seller would be left
    holding a finished drop, no next week, and their board behind the wall.
  */
  const nextNumber = drop.number + 1;
  const existing = (await loadDrops(world.id)).find((d) => d.number === nextNumber);
  const nextDrop =
    existing ??
    (await createDrop(
      world.id,
      nextNumber,
      toISODate(nextWeekday(after, world.dropWeekday)),
    ));

  /* Everything saved into research moves on with the seller. */
  await carryBoardForward(drop.id, nextDrop.id).catch((e) =>
    report("studio", e, { worldId: world.id, dropId: drop.id, at: "carry" }),
  );

  await supabase
    .from("wb_drops")
    .update({
      frozen_at: new Date().toISOString(),
      status: "live",
      publish_date: toISODate(new Date()),
    })
    .eq("id", drop.id);
}
