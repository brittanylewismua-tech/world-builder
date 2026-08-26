import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";
import { admit, endWell, meter, ownerOf } from "@/lib/guard";
import { serviceDb } from "@/lib/pinterest";

export const runtime = "nodejs";
export const maxDuration = 300;

const MODEL = process.env.WB_MODEL || "claude-sonnet-5";

/**
 * READ THE WALL.
 *
 * Every other AI surface in this app reads words. This one looks at pictures,
 * because the design is a picture and everything written about it on Etsy is
 * search engine sludge.
 *
 * It runs across the whole library at once rather than keyword by keyword. A
 * keyword's three winners tell you nothing; thirty winners from one world tell
 * you what that world is actually buying, and that is a thing no seller can
 * see by eye because they never have thirty of them side by side.
 *
 * The one thing it must never turn into is a copying machine. "Make this
 * shirt" is worthless and also how people get their shops closed. The output
 * is the move underneath the design, which is the part that is not anybody's
 * property.
 */

/** Looking at pictures is expensive. Thirty is a wide enough view to see a
 *  pattern and a narrow enough one to keep a read to a few cents. */
const LOOK_AT = 30;

const SYSTEM = `You are looking at the print-on-demand designs that already sold in one customer world, and writing the seller a short brief.

WHAT YOU ARE ACTUALLY LOOKING AT
Product photographs from Etsy. Each is a garment with artwork on it. Read the artwork: what is drawn, what is written, how it is laid out, what it is doing. Ignore the garment, the model, the background and the fold of the fabric — the seller prints on blanks and none of that is the design.

Each picture comes with numbers: total sales, sales per day since it was listed, days listed, price. Old and huge and slow is a different animal from young and fast, and you should say so when it matters.

WHAT THE BRIEF CONTAINS

1. THE MOVES. What these designs keep doing. Not the words they use — the manoeuvre underneath. "Reframes received history so the villain is the record itself" is a move. "Uses the word witch" is a word. A move should be something the seller could apply to a subject that appears nowhere on this wall. Two to four of them, strongest first.

2. WORN OUT. Where the wall is crowded — the same idea from several shops, or one idea holding so much of the sales that arriving now means arriving last. Name what is saturated and say what tells you. One to three.

3. STILL MOVING. What is alive right now rather than what banked the most money over three years. Lean on sales per day and on young listings that are already selling. One to three.

4. THE HOLE. Given the moves, what has this world not been given yet. Each one names a subject and the move to apply to it. This is the part the seller is here for, so it is the part you think hardest about. Two to four.

HOW TO WRITE IT
Every entry is a short heading and one or two plain sentences. No preamble, no summary, no restating the brief back. Cite what you saw — "four of these are portrait line-ups", "the top listing is doing seven a day at 575 days old" — because an observation with no evidence behind it is a horoscope.

NEVER
- Never tell the seller to make a copy of a design on this wall, or a version of one with the words changed. That is the one thing this must not do.
- Never write about fabric, fit, cut, colour of the blank, or mockup quality.
- Never say the sample was small, uneven, or that more data would help.
- Never hedge with "consider", "you might want to", "it could be worth". Say the thing.`;

const TOOL = {
  name: "write_brief",
  description: "The read across this world's proven designs.",
  input_schema: {
    type: "object",
    properties: {
      moves: {
        type: "array",
        description: "What these designs keep doing, strongest first.",
        items: {
          type: "object",
          properties: {
            heading: { type: "string" },
            body: { type: "string" },
          },
          required: ["heading", "body"],
        },
      },
      worn: {
        type: "array",
        description: "Where the wall is crowded.",
        items: {
          type: "object",
          properties: {
            heading: { type: "string" },
            body: { type: "string" },
          },
          required: ["heading", "body"],
        },
      },
      alive: {
        type: "array",
        description: "What is moving now rather than what banked the most.",
        items: {
          type: "object",
          properties: {
            heading: { type: "string" },
            body: { type: "string" },
          },
          required: ["heading", "body"],
        },
      },
      gaps: {
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
    required: ["moves", "worn", "alive", "gaps"],
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
 * Which thirty.
 *
 * Sorting by sales alone hands back the same three-year-old giants every time
 * and the brief never notices anything new. Half the wall is chosen by total
 * sales and half by sales per day, so the established and the fast are both
 * in front of the model — which is the same pair the seller sees featured on
 * each keyword.
 */
function pick(rows: Row[]) {
  const withArt = rows.filter((r) => r.image_url);
  const rate = (r: Row) => r.sales / Math.max(1, r.age_days);

  const bySales = [...withArt].sort((a, b) => b.sales - a.sales);
  const byRate = [...withArt].sort((a, b) => rate(b) - rate(a));

  const chosen: Row[] = [];
  const seen = new Set<string>();
  for (let i = 0; chosen.length < LOOK_AT && i < withArt.length; i++) {
    for (const list of [bySales, byRate]) {
      const r = list[i];
      if (!r || seen.has(r.listing_id) || chosen.length >= LOOK_AT) continue;
      seen.add(r.listing_id);
      chosen.push(r);
    }
  }
  return chosen;
}

export async function POST(req: Request) {
  let body: { worldId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Bad request." }, { status: 400 });
  }
  const worldId = body.worldId;
  if (!worldId)
    return NextResponse.json({ error: "No world given." }, { status: 400 });

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
    .eq("hidden", false);

  const rows = (data ?? []) as Row[];
  const chosen = pick(rows);

  if (chosen.length < 4)
    return NextResponse.json(
      {
        error:
          "There are not enough designs on the wall yet. Add a couple more exports and read it then.",
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
      text: `— ${i + 1} — filed under "${r.keyword}" · ${r.sales.toLocaleString()} sales · ${rate}/day · ${r.age_days} days listed · $${Number(r.price).toFixed(2)} · ${r.daily_views} views/day${r.design ? `\nEtsy describes it: ${r.design}` : ""}`,
    });
    content.push({
      type: "image",
      source: { type: "url", url: smaller(r.image_url as string) },
    } as Anthropic.ImageBlockParam);
  });
  content.push({
    type: "text",
    text: "Write the brief. Look at the artwork, not the shirts.",
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
      moves: list("moves"),
      worn: list("worn"),
      alive: list("alive"),
      gaps: list("gaps"),
    };

    if (!brief.moves.length && !brief.gaps.length)
      return NextResponse.json(
        { error: "That did not come back with anything. Try it again." },
        { status: 502 },
      );

    await db
      .from("wb_winner_reads")
      .insert({ world_id: worldId, brief, counted: chosen.length });

    return NextResponse.json({ brief, counted: chosen.length });
  } catch (e) {
    console.error("winners/read", e);
    return NextResponse.json(
      { error: "That did not finish. Try it again." },
      { status: 500 },
    );
  }
}
