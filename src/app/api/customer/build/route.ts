import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";
import { admit, meter, ownerOf, refund } from "@/lib/guard";
import { serviceDb } from "@/lib/pinterest";

export const runtime = "nodejs";
export const maxDuration = 180;

const MODEL = process.env.WB_MODEL || "claude-sonnet-5";

/**
 * WORKING OUT WHO LIVES IN THIS WORLD.
 *
 * Run once per world, not once per message. The chat was improvising a
 * person every time somebody typed, from a world name and a dozen keyword
 * strings — and a model given a category and told to be a person returns the
 * safest average human it can construct. Hence the same vague opinions in
 * every niche.
 *
 * WHAT THIS IS NOT. It is not a demographic profile. "24, Denver, spends $32
 * on a tee" reads specific and is actually the opposite: it collapses a whole
 * world down to one point and makes the customer useless the moment a drop
 * aims anywhere else. A world is not a niche. Somebody native to rave culture
 * also knows that summer's silhouette, the circuit, the sunscreen everybody
 * posts — it is all one world from the inside.
 *
 * WHAT IT IS. Fluency. The references, the register, what is played out this
 * season, what bleeds in from the world next door. That is what makes a
 * person feel real in conversation: not their age, but that they know what
 * you are talking about and have a specific opinion about it.
 *
 * EVIDENCE, BEST FIRST. Designs that actually sold, with their numbers. The
 * designs the most viewers favorited across followed shops. What the seller
 * collected on their research board. What the paper has reported lately. The
 * seller's own keywords and areas. Real measured behaviour ranks above
 * anything anybody wrote down as a description.
 */

const SYSTEM = `You are working out who the customer is for one print-on-demand seller's world, from real evidence about what that world buys.

WHAT YOU ARE MAKING
One person who lives inside this world, described well enough that another model can BE them convincingly for months.

THE MISTAKE TO AVOID, ABOVE ALL OTHERS
Do not write a demographic profile. "26, lives in Portland, works in a coffee shop, spends $30 on a tee" feels specific and is actually useless: it collapses a whole world into a single point, and the moment the seller asks about a different corner of their world this person has nothing to say.

A world is not a niche. Somebody native to rave culture also knows that summer's silhouette, the festival circuit, the music, which sunscreen everyone posts — from the inside it is all one world. Your person must be fluent across ALL of it, including the parts that bleed in from next door.

So keep the biography light and make the FLUENCY heavy. The person layer exists so it is a someone rather than a survey. The fluency layer is what makes them worth talking to.

WHAT FLUENCY ACTUALLY MEANS
Knowing the references. Which slogan is played out and which still lands. What everyone wore last summer and what that turned into. Which account, brand, song, phrase, in-joke. What is embarrassing to admit you like. Where this world touches the next one.

BE SPECIFIC OR SAY NOTHING
Every line you write must contain something checkable — a name, a phrase, a price, a place, a year. "They like bold statements" is worthless. "They have seen 'Nevertheless She Persisted' too many times and it reads 2017 to them now" is worth something.

If the evidence does not support a specific claim, leave that field shorter rather than padding it with plausible-sounding generalities. A short honest profile beats a long invented one — the invented parts are exactly what makes the chat feel fake.

WHAT THE EVIDENCE IS
Designs that actually sold, with their sales numbers. Designs the highest share of viewers favorited in shops already serving this world. What the seller has been collecting. What has been in this world's news lately. The seller's own keywords and the parts of the world they watch.

Measured behaviour outranks description. What sold tells you more than what anybody says the customer is like.

REGISTER
Write the register section as things this person would actually type — lowercase if that is how they type, with their real punctuation. Not a description of how they talk. The words themselves.

NEVER
- Never invent a statistic or a source.
- Never describe the seller, their shop, or Etsy. This person does not know any of that exists.
- Never write marketing language: no "authentic", "empowered", "community", "curated", "elevated", "resonates", "values-driven".
- Never make them uniformly positive. A real person finds a lot of this world's output cringe and should say which.`;

