import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";
import { admit } from "@/lib/guard";

export const runtime = "nodejs";
export const maxDuration = 60;

const MODEL = process.env.WB_MODEL || "claude-sonnet-5";

/**
 * SUGGESTED WORLD AREAS
 *
 * Asking a seller on day one to name the parts of their customer's world worth
 * watching every morning demands the fluency the product exists to build. They
 * have not lived in this world yet. So the keywords they already validated do
 * the talking, and the seller edits.
 *
 * SPEC: "The seller chooses these; the AI does not decide what matters." That
 * still holds — nothing here is applied on its own. These are proposals on a
 * screen where every one can be removed and anything can be added. The AI is
 * breaking the blank page, not making the call.
 */
const SYSTEM = `You read a print-on-demand seller's validated Etsy keywords and name the parts of their customer's wider world that would be worth reading about every morning.

FIRST, FIND THE ONE CUSTOMER
Before naming anything, work out who these keywords have in common. A world is one broader customer universe that several demand pockets happen to point at — not a list of products. Everything you name has to belong to that one person's life.

This is the part that goes wrong most often. Do NOT walk the keywords one by one turning each into its own area; that produces a scattered watch list that reads like several different shops. Find the person underneath, then name the parts of HER world.

If a small number of keywords clearly belong to somebody else entirely, follow the majority and leave the strays out rather than inventing an area for them. Do not mention that you did this and do not comment on the seller's choices — just do not build a watch list around an outlier.

Be generous about what one person contains, though. The same woman can be into raves and be somebody's mother and be getting married; those are seasons and roles in one life, not different customers. Only treat something as a stray when it implies a genuinely different person.

WHAT AN AREA IS
A living slice of culture around this customer that keeps producing new things to notice — how they dress, what they listen to, where they gather, what they joke about, what they celebrate, what they are into outside of shopping.

Good areas for a festival/rave seller: festival fashion · EDM culture · rave humor · festival beauty · nightlife style · music festival lineups.
Good areas for a Christian motherhood seller: christian motherhood · worship music culture · bible journaling · modest fashion · faith-based home decor.

WHEN THE WORLD IS A CAUSE RATHER THAN A LIFESTYLE
Some worlds are not organised around a person's hobbies — they are organised around what someone believes. Activism, faith, politics, fandom loyalties. Zooming out from those keywords the usual way produces news categories: "rallies", "movements", "campaigns". Do not do that. Those return press coverage written by reporters, and there is nothing in a news report that anyone can print.

Name the CAUSES and the places their language lives instead: the specific issues by name, protest signs and slogans, the humour, the counter-argument, what the other camp is wearing.

Bad areas for an anti-ICE seller: ice rallies · liberal movements · republican rallies.
Good areas for the same seller: abolish ice · immigrant rights · protest signs and slogans · leftist humor · anti-war organizing · eat the rich · conservative merch.

Notice the last one. Watching the opposing camp is deliberate, not an accident — where their slogans go tells you where the whole argument is going.

RULES
1. Areas are about the customer's WORLD, not about products. "Festival fashion" is an area. "Rave t-shirts" is a product category — do not return it.
2. Never just restate a keyword. Zoom out from the keywords to the culture underneath them.
3. Two to four words each, lowercase, plain language the customer would recognise.
4. Between 6 and 8 of them. Cover genuinely different ground; no two near-duplicates.
5. Each one has to be something that changes — a thing you could read news about every week. If nothing new ever happens in it, leave it out.
6. Every area must be recognisable as the same customer's life. Read your list back and ask whether one person could plausibly care about all of it. If not, cut what does not fit.
7. Do not judge the seller's niche, score anything, or comment on whether it is a good world.

Return ONLY raw JSON, no markdown fence:
{"areas":["festival fashion","edm culture"]}`;

interface Body {
  worldName?: string;
  subNiches?: string[];
  existing?: string[];
}

export async function POST(req: Request) {
  const door = await admit(req, "areas");
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

  const keywords = (body.subNiches ?? []).filter(Boolean);
  if (keywords.length < 2)
    return NextResponse.json(
      { error: "Add a few validated keywords first and I can read them." },
      { status: 400 },
    );

  const existing = (body.existing ?? []).filter(Boolean);

  const prompt = `${body.worldName ? `The seller calls this world: ${body.worldName}\n` : ""}Keywords they validated in eRank:
${keywords.map((k) => `- ${k}`).join("\n")}
${existing.length ? `\nThey are already watching these, so suggest different ground:\n${existing.map((e) => `- ${e}`).join("\n")}` : ""}

Name the areas of this customer's world worth reading every morning.`;

  try {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const res = await client.messages.create({
      model: MODEL,
      max_tokens: 800,
      system: SYSTEM,
      messages: [{ role: "user", content: prompt }],
    });

    const text = res.content
      .map((b) => (b.type === "text" ? b.text : ""))
      .join("")
      .trim();
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start === -1 || end === -1)
      return NextResponse.json(
        { error: "That came back unreadable. Try again." },
        { status: 502 },
      );

    let parsed: { areas?: string[] };
    try {
      parsed = JSON.parse(text.slice(start, end + 1));
    } catch {
      return NextResponse.json(
        { error: "That came back in a shape I could not read. Try again." },
        { status: 502 },
      );
    }

    const have = new Set(existing.map((e) => e.toLowerCase()));
    const areas = (parsed.areas ?? [])
      .map((a) => String(a).trim().toLowerCase())
      .filter((a) => a.length > 1 && a.length <= 40 && !have.has(a))
      .filter((a, i, all) => all.indexOf(a) === i)
      .slice(0, 8);

    return NextResponse.json({ areas });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Could not read your keywords." },
      { status: 500 },
    );
  }
}
