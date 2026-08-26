"use client";

import { supabase } from "./supabase";
import { askAI } from "./askAI";
import type { World } from "./world";

/**
 * THE WEB.
 *
 * Etsy keywords are the spine. Everything the world contains that will never
 * be an Etsy keyword hangs off whichever one it sits nearest.
 *
 * Every found node carries an exact quote, a plain sentence saying what it is,
 * and a link to a real page. Nothing without all three is ever written, so
 * there is no such thing here as a node you cannot follow up.
 */

export interface WebNode {
  id: string;
  kind: "keyword" | "found";
  label: string;
  anchor: string | null;
  quote: string | null;
  note: string | null;
  url: string | null;
  source: string | null;
  score: number | null;
  seenOn: string | null;
  firstSeen: string;
}

function shape(r: Record<string, unknown>): WebNode {
  return {
    id: r.id as string,
    kind: r.kind as WebNode["kind"],
    label: r.label as string,
    anchor: (r.anchor as string | null) ?? null,
    quote: (r.quote as string | null) ?? null,
    note: (r.note as string | null) ?? null,
    url: (r.url as string | null) ?? null,
    source: (r.source as string | null) ?? null,
    score: (r.score as number | null) ?? null,
    seenOn: (r.seen_on as string | null) ?? null,
    firstSeen: r.first_seen as string,
  };
}

export async function loadWeb(worldId: string): Promise<WebNode[]> {
  const { data, error } = await supabase
    .from("wb_web_nodes")
    .select("id, kind, label, anchor, quote, note, url, source, score, seen_on, first_seen")
    .eq("world_id", worldId)
    .eq("hidden", false)
    .order("first_seen", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map(shape);
}

export async function lastGrown(worldId: string): Promise<string | null> {
  const { data } = await supabase
    .from("wb_web_runs")
    .select("ran_at")
    .eq("world_id", worldId)
    .order("ran_at", { ascending: false })
    .limit(1);
  return (data?.[0]?.ran_at as string) ?? null;
}

export async function hideNode(id: string) {
  await supabase.from("wb_web_nodes").update({ hidden: true }).eq("id", id);
}

export async function growWeb(world: World) {
  return askAI<{ added: number }>(
    "/api/web",
    { worldId: world.id },
    { timeoutMs: 240_000 },
  );
}

/**
 * WHERE EVERYTHING SITS.
 *
 * Not a force-directed graph. Those look impressive at twenty nodes and turn
 * into an unreadable hairball at two hundred, which is where a world lands
 * after a few months — and they also move every time you open them, so
 * nothing is ever where you left it.
 *
 * Instead the anchors are placed evenly around a circle and stay put, and
 * each anchor's finds fan out from it in rings. Positions are computed from
 * position in the list, so the map is identical every time it loads and a
 * seller can learn where things are.
 */
export interface Placed {
  node: WebNode;
  x: number;
  y: number;
  anchorX: number;
  anchorY: number;
}

export function layout(nodes: WebNode[], size: number) {
  const mid = size / 2;
  const anchors = nodes.filter((n) => n.kind === "keyword");
  const found = nodes.filter((n) => n.kind === "found");

  const ringR = Math.min(size * 0.3, 260);
  const placed: Placed[] = [];
  const at = new Map<string, { x: number; y: number }>();

  anchors.forEach((a, i) => {
    // Start at the top and go clockwise: the first keyword is always at 12.
    const angle = (i / Math.max(anchors.length, 1)) * Math.PI * 2 - Math.PI / 2;
    const x = mid + Math.cos(angle) * ringR;
    const y = mid + Math.sin(angle) * ringR;
    at.set(a.label, { x, y });
    placed.push({ node: a, x, y, anchorX: mid, anchorY: mid });
  });

  const perAnchor = new Map<string, number>();
  for (const f of found) {
    const home = f.anchor ? at.get(f.anchor) : undefined;
    if (!home) continue;
    const n = perAnchor.get(f.anchor!) ?? 0;
    perAnchor.set(f.anchor!, n + 1);

    // Fan outward from the anchor, away from the centre, in rings of six.
    const ring = Math.floor(n / 6) + 1;
    const slot = n % 6;
    const outward = Math.atan2(home.y - mid, home.x - mid);
    const spread = ((slot - 2.5) / 6) * 1.9;
    const dist = 62 + ring * 46;
    placed.push({
      node: f,
      x: home.x + Math.cos(outward + spread) * dist,
      y: home.y + Math.sin(outward + spread) * dist,
      anchorX: home.x,
      anchorY: home.y,
    });
  }

  return placed;
}
