import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * IS THE ETSY KEY WORKING?
 *
 * The first version of this probe asked whether Etsy would serve a listing
 * page to a Vercel function. The answer was a flat 403 and a DataDome
 * challenge, which is what sent the whole importer through Etsy's Open API
 * instead.
 *
 * So the question has changed, and it is worth keeping one: the moment the
 * key lands in Vercel, somebody has to know whether it actually works before
 * a seller finds out by uploading a file. This asks Etsy for one real listing
 * and reports whether a picture came back.
 *
 * Guarded by CRON_SECRET, and it never returns the key itself.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  if (
    !process.env.CRON_SECRET ||
    url.searchParams.get("secret") !== process.env.CRON_SECRET
  )
    return NextResponse.json({ error: "Not found." }, { status: 404 });

  const key = process.env.ETSY_API_KEY;
  if (!key)
    return NextResponse.json({ configured: false, reason: "No ETSY_API_KEY." });

  // Defaults to the top "feminist shirt" listing, which is public and busy.
  const ids = url.searchParams.get("listings") ?? "1865753173";

  try {
    const res = await fetch(
      `https://openapi.etsy.com/v3/application/listings/batch?listing_ids=${encodeURIComponent(ids)}&includes=Images`,
      {
        headers: { "x-api-key": key, accept: "application/json" },
        signal: AbortSignal.timeout(25_000),
      },
    );
    const text = await res.text();

    let parsed: unknown = null;
    try {
      parsed = JSON.parse(text);
    } catch {
      /* Etsy answered with something that is not JSON; the body says what. */
    }

    const results =
      (parsed as { results?: { listing_id?: number; images?: { url_570xN?: string; alt_text?: string | null }[] }[] })
        ?.results ?? [];

    return NextResponse.json({
      configured: true,
      status: res.status,
      count: results.length,
      sample: results.slice(0, 2).map((l) => ({
        listing_id: l.listing_id,
        image: l.images?.[0]?.url_570xN ?? null,
        alt: l.images?.[0]?.alt_text ?? null,
      })),
      // Only on failure, and only the first stretch — never the key.
      body: res.ok ? undefined : text.slice(0, 400),
    });
  } catch (e) {
    return NextResponse.json(
      { configured: true, error: e instanceof Error ? e.message : "failed" },
      { status: 500 },
    );
  }
}
