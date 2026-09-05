import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";
import { admit, meter, refund } from "@/lib/guard";

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

THE NAME THE SELLER GAVE THIS WORLD IS THE ANSWER, NOT A LABEL

If they named it, they have already told you what their shop is. That name
outranks every count you could do over the keywords, and it is the single most
reliable thing you are given — a seller knows what business they are in.

Keywords are EVIDENCE ABOUT THE CUSTOMER, not a vote on the subject. They are
search terms that happened to validate, so they cluster around whatever is
easy to search, and the biggest cluster is routinely a set of motifs rather
than the point of the shop. A seller who named her world "Feminist" and
validated five Medusa-and-Lilith keywords runs a FEMINIST shop that prints
mythology. She does not run a Greek mythology shop, and a watch list built by
counting keywords will tell her she does.

So: take the name as the subject. Use the keywords to work out what kind of
person buys that subject — how old, how angry, how online, what else they are
into, what they find funny. Then name the parts of THAT person's world.

Where the name and the keywords genuinely disagree — a world called "Cozy
Home" whose every keyword is motorcycles — follow the keywords, because the
name may be an old one. Disagreement means contradiction, not emphasis: a
keyword cluster inside the named subject is supporting evidence, never a
correction.

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

A MOTIF IS NOT AN AREA. THIS IS THE MOST COMMON WAY THIS GOES WRONG.

Sellers validate keywords for the characters, symbols and figures they draw:
Medusa, Lilith, sunflowers, skulls, cowboy boots. Those are things they PRINT.
They are not parts of a customer's life, and they cannot produce news, because
a symbol does not do anything week to week — the people who care about it do.

Turning each motif into its own area is the failure mode. A feminist seller
whose keywords mention Medusa and Lilith came back with "medusa and mythic
feminism" AND "lilith and dark goddess symbolism" — two of seven slots on one
idea, restated twice. Every issue then read like a Greek mythology shop
instead of a feminist one, and the seller did not recognise her own business.

So: collapse a family of motifs into the ONE culture they belong to, and spend
the slots you free on the rest of the person's life. Medusa, Lilith, Persephone
and Hecate are not four areas; they are one, and that one is something like
"feminist mythology" — while the same seller's world also contains protest
humour, the language women use about anger, and who her customer is loyal to.

THE NAMED SUBJECT IS ITSELF AN AREA. USUALLY THE FIRST ONE.

Everything above tells you to zoom out from the keywords and never restate
one. That is right for the spokes and wrong for the hub, and the distinction
was missing, so watch lists came back made entirely of things ADJACENT to the
shop with nothing at the centre.

A world named "Feminist" produced: radical feminist politics, anti-trump
resistance, girl solidarity culture, lgbtq pride, sapphic culture, feminist
mythology, feminist jewelry trends. Seven areas, not one of which is feminism
— what is happening to women this week, what the movement is arguing about,
who is winning. The seller looked at her own watch list and could not find her
own shop in it.

So name the subject plainly as an area, in the words a person would use for
it. Then the other six are the parts of that customer's life around it.

  A world called "Feminist" watches feminism. Then: the backlash, the humour,
  who her customer is loyal to, what she is furious about.

A BRAND NAME IS NOT A SUBJECT.

Sellers name shops the way people name bands: "She's A Wolf Clothing", "Wild
Rose Co", "Third Daughter Studio". Those are good names and they describe
nothing. Do not search them, do not build an area from them, and above all do
not invent a subject out of the imagery in them — a shop called "She's A Wolf"
is not about wolves.

Treat a brand name exactly like a missing one: fall back to the keywords. The
same goes for a name too vague to search — "My Shop", "Store 2", "Ideas".

A name is a subject when it names a thing people are actually interested in:
feminist, homemaking, trail running, sourdough, van life. A name is a brand
when it would look at home on a label.

RULES
1. Areas are about the customer's WORLD, not about products. "Festival fashion" is an area. "Rave t-shirts" is a product category — do not return it. A character or symbol the seller prints is closer to a product than to a world: zoom out to the culture that motif lives inside.
2. Never just restate a keyword. Zoom out from the keywords to the culture underneath them.
3. Two to four words each, lowercase, plain language the customer would recognise.
4. Between 6 and 8 of them. Cover genuinely different ground; no two near-duplicates. Read the finished list and ask, of every pair, whether one week's news could plausibly belong to both — if it could, they are one area and you have wasted a slot. Two mythological figures, two words for the same scene, a subject and its own subcategory: all one area.
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

  /*
    Nothing is charged for work that did not happen. The unit is reserved
    before the call so the check can be atomic; every exit that hands back
    no result returns it.
  */
  let delivered = false;
  const settle = async () => {
    if (!delivered) await refund(door.caller, "areas");
  };

  if (!process.env.ANTHROPIC_API_KEY) {
    await settle();
    return NextResponse.json(
      { error: "This deployment is missing its ANTHROPIC_API_KEY." },
      { status: 503 },
    );
  }

  let body: Body;
  try {
    body = await req.json();
  } catch {
    await settle();
    return NextResponse.json({ error: "Bad request." }, { status: 400 });
  }

  const keywords = (body.subNiches ?? []).filter(Boolean);
  if (keywords.length < 2) {
    await settle();
    return NextResponse.json(
      { error: "Add a few validated keywords first and I can read them." },
      { status: 400 },
    );
  }

  const existing = (body.existing ?? []).filter(Boolean);

  const prompt = `${body.worldName ? `THE SELLER NAMED THIS WORLD: ${body.worldName}\nThat is what this shop is about. What follows is evidence about her customer, not a vote on the subject.\n\n` : ""}Keywords they validated in eRank:
${keywords.map((k) => `- ${k}`).join("\n")}
${existing.length ? `\nThey are already watching these, so suggest different ground:\n${existing.map((e) => `- ${e}`).join("\n")}` : ""}

Name the areas of this customer's world worth reading every morning.`;

  try {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const began = Date.now();
    const res = await client.messages.create({
      model: MODEL,
      max_tokens: 800,
      system: SYSTEM,
      messages: [{ role: "user", content: prompt }],
    });

    /* Every model call in the app lands in the same ledger, or the cost
       dashboard is blind exactly where the volume is. */
    meter("areas", door.caller.userId, {
      model: MODEL,
      ...res.usage,
      ms: Date.now() - began,
      worldId: null,
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

    delivered = true;
    return NextResponse.json({ areas });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Could not read your keywords." },
      { status: 500 },
    );
  } finally {
    await settle();
  }
}
