import { NextResponse } from "next/server";
import { ownerOf } from "@/lib/guard";
import { listBoards, serviceDb, tokenFor } from "@/lib/pinterest";

export const runtime = "nodejs";

/** The seller's boards, so they can say which one feeds what. */
export async function POST(req: Request) {
  let body: { worldId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Bad request." }, { status: 400 });
  }
  if (!body.worldId)
    return NextResponse.json({ error: "No world given." }, { status: 400 });

  const door = await ownerOf(req, body.worldId);
  if ("deny" in door) return door.deny;

  const { data: account } = await serviceDb()
    .from("wb_pinterest_accounts")
    .select("world_id")
    .eq("world_id", body.worldId)
    .maybeSingle();

  if (!account) return NextResponse.json({ connected: false, boards: [] });

  try {
    const boards = await listBoards(await tokenFor(body.worldId));
    return NextResponse.json({ connected: true, boards });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Could not reach Pinterest." },
      { status: 502 },
    );
  }
}
