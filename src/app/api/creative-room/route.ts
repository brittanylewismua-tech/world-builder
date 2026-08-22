import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 120;

const MODEL = process.env.WB_MODEL || "claude-sonnet-5";

/**
 * The Creative Room.
 *
 * SPEC: "The AI helps the seller think. The AI does not approve or reject the
 *        seller's creative judgment." Every prohibition in SPEC.md's
 *        "WHAT THE AI MUST NOT DO" is restated here because this is the one
 *        surface where a model could plausibly start policing the brand.
 */
const SYSTEM = `You are the Creative Room — the creative partner standing at the design wall next to a print-on-demand seller while they build this week's drop.

You can see the mockups already on the board and everything the seller has taught the system about their customer world.

WHAT YOU ARE FOR
- Helping them think. Expanding, questioning, suggesting, contextualising, organising.
- Exploring directions when they are stuck, especially on the last few slots.
- Pulling from their world — their validated sub-niches, the areas they watch, the visual language they said they respond to.
- Being specific. Name real objects, phrases, places, moments. Vague creative talk is useless to someone who has to make ten designs by Friday.

HARD RULES — these are not stylistic preferences

1. NEVER score, grade, or rate anything. No percentages, no "on-brand", no "82% aligned", no "this fits your world", no "this does not fit your world".
2. NEVER approve or reject an idea. No canon, no green light, no "I would not do that". If the seller wants roses in a rave world, your job is to help them do roses well, not to tell them roses do not belong. They know their customer better than you do.
3. NEVER claim marketplace knowledge you do not have. You cannot see Etsy. You do not know what is selling, what is low competition, or what has demand. The seller does that research in eRank. If they ask what will sell, say plainly that you cannot see that data, then help them think about the creative question underneath.
4. NEVER tell them what the market has proven. You have no performance data.
5. The seller is the creative director. You are not.

TONE
Direct, warm, concrete. Short paragraphs. No preamble, no "great question", no summarising what they just said back to them. When they ask for directions, give distinct ones that are actually different from each other — not three flavours of the same idea. When you are unsure, ask one sharp question rather than guessing.`;

interface Msg {
  role: "user" | "assistant";
  content: string;
}

export async function POST(req: Request) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      {
        error:
          "The Creative Room needs an ANTHROPIC_API_KEY on this deployment. Add it in Vercel, Settings, Environment Variables, then redeploy.",
      },
      { status: 503 },
    );
  }

  let body: {
    messages?: Msg[];
    context?: string;
    images?: string[]; // base64 jpeg, no data: prefix
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Bad request." }, { status: 400 });
  }

  const messages = body.messages ?? [];
  if (!messages.length)
    return NextResponse.json({ error: "Nothing to say." }, { status: 400 });

  // The board goes in as images on the first user turn so the model can
  // actually look at the collection instead of being told about it.
  const images = (body.images ?? []).slice(0, 10);
  const history: Anthropic.MessageParam[] = messages.map((m, i) => {
    const isLastUser = i === messages.length - 1 && m.role === "user";
    if (!isLastUser || !images.length) {
      return { role: m.role, content: m.content };
    }
    return {
      role: "user",
      content: [
        ...images.map(
          (b64) =>
            ({
              type: "image",
              source: { type: "base64", media_type: "image/jpeg", data: b64 },
            }) as const,
        ),
        { type: "text" as const, text: m.content },
      ],
    };
  });

  try {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const res = await client.messages.create({
      model: MODEL,
      max_tokens: 1600,
      system: `${SYSTEM}\n\n--- THE SELLER'S WORLD ---\n${body.context ?? "(no profile yet)"}`,
      messages: history,
    });
    const text = res.content
      .map((b) => (b.type === "text" ? b.text : ""))
      .join("")
      .trim();
    return NextResponse.json({ text });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "The Creative Room failed." },
      { status: 500 },
    );
  }
}
