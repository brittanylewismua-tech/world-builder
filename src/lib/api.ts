"use client";

import { supabase, ASSET_BUCKET } from "./supabase";
import { DEFAULT_THEME, type RailStyle, type Theme, type WallpaperKind } from "./theme";
import {
  EMPTY_AFFINITY,
  type Affinity,
  type World,
  type VisualReference,
} from "./world";

const SIGNED_TTL = 60 * 60; // one hour is plenty for a session

/* ------------------------------------------------------------------ */
/* images                                                              */
/* ------------------------------------------------------------------ */

/** Downscale before upload. These are creative context, not print assets. */
export function downscale(file: File, max = 1200): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Could not read that file."));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("Could not open that image."));
      img.onload = () => {
        const scale = Math.min(1, max / Math.max(img.width, img.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        const ctx = canvas.getContext("2d");
        if (!ctx) return reject(new Error("Canvas unavailable."));
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        canvas.toBlob(
          (b) => (b ? resolve(b) : reject(new Error("Could not encode image."))),
          "image/jpeg",
          0.85,
        );
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });
}

export async function uploadAsset(file: File, folder: string): Promise<string> {
  const { data: auth } = await supabase.auth.getUser();
  const uid = auth.user?.id;
  if (!uid) throw new Error("Not signed in.");
  const blob = await downscale(file, folder === "wallpaper" ? 2200 : 1200);
  // Storage policies key off the first path segment being the user id.
  const path = `${uid}/${folder}/${crypto.randomUUID()}.jpg`;
  const { error } = await supabase.storage
    .from(ASSET_BUCKET)
    .upload(path, blob, { contentType: "image/jpeg", upsert: false });
  if (error) throw new Error(error.message);
  return path;
}

async function sign(path: string | null): Promise<string | null> {
  if (!path) return null;
  const { data } = await supabase.storage
    .from(ASSET_BUCKET)
    .createSignedUrl(path, SIGNED_TTL);
  return data?.signedUrl ?? null;
}

