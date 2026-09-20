import { NextResponse } from "next/server";
import { ownerOf } from "@/lib/guard";
import { ASSETS, listBoards, listPins, serviceDb, tokenFor } from "@/lib/pinterest";

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
    .select("board_id, board_name, destination, drop_id, last_pin_count")
    .eq("world_id", worldId)
    ;

  /*
    EVERY BOARD THIS WORLD IS CONNECTED TO, NOT JUST THIS DROP'S.

    This used to keep only the sources whose drop_id matched the drop on
    screen. A board connected during Drop 3 therefore vanished from the
    refresh the moment Drop 5 began — still listed as connected, contributing
    nothing, and a press of Get new pins did not even consider it. Nothing on
    the page said why, and the only way to find out was to read the database.

    A Pinterest board is chosen for the world. Whatever drop is open is where
    its new pins land.
  */
  const feeding = sources ?? [];

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

    /*
      ASK ABOUT THE BOARDS THAT MOVED, NOT ALL OF THEM.

      Every refresh used to spend one request per board feeding the drop,
      whether anything had been pinned to it or not — six boards, six requests,
      to find out that five of them were exactly as they were an hour ago.

      The board list is a SINGLE request and it carries each board's pin count.
      Comparing that against the count at the last sync says which boards are
      worth opening, so a seller who pinned four things to one board spends two
      requests instead of six.

      If the board list itself fails, nothing is skipped: every board is read
      the old way. A saving is not worth a missed pin.
    */
    const counts = new Map<string, number>();
    try {
      for (const b of await listBoards(token)) counts.set(b.id, b.pinCount);
    } catch {
      /* No list, no skipping. */
    }

    const skipped: string[] = [];

    for (const src of feeding) {
      try {
        const now = counts.get(src.board_id as string);
        const before = src.last_pin_count as number | null;
        /*
          Unchanged means nothing was added AND nothing was removed. A board
          where one pin was deleted and one added lands on the same number and
          waits until the next change — the alternative is asking about every
          board forever to catch a case that costs one refresh of delay.
        */
        if (now !== undefined && before !== null && now === before) {
          skipped.push(String(src.board_name ?? "A board"));
          continue;
        }

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
        // thing to arrive for it. Always the drop being worked on — where the
        // board was first attached is history, not a destination.
        let boardId: string | null = null;
        const target = dropId ?? (src.drop_id as string | null) ?? null;
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
          .update({
            last_synced_at: new Date().toISOString(),
            /* Only written after the pins were actually read, so a board that
               failed halfway is looked at again next time. */
            last_pin_count: counts.get(src.board_id as string) ?? null,
          })
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

    /*
      A PROBLEM THE PAGE NEVER SHOWED.

      Anything that went wrong per board was collected into `trouble` and
      returned — and the research board only ever read `imported` and `note`.
      So when Pinterest answered "the daily limit for this app has been
      reached", the seller was told "nothing new on your Pinterest boards
      since last time". The one message that explains why the button is not
      working was the one message that could not get out.

      It comes back as `note` now, which is the field the page already reads.
    */
    const note = trouble.length
      ? trouble.join(" · ")
      : imported === 0 && skipped.length === feeding.length
        ? "Nothing new on your Pinterest boards since last time."
        : undefined;

    return NextResponse.json({
      ok: true,
      imported,
      boards: feeding.length,
      checked: feeding.length - skipped.length,
      skipped: skipped.length,
      note,
      trouble: trouble.length ? trouble : undefined,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "That refresh did not finish." },
      { status: 502 },
    );
  }
}
