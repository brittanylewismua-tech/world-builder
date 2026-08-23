"use client";

import { supabase } from "./supabase";
import { askAI } from "./askAI";
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
  sources: DailySource[];
}

export function todayISO() {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 10);
}

export async function loadIssue(
  worldId: string,
  date: string,
): Promise<DailyItem[]> {
  const { data, error } = await supabase
    .from("wb_daily_items")
    .select("id, area, kind, headline, body, sources")
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
export async function generateIssue(
  world: World,
  date: string,
): Promise<DailyItem[]> {
  const j = await askAI<{ items: Omit<DailyItem, "id">[] }>("/api/world-daily", {
    worldName: world.name,
    areas: world.areas.map((a) => a.name),
    subNiches: world.subNiches.map((s) => s.keyword),
  });

  const rows = j.items.map((it, i) => ({
    world_id: world.id,
    issue_date: date,
    area: it.area,
    kind: it.kind,
    headline: it.headline,
    body: it.body,
    sources: it.sources,
    position: i,
  }));

  // Replace rather than append, so a rerun does not double the issue.
  await supabase
    .from("wb_daily_items")
    .delete()
    .eq("world_id", world.id)
    .eq("issue_date", date);

  const { error } = await supabase.from("wb_daily_items").insert(rows);
  if (error) throw new Error(error.message);

  return loadIssue(world.id, date);
}

export function formatIssueDate(iso: string) {
  return new Date(`${iso}T00:00:00`)
    .toLocaleDateString("en-US", {
      weekday: "long",
      month: "long",
      day: "numeric",
    });
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
