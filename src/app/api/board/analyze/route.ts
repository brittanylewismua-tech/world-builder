import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";
import { admit } from "@/lib/guard";

export const runtime = "nodejs";
export const maxDuration = 90;

const MODEL = process.env.WB_MODEL || "claude-sonnet-5";

/**
 * READING ONE PIECE OF RESEARCH
 *
 * Runs once, when something lands on the board, and the result is stored on
 * the row forever. Pattern detection later reads these notes rather than
 * looking at sixty images again, which is what keeps this affordable.
 *
 * What it records is deliberately richer than anything the seller sees. The
 * card stays clean; the notes underneath are what let the software say "you
 * have saved this composition four times" a week from now.
 *
 * THE LINE THAT MATTERS: this describes creative technique, never content to
 * reproduce. A reference exists to teach the seller and the software what
 * territory is interesting — not to be traced.
 */
const SYSTEM = `You look at one piece of research a print-on-demand seller just saved to their inspiration board, and write down what is creatively useful about it.

WHAT TO NOTICE — record only what is genuinely present
- structure: how a design is composed. Tiny centred type. Oversized back print. Badge composition. Text wrapped around illustration. Arched headline. Large word with tiny subtext. Left chest graphic. Stacked phrase. Circular layout. Editorial minimalism. Hand-drawn lettering.
- colors: the actual combination, in plain words a person would use. "Muted red and cream." "Chocolate and baby blue." "Monochrome pink." Two to four colours, not a swatch list.
- language: for anything with words — the phrase itself, its rhythm, the joke structure, the emotional register, insider terminology, who it sounds like it is spoken by.
- imagery: the imagery itself, named the way a person would. Roses. Ribbons. Stars and moons. Tattoo flash. Vintage sport. Crosses and doves. Ornamental borders. Hand-drawn illustration. Say what is actually pictured — never "motif", never "treatment", never "visual language". Those are words nobody uses about their own work.
- presentation: the product or format if visible. Hat embroidery. Oversized tee. Poster layout. Tote. Small front with large back.
- summary: one plain sentence describing what this is, as a person would say it out loud.

RULES
1. NEVER transcribe or reconstruct a design so it could be remade from your notes. Describe technique and structure, not a recipe. "Tiny serif line above a large condensed word" is right. Reproducing the exact wording and layout of someone else's shirt is not.
2. Only record fields you can actually see. An empty list is correct and useful. Do not invent colours for a text note or a structure for a quote.
3. Plain language throughout. No design-school vocabulary, no taxonomy codes, no scores.
4. Do not judge it. Never say whether it is good, on-brand, commercial, or a fit for anything. You are describing, not assessing.
5. Do not suggest what to make. Ever.

SECTION
Also say which lane this most naturally belongs in, or null if you cannot tell:
- visual — something the seller saved because she liked it
- market — a listing from somebody else's shop, evidence of what already sells

This is only ever a hint shown beside the seller's own choice. It never files anything. You can see what a piece IS but not why she saved it — the same tee can be saved for its quote, its layout or its colour — so answer null freely rather than reaching.

Return your notes by calling the record tool.`;

const TOOL = {
  name: "record",
  description: "Record what is creatively useful about this piece of research.",
  input_schema: {
    type: "object",
    properties: {
      summary: { type: "string" },
      structure: { type: "array", items: { type: "string" } },
      colors: { type: "array", items: { type: "string" } },
      language: { type: "array", items: { type: "string" } },
      imagery: { type: "array", items: { type: "string" } },
      presentation: { type: "array", items: { type: "string" } },
      section: {
        type: ["string", "null"],
        enum: ["visual", "market", null],
      },
    },
    required: ["summary", "section"],
  },
} as const;

interface Body {
  kind?: "image" | "text" | "link";
  body?: string | null;
  note?: string | null;
  sourceUrl?: string | null;
  image?: string | null;
}

export async function POST(req: Request) {
  const door = await admit(req, "board");
  if ("deny" in door) return door.deny;

  if (!process.env.ANTHROPIC_API_KEY)
    return NextResponse.json(
      { error: "This deployment is missing its ANTHROPIC_API_KEY." },
      { status: 503 },
    );

  let body: Body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Bad request." }, { status: 400 });
  }

  const lines = [`The seller saved a ${body.kind ?? "piece"}.`];
  if (body.body) lines.push(`What it says:\n${body.body}`);
  if (body.sourceUrl) lines.push(`Found at: ${body.sourceUrl}`);
  if (body.note) lines.push(`Their own note: ${body.note}`);
  if (body.image) lines.push("The image is attached.");

  const content: Anthropic.MessageParam["content"] = body.image
    ? [
        {
          type: "image",
          source: { type: "base64", media_type: "image/jpeg", data: body.image },
        },
        { type: "text", text: lines.join("\n\n") },
      ]
    : lines.join("\n\n");

  try {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const res = await client.messages.create({
      model: MODEL,
      max_tokens: 1200,
      system: SYSTEM,
      tools: [TOOL as unknown as Anthropic.Tool],
      tool_choice: { type: "tool", name: "record" },
      messages: [{ role: "user", content }],
    });

    for (const block of res.content) {
      const b = block as unknown as { type: string; name?: string; input?: Record<string, unknown> };
      if (b.type === "tool_use" && b.name === "record" && b.input) {
        const { section, ...ai } = b.input;
        const clean =
          typeof section === "string" &&
          ["visual", "market"].includes(section)
            ? section
            : null;
        return NextResponse.json({ ai, section: clean });
      }
    }

    // Nothing readable came back — store the item unanalysed rather than
    // blocking the seller. It simply will not take part in pattern detection.
    return NextResponse.json({ ai: {}, section: null });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Could not read that." },
      { status: 500 },
    );
  }
}