async function signMany(paths: string[]): Promise<Record<string, string>> {
  if (!paths.length) return {};
  const { data } = await supabase.storage
    .from(ASSET_BUCKET)
    .createSignedUrls(paths, SIGNED_TTL);
  const out: Record<string, string> = {};
  for (const row of data ?? []) {
    if (row.path && row.signedUrl) out[row.path] = row.signedUrl;
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* world                                                               */
/* ------------------------------------------------------------------ */

interface WorldRow {
  id: string;
  name: string;
  established: boolean;
  affinity: Partial<Affinity> | null;
  shop_banner: string | null;
  board_background: string;
  slots_per_drop: number;
  drop_weekday: number;
  paused: boolean;
  theme_preset: string;
  theme_accent: string;
  theme_rail: RailStyle;
  wallpaper_kind: WallpaperKind;
  wallpaper_path: string | null;
  wallpaper_opacity: number;
  wallpaper_accent: string | null;
}

/** The seller's world, or null if they have not created one yet. */
export async function loadWorld(): Promise<World | null> {
  const { data: rows, error } = await supabase
    .from("wb_worlds")
    .select(
      "id, name, established, affinity, shop_banner, board_background, slots_per_drop, drop_weekday, paused, theme_preset, theme_accent, theme_rail, wallpaper_kind, wallpaper_path, wallpaper_opacity, wallpaper_accent",
    )
    .order("created_at", { ascending: true })
    .limit(1);
  if (error) throw new Error(error.message);
  const row = rows?.[0] as WorldRow | undefined;
  if (!row) return null;

  const [{ data: niches }, { data: areas }, { data: refs }] = await Promise.all([
    supabase
      .from("wb_sub_niches")
      .select("id, keyword, note")
      .eq("world_id", row.id)
      .order("created_at"),
    supabase
      .from("wb_areas")
      .select("id, name")
      .eq("world_id", row.id)
      .order("created_at"),
    supabase
      .from("wb_visual_refs")
      .select("id, storage_path")
      .eq("world_id", row.id)
      .order("created_at"),
  ]);

  const refRows = (refs ?? []) as { id: string; storage_path: string }[];
  const signed = await signMany(refRows.map((r) => r.storage_path));

  return {
    id: row.id,
    name: row.name,
    established: row.established,
    affinity: { ...EMPTY_AFFINITY, ...(row.affinity ?? {}) },
    shopBannerPath: row.shop_banner,
    shopBannerSrc: await sign(row.shop_banner),
    boardBackground: row.board_background,
    slotsPerDrop: row.slots_per_drop,
    dropWeekday: row.drop_weekday,
    paused: row.paused,
    theme: {
      preset: row.theme_preset ?? DEFAULT_THEME.preset,
      accent: row.theme_accent ?? DEFAULT_THEME.accent,
      rail: row.theme_rail ?? DEFAULT_THEME.rail,
      wallpaperKind: row.wallpaper_kind ?? DEFAULT_THEME.wallpaperKind,
      wallpaperPath: row.wallpaper_path,
      wallpaperSrc: await sign(row.wallpaper_path),
      wallpaperOpacity: row.wallpaper_opacity ?? DEFAULT_THEME.wallpaperOpacity,
      wallpaperAccent: row.wallpaper_accent,
    },
    subNiches: (niches ?? []) as World["subNiches"],
    areas: (areas ?? []) as World["areas"],
    visualReferences: refRows.map((r) => ({
      id: r.id,
      path: r.storage_path,
      src: signed[r.storage_path] ?? "",
    })),
  };
}

export async function createWorld(): Promise<World> {
  const { data: auth } = await supabase.auth.getUser();
  const uid = auth.user?.id;
  if (!uid) throw new Error("Not signed in.");
  const { error } = await supabase.from("wb_worlds").insert({ user_id: uid });
  if (error) throw new Error(error.message);
  const w = await loadWorld();
  if (!w) throw new Error("World was created but could not be read back.");
  return w;
}

type WorldPatch = Partial<{
  theme: Theme;
  name: string;
  established: boolean;
  affinity: Affinity;
  boardBackground: string;
  slotsPerDrop: number;
  dropWeekday: number;
  paused: boolean;
}>;

export async function saveWorld(id: string, patch: WorldPatch) {
  const row: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.name !== undefined) row.name = patch.name;
  if (patch.established !== undefined) row.established = patch.established;
  if (patch.affinity !== undefined) row.affinity = patch.affinity;
  if (patch.boardBackground !== undefined)
    row.board_background = patch.boardBackground;
  if (patch.slotsPerDrop !== undefined) row.slots_per_drop = patch.slotsPerDrop;
  if (patch.dropWeekday !== undefined) row.drop_weekday = patch.dropWeekday;
  if (patch.paused !== undefined) row.paused = patch.paused;
  if (patch.theme !== undefined) {
    row.theme_preset = patch.theme.preset;
    row.theme_accent = patch.theme.accent;
    row.theme_rail = patch.theme.rail;
    row.wallpaper_kind = patch.theme.wallpaperKind;
    row.wallpaper_path = patch.theme.wallpaperPath;
    row.wallpaper_opacity = patch.theme.wallpaperOpacity;
    row.wallpaper_accent = patch.theme.wallpaperAccent;
  }
  const { error } = await supabase.from("wb_worlds").update(row).eq("id", id);
  if (error) throw new Error(error.message);
}

/* --------------------------------- W ------------------------------- */

export async function addSubNiche(worldId: string, keyword: string) {
  const { data, error } = await supabase
    .from("wb_sub_niches")
    .insert({ world_id: worldId, keyword })
    .select("id, keyword, note")
    .single();
  if (error) throw new Error(error.message);
  return data as World["subNiches"][number];
}

/** Bulk add, so a paste from eRank is one round trip rather than thirty. */
export async function addSubNiches(worldId: string, keywords: string[]) {
  if (!keywords.length) return [];
  const { data, error } = await supabase
    .from("wb_sub_niches")
    .insert(keywords.map((keyword) => ({ world_id: worldId, keyword })))
    .select("id, keyword, note");
  if (error) throw new Error(error.message);
  return (data ?? []) as World["subNiches"];
}

export async function removeSubNiche(id: string) {
  const { error } = await supabase.from("wb_sub_niches").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

/* --------------------------------- L ------------------------------- */

export async function addArea(worldId: string, name: string) {
  const { data, error } = await supabase
    .from("wb_areas")
    .insert({ world_id: worldId, name })
    .select("id, name")
    .single();
  if (error) throw new Error(error.message);
  return data as World["areas"][number];
}

export async function removeArea(id: string) {
  const { error } = await supabase.from("wb_areas").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

/* --------------------------------- R ------------------------------- */

export async function addVisualReference(
  worldId: string,
  file: File,
): Promise<VisualReference> {
  const path = await uploadAsset(file, "calibration");
  const { data, error } = await supabase
    .from("wb_visual_refs")
    .insert({ world_id: worldId, storage_path: path })
    .select("id, storage_path")
    .single();
  if (error) throw new Error(error.message);
  return {
    id: data.id as string,
    path,
    src: (await sign(path)) ?? "",
  };
}

export async function removeVisualReference(ref: VisualReference) {
  const { error } = await supabase
    .from("wb_visual_refs")
    .delete()
    .eq("id", ref.id);
  if (error) throw new Error(error.message);
  await supabase.storage.from(ASSET_BUCKET).remove([ref.path]);
}

/* ------------------------------- banner ----------------------------- */

export async function setShopBanner(worldId: string, file: File) {
  const path = await uploadAsset(file, "banner");
  const { error } = await supabase
    .from("wb_worlds")
    .update({ shop_banner: path })
    .eq("id", worldId);
  if (error) throw new Error(error.message);
  return { path, src: (await sign(path)) ?? "" };
}


/** Upload a wallpaper. Wide and generous, but still downscaled and capped. */
export async function setWallpaper(file: File) {
  const path = await uploadAsset(file, "wallpaper");
  return { path, src: (await sign(path)) ?? "" };
}
