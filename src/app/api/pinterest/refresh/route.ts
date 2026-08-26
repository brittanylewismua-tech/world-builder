import { NextResponse } from "next/server";
import { ownerOf } from "@/lib/guard";
import { ASSETS, listPins, serviceDb, tokenFor } from "@/lib/pinterest";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * REFRESH THE BOARDS THIS DROP ALREADY PULLS FROM.
 *
 * Bringing a board in is a one-time pull, which meant the only way to collect
 * the week's new pins was a trip to World Profile, finding each board, and
 * importing it again one at a time. The research board is where a seller
 * notices her research is stale, so the refresh belongs there.
 *
 * It only touches boards this drop has already pulled from — it does not go
 * looking for new boards. Choosing what feeds a drop stays a deliberate act;
 * this just tops up what she already chose.
 *
 * Fifty per board per press, the same as the first pull. The old twenty was a
 * Trial-access limit — a thousand requests a day shared by every seller — and
 * Standard access replaced that with a per-user ceiling, so a refresh can
 * bring back a board's worth instead of a sample. It still never runs on its
 * own; the seller presses it.
 */

const PER_BOARD = 50;

export async function POST(req: Request) {
  let body: { worldId?: string; dropId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Bad request." }, { status: 400 });
  }
  const { worldId, dropId } = body;
  if (!worldId)
    return NextResponse.json({ error: "No world given." }, { status: 400 });

  const door = await ownerOf(req, worldId);
  if ("deny" in door) return door.deny;

  const db = serviceDb();

  const { data: sources } = await db
    .from("wb_pin_sources")
    .select("board_id, board_name, destination, drop_id")
    .eq("world_id", worldId)
    .neq("destination", "calibration");

  const feeding = (sources ?? []).filter(
    (s) => !dropId || !s.drop_id || s.drop_id === dropId,
  );

  if (!feeding.length)
    return NextResponse.json({
      ok: true,
      imported: 0,
      boards: 0,
      note: "No Pinterest boards are feeding this drop yet.",
    });

  try {
    const token = await tokenFor(worldId);

    // One board's worth of trouble must not cost the seller the others.
    let imported = 0;
    const trouble: string[] = [];

    for (const src of feeding) {
      try {
        const pins = await listPins(token, src.board_id as string, PER_BOARD);
        if (!pins.length) continue;

        const { data: seen } = await db
          .from("wb_imported_pins")
          .select("pin_id")
          .eq("world_id", worldId)
          .in(
            "pin_id",
            pins.map((p) => p.id),
          );
        const already = new Set((seen ?? []).map((r) => r.pin_id as string));
        const fresh = pins.filter((p) => !already.has(p.id) && p.imageUrl);
        if (!fresh.length) continue;

        // The board this drop's research lands on, made if this is the first
        // thing to arrive for it.
        let boardId: string | null = null;
        const target = (src.drop_id as string | null) ?? dropId ?? null;
        if (!target) continue;

        const { data: existing } = await db
          .from("wb_boards")
          .select("id")
          .eq("drop_id", target)
          .maybeSingle();
        if (existing) boardId = existing.id as string;
        else {
          const { data: made } = await db
            .from("wb_boards")
            .insert({ world_id: worldId, drop_id: target })
            .select("id")
            .single();
          boardId = made?.id ?? null;
        }
        if (!boardId) continue;

        const lane = src.destination === "reference" ? ["market"] : ["visual"];

        for (const pin of fresh) {
          try {
            const res = await fetch(pin.imageUrl as string);
            if (!res.ok) throw new Error(`image ${res.status}`);
            const bytes = Buffer.from(await res.arrayBuffer());
            const path = `${door.userId}/board/${crypto.randomUUID()}.jpg`;

            const { error: upErr } = await db.storage
              .from(ASSETS)
              .upload(path, bytes, {
                contentType: "image/jpeg",
                upsert: false,
              });
            if (upErr) throw new Error(upErr.message);

            const note = [pin.title, pin.description, pin.altText]
              .map((t) => t.trim())
              .filter(Boolean)
              .join(" — ")
              .slice(0, 400);

            const { error } = await db.from("wb_board_items").insert({
              world_id: worldId,
              board_id: boardId,
              kind: "image",
              storage_path: path,
              original_name: pin.title?.slice(0, 120) || "Pin",
              source_url: pin.link,
              source_label:
                src.destination === "reference" ? "reference" : "pinterest",
              sections: lane,
              note,
            });
            if (error) throw new Error(error.message);

            await db
              .from("wb_imported_pins")
              .insert({ world_id: worldId, pin_id: pin.id });
            imported++;
          } catch {
            // One unreadable pin is not worth failing the refresh over.
          }
        }

        await db
          .from("wb_pin_sources")
          .update({ last_synced_at: new Date().toISOString() })
          .eq("world_id", worldId)
          .eq("board_id", src.board_id as string)
          .eq("destination", src.destination as string);
      } catch (e) {
        trouble.push(
          `${src.board_name ?? "A board"}: ${
            e instanceof Error ? e.message : "did not respond"
          }`,
        );
      }
    }

    return NextResponse.json({
      ok: true,
      imported,
      boards: feeding.length,
      trouble: trouble.length ? trouble : undefined,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "That refresh did not finish." },
      { status: 502 },
    );
  }
}
