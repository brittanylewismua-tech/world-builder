import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * CAN THIS DEPLOYMENT SEE AN ETSY LISTING AT ALL?
 *
 * The whole wall rests on one unverified assumption: that Etsy will serve a
 * product page to a Vercel function. Etsy is aggressive about scrapers, and a
 * data-centre IP with a browser user agent is exactly the shape it blocks.
 * If it does not, every design arrives without a picture and the feature is
 * an empty grid.
 *
 * That is not a thing to discover by asking Brittany to upload a file and
 * watch it fail. This runs the fetch and reports what came back — status,
 * page size, and whether the two things the importer needs were found.
 *
 * Guarded by CRON_SECRET. Deleted as soon as it has answered.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  if (
    !process.env.CRON_SECRET ||
    url.searchParams.get("secret") !== process.env.CRON_SECRET
  )
    return NextResponse.json({ error: "Not found." }, { status: 404 });

  const id = url.searchParams.get("listing") ?? "1865753173";

  try {
    const res = await fetch(`https://www.etsy.com/listing/${id}`, {
      headers: {
        "user-agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
        accept: "text/html,application/xhtml+xml",
        "accept-language": "en-US,en;q=0.9",
      },
      signal: AbortSignal.timeout(15_000),
    });
    const html = await res.text();

    const image =
      html.match(
        /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i,
      )?.[1] ??
      html.match(
        /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i,
      )?.[1] ??
      null;

    const design =
      html.match(/alt=["']May include:\s*([^"']{10,600})["']/i)?.[1] ?? null;

    return NextResponse.json({
      status: res.status,
      bytes: html.length,
      image,
      design,
      // If both are null, seeing how the page opens says whether it was a
      // block page, a challenge, or simply different markup.
      head: image || design ? undefined : html.slice(0, 700),
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "failed" },
      { status: 500 },
    );
  }
}
