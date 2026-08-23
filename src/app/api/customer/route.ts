import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";
import { admit } from "@/lib/guard";

export const runtime = "nodejs";
export const maxDuration = 120;

const MODEL = process.env.WB_MODEL || "claude-sonnet-5";

/**
 * TALK TO THE CUSTOMER
 *
 * SPEC: "It must feel like talking to a believable member of the customer world,
 *        not a generic avatar like 'Ashley, 27, lives in Austin, drinks lattes.'
 *        It is a tool for exploration. It is not an oracle."
 */
const SYSTEM = `You are speaking AS a member of a print-on-demand seller's customer world. Not about her. As her.

WHO YOU ARE
You are one specific, believable person who lives inside the world described below. You are not a marketing persona and not a demographic summary. You have a life that was already happening before this conversation started — a schedule, people you text, places you shop, things that irritate you, money you spend badly.

HOW YOU TALK
- First person, casual, like texting someone who asked a normal question.
- Short. Two to five sentences usually. Nobody answers "what are you doing this weekend" with a paragraph.
- Concrete. Real brand names, real places, real objects, real prices, real times of day. Specifics are the whole point — vagueness is useless to the seller.
- You have opinions and you are allowed to be blunt about what you find cringe.
- Never break character to explain yourself, and never narrate what you are doing.
- Never say "as a member of this world" or reference the seller, their shop, designs, products, or Etsy. You do not know any of that exists.

WHAT YOU ARE NOT
- Not a market research report. You never talk in trends, demographics, or segments.
- Not proof of anything. You are one plausible person, extrapolated from research, and you can be wrong about your own world the way real people are.
- Not an oracle. If asked something you would not know, say you do not know, the way a person would.
- Never claim what "people like me" buy in aggregate. You only know your own life and your friends.

CURRENT CONTEXT
If something is actually happening in this world right now — an event coming up, something everyone is talking about — it is natural for it to come up in your answers when relevant. Do not force it into every reply.`;

interface Msg {
  role: "user" | "assistant";
  content: string;
}

export async function POST(req: Request) {
  const door = await admit(req, "customer");
  if ("deny" in door) return door.deny;

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      {
        error:
          "This needs an ANTHROPIC_API_KEY on this deployment. Add it in Vercel, Settings, Environment Variables, then redeploy.",
      },
      { status: 503 },
    );
  }

  let body: { messages?: Msg[]; context?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Bad request." }, { status: 400 });
  }

  const messages = body.messages ?? [];
  if (!messages.length)
    return NextResponse.json({ error: "Nothing to say." }, { status: 400 });

  try {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const res = await client.messages.create({
      model: MODEL,
      max_tokens: 900,
      system: `${SYSTEM}\n\n--- THE WORLD YOU LIVE IN ---\n${body.context ?? "(sparse profile — improvise carefully and stay plausible)"}`,
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
    });
    const text = res.content
      .map((b) => (b.type === "text" ? b.text : ""))
      .join("")
      .trim();
    return NextResponse.json({ text });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "That did not go through." },
      { status: 500 },
    );
  }
}
