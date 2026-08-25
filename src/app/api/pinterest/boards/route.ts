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

    /*
      Which boards this world has already pulled from, and when.
      
      This lived only in component state, so a refresh wiped it and every
      board looked untouched — a seller could not tell what she had already
      brought in without importing it again and reading "nothing new". The
      record was always in wb_pin_sources; it just was not being read back.
    */
    const { data: pulls } = await serviceDb()
      .from("wb_pin_sources")
      .select("board_id, destination, last_synced_at, imported_count")
      .eq("world_id", body.worldId);

    const history = new Map<
      string,
      { at: string; count: number; destination: string }
    >();
    for (const r of pulls ?? []) {
      const id = r.board_id as string;
      const at = r.last_synced_at as string;
      const seen = history.get(id);
      // A board can be pulled to more than one place; show the most recent.
      if (!seen || at > seen.at)
        history.set(id, {
          at,
          count: Number(r.imported_count ?? 0),
          destination: String(r.destination ?? ""),
        });
    }

    return NextResponse.json({
      connected: true,
      boards: boards.map((b) => ({ ...b, pulled: history.get(b.id) ?? null })),
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Could not reach Pinterest." },
      { status: 502 },
    );
  }
}
