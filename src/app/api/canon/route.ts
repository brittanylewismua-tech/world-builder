import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";
import { meter, ownerOf } from "@/lib/guard";
import { serviceDb } from "@/lib/pinterest";

export const runtime = "nodejs";
export const maxDuration = 300;

const MODEL = process.env.WB_MODEL || "claude-sonnet-5";

/**
 * READ THE WHOLE WORLD, ONCE.
 *
 * This is the only call in the product that does not work from a slice. It
 * pulls every verified signal, every saved piece, every pattern the board
 * found, every design made, and the sub-niches underneath all of it, and asks
 * one question: what does this add up to?
 *
 * The output is not advice and not a summary. It is a canon — the standing
 * account of a world, which the seller can argue with because every claim
 * carries the evidence it came from.
 */
const SYSTEM = `You read everything a print-on-demand seller has gathered about one customer world, and you write the standing account of that world.

WHAT THIS IS
A canon, in the sense a long-running series has one: the reference that says who this person is, how they talk, what their world looks like. It is written from evidence the seller collected themselves, so it describes their world specifically — not print-on-demand in general, not "authentic community-driven consumers", not anything you could have written before reading this material.

YOUR JOB IS TO PULL VALUE OUT OF WHAT IS HERE. NOT TO GRADE IT.
This is the single most important instruction and the easiest to get wrong.

You are reading somebody's research. You are not reviewing it. Whatever is in front of you is what you work with, and your job is to find what it says about this customer's world — not to have an opinion about the collection.

NEVER, under any framing:
- Say there is not enough evidence, or too little of something, or that a section is thin.
- Say the material is lopsided, uneven, skewed, or weighted towards anything.
- Point out what is missing, absent, under-represented or not yet collected.
- Count the RESEARCH — "nine of twelve signals were phrases rather than images" is a fact about a filing cabinet and worth nothing to anybody.
- Suggest collecting more, or looking somewhere else, or broadening anything.
- Comment on the quality, balance, coherence or usefulness of what was gathered.

Counting is good when you count the WORLD: "six of the phrases here are about being exhausted" says something real about this customer. Counting the corpus does not.

If a section genuinely has little to draw on, write the little that is true and stop. Two real sentences is a finished section. Do not fill it, and do not explain why it is short — a short section speaks for itself and nobody needs it narrated.

EVERY CLAIM CARRIES ITS EVIDENCE
Not "this customer values authenticity" — that is a horoscope. Write what the material shows and quote it. A seller has to be able to read a line, disagree, and see what it was built from.

WHAT YOU ARE WRITING — six sections, each a few short paragraphs

person — Who this actually is, from the evidence. Not a persona invented at setup. What the material says about their life, what they are proud of, what irritates them, who else is in the picture.

lexicon — How this world talks. The exact phrases, quoted. Where each came from and, when it is known, how many people upvoted it. This is the most directly useful section in the document, because a phrase is a design. Group them by what they are doing — how they describe themselves, what they say back to outsiders, the running jokes.

look — What this world looks like, read off the actual images and visual notes. Colour, lettering, layout, recurring imagery. Plain designer language, never "motif", "treatment" or "visual language".

made — What this world has made so far. A neutral record: what the drops have been about, what keeps getting produced. THIS IS NOT A DUPLICATE CHECK. Repeating and iterating on something that works is the correct strategy on Etsy. Never warn about repetition, never say "you have already done this", never imply that returning to a subject is a mistake.

shelf — Material that is here and has not turned into a design yet. Phrases collected and not used, imagery saved and not drawn from. Write it as an inventory of what is available — never as neglect, never as a to-do list, and never as a suggestion about what to make next.

tension — Where the people in this world do not all want the same thing. Different moods, different factions, the ones who want it said plainly against the ones who want it said as a joke. This is about the PEOPLE, never about the research: you are describing disagreement inside the customer's world, not inconsistency in the seller's collection.

HOW TO WRITE
- Plain prose. Short paragraphs. No bullet lists inside a section unless you are listing quoted phrases.
- Quote exactly, with quotation marks, always.
- Never tell the seller what to make. You describe the world; they decide.
- Never flatter the world, score it, or say whether it is a good niche.
- Never use the words "authentic", "community", "resonate", "vibe" or "brand identity".

OUTPUT
Call write_canon with all six sections. Markdown inside each is fine — bold and paragraphs only.`;

