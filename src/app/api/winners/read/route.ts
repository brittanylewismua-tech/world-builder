import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";
import { admit, endWell, meter, ownerOf } from "@/lib/guard";
import { serviceDb } from "@/lib/pinterest";

export const runtime = "nodejs";
export const maxDuration = 300;

const MODEL = process.env.WB_MODEL || "claude-sonnet-5";

/**
 * READ ONE KEYWORD'S WINNERS.
 *
 * Every other AI surface in this app reads words. This one looks at pictures,
 * because the design is a picture and everything written about it on Etsy is
 * search engine sludge.
 *
 * It runs one keyword at a time. The whole-wall version came first and was
 * dropped: a seller does not want one verdict on everything, they want to
 * stand in front of one group and ask what is going on in it — and a read
 * they aimed themselves is worth more than a broader one they did not.
 *
 * Two sections now, not four. "Worn out" is gone because nothing here is
 * being copied: these are all top sellers being read for direction, so
 * telling somebody a phrase is saturated answers a question nobody asked.
 * What the world buys and what is still moving were the same observation
 * split in half, so they are one section.
 *
 * The one thing it must never turn into is a copying machine. "Make this
 * shirt" is worthless and also how people get their shops closed. The output
 * is the move underneath the design, which is the part that is not anybody's
 * property.
 */

/** One keyword's group is capped at this on the way in, so a read is always
 *  ten pictures and always costs about the same. */
const LOOK_AT = 10;

const SYSTEM = `You are looking at the print-on-demand designs that already sold under one search term in one customer world, and writing the seller a short brief.

WHAT YOU ARE ACTUALLY LOOKING AT
Product photographs from Etsy. Each is a garment with artwork on it. Read the artwork: what is drawn, what is written, how it is laid out, what it is doing. Ignore the garment, the model, the background and the fold of the fabric — the seller prints on blanks and none of that is the design.

Each picture comes with numbers: total sales, sales per day since it was listed, days listed, price. Old and huge and slow is a different animal from young and fast, and you should say so when it matters.

THE BRIEF HAS TWO PARTS

1. PATTERNS. What these designs keep doing, and which of them are alive right now. Not the words they use — the manoeuvre underneath. "Reframes received history so the villain is the record itself" is a pattern. "Uses the word witch" is a word. Where sales per day or a young fast-selling listing tells you something, say it inside the pattern it belongs to rather than as a separate observation. Three to five, strongest first.

2. OPPORTUNITIES. Given those patterns, what this world has not been given yet. Each one names a subject and the move to apply to it. This is the part the seller is here for, so it is the part you think hardest about. Three to five.

HOW TO WRITE IT
Every entry is a short heading and one or two plain sentences. No preamble, no summary, no restating the brief back. Cite what you saw — "four of these are portrait line-ups", "the top one is doing seven a day at 575 days old" — because an observation with no evidence behind it is a horoscope.

NEVER
- Never tell the seller to make a copy of a design here, or a version of one with the words changed. That is the one thing this must not do.
- Never write about fabric, fit, cut, colour of the blank, or mockup quality.
- Never say the sample was small, uneven, or that more data would help.
- Never hedge with "consider", "you might want to", "it could be worth". Say the thing.`;

const TOOL = {
  name: "write_brief",
  description: "The read across one keyword's proven designs.",
  input_schema: {
    type: "object",
    properties: {
      patterns: {
        type: "array",
        description:
          "What these designs keep doing, and which are alive now. Strongest first.",
        items: {
          type: "object",
          properties: {
            heading: { type: "string" },
            body: { type: "string" },
          },
          required: ["heading", "body"],
        },
      },
      opportunities: {
        type: "array",
        description: "Subjects this world has not been given yet.",
        items: {
          type: "object",
          properties: {
            heading: { type: "string" },
            body: { type: "string" },
          },
          required: ["heading", "body"],
        },
      },
    },
    required: ["patterns", "opportunities"],
  },
} as const;

interface Row {
  listing_id: string;
  keyword: string;
  title: string;
  shop: string | null;
  age_days: number;
  daily_views: number;
  sales: number;
  price: number;
  image_url: string | null;
  design: string | null;
}

/**
 * Etsy serves its photographs at a fixed set of widths. The one stored is the
 * 1080, which is four times the tokens of a size that reads perfectly well —
 * and thirty of those is the difference between a few cents and a dollar.
 */
function smaller(url: string) {
  return url.replace(/il_(fullxfull|\d+x[N\d]+)\./i, "il_570xN.");
}

