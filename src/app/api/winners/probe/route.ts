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

  const key = process.env.ETSY_API_KEY?.trim();
  const secret = process.env.ETSY_SHARED_SECRET?.trim();
  if (!key)
    return NextResponse.json({ configured: false, reason: "No ETSY_API_KEY." });

  // Defaults to the top "feminist shirt" listing, which is public and busy.
  const ids = url.searchParams.get("listings") ?? "1865753173";

  /*
    Etsy's own error message names two possible faults — an inactive key, or
    the wrong shared secret — so try both shapes and report which one it
    accepts. That distinguishes "the secret is needed" from "the key was
    pasted wrong", which no single attempt can.
  */
  const shapes: [string, string][] = [["keystring", key]];
  if (secret) shapes.push(["keystring:secret", `${key}:${secret}`]);

  const tried: Record<string, unknown>[] = [];

  for (const [name, value] of shapes) {
    try {
      const res = await fetch(
        `https://openapi.etsy.com/v3/application/listings/batch?listing_ids=${encodeURIComponent(ids)}&includes=Images`,
        {
          headers: { "x-api-key": value, accept: "application/json" },
          signal: AbortSignal.timeout(25_000),
        },
      );
      const text = await res.text();

      let parsed: unknown = null;
      try {
        parsed = JSON.parse(text);
      } catch {
        /* Not JSON; the body below says what it was instead. */
      }

      const results =
        (
          parsed as {
            results?: {
              listing_id?: number;
              images?: { url_570xN?: string; alt_text?: string | null }[];
            }[];
          }
        )?.results ?? [];

      if (res.ok && results.length)
        return NextResponse.json({
          configured: true,
          works: name,
          count: results.length,
          sample: results.slice(0, 2).map((l) => ({
            listing_id: l.listing_id,
            image: l.images?.[0]?.url_570xN ?? null,
            alt: l.images?.[0]?.alt_text ?? null,
          })),
        });

      // Only ever the shape's name and Etsy's own words. Never the key.
      tried.push({ shape: name, status: res.status, body: text.slice(0, 200) });
    } catch (e) {
      tried.push({
        shape: name,
        error: e instanceof Error ? e.message : "failed",
      });
    }
  }

  return NextResponse.json(
    {
      configured: true,
      works: null,
      haveSecret: !!secret,
      keyLength: key.length,
      tried,
    },
    { status: 502 },
  );
}