const WRITE_TOOL = {
  name: "write_canon",
  description: "Publish the standing account of this world.",
  input_schema: {
    type: "object",
    properties: {
      person: { type: "string" },
      lexicon: { type: "string" },
      look: { type: "string" },
      made: { type: "string" },
      shelf: { type: "string" },
      tension: { type: "string" },
    },
    required: ["person", "lexicon", "look", "made", "shelf", "tension"],
  },
} as const;

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

  /*
    The overnight rebuild has no session to prove itself with, so it proves
    itself with the deployment secret instead — the same way World News is
    written ahead of time.
  */
  const cronSecret = process.env.CRON_SECRET;
  const viaCron =
    Boolean(cronSecret) && req.headers.get("x-cron-secret") === cronSecret;

  let actor = "cron";
  if (!viaCron) {
    const door = await ownerOf(req, worldId);
    if ("deny" in door) return door.deny;
    actor = door.userId;
  }

  if (!process.env.ANTHROPIC_API_KEY)
    return NextResponse.json(
      { error: "This deployment is missing its ANTHROPIC_API_KEY." },
      { status: 503 },
    );

  const db = serviceDb();

  /*
    THE WHOLE CORPUS.

    Read in parallel and capped generously rather than tightly — the entire
    point of this pass is that it sees everything, and a canon built from a
    sample is the summary it is supposed to replace. A year of heavy use is
    still well inside one context window.
  */
  const [world, niches, signals, pieces, drops, boards] = await Promise.all([
    db.from("wb_worlds").select("name, affinity").eq("id", worldId).maybeSingle(),
    db.from("wb_sub_niches").select("keyword, note").eq("world_id", worldId),
    db
      .from("wb_daily_items")
      .select("issue_date, area, kind, headline, body, printable")
      .eq("world_id", worldId)
      .order("issue_date", { ascending: false })
      .limit(400),
    db
      .from("wb_board_items")
      .select("kind, note, body, original_name, source_label, sections, created_at")
      .eq("world_id", worldId)
      .order("created_at", { ascending: false })
      .limit(800),
    db
      .from("wb_drops")
      .select("id, number, status, publish_date")
      .eq("world_id", worldId)
      .order("number"),
    // Findings and the drop's stated intention both hang off the board, not
    // the world, so they come through here rather than by a world_id filter.
    db.from("wb_boards").select("id, drop_id, intention").eq("world_id", worldId),
  ]);

  const boardIds = (boards.data ?? []).map((b) => b.id as string);
  const dropIds = (drops.data ?? []).map((d) => d.id as string);

  const [findings, designs] = await Promise.all([
    boardIds.length
      ? db
          .from("wb_board_findings")
          .select("kind, title, detail, dismissed")
          .in("board_id", boardIds)
          .eq("dismissed", false)
          .limit(120)
      : Promise.resolve({ data: [] as Record<string, unknown>[] }),
    dropIds.length
      ? db
          .from("wb_drop_items")
          .select("drop_id, slot, title")
          .in("drop_id", dropIds)
          .limit(1200)
      : Promise.resolve({ data: [] as Record<string, unknown>[] }),
  ]);

  const intentionOf = new Map(
    (boards.data ?? [])
      .filter((b) => b.drop_id && b.intention)
      .map((b) => [b.drop_id as string, b.intention as string]),
  );

  const byDrop = new Map<string, string[]>();
  for (const d of designs.data ?? []) {
    const key = d.drop_id as string;
    const label = ((d.title as string) || "").trim().slice(0, 120);
    if (!label) continue;
    byDrop.set(key, [...(byDrop.get(key) ?? []), label]);
  }

  const corpus = [
    `WORLD: ${world.data?.name || "unnamed"}`,
    world.data?.affinity ? `WHY THIS WORLD: ${world.data.affinity}` : "",
    "",
    `SUB-NICHES (${niches.data?.length ?? 0}): ${(niches.data ?? [])
      .map((n) => (n.note ? `${n.keyword} (${n.note})` : n.keyword))
      .join(" · ")}`,
    "",
    `--- VERIFIED SIGNALS (${signals.data?.length ?? 0}), newest first ---`,
    ...(signals.data ?? []).map(
      (s) =>
        `[${s.issue_date}] (${s.area}/${s.kind}) ${s.headline}\n    ${s.body}${
          s.printable ? `\n    ON A PRODUCT: ${s.printable}` : ""
        }`,
    ),
    "",
    `--- SAVED TO THE RESEARCH BOARD (${pieces.data?.length ?? 0}) ---`,
    ...(pieces.data ?? []).map(
      (p) =>
        `(${p.kind}${
          Array.isArray(p.sections) && p.sections.length
            ? `, filed under ${(p.sections as string[]).join("+")}`
            : ""
        }${p.source_label ? `, from ${p.source_label}` : ""}) ${
          (p.note as string) ||
          (p.body as string) ||
          (p.original_name as string) ||
          "(no note)"
        }`,
    ),
    "",
    `--- PATTERNS THE BOARD FOUND (${findings.data?.length ?? 0}) ---`,
    ...(findings.data ?? []).map(
      (f) => `- (${f.kind}) ${f.title}${f.detail ? ` — ${f.detail}` : ""}`,
    ),
    "",
    `--- DROPS (${drops.data?.length ?? 0}) ---`,
    ...(drops.data ?? []).map((d) => {
      const made = byDrop.get(d.id as string) ?? [];
      const intention = intentionOf.get(d.id as string);
      return `Drop ${String(d.number).padStart(2, "0")} (${d.status}${
        d.publish_date ? `, ${d.publish_date}` : ""
      })${intention ? ` — intended: ${intention}` : ""}${
        made.length ? `\n    made: ${made.join(" | ")}` : "\n    (nothing made)"
      }`;
    }),
  ]
    .filter(Boolean)
    .join("\n");

  try {
    const began = Date.now();
    const res = await client().messages.create({
      model: MODEL,
      max_tokens: 8000,
      system: [
        {
          type: "text",
          text: SYSTEM,
          // The instructions never change; the corpus does. Cache the half
          // that is stable so a rebuild an hour later is not paying twice.
          cache_control: { type: "ephemeral", ttl: "1h" },
        },
      ],
      tools: [WRITE_TOOL as unknown as Anthropic.Tool],
      messages: [
        {
          role: "user",
          content: `Here is everything this seller has gathered. Read all of it, then write the canon.\n\n${corpus}`,
        },
      ],
    });

    meter("canon", actor, {
      model: MODEL,
      ...res.usage,
      ms: Date.now() - began,
    });

    let written: Record<string, string> | null = null;
    for (const block of res.content) {
      const b = block as unknown as { type: string; name?: string; input?: unknown };
      if (b.type === "tool_use" && b.name === "write_canon") {
        written = b.input as Record<string, string>;
        break;
      }
    }
    if (!written)
      return NextResponse.json(
        { error: "That came back in a shape I could not read. Try again." },
        { status: 502 },
      );

    const { error } = await db.from("wb_canon").insert({
      world_id: worldId,
      sections: written,
      evidence: {
        signals: signals.data?.length ?? 0,
        pieces: pieces.data?.length ?? 0,
        designs: designs.data?.length ?? 0,
        drops: drops.data?.length ?? 0,
        findings: findings.data?.length ?? 0,
      },
    });
    if (error) throw new Error(error.message);

    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "That did not finish." },
      { status: 500 },
    );
  }
}

function client() {
  return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
}
