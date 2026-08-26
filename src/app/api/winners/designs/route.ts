import { NextResponse } from "next/server";
import { ownerOf } from "@/lib/guard";
import { serviceDb } from "@/lib/pinterest";
import { zip, type ZipEntry } from "@/lib/zip";

export const runtime = "nodejs";
export const maxDuration = 120;

/**
 * THE DESIGNS, AS FILES.
 *
 * Goldie can look at pictures you upload to it, and a list of image links is
 * no use for that — a browser will not save a cross-origin image with a
 * download link, and Etsy's CDN will not hand the bytes to a page on another
 * domain either. Both roads end at the same wall.
 *
 * So the server fetches them, which it may, and hands back one archive to
 * drag straight in. Named by rank and sales so they arrive in a sensible
 * order and each one says what it is.
 */

/** Only ever Etsy's image CDN. Without this the route is an open proxy that
 *  will fetch anything anybody names. */
const ALLOWED = /^https:\/\/i\.etsystatic\.com\//;

/** Full size for the archive — these are going somewhere to be looked at
 *  properly, not counted as tokens. */
function biggest(url: string) {
  return url.replace(/il_(\d+x[N\d]+)\./i, "il_fullxfull.");
}

function safe(s: string) {
  return s
    .replace(/[^a-z0-9 _-]/gi, "")
    .trim()
    .slice(0, 60);
}

export async function POST(req: Request) {
  let body: { worldId?: string; keyword?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Bad request." }, { status: 400 });
  }
  const { worldId, keyword } = body;
  if (!worldId || !keyword)
    return NextResponse.json({ error: "Bad request." }, { status: 400 });

  const door = await ownerOf(req, worldId);
  if ("deny" in door) return door.deny;

  const db = serviceDb();
  const { data } = await db
    .from("wb_winners")
    .select("shop, sales, image_url")
    .eq("world_id", worldId)
    .eq("keyword", keyword)
    .eq("hidden", false)
    .order("sales", { ascending: false });

  const rows = (data ?? []).filter(
    (r) => r.image_url && ALLOWED.test(r.image_url as string),
  );

  if (!rows.length)
    return NextResponse.json(
      { error: "There are no design images under this keyword yet." },
      { status: 400 },
    );

  const files = await Promise.all(
    rows.map(async (r, i): Promise<ZipEntry | null> => {
      try {
        const res = await fetch(biggest(r.image_url as string), {
          signal: AbortSignal.timeout(20_000),
        });
        if (!res.ok) return null;
        const bytes = new Uint8Array(await res.arrayBuffer());
        const rank = String(i + 1).padStart(2, "0");
        return {
          name: `${rank} - ${r.sales} sales - ${safe((r.shop as string) ?? "shop")}.jpg`,
          bytes,
        };
      } catch {
        // One photograph that will not come down is not worth losing the
        // other nine over.
        return null;
      }
    }),
  );

  const got = files.filter((f): f is ZipEntry => f !== null);
  if (!got.length)
    return NextResponse.json(
      { error: "None of the images could be fetched. Try again in a moment." },
      { status: 502 },
    );

  const archive = zip(got);
  return new Response(new Uint8Array(archive), {
    headers: {
      "content-type": "application/zip",
      "content-disposition": `attachment; filename="${safe(keyword) || "designs"} designs.zip"`,
      "cache-control": "no-store",
    },
  });
}
