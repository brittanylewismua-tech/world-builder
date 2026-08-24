import { NextResponse } from "next/server";
import { ownerOf } from "@/lib/guard";
import { ASSETS, listPins, serviceDb, tokenFor } from "@/lib/pinterest";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * BRINGING A BOARD IN.
 *
 * A pin is an image plus the words somebody attached to it, which is exactly
 * the shape of everything this product already holds. So a board becomes:
 *
 *   calibration — this is my eye. Lands in Visual Calibration.
 *   research    — this is for the drop I am building next. Lands on its board.
 *   reference   — this is what shops in my world look like. Lands on the
 *                 board too, but marked as reference rather than as the
 *                 seller's own direction, because the difference matters when
 *                 the AI reads it back.
 *
 * Imported once, ever. Someone who keeps pinning to the same board and syncs
 * again should get what is new, not a second copy of everything.
 *
 * The image is copied into this product's own storage rather than hot-linked.
 * Pinterest's CDN URLs are not promised to last, and a world whose references
 * quietly turn into broken images in a year is worse than no import at all.
 */

const MAX_PINS = 40;

export async function POST(req: Request) {
  let body: {
    worldId?: string;
    boardId?: string;
    boardName?: string;
    destination?: "calibration" | "research" | "reference";
    dropId?: string | null;
    /*
      Which lane the whole board lands in. Sellers already keep thematic
      boards — "quotes I love", "layouts", "colour" — so the honest place to
      ask why something was saved is at the board, once, rather than at every
      pin afterwards. Omitted means unfiled, and she sorts on the page.
    */
    lane?: string | null;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Bad request." }, { status: 400 });
  }

  const { worldId, boardId, boardName, destination } = body;
  if (!worldId || !boardId || !destination)
    return NextResponse.json({ error: "Missing details." }, { status: 400 });

  const door = await ownerOf(req, worldId);
  if ("deny" in door) return door.deny;

  const db = serviceDb();

  try {
    const pins = await listPins(await tokenFor(worldId), boardId, MAX_PINS);

    // Skip anything this world already took from Pinterest.
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

    if (!fresh.length)
      return NextResponse.json({
        ok: true,
        imported: 0,
        note: "Nothing new on that board since last time.",
      });

    /*
      Research and reference pins need a board to land on, and that board
      belongs to a drop. Created here if this is the first thing to arrive.
    */
    let targetBoard: string | null = null;
    if (destination !== "calibration") {
      if (!body.dropId)
        return NextResponse.json(
          { error: "No drop to attach that board to." },
          { status: 400 },
        );
      const { data: existing } = await db
        .from("wb_boards")
        .select("id")
        .eq("drop_id", body.dropId)
        .maybeSingle();
      if (existing) targetBoard = existing.id as string;
      else {
        const { data: made, error } = await db
          .from("wb_boards")
          .insert({ world_id: worldId, drop_id: body.dropId })
          .select("id")
          .single();
        if (error) throw new Error(error.message);
        targetBoard = made.id as string;
      }
    }

    // Where in storage. The first path segment must be the owner's user id,
    // because that is what the storage policies key off.
    const folder = destination === "calibration" ? "calibration" : "board";

    let imported = 0;
    const failures: string[] = [];

    for (const pin of fresh) {
      try {
        const res = await fetch(pin.imageUrl as string);
        if (!res.ok) throw new Error(`image ${res.status}`);
        const bytes = Buffer.from(await res.arrayBuffer());
        const path = `${door.userId}/${folder}/${crypto.randomUUID()}.jpg`;

        const { error: upErr } = await db.storage
          .from(ASSETS)
          .upload(path, bytes, { contentType: "image/jpeg", upsert: false });
        if (upErr) throw new Error(upErr.message);

        if (destination === "calibration") {
          const { count } = await db
            .from("wb_visual_refs")
            .select("id", { count: "exact", head: true })
            .eq("world_id", worldId);
          const { error } = await db.from("wb_visual_refs").insert({
            world_id: worldId,
            storage_path: path,
            position: count ?? 0,
          });
          if (error) throw new Error(error.message);
        } else {
          // The seller's own words about the pin are worth more than the
          // title Pinterest scraped off the source page.
          const lane =
            typeof body.lane === "string" &&
            ["structure", "color", "language", "visual"].includes(body.lane)
              ? [body.lane]
              : [];
          const note = [pin.title, pin.description, pin.altText]
            .map((t) => t.trim())
            .filter(Boolean)
            .join(" — ")
            .slice(0, 400);
          const { error } = await db.from("wb_board_items").insert({
            world_id: worldId,
            board_id: targetBoard,
            kind: "image",
            storage_path: path,
            original_name: pin.title?.slice(0, 120) || "Pin",
            source_url: pin.link,
            source_label: destination === "reference" ? "reference" : "pinterest",
            sections: lane,
            note,
          });
          if (error) throw new Error(error.message);
        }

        await db
          .from("wb_imported_pins")
          .insert({ world_id: worldId, pin_id: pin.id });
        imported++;
      } catch (e) {
        // One bad pin must not cost the seller the other thirty-nine.
        failures.push(e instanceof Error ? e.message : "failed");
      }
    }

    await db.from("wb_pin_sources").upsert(
      {
        world_id: worldId,
        board_id: boardId,
        board_name: boardName ?? "Board",
        destination,
        drop_id: body.dropId ?? null,
        last_synced_at: new Date().toISOString(),
        imported_count: imported,
      },
      { onConflict: "world_id,board_id,destination,drop_id" },
    );

    return NextResponse.json({
      ok: true,
      imported,
      skipped: pins.length - fresh.length,
      failed: failures.length,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "That import did not finish." },
      { status: 502 },
    );
  }
}