/**
 * Which ten.
 *
 * The group is already capped at ten on the way in, so this is usually all of
 * it. The sort still matters for the rare group that predates the cap: by
 * sales, because within a single search term the biggest sellers are the ones
 * the seller is standing there asking about.
 */
function pick(rows: Row[]) {
  return rows
    .filter((r) => r.image_url)
    .sort((a, b) => b.sales - a.sales)
    .slice(0, LOOK_AT);
}

export async function POST(req: Request) {
  let body: { worldId?: string; keyword?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Bad request." }, { status: 400 });
  }
  const worldId = body.worldId;
  const keyword = body.keyword?.trim();
  if (!worldId)
    return NextResponse.json({ error: "No world given." }, { status: 400 });
  if (!keyword)
    return NextResponse.json({ error: "No keyword given." }, { status: 400 });

  const door = await ownerOf(req, worldId);
  if ("deny" in door) return door.deny;

  const gate = await admit(req, "winners");
  if ("deny" in gate) return gate.deny;

  if (!process.env.ANTHROPIC_API_KEY)
    return NextResponse.json(
      { error: "This deployment is missing its ANTHROPIC_API_KEY." },
      { status: 503 },
    );

  const db = serviceDb();
  const { data } = await db
    .from("wb_winners")
    .select(
      "listing_id, keyword, title, shop, age_days, daily_views, sales, price, image_url, design",
    )
    .eq("world_id", worldId)
    .eq("keyword", keyword)
    .eq("hidden", false);

  const rows = (data ?? []) as Row[];
  const chosen = pick(rows);

  if (chosen.length < 3)
    return NextResponse.json(
      {
        error:
          "There are not enough designs under this keyword to find a pattern in.",
      },
      { status: 400 },
    );

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const started = Date.now();

  const content: Anthropic.ContentBlockParam[] = [];
  chosen.forEach((r, i) => {
    const rate = (r.sales / Math.max(1, r.age_days)).toFixed(1);
    content.push({
      type: "text",
      text: `— ${i + 1} — ${r.sales.toLocaleString()} sales · ${rate}/day · ${r.age_days} days listed · $${Number(r.price).toFixed(2)} · ${r.daily_views} views/day${r.design ? `\nEtsy describes it: ${r.design}` : ""}`,
    });
    content.push({
      type: "image",
      source: { type: "url", url: smaller(r.image_url as string) },
    } as Anthropic.ImageBlockParam);
  });
  content.push({
    type: "text",
    text: `Write the brief. Every one of these is winning the search "${keyword}", so this is one corner of the seller's world rather than all of it. Look at the artwork, not the shirts.`,
  });

  try {
    const res = await client.messages.create({
      model: MODEL,
      max_tokens: 3000,
      system: [
        {
          type: "text",
          text: SYSTEM,
          cache_control: { type: "ephemeral", ttl: "1h" },
        } as unknown as Anthropic.TextBlockParam,
      ],
      tools: [TOOL as unknown as Anthropic.Tool],
      tool_choice: { type: "tool", name: "write_brief" },
      messages: [{ role: "user", content }],
    });

    meter("winners", door.userId, {
      model: MODEL,
      input_tokens: res.usage.input_tokens,
      output_tokens: res.usage.output_tokens,
      cache_read_input_tokens: res.usage.cache_read_input_tokens,
      cache_creation_input_tokens: res.usage.cache_creation_input_tokens,
      ms: Date.now() - started,
      worldId,
    });

    const call = res.content.find((b) => b.type === "tool_use");
    if (!call || call.type !== "tool_use")
      return NextResponse.json(
        { error: "That did not come back with anything. Try it again." },
        { status: 502 },
      );

    const raw = call.input as Record<string, unknown>;
    const list = (k: string) =>
      (Array.isArray(raw[k]) ? (raw[k] as Record<string, string>[]) : [])
        .filter((p) => p?.heading && p?.body)
        .map((p) => ({
          heading: String(p.heading).trim(),
          // A tool call can be cut off mid sentence like any other reply.
          body: endWell(String(p.body).trim(), res.stop_reason),
        }));

    const brief = {
      patterns: list("patterns"),
      opportunities: list("opportunities"),
    };

    if (!brief.patterns.length && !brief.opportunities.length)
      return NextResponse.json(
        { error: "That did not come back with anything. Try it again." },
        { status: 502 },
      );

    await db
      .from("wb_winner_reads")
      .insert({ world_id: worldId, keyword, brief, counted: chosen.length });

    return NextResponse.json({ brief, counted: chosen.length, keyword });
  } catch (e) {
    console.error("winners/read", e);
    return NextResponse.json(
      { error: "That did not finish. Try it again." },
      { status: 500 },
    );
  }
}
