import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { NEW_BEFORE_REREAD } from "@/lib/limits";
import { admit, meter, refund } from "@/lib/guard";

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
  /* Attribution only — which world this spend belongs to. */
  worldId?: string;
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
  /** Which board, so a repeat read of an unchanged one can be refused. */
  boardId?: string;
}

export async function POST(req: Request) {
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

  /*
    THE MOST EXPENSIVE BUTTON IN THE PRODUCT TO PRESS TWICE.

    Every analysed item on the board goes into this call, so unlike the other
    reads its price grows with the board — a forty-piece board is a large
    prompt. And the answer is a function of the board alone: pressing it again
    without having added anything buys a reworded copy of the findings already
    on screen.

    So the findings carry the size of the board they were read from, and the
    board has to have grown by a real batch — ten pieces, roughly a session's
    saving — before it is worth reading again. One or two more images do not
    change what the board is about.

    A batch, rather than a cooldown, because the rule should follow the work:
    somebody who saves thirty things on Tuesday should not be told to wait,
    and somebody who saves nothing all week should not be handed a free
    reword on Monday.

    Checked BEFORE admit, which spends a unit of the allowance as it runs.
  */
  const boardId = body.boardId;
  if (boardId) {
    const auth = req.headers.get("authorization") ?? "";
    const token = auth.toLowerCase().startsWith("bearer ")
      ? auth.slice(7).trim()
      : "";
    if (token) {
      /* The caller's own token, so row security still decides what they see. */
      const asUser = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL ??
          "https://ywncfltxrnrchicjwcse.supabase.co",
        process.env.NEXT_PUBLIC_SUPABASE_KEY ??
          "sb_publishable_1dP18eUzIVckldFdIR2w7Q_6clKwTmu",
        {
          auth: { persistSession: false, autoRefreshToken: false },
          global: { headers: { Authorization: `Bearer ${token}` } },
        },
      );
      const { data: before } = await asUser
        .from("wb_board_findings")
        .select("covered")
        .eq("board_id", boardId)
        .not("covered", "is", null)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (before != null) {
        const added = items.length - Number(before.covered);
        if (added < NEW_BEFORE_REREAD) {
          const left = NEW_BEFORE_REREAD - Math.max(0, added);
          return NextResponse.json(
            {
              error: `This board has already been read. It opens again once ${left} more ${
                left === 1 ? "piece is" : "pieces are"
              } on it — a handful of new images would only reword what you already have.`,
            },
            { status: 429 },
          );
        }
      }
    }
  }

  const door = await admit(req, "board");
  if ("deny" in door) return door.deny;

  /*
    Nothing is charged for work that did not happen. The unit is reserved
    before the call so the check can be atomic; every exit that hands back
    no result returns it.
  */
  let delivered = false;
  const settle = async () => {
    if (!delivered) await refund(door.caller, "board");
  };

  if (!process.env.ANTHROPIC_API_KEY) {
    await settle();
    return NextResponse.json(
      { error: "This deployment is missing its ANTHROPIC_API_KEY." },
      { status: 503 },
    );
  }

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
    const began = Date.now();
    const res = await client.messages.create({
      model: MODEL,
      max_tokens: 2500,
      system: SYSTEM,
      tools: [TOOL as unknown as Anthropic.Tool],
      tool_choice: { type: "tool", name: "record" },
      messages: [{ role: "user", content: prompt }],
    });

    /* Every model call in the app lands in the same ledger, or the cost
       dashboard is blind exactly where the volume is. */
    meter("board", door.caller.userId, {
      model: MODEL,
      ...res.usage,
      ms: Date.now() - began,
      worldId: body.worldId ?? null,
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
        delivered = true;
        return NextResponse.json({ findings });
      }
    }

    delivered = true;
    return NextResponse.json({ findings: [] });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Could not read the board." },
      { status: 500 },
    );
  } finally {
    await settle();
  }
}
