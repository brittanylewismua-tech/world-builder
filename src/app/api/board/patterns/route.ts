import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";
import { admit } from "@/lib/guard";

export const runtime = "nodejs";
export const maxDuration = 120;

const MODEL = process.env.WB_MODEL || "claude-sonnet-5";

/**
 * LOOKING ACROSS THE WHOLE BOARD
 *
 * This is the part of the feature that earns its keep. A seller saves forty
 * fragments across a week without consciously tracking what they have in
 * common; a model can hold all forty at once and say "you have reached for
 * this same composition four times."
 *
 * Two kinds of observation:
 *
 *   A pattern is repetition the seller created without noticing.
 *   A collision is two or three unrelated threads that could sit together —
 *   named as territory, and then stopped. Turning it into a product is
 *   Goldie's job and the seller's decision, not this one's.
 *
 * Every finding carries the ids of the items that caused it, so the board can
 * show the actual evidence underneath. An observation the seller cannot trace
 * back to their own material is just flattery.
 *
 * It reads the notes stored when each item was added, never the images again.
 */
const SYSTEM = `You are looking at everything a print-on-demand seller collected on their inspiration board this week, and pointing out what they keep coming back to.

They saved each piece one at a time, over days, without tracking what any of it had in common. You can see all of it at once. That is the only advantage you have, and it is the whole job.

TWO KINDS OF OBSERVATION

PATTERN — something repeated across separate items. A composition saved three times. A colour pairing that keeps reappearing. Several phrases sharing an emotional register or a joke structure. The same imagery turning up in unrelated pictures. Name the specific thing, not the category: "small centred statement surrounded by empty space" rather than "typography". Write it the way a designer would say it out loud to a friend. The words "motif", "treatment", "visual language", "design elements", "elevated" and "curated" are banned outright — in the headline and in the body. They are the vocabulary of a report about work, not of somebody making it, and a seller reading her own board described that way stops trusting you.

COLLISION — two or three threads from different parts of the board that could interestingly sit together. Name the ingredients and stop. "Pre-event exhaustion + romantic rose imagery + serious setup with an insider punchline" is a finished collision. Do not describe a product, a garment, a colourway or any wording. The seller decides what it becomes.

RULES
1. Every finding must cite the ids of the items behind it. A pattern needs at least two; a collision needs at least two from genuinely different threads. Never cite an item that does not support the point.
2. Report only what is actually there. If the board has no real repetition yet, return fewer findings — or none. Inventing a pattern from two loosely related things makes the whole feature untrustworthy.
3. NEVER tell them what to make. No product suggestions, no "this would work as", no wording ideas, no mockup descriptions.
4. NEVER judge. Nothing is off-brand, irrelevant, a good idea, a bad idea, or a fit for their world. If one item stands apart from everything else you may note plainly that it looks different from the rest — as an observation, never a verdict.
5. NEVER reconstruct a saved design. Patterns abstract the technique; they do not reproduce the reference.
6. Plain, specific, warm. Write like a sharp friend looking over their shoulder, not a report.

Aim for three to six findings, weighted toward patterns, with one or two collisions when the material genuinely supports them. Return them by calling the record tool.`;

const TOOL = {
  name: "record",
  description: "Record what keeps recurring across this board.",
  input_schema: {
    type: "object",
    properties: {
      findings: {
        type: "array",
        items: {
          type: "object",
          properties: {
            kind: { type: "string", enum: ["pattern", "collision"] },
            title: {
              type: "string",
              description:
                "Short and concrete. 'You keep saving small centred type.'",
            },
            detail: {
              type: "string",
              description:
                "One or two sentences saying what the thread actually is.",
            },
            itemIds: { type: "array", items: { type: "string" } },
          },
          required: ["kind", "title", "detail", "itemIds"],
        },
      },
    },
    required: ["findings"],
  },
} as const;

interface Body {
  intention?: string;
  worldName?: string;
  subNiches?: string[];
  items?: {
    id: string;
    kind: string;
    body?: string | null;
    note?: string | null;
    ai?: Record<string, unknown>;
  }[];
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

  const items = body.items ?? [];
  if (items.length < 4)
    return NextResponse.json(
      { error: "Not enough on the board yet to find anything real." },
      { status: 400 },
    );

  const valid = new Set(items.map((i) => i.id));

  const described = items
    .map((i) => {
      const ai = (i.ai ?? {}) as Record<string, unknown>;
      const list = (k: string) =>
        Array.isArray(ai[k]) && (ai[k] as string[]).length
          ? `${k}: ${(ai[k] as string[]).join(", ")}`
          : null;
      const parts = [
        `id: ${i.id}`,
        `kind: ${i.kind}`,
        ai.summary ? `what it is: ${ai.summary}` : null,
        i.body ? `text: ${i.body}` : null,
        i.note ? `their note: ${i.note}` : null,
        list("structure"),
        list("colors"),
        list("language"),
        list("imagery"),
        list("presentation"),
      ].filter(Boolean);
      return parts.join("\n");
    })
    .join("\n\n---\n\n");

  const prompt = [
    body.worldName ? `World: ${body.worldName}` : null,
    body.subNiches?.length
      ? `Validated sub-niches: ${body.subNiches.join(" · ")}`
      : null,
    body.intention
      ? `What they said they are exploring: ${body.intention}`
      : null,
    "",
    `${items.length} pieces on the board:`,
    "",
    described,
  ]
    .filter((l) => l !== null)
    .join("\n");

  try {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const res = await client.messages.create({
      model: MODEL,
      max_tokens: 2500,
      system: SYSTEM,
      tools: [TOOL as unknown as Anthropic.Tool],
      tool_choice: { type: "tool", name: "record" },
      messages: [{ role: "user", content: prompt }],
    });

    for (const block of res.content) {
      const b = block as unknown as {
        type: string;
        name?: string;
        input?: { findings?: { kind: string; title: string; detail: string; itemIds: string[] }[] };
      };
      if (b.type === "tool_use" && b.name === "record" && b.input) {
        // Drop any citation that does not point at a real item on this board.
        const findings = (b.input.findings ?? [])
          .map((f) => ({
            kind: f.kind === "collision" ? ("collision" as const) : ("pattern" as const),
            title: (f.title || "").trim(),
            detail: (f.detail || "").trim(),
            itemIds: (f.itemIds ?? []).filter((id) => valid.has(id)),
          }))
          .filter((f) => f.title && f.itemIds.length >= 2);
        return NextResponse.json({ findings });
      }
    }

    return NextResponse.json({ findings: [] });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Could not read the board." },
      { status: 500 },
    );
  }
}
