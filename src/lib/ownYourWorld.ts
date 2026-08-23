"use client";

import { supabase, ASSET_BUCKET } from "./supabase";
import type { World } from "./world";

/**
 * TAKING YOUR WORLD WITH YOU, AND BEING ABLE TO END IT.
 *
 * A year of research about a customer is the most valuable thing this
 * software holds, and until now it existed only inside this software. That is
 * a reason not to trust it. Export writes the whole archive to a file the
 * seller keeps — readable without this app ever running again.
 *
 * Delete is the other half of the same promise. Someone who can leave with
 * everything, and erase everything, is someone who chose to stay.
 *
 * The export deliberately carries the seller's own material — keywords,
 * reflections, notes, conversations, what was collected and what was
 * released. It does not carry the images themselves; those are large and
 * already on the seller's own machine, so it records their names instead.
 */

export interface WorldExport {
  exportedAt: string;
  world: Record<string, unknown>;
  subNiches: unknown[];
  areas: unknown[];
  visualReferences: unknown[];
  drops: unknown[];
  dropItems: unknown[];
  dailyIssues: unknown[];
  researchBoards: unknown[];
  researchItems: unknown[];
  findings: unknown[];
  conversations: unknown[];
  messages: unknown[];
}

async function rows(table: string, column: string, value: string) {
  const { data } = await supabase.from(table).select("*").eq(column, value);
  return data ?? [];
}

export async function exportWorld(world: World): Promise<WorldExport> {
  const [subNiches, areas, visualReferences, drops, dailyIssues, boards, researchItems, conversations] =
    await Promise.all([
      rows("wb_sub_niches", "world_id", world.id),
      rows("wb_areas", "world_id", world.id),
      rows("wb_visual_refs", "world_id", world.id),
      rows("wb_drops", "world_id", world.id),
      rows("wb_daily_items", "world_id", world.id),
      rows("wb_boards", "world_id", world.id),
      rows("wb_board_items", "world_id", world.id),
      rows("wb_conversations", "world_id", world.id),
    ]);

  const dropIds = (drops as { id: string }[]).map((d) => d.id);
  const boardIds = (boards as { id: string }[]).map((b) => b.id);
  const convoIds = (conversations as { id: string }[]).map((c) => c.id);

  const [dropItems, findings, messages] = await Promise.all([
    dropIds.length
      ? supabase.from("wb_drop_items").select("*").in("drop_id", dropIds)
      : Promise.resolve({ data: [] }),
    boardIds.length
      ? supabase.from("wb_board_findings").select("*").in("board_id", boardIds)
      : Promise.resolve({ data: [] }),
    convoIds.length
      ? supabase.from("wb_messages").select("*").in("conversation_id", convoIds)
      : Promise.resolve({ data: [] }),
  ]);

  return {
    exportedAt: new Date().toISOString(),
    world: {
      id: world.id,
      name: world.name,
      slotsPerDrop: world.slotsPerDrop,
      dropWeekday: world.dropWeekday,
      paused: world.paused,
      affinity: world.affinity,
    },
    subNiches,
    areas,
    visualReferences,
    drops,
    dropItems: dropItems.data ?? [],
    dailyIssues,
    researchBoards: boards,
    researchItems,
    findings: findings.data ?? [],
    conversations,
    messages: messages.data ?? [],
  };
}

/** Hand the file to the browser. Nothing leaves the seller's machine. */
export function downloadExport(data: WorldExport, worldName: string) {
  const safe =
    worldName.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") ||
    "my-world";
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${safe}-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/**
 * Erase the world and everything under it.
 *
 * Every table cascades from the world row, so the database goes in one
 * statement. Storage does not cascade, so the uploaded mockups, references
 * and wallpapers are removed first — deleting the rows before the files
 * would leave images with nothing pointing at them and no way to find them
 * again.
 */
export async function deleteWorldForever(world: World) {
  const [refs, boardItems, dropItems] = await Promise.all([
    supabase.from("wb_visual_refs").select("storage_path").eq("world_id", world.id),
    supabase.from("wb_board_items").select("storage_path").eq("world_id", world.id),
    supabase.from("wb_drops").select("id").eq("world_id", world.id),
  ]);

  const dropIds = (dropItems.data ?? []).map((d: { id: string }) => d.id);
  const mockups = dropIds.length
    ? await supabase.from("wb_drop_items").select("storage_path").in("drop_id", dropIds)
    : { data: [] };

  const paths = [
    ...(refs.data ?? []),
    ...(boardItems.data ?? []),
    ...(mockups.data ?? []),
  ]
    .map((r: { storage_path?: string | null }) => r.storage_path)
    .filter((p): p is string => !!p);

  // Also the wallpaper, which lives on the world rather than in a child table.
  if (world.theme?.wallpaperPath) paths.push(world.theme.wallpaperPath);

  if (paths.length) {
    // Storage removes in batches; a failure here must not strand the rows.
    for (let i = 0; i < paths.length; i += 100) {
      await supabase.storage.from(ASSET_BUCKET).remove(paths.slice(i, i + 100));
    }
  }

  const { error } = await supabase.from("wb_worlds").delete().eq("id", world.id);
  if (error) throw new Error(error.message);
}
