"use client";

import { supabase } from "./supabase";
import { askAI } from "./askAI";
import type { World } from "./world";

/**
 * WORLD SHOPS.
 *
 * Shops that have already built the world the seller is building. They find
 * one, paste its address, and the whole catalogue comes down through Etsy's
 * API — every active listing with Etsy's own view and save counts.
 *
 * That last part is what makes this different from World Winners. eRank
 * estimates sales from search data; this is measured. So the one number that
 * matters here — how many of the people who saw a design favorited it — is real,
 * and it separates a design search delivered from a design somebody wanted.
 */

/* One copy of each, shared with the routes that enforce them. */
import { ENOUGH_VIEWS, MOST_SHOPS } from "./limits";
export { ENOUGH_VIEWS, MOST_SHOPS };

export interface Shop {
  id: string;
  etsyShopId: number;
  name: string;
  url: string | null;
  listingCount: number | null;
  favorers: number | null;
  reviewCount: number | null;
  reviewAvg: number | null;
  soldCount: number | null;
  openedAt: string | null;
  refreshedAt: string;
}

export interface ShopDesign {
  listingId: number;
  title: string;
  url: string | null;
  imageUrl: string | null;
  views: number;
  favorers: number;
  price: number | null;
}

export function saveRate(d: ShopDesign) {
  return d.views >= ENOUGH_VIEWS ? d.favorers / d.views : 0;
}

export interface ShopPoint {
  heading: string;
  /** One sentence. The claim. */
  body: string;
  /** The evidence, a line each. Absent on briefs written before this. */
  points?: string[];
  /** Listing ids of designs that show the finding. */
  examples?: number[];
  quote?: string;
}

export interface ShopRead {
  kind: "patterns" | "buyers";
  patterns: ShopPoint[];
  ranAt: string;
}

export async function loadShops(worldId: string): Promise<Shop[]> {
  const { data, error } = await supabase
    .from("wb_shops")
    .select(
      "id, etsy_shop_id, shop_name, url, listing_count, favorers, review_count, review_avg, sold_count, opened_at, refreshed_at",
    )
    .eq("world_id", worldId)
    .order("added_at");
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => ({
    id: r.id as string,
    etsyShopId: Number(r.etsy_shop_id),
    name: r.shop_name as string,
    url: (r.url as string | null) ?? null,
    listingCount: r.listing_count as number | null,
    favorers: r.favorers as number | null,
    reviewCount: r.review_count as number | null,
    reviewAvg: r.review_avg as number | null,
    soldCount: r.sold_count as number | null,
    openedAt: r.opened_at as string | null,
    refreshedAt: r.refreshed_at as string,
  }));
}

export async function loadDesigns(shopId: string): Promise<ShopDesign[]> {
  const { data, error } = await supabase
    .from("wb_shop_designs")
    .select("listing_id, title, url, image_url, views, favorers, price")
    .eq("shop_id", shopId)
    .order("favorers", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => ({
    listingId: Number(r.listing_id),
    title: r.title as string,
    url: (r.url as string | null) ?? null,
    imageUrl: (r.image_url as string | null) ?? null,
    views: Number(r.views ?? 0),
    favorers: Number(r.favorers ?? 0),
    price: r.price == null ? null : Number(r.price),
  }));
}

/** The latest of each kind of read, per shop. */
export async function loadShopReads(
  worldId: string,
): Promise<Record<string, Partial<Record<"patterns" | "buyers", ShopRead>>>> {
  const { data } = await supabase
    .from("wb_shop_reads")
    .select("shop_id, kind, brief, ran_at")
    .eq("world_id", worldId)
    .order("ran_at", { ascending: false });

  const out: Record<
    string,
    Partial<Record<"patterns" | "buyers", ShopRead>>
  > = {};
  for (const row of data ?? []) {
    const shop = row.shop_id as string;
    const kind = row.kind as "patterns" | "buyers";
    out[shop] ??= {};
    if (out[shop][kind]) continue; // newest first
    out[shop][kind] = {
      kind,
      patterns:
        (row.brief as { patterns?: ShopPoint[] })?.patterns ?? [],
      ranAt: row.ran_at as string,
    };
  }
  return out;
}

export async function addShop(world: World, input: string) {
  return askAI<{ shopName: string; designs: number; withArtwork: number }>(
    "/api/shops",
    { worldId: world.id, input },
    { timeoutMs: 240_000 },
  );
}

export async function readShop(
  world: World,
  shopId: string,
  kind: "patterns" | "buyers",
) {
  return askAI<{ brief: { patterns: ShopPoint[] }; kind: string }>(
    "/api/shops/read",
    { worldId: world.id, shopId, kind },
    { timeoutMs: 240_000 },
  );
}

export async function removeShop(id: string) {
  const { error } = await supabase.from("wb_shops").delete().eq("id", id);
  if (error) throw new Error(error.message);
}
