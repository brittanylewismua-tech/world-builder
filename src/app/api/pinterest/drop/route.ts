import { NextResponse } from "next/server";
import { ownerOf } from "@/lib/guard";
import { serviceDb } from "@/lib/pinterest";

export const runtime = "nodejs";

/**
 * STOP PULLING FROM A BOARD.
 *
 * Choosing a board was a one-way door: once it fed a world there was no way
 * to make it stop, short of disconnecting Pinterest entirely. A board picked
 * by mistake, or one that has stopped being what the world is about, sat
 * there feeding every refresh forever.
 *
 * WHAT THIS DOES NOT DO. It does not delete the pins already brought in.
 * Those are research the seller has collected, sorted and possibly built a
 * drop around — they belong to the board in the app now, not to Pinterest.
 * Unfollowing a source and throwing away the work are two different
 * intentions, and only one of them was asked for.
 *
 * Nothing on Pinterest is touched. This app has never had write access.
 */
export async function POST(req: Request) {
  let body: { worldId?: string; boardId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Bad request." }, { status: 400 });
  }

  const { worldId, boardId } = body;
  if (!worldId || !boardId)
    return NextResponse.json({ error: "Bad request." }, { status: 400 });

  const door = await ownerOf(req, worldId);
  if ("deny" in door) return door.deny;

  const { error } = await serviceDb()
    .from("wb_pin_sources")
    .delete()
    .eq("world_id", worldId)
    .eq("board_id", boardId);

  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
