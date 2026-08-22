"use client";

import { supabase, ASSET_BUCKET } from "./supabase";
import { downscale } from "./api";
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

export function toISODate(d: Date) {
  return d.toISOString().slice(0, 10);
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
    })
    .toUpperCase();
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

async function createDrop(worldId: string, number: number, publishDate: string) {
  const { error } = await supabase
    .from("wb_drops")
    .insert({ world_id: worldId, number, publish_date: publishDate });
  if (error && !/duplicate key/i.test(error.message))
    throw new Error(error.message);
}

/**
 * Bring the schedule up to date, then return every drop.
 *
 * Freezes any unfrozen drop whose publish date has passed, and opens the next
 * board. Paused worlds freeze nothing and open nothing — the current board just
 * stays put until the seller resumes.
 */
export async function syncSchedule(world: World): Promise<Drop[]> {
  let drops = await loadDrops(world.id);

  if (!drops.length) {
    await createDrop(
      world.id,
      1,
      toISODate(nextWeekday(new Date(), world.dropWeekday)),
    );
    return loadDrops(world.id);
  }

  if (world.paused) return drops;

  let changed = false;
  // Newest first, so the open board is drops[0].
  const current = drops[0];
  // Freeze only once the publish day has fully passed. Using >= 0 here meant a
  // seller who signed up on a Friday had Drop 01 frozen empty the moment they
  // opened the studio.
  if (daysSince(current.publishDate) > 0 && !current.frozenAt) {
    await supabase
      .from("wb_drops")
      .update({ frozen_at: new Date().toISOString(), status: "live" })
      .eq("id", current.id);
    const next = new Date(`${current.publishDate}T00:00:00`);
    next.setDate(next.getDate() + 1);
    await createDrop(
      world.id,
      current.number + 1,
      toISODate(nextWeekday(next, world.dropWeekday)),
    );
    changed = true;
  }

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

export async function removeMockup(item: DropItem) {
  const { error } = await supabase
    .from("wb_drop_items")
    .delete()
    .eq("id", item.id);
  if (error) throw new Error(error.message);
  await supabase.storage.from(ASSET_BUCKET).remove([item.path]);
}

/** Publish early — freeze this board now rather than waiting for the date. */
export async function freezeNow(world: World, drop: Drop) {
  await supabase
    .from("wb_drops")
    .update({
      frozen_at: new Date().toISOString(),
      status: "live",
      publish_date: toISODate(new Date()),
    })
    .eq("id", drop.id);
  const next = new Date();
  next.setDate(next.getDate() + 1);
  await createDrop(
    world.id,
    drop.number + 1,
    toISODate(nextWeekday(next, world.dropWeekday)),
  );
}
