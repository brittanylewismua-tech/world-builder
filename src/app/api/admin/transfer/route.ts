import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 120;

/**
 * MOVING A WORLD TO ANOTHER ACCOUNT
 *
 * The case this exists for: somebody built a world in an anonymous session,
 * lost that session, and already has a permanent account. The world is intact
 * but belongs to a user nobody can sign in as.
 *
 * Reassigning the world row alone is not enough and is the trap here. Storage
 * access is granted by path — the policy checks that the first folder of the
 * object name equals the caller's user id — so every uploaded banner, design
 * reference and mockup would still sit under the old id and quietly 403. A
 * world that loads with all its images broken is barely a rescue.
 *
 * So this moves the files too, and rewrites every path that points at them,
 * before handing over ownership. Files first: if a move fails we stop with the
 * world still owned by the original account and nothing half-done.
 *
 * Support tool. Guarded by the deployment secret, never linked from the app.
 */

const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  "https://ywncfltxrnrchicjwcse.supabase.co";
const BUCKET = "world-assets";

export async function POST(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`)
    return NextResponse.json({ error: "Not for you." }, { status: 401 });

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey)
    return NextResponse.json(
      { error: "SUPABASE_SERVICE_ROLE_KEY is not set." },
      { status: 503 },
    );

  let body: { worldId?: string; toUserId?: string; dryRun?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Bad request." }, { status: 400 });
  }

  const { worldId, toUserId, dryRun = false } = body;
  if (!worldId || !toUserId)
    return NextResponse.json(
      { error: "worldId and toUserId are required." },
      { status: 400 },
    );

  const db = createClient(SUPABASE_URL, serviceKey, {
    auth: { persistSession: false },
  });

  const { data: world, error: worldError } = await db
    .from("wb_worlds")
    .select("id, name, user_id, shop_banner, wallpaper_path")
    .eq("id", worldId)
    .single();
  if (worldError || !world)
    return NextResponse.json(
      { error: worldError?.message ?? "No such world." },
      { status: 404 },
    );

  const from = world.user_id as string;
  if (from === toUserId)
    return NextResponse.json(
      { error: "That world already belongs to that account." },
      { status: 409 },
    );

  const { data: target } = await db.auth.admin.getUserById(toUserId);
  if (!target?.user)
    return NextResponse.json(
      { error: "The destination account does not exist." },
      { status: 404 },
    );

  /* -------------------------------------------------- gather every file */

  const [{ data: refs }, { data: drops }] = await Promise.all([
    db.from("wb_visual_refs").select("id, storage_path").eq("world_id", worldId),
    db.from("wb_drops").select("id").eq("world_id", worldId),
  ]);

  const dropIds = (drops ?? []).map((d) => d.id as string);
  const { data: mockups } = dropIds.length
    ? await db
        .from("wb_drop_items")
        .select("id, storage_path")
        .in("drop_id", dropIds)
    : { data: [] as { id: string; storage_path: string }[] };

  const rename = (p: string | null) =>
    p && p.startsWith(`${from}/`) ? `${toUserId}/${p.slice(from.length + 1)}` : null;

  const moves: { table: string; id: string; column: string; from: string; to: string }[] = [];

  const banner = rename(world.shop_banner as string | null);
  if (banner)
    moves.push({ table: "wb_worlds", id: worldId, column: "shop_banner", from: world.shop_banner as string, to: banner });

  const wallpaper = rename(world.wallpaper_path as string | null);
  if (wallpaper)
    moves.push({ table: "wb_worlds", id: worldId, column: "wallpaper_path", from: world.wallpaper_path as string, to: wallpaper });

  for (const r of refs ?? []) {
    const to = rename(r.storage_path as string);
    if (to)
      moves.push({ table: "wb_visual_refs", id: r.id as string, column: "storage_path", from: r.storage_path as string, to });
  }

  for (const m of mockups ?? []) {
    const to = rename(m.storage_path as string);
    if (to)
      moves.push({ table: "wb_drop_items", id: m.id as string, column: "storage_path", from: m.storage_path as string, to });
  }

  if (dryRun)
    return NextResponse.json({
      ok: true,
      dryRun: true,
      world: world.name,
      from,
      to: toUserId,
      files: moves.length,
      paths: moves.map((m) => `${m.from} → ${m.to}`),
    });

  /* ------------------------------------------- move the files, then own it */

  const moved: string[] = [];
  for (const m of moves) {
    const { error } = await db.storage.from(BUCKET).move(m.from, m.to);
    // An object already at the destination is fine — a retry of this same job.
    if (error && !/exists|duplicate/i.test(error.message))
      return NextResponse.json(
        {
          error: `Stopped before changing ownership. Could not move ${m.from}: ${error.message}`,
          movedSoFar: moved,
        },
        { status: 500 },
      );
    moved.push(m.to);
    await db.from(m.table).update({ [m.column]: m.to }).eq("id", m.id);
  }

  const { error: handover } = await db
    .from("wb_worlds")
    .update({ user_id: toUserId })
    .eq("id", worldId);
  if (handover)
    return NextResponse.json(
      { error: `Files moved but ownership did not change: ${handover.message}` },
      { status: 500 },
    );

  return NextResponse.json({
    ok: true,
    world: world.name,
    from,
    to: toUserId,
    filesMoved: moved.length,
    note: "Sign in as the destination account to find it, with every image intact.",
  });
}