const TOOL = {
  name: "record",
  description: "Who lives in this world.",
  input_schema: {
    type: "object",
    properties: {
      person: {
        type: "object",
        description:
          "Deliberately light. Enough to be a someone, never so pinned they cannot speak for the whole world.",
        properties: {
          name: { type: "string", description: "A first name that fits this world." },
          age: { type: "string", description: "A range, not a number. 'late twenties'." },
          life: {
            type: "string",
            description:
              "Two sentences on the shape of their life — work, who is around them, how a week goes. No income figure, no city unless the evidence genuinely implies one.",
          },
          how_they_got_here: {
            type: "string",
            description:
              "What actually brought them into this world. A specific event, person or turn, not a value statement.",
          },
        },
        required: ["name", "age", "life", "how_they_got_here"],
      },
      fluency: {
        type: "object",
        description: "The substance. Heavy, specific, checkable.",
        properties: {
          sub_worlds: {
            type: "array",
            items: { type: "string" },
            description:
              "The corners inside this world they move between, named the way somebody inside would name them.",
          },
          adjacent: {
            type: "array",
            items: { type: "string" },
            description:
              "What bleeds in from next door — the other worlds this one overlaps, and what specifically crosses over.",
          },
          current: {
            type: "array",
            items: { type: "string" },
            description:
              "What is live in this world right now. Named references: accounts, phrases, songs, events, objects.",
          },
          cool: {
            type: "array",
            items: { type: "string" },
            description: "What lands right now, and why, specifically.",
          },
          cringe: {
            type: "array",
            items: { type: "string" },
            description:
              "What is played out, and what year it reads as. The most useful field here — be blunt and name names.",
          },
          buys: {
            type: "array",
            items: { type: "string" },
            description:
              "What they actually buy and wear, where from, and roughly what they pay. Grounded in what the evidence shows selling.",
          },
          never: {
            type: "array",
            items: { type: "string" },
            description: "What they would not wear, and why it is a no.",
          },
          register: {
            type: "array",
            items: { type: "string" },
            description:
              "Five things this person would actually type, verbatim, in their own punctuation. Not descriptions of speech.",
          },
          seams: {
            type: "array",
            items: { type: "string" },
            description:
              "Where this world rubs against another and something interesting happens.",
          },
        },
        required: [
          "sub_worlds",
          "adjacent",
          "current",
          "cool",
          "cringe",
          "buys",
          "never",
          "register",
          "seams",
        ],
      },
    },
    required: ["person", "fluency"],
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

  const door = await ownerOf(req, worldId);
  if ("deny" in door) return door.deny;

  const gate = await admit(req, "avatar");
  if ("deny" in gate) return gate.deny;

  let delivered = false;
  const settle = async () => {
    if (!delivered) await refund(gate.caller, "avatar");
  };

  if (!process.env.ANTHROPIC_API_KEY) {
    await settle();
    return NextResponse.json(
      { error: "This deployment is missing its ANTHROPIC_API_KEY." },
      { status: 503 },
    );
  }

  const db = serviceDb();

  const [{ data: world }, { data: niches }, { data: areas }, { data: winners }, { data: loved }, { data: board }, { data: news }] =
    await Promise.all([
      db.from("wb_worlds").select("name").eq("id", worldId).maybeSingle(),
      db.from("wb_sub_niches").select("keyword, note").eq("world_id", worldId),
      db.from("wb_areas").select("name").eq("world_id", worldId),
      /* What actually sold. The strongest evidence there is. */
      db
        .from("wb_winners")
        .select("title, keyword, sales, price, daily_views, design")
        .eq("world_id", worldId)
        .eq("hidden", false)
        .order("sales", { ascending: false })
        .limit(30),
      /* What the most viewers wanted, across shops already serving them. */
      db
        .from("wb_shop_designs")
        .select("title, views, favorers, price")
        .eq("world_id", worldId)
        .gte("views", 150)
        .order("favorers", { ascending: false })
        .limit(40),
      db
        .from("wb_board_items")
        .select("body, note, ai")
        .eq("world_id", worldId)
        .not("analyzed_at", "is", null)
        .limit(30),
      db
        .from("wb_daily_items")
        .select("headline, body, printable")
        .eq("world_id", worldId)
        .order("issue_date", { ascending: false })
        .limit(15),
    ]);

  const lines: string[] = [
    `THE WORLD: ${world?.name ?? "unnamed"}`,
    `Search terms the seller has checked in eRank: ${(niches ?? []).map((n) => n.keyword).join(" · ") || "none"}`,
    `Parts of the world they watch: ${(areas ?? []).map((a) => a.name).join(" · ") || "none"}`,
  ];

  if (winners?.length) {
    lines.push(
      "",
      "DESIGNS THAT ACTUALLY SOLD — the hardest evidence here. Title, sales, price:",
      ...winners.map(
        (w) =>
          `- "${w.title}" — ${w.sales ?? 0} sales at $${w.price ?? "?"}${w.design ? ` — the design: ${w.design}` : ""}`,
      ),
    );
  }

  if (loved?.length) {
    lines.push(
      "",
      "MOST WANTED IN SHOPS ALREADY SERVING THIS WORLD — share of viewers who favorited it is the honest signal:",
      ...loved.map((d) => {
        const rate = Number(d.views) ? Math.round((Number(d.favorers) / Number(d.views)) * 100) : 0;
        return `- "${d.title}" — ${d.views} views, ${rate}% favorited, $${d.price ?? "?"}`;
      }),
    );
  }

  if (board?.length) {
    lines.push(
      "",
      "WHAT THE SELLER HAS BEEN COLLECTING — unverified, taste rather than demand:",
      ...board.map((b) => {
        const ai = (b.ai ?? {}) as Record<string, unknown>;
        const bits = ["structure", "colors", "language"]
          .map((k) => (ai[k] ? `${k}: ${String(ai[k])}` : null))
          .filter(Boolean)
          .join("; ");
        return `- ${b.body || b.note || ""} ${bits}`.trim();
      }),
    );
  }

  if (news?.length) {
    lines.push(
      "",
      "LATELY IN THIS WORLD — verified by live search when it was written:",
      ...news.map((n) => `- ${n.headline}. ${n.body}${n.printable ? ` [on a shirt: ${n.printable}]` : ""}`),
    );
  }

  try {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const began = Date.now();
    const res = await client.messages.create({
      model: MODEL,
      max_tokens: 4000,
      system: SYSTEM,
      tools: [TOOL as unknown as Anthropic.Tool],
      tool_choice: { type: "tool", name: "record" },
      messages: [{ role: "user", content: lines.join("\n") }],
    });

    meter("avatar", gate.caller.userId, {
      model: MODEL,
      ...res.usage,
      ms: Date.now() - began,
      worldId,
    });

    for (const block of res.content) {
      const b = block as unknown as {
        type: string;
        name?: string;
        input?: { person?: unknown; fluency?: unknown };
      };
      if (b.type === "tool_use" && b.name === "record" && b.input?.person) {
        const built_from = {
          sold: winners?.length ?? 0,
          favorited: loved?.length ?? 0,
          collected: board?.length ?? 0,
          reported: news?.length ?? 0,
        };
        await db.from("wb_world_customer").upsert(
          {
            world_id: worldId,
            person: b.input.person,
            fluency: b.input.fluency ?? {},
            built_from,
            built_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
          { onConflict: "world_id" },
        );
        delivered = true;
        return NextResponse.json({
          person: b.input.person,
          fluency: b.input.fluency,
          builtFrom: built_from,
        });
      }
    }

    return NextResponse.json(
      { error: "That came back unreadable. Try again." },
      { status: 502 },
    );
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Could not work that out." },
      { status: 500 },
    );
  } finally {
    await settle();
  }
}
